// @vitest-environment jsdom
// R3 storage boundary fixes on the real result pages: H1 (saved choice must
// survive a reload even with future-dated scopes) and H4 (no stale error
// notice next to a verified success).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope, loadHanjaSelections } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '이준'] };
const scopeB = (over: Partial<ModeBInput> = {}) => { const v = validateModeBInput({ ...B_INPUT, ...over }); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const scopeC = (over: Partial<ModeCInput> = {}) => { const v = validateModeCInput({ ...C_INPUT, ...over }); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const futureStore = (scopes: string[]) => {
  const t = Date.now() + 86_400_000;
  return JSON.stringify({ version: 2, scopes: Object.fromEntries(scopes.map((s, i) => [s, { updatedAt: t + i, names: {} }])) });
};
const august = (i: number) => `2027-08-${String(i + 1).padStart(2, '0')}`;

async function pick(name: string, position: number, hanja: string) {
  const heading = await screen.findByRole('heading', { name }, { timeout: 15000 });
  const card = heading.closest('div.bg-white') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: /세부 분석 보기/ }));
  fireEvent.click(within(card).getByRole('button', { name: /한자 분석/ }));
  fireEvent.click(card.querySelectorAll<HTMLElement>('[data-hanja-status]')[position]);
  fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.trim().startsWith(hanja))!);
  return heading;
}

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('H1: a choice shown as saved survives a reload (20 future-dated scopes)', () => {
  it('Mode B', async () => {
    localStorage.setItem(HANJA_SELECTION_KEYS.modeB, futureStore(Array.from({ length: 20 }, (_, i) => scopeB({ birthDate: august(i) }))));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(loadHanjaSelections(HANJA_SELECTION_KEYS.modeB, scopeB())).toEqual({ 김민서: ['敏'] });
    cleanup();
    render(<ModeBResults />);
    expect((await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 })).parentElement!.textContent).toContain('敏');
  }, 60000);

  it('Mode C', async () => {
    localStorage.setItem(HANJA_SELECTION_KEYS.modeC, futureStore(Array.from({ length: 20 }, (_, i) => scopeC({ birthDate: august(i) }))));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(loadHanjaSelections(HANJA_SELECTION_KEYS.modeC, scopeC())['김민서']?.[0]).toBe('敏');
    cleanup();
    render(<ModeCResults />);
    expect((await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 })).parentElement!.textContent).toContain('敏');
  }, 60000);
});

/** getItem of `key` throws until `fix()` is called. */
function brokenUntilFixed(key: string) {
  let broken = true;
  const real = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
    if (k === key && broken) throw new DOMException('blocked', 'SecurityError');
    return real.call(this, k);
  });
  return () => { broken = false; };
}

describe('H4: after a verified save the stale "cannot read / will not save" notice is cleared', () => {
  it('Mode B', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    const fix = brokenUntilFixed(HANJA_SELECTION_KEYS.modeB);
    render(<ModeBResults />);
    expect((await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 })).textContent).toContain('불러오지 못했습니다');
    fix();
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(screen.queryByTestId('hanja-recovery-notice')).toBeNull();
  }, 60000);

  it('Mode C', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    const fix = brokenUntilFixed(HANJA_SELECTION_KEYS.modeC);
    render(<ModeCResults />);
    expect((await screen.findByTestId('hanja-read-notice', {}, { timeout: 15000 })).textContent).toContain('불러오지 못했습니다');
    fix();
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(screen.queryByTestId('hanja-read-notice')).toBeNull();
  }, 60000);

  it('a failed save keeps the read notice (it is still accurate)', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    brokenUntilFixed(HANJA_SELECTION_KEYS.modeB); // never fixed
    render(<ModeBResults />);
    await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 });
    await pick('김민서', 1, '敏');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByTestId('hanja-recovery-notice')).toBeTruthy();
  }, 60000);
});
