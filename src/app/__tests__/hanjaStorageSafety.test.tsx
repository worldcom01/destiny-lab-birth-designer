// @vitest-environment jsdom
// R3 data-safety hotfix: a failed storage read must never lead to a save that
// erases stored Hanja selections, and a save must never be reported as
// successful when it was refused or lost data.
// R3.2: pages persist through one IndexedDB transaction per save (the in-memory
// backend here). Legacy localStorage is imported once and then only read; an
// unreadable / oversized / corrupted source makes the page read-only. The R3
// guarantees are re-asserted against that contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { committedNames, installMemoryHanjaBackend } from '@/test-utils/hanjaTestBackend';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope, saveHanjaSelections } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const KEY_B = HANJA_SELECTION_KEYS.modeB;
const KEY_C = HANJA_SELECTION_KEYS.modeC;
const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const OTHER_B: ModeBInput = { ...B_INPUT, birthDate: '2027-07-05' };
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '이준'] };
const scopeB = (i: ModeBInput) => { const v = validateModeBInput(i); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const scopeC = (i: ModeCInput) => { const v = validateModeCInput(i); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const storeOf = (scopes: Record<string, object>, pad?: number) => JSON.stringify({
  version: 2,
  scopes: {
    ...Object.fromEntries(Object.entries(scopes).map(([s, names], i) => [s, { updatedAt: i + 1, names }])),
    ...(pad ? { ['{' + 'x'.repeat(pad)]: { updatedAt: 0, names: {} } } : {}),
  },
});

/** Makes Storage.getItem throw for `key` while `active()` is true (setItem keeps working). */
function failReadsOf(key: string, active: () => boolean) {
  const real = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
    if (k === key && active()) throw new DOMException('read blocked', 'SecurityError');
    return real.call(this, k);
  });
}
const be = installMemoryHanjaBackend();
const persistenceStatus = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const whenSettled = () => waitFor(() => expect(['initializing', 'saving']).not.toContain(persistenceStatus()));
/** In a read-only state the Hanja controls of `name` are disabled and open nothing. */
async function expectNoSavePossible(name: string) {
  const card = (await screen.findByRole('heading', { name }, { timeout: 15000 })).closest('div.bg-white') as HTMLElement;
  const buttons = within(card).getAllByRole('button', { name: /한자 선택/ });
  expect(buttons.every(b => b.getAttribute('aria-disabled') === 'true')).toBe(true);
  fireEvent.click(buttons[0]);
  expect(screen.queryByRole('dialog')).toBeNull();
}
/** Opens the Hanja picker of a card's given-name syllable and picks `hanja`. */
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

