// @vitest-environment jsdom
// R3 storage boundary fixes on the real result pages: H1 (saved choice must
// survive a reload even with future-dated scopes) and H4 (no stale error
// notice next to a verified success).
// R3.2: saves are committed to the persistence backend (in-memory here); legacy
// localStorage is imported once and then only read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { committedNames, installMemoryHanjaBackend } from '@/test-utils/hanjaTestBackend';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
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

const be = installMemoryHanjaBackend();
const persistenceStatus = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const whenSettled = () => waitFor(() => expect(['initializing', 'saving']).not.toContain(persistenceStatus()));

async function pick(name: string, position: number, hanja: string) {
  const heading = await screen.findByRole('heading', { name }, { timeout: 15000 });
  await whenSettled();
  const card = heading.closest('div.bg-white') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: /세부 분석 보기/ }));
  fireEvent.click(within(card).getByRole('button', { name: /한자 분석/ }));
  fireEvent.click(card.querySelectorAll<HTMLElement>('[data-hanja-status]')[position]);
  fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.trim().startsWith(hanja))!);
  await whenSettled();
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
    expect(committedNames(be(), HANJA_SELECTION_KEYS.modeB, scopeB())).toEqual({ 김민서: ['敏'] });
    expect(Object.keys(JSON.parse(be().documents.get(HANJA_SELECTION_KEYS.modeB)!).scopes)).toHaveLength(20); // retention size unchanged
    cleanup();
    render(<ModeBResults />); // reload
    const reloaded = await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    expect(reloaded.parentElement!.textContent).toContain('敏');
  }, 60000);

  it('Mode C', async () => {
    localStorage.setItem(HANJA_SELECTION_KEYS.modeC, futureStore(Array.from({ length: 20 }, (_, i) => scopeC({ birthDate: august(i) }))));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(committedNames(be(), HANJA_SELECTION_KEYS.modeC, scopeC())?.['김민서']?.[0]).toBe('敏');
    cleanup();
    render(<ModeCResults />); // reload
    const reloaded = await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    expect(reloaded.parentElement!.textContent).toContain('敏');
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
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error')); // nothing saved while the source is unreadable
    fix();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); // R3.2: initialisation is retried explicitly
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(screen.queryByTestId('hanja-recovery-notice')).toBeNull();
  }, 60000);

  it('Mode C', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    const fix = brokenUntilFixed(HANJA_SELECTION_KEYS.modeC);
    render(<ModeCResults />);
    expect((await screen.findByTestId('hanja-read-notice', {}, { timeout: 15000 })).textContent).toContain('불러오지 못했습니다');
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'));
    fix();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(screen.queryByTestId('hanja-read-notice')).toBeNull();
  }, 60000);

  it('while the source stays unreadable no save is possible and the read notice stays (it is still accurate)', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    brokenUntilFixed(HANJA_SELECTION_KEYS.modeB); // never fixed
    render(<ModeBResults />);
    await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 });
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'));
    const heading = await screen.findByRole('heading', { name: '김민서' });
    const card = heading.closest('div.bg-white') as HTMLElement;
    const quick = within(card).getAllByRole('button', { name: /'민' 한자 선택/ })[0];
    expect(quick.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(quick);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); // retry while still broken
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'));
    expect(screen.getByTestId('hanja-recovery-notice')).toBeTruthy();
    expect(be().documents.size).toBe(0); // no store was created from an unreadable source
  }, 60000);
});
