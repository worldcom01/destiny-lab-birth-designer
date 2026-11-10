// @vitest-environment jsdom
// R3 final patch: result pages are read-only towards stored Hanja records
// (R36-E2), empty/non-empty legacy conflicts are never recovered (R36-E1),
// and an oversized store is skipped without losing records (R36-L1).
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
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '김민'] };
const vB = () => { const v = validateModeBInput(B_INPUT); if (!v.ok) throw new Error('invalid'); return v.value; };
const vC = () => { const v = validateModeCInput(C_INPUT); if (!v.ok) throw new Error('invalid'); return v.value; };
const V1_B = JSON.stringify({ version: 1, names: { 김민서: ['珉', null] } });
const V1_C = JSON.stringify({ version: 1, names: { 김민: ['敏'] } });
const storeOf = (scopes: Record<string, object>) =>
  JSON.stringify({ version: 2, scopes: Object.fromEntries(Object.entries(scopes).map(([s, names], i) => [s, { updatedAt: i + 1, names }])) });
const snapshot = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).map(k => [k, localStorage.getItem(k)]));
const minseoCard = async () => (await screen.findByRole('heading', { name: '김민서' }, { timeout: 15000 })).closest('div.bg-white') as HTMLElement;

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('R36-E2: opening results never deletes stored records', () => {
  it('Mode B: both v1 keys and the v2 store keep their exact original values', async () => {
    localStorage.setItem('dlbd_mode_b_hanja', V1_B);
    localStorage.setItem('dlbd_mode_c_hanja', V1_C);
    localStorage.setItem(HANJA_SELECTION_KEYS.modeB, storeOf({ [analysisScope(vB())]: { 김민서: [null, '書'] } }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    const before = snapshot();
    render(<ModeBResults />);
    const card = await minseoCard();
    expect(card.textContent).toContain('珉書'); // v2 [null,'書'] applied (珉 = default recommendation); v1 is never applied
    expect(snapshot()).toEqual(before);
    expect(localStorage.getItem('dlbd_mode_b_hanja')).toBe(V1_B);
    expect(localStorage.getItem('dlbd_mode_c_hanja')).toBe(V1_C);
  }, 60000);

  it('Mode C: both v1 keys and the v2 store keep their exact original values', async () => {
    localStorage.setItem('dlbd_mode_b_hanja', V1_B);
    localStorage.setItem('dlbd_mode_c_hanja', V1_C);
    localStorage.setItem(HANJA_SELECTION_KEYS.modeC, storeOf({ [analysisScope(vC())]: { 김민서: ['敏', null] } }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    const before = snapshot();
    render(<ModeCResults />);
    await minseoCard();
    expect(snapshot()).toEqual(before);
    expect(localStorage.getItem('dlbd_mode_b_hanja')).toBe(V1_B);
    expect(localStorage.getItem('dlbd_mode_c_hanja')).toBe(V1_C);
  }, 60000);
});

describe('R36-E1: empty vs non-empty legacy records on the page', () => {
  it('shows the ambiguity notice and applies neither record', async () => {
    const v = vB();
    const dup2 = analysisScope({ ...v, nameStyles: ['전통형', '전통형'] });
    const dup3 = analysisScope({ ...v, nameStyles: ['전통형', '전통형', '전통형'] });
    localStorage.setItem(HANJA_SELECTION_KEYS.modeB, storeOf({ [dup3]: {}, [dup2]: { 김민서: ['敏', null] } }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    const before = snapshot();
    render(<ModeBResults />);
    const notice = await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 });
    expect(notice.textContent).toContain('선택을 비운 기록 포함');
    expect(notice.textContent).toContain('다시 선택해주세요');
    expect((await minseoCard()).querySelector('h3')!.parentElement!.textContent).not.toContain('敏');
    expect(snapshot()).toEqual(before);
  }, 60000);
});

describe('R36-L1: oversized store on the page', () => {
  it('skips with a notice, deletes nothing, and an explicit edit is refused without touching storage', async () => {
    const scope = analysisScope(vB());
    const big = storeOf({ [scope]: { 김민서: [null, '書'] }, ['{' + 'x'.repeat(1_000_000)]: {} });
    localStorage.setItem(HANJA_SELECTION_KEYS.modeB, big);
    localStorage.setItem('dlbd_mode_b_hanja', V1_B);
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const notice = await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 });
    expect(notice.textContent).toContain('안전 한도');
    expect(localStorage.getItem(HANJA_SELECTION_KEYS.modeB)).toBe(big);
    // explicit edit: choose 敏 for 민 (first given syllable)
    const card = await minseoCard();
    fireEvent.click(within(card).getByRole('button', { name: /세부 분석 보기/ }));
    fireEvent.click(within(card).getByRole('button', { name: /한자 분석/ }));
    const minChar = card.querySelectorAll<HTMLElement>('[data-hanja-status]')[1];
    fireEvent.click(minChar);
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.startsWith('敏'))!);
    // Data-safety hotfix: over the size limit the save is refused (no unbounded parse, no write);
    // the stored 書 record is untouched and the failure is shown.
    expect(localStorage.getItem(HANJA_SELECTION_KEYS.modeB)).toBe(big);
    expect(loadHanjaSelections(HANJA_SELECTION_KEYS.modeB, scope)).toEqual({ 김민서: [null, '書'] });
    expect(screen.getByRole('alert').textContent).toContain('안전 한도보다 큽니다');
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    expect(localStorage.getItem('dlbd_mode_b_hanja')).toBe(V1_B);
  }, 60000);
});