describe('audit reproduction (must fail on the pre-hotfix code)', () => {
  it('A: an oversized legacy store is never imported or overwritten; the stored 書 stays (page is read-only)', async () => {
    const raw = storeOf({ [scopeB(B_INPUT)]: { 김민서: [null, '書'] } }, 1_000_000);
    localStorage.setItem(KEY_B, raw);
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'));
    expect(screen.getByTestId('hanja-persistence-status').textContent).toContain('안전 한도보다 큽니다');
    await expectNoSavePossible('김민서');
    expect(localStorage.getItem(KEY_B)).toBe(raw);
    expect(be().documents.size).toBe(0);
  }, 60000);

  it('B: a failed read followed by a save never erases other analysis scopes and is reported as failed', () => {
    const raw = storeOf({ [scopeB(B_INPUT)]: { 김민서: [null, '書'] }, [scopeB(OTHER_B)]: { 김민서: ['珉', '瑞'] } });
    localStorage.setItem(KEY_B, raw);
    failReadsOf(KEY_B, () => true);
    const ok = saveHanjaSelections(KEY_B, scopeB(B_INPUT), { 김민서: ['敏', '書'] }, localStorage);
    vi.restoreAllMocks();
    expect(ok).toBe(false);
    expect(localStorage.getItem(KEY_B)).toBe(raw);
  });

  it('C: the page never reports a save as successful when the transaction failed; committed data is unchanged', async () => {
    localStorage.setItem(KEY_B, storeOf({ [scopeB(B_INPUT)]: { 김민서: [null, '書'] }, [scopeB(OTHER_B)]: { 김민서: ['珉', '瑞'] } }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    const before = be().documents.get(KEY_B);
    be().failNext = 'aborted';
    await pick('김민서', 1, '敏');
    expect(be().documents.get(KEY_B)).toBe(before);
    expect(screen.getByRole('alert').textContent).toContain('저장하지 못했습니다');
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
  }, 60000);

  it('C (Mode C): same guarantee', async () => {
    localStorage.setItem(KEY_C, storeOf({ [scopeC(C_INPUT)]: { 김민서: [null, '書'] }, [scopeC({ ...C_INPUT, birthDate: '2027-07-05' })]: { 김민서: ['珉', '瑞'] } }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    const before = be().documents.get(KEY_C);
    be().failNext = 'aborted';
    await pick('김민서', 1, '敏');
    expect(be().documents.get(KEY_C)).toBe(before);
    expect(screen.getByRole('alert').textContent).toContain('저장하지 못했습니다');
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
  }, 60000);

  it('a read failure of the legacy source makes the page read-only (never an empty store)', async () => {
    localStorage.setItem(KEY_B, storeOf({ [scopeB(B_INPUT)]: { 김민서: [null, '書'] } }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    failReadsOf(KEY_B, () => true);
    render(<ModeBResults />);
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'), { timeout: 15000 });
    await expectNoSavePossible('김민서');
    expect(be().documents.size).toBe(0);
  }, 60000);
});

describe('page-level save feedback matches verified persistence', () => {
  it('Mode B: success is shown only after a verified write and survives a reload; other scopes kept', async () => {
    localStorage.setItem(KEY_B, storeOf({ [scopeB(B_INPUT)]: { 김민서: [null, '書'] }, [scopeB(OTHER_B)]: { 김민서: ['珉', '瑞'] } }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const heading = await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status').textContent).toContain('김민서의 한자 선택을 브라우저에 저장했습니다');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(heading.parentElement!.textContent).toContain('敏書');
    expect(committedNames(be(), KEY_B, scopeB(B_INPUT))).toEqual({ 김민서: ['敏', '書'] });
    expect(committedNames(be(), KEY_B, scopeB(OTHER_B))).toEqual({ 김민서: ['珉', '瑞'] });
    cleanup();
    render(<ModeBResults />); // reload
    const reloaded = await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    expect(reloaded.parentElement!.textContent).toContain('敏書');
  }, 60000);

  it('Mode B: quota failure → alert, screen unchanged, reload shows the old record; retry after the fix succeeds', async () => {
    const raw = storeOf({ [scopeB(B_INPUT)]: { 김민서: [null, '書'] } });
    localStorage.setItem(KEY_B, raw);
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    const committed = be().documents.get(KEY_B);
    be().failNext = 'quota';
    const heading = await pick('김민서', 1, '敏');
    expect(screen.getByRole('alert').textContent).toContain('브라우저 저장 공간이 부족합니다');
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    expect(heading.parentElement!.textContent).not.toContain('敏書');
    expect(be().documents.get(KEY_B)).toBe(committed);
    expect(localStorage.getItem(KEY_B)).toBe(raw); // legacy record untouched
    cleanup();
    render(<ModeBResults />); // reload: old record
    const h2 = await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 });
    await whenSettled();
    expect(h2.parentElement!.textContent).not.toContain('敏書');
    expect(screen.queryByRole('alert')).toBeNull();
    await pick('김민서', 1, '敏'); // retry
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(committedNames(be(), KEY_B, scopeB(B_INPUT))).toEqual({ 김민서: ['敏', '書'] });
  }, 60000);

  it('Mode B: a corrupted store is reported on load and a save is refused without touching it', async () => {
    const raw = '{"version":2,"scopes":{';
    localStorage.setItem(KEY_B, raw);
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    expect((await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 })).textContent).toContain('저장된 한자 선택을 불러오지 못했습니다');
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'));
    expect(screen.getByTestId('hanja-persistence-status').textContent).toContain('형식이 손상돼 있습니다');
    await expectNoSavePossible('김민서');
    expect(localStorage.getItem(KEY_B)).toBe(raw);
    expect(be().documents.size).toBe(0);
  }, 60000);

  it('Mode C: success and refusal behave the same way', async () => {
    const raw = '{"version":2,"scopes":{"{x":{"updatedAt":1,"names":{"김민서":["x"]}}}}'; // invalid Hanja value
    localStorage.setItem(KEY_C, raw);
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    expect((await screen.findByTestId('hanja-read-notice', {}, { timeout: 15000 })).textContent).toContain('알 수 없는 형식');
    await waitFor(() => expect(persistenceStatus()).toBe('read-only-error'));
    await expectNoSavePossible('김민서');
    expect(localStorage.getItem(KEY_C)).toBe(raw);
    expect(be().documents.size).toBe(0); // the refused source created no store
    cleanup();
    localStorage.setItem(KEY_C, storeOf({ [scopeC(C_INPUT)]: { 김민서: [null, '書'] } }));
    render(<ModeCResults />);
    await pick('김민서', 1, '敏');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(committedNames(be(), KEY_C, scopeC(C_INPUT))).toEqual({ 김민서: ['敏', '書'] });
  }, 60000);
});
