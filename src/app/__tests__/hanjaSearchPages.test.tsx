// @vitest-environment jsdom
// R4.2 acceptance on the real Mode B / Mode C result pages: search inside the picker,
// keyboard navigation, honest meaning/legal labels, exact-character selection through the
// normal save path, reload and PDF-input consistency; unavailable results cannot be saved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnalysisResult, ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { runModeBAnalysis } from '@/lib/analysis';
import { overrideHanjaBackend } from '@/lib/hanjaPersistence';
import { MemoryHanjaBackend } from '@/test-utils/memoryHanjaBackend';
import { committedNames } from '@/test-utils/hanjaTestBackend';
import { getHanjaOptions } from '@/data/hanjaDB';
import { getHanjaDictionary } from '@/lib/hanjaDictionary';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
const pdfResults: AnalysisResult[][] = [];
vi.mock('@/components/PDFButton', () => ({ default: (p: { results: AnalysisResult[] }) => { pdfResults.push(p.results); return null; } }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김현서', '이준'] };

let be: MemoryHanjaBackend;
beforeEach(() => { localStorage.clear(); pdfResults.length = 0; be = new MemoryHanjaBackend(); overrideHanjaBackend(be); });
afterEach(() => { cleanup(); overrideHanjaBackend(null); });

const status = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const cardOf = (name: string) => screen.getByRole('heading', { name }).closest('div.bg-white') as HTMLElement;
const quick = (c: HTMLElement, syl: string) => within(within(c).getByTestId('hanja-quick-select')).getByRole('button', { name: new RegExp(`^'${syl}' 한자 선택`) });
const press = (el: HTMLElement) => { el.focus(); fireEvent.keyDown(el, { key: 'Enter' }); fireEvent.click(el); };

interface Ctx { key: string; scope: string; fullName: string; syl: string; pick: string; legacyMeaning: string; unavailable: string }
function context(mode: 'B' | 'C'): Ctx {
  const v = mode === 'B' ? validateModeBInput(B_INPUT) : validateModeCInput(C_INPUT);
  if (!v.ok) throw new Error('invalid');
  const fullName = mode === 'B' ? runModeBAnalysis(v.value as ModeBInput)[0].name.full : '김현서';
  const syl = Array.from(fullName)[1];
  const opts = getHanjaOptions(syl);
  const pick = mode === 'C' ? '鉉' : opts[opts.length - 1].hanja;
  const offered = new Set(opts.map(o => o.hanja));
  const unavailable = getHanjaDictionary().byReading(syl).find(x => !offered.has(x.char) && x.evidence.some(e => e.source === 'unihan'))!.char;
  return { key: mode === 'B' ? HANJA_SELECTION_KEYS.modeB : HANJA_SELECTION_KEYS.modeC, scope: analysisScope(v.value), fullName, syl, pick, legacyMeaning: opts.find(o => o.hanja === pick)!.meaning, unavailable };
}
async function open(mode: 'B' | 'C') {
  localStorage.setItem(mode === 'B' ? 'dlbd_mode_b' : 'dlbd_mode_c', JSON.stringify(mode === 'B' ? B_INPUT : C_INPUT));
  const r = render(mode === 'B' ? <ModeBResults /> : <ModeCResults />);
  await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
  await waitFor(() => expect(status()).toBe('idle'));
  return r;
}
async function searchFor(syl: string, fullName: string, q: string) {
  const trigger = quick(cardOf(fullName), syl);
  press(trigger);
  const dialog = await screen.findByRole('dialog');
  const input = within(dialog).getByRole('searchbox', { name: '한자 검색' });
  input.focus();
  fireEvent.change(input, { target: { value: q } });
  await within(dialog).findByTestId('hanja-search-results', {}, { timeout: 15000 });
  return { trigger, dialog, input };
}

describe.each(['B', 'C'] as const)('Mode %s: search and select', mode => {
  it('keyboard: finds the character, shows honest labels, selects it once, keeps it after reload and in the PDF input', async () => {
    const c = context(mode);
    const { unmount } = await open(mode);
    const { trigger, dialog, input } = await searchFor(c.syl, c.fullName, c.pick);
    // mobile/clipping contract: portal to <body>, one scroll region, sticky search header
    expect(dialog.closest('.fade-up')).toBeNull();
    expect(within(dialog).getByTestId('hanja-picker-scroll').className).toMatch(/overflow-y-auto/);
    expect(within(dialog).getByTestId('hanja-search').firstElementChild!.className).toMatch(/sticky/);
    expect(within(dialog).getByTestId('hanja-search-status').textContent).toMatch(/검색 결과 1건 · 선택 가능 1건/);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const row = dialog.querySelector(`[data-result="${c.pick}"]`) as HTMLElement;
    expect(document.activeElement).toBe(row);
    fireEvent.keyDown(row, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(input);
    press(row);
    const detail = await within(dialog).findByTestId('hanja-search-detail');
    expect(detail.dataset.char).toBe(c.pick);
    expect(within(detail).getByTestId('hanja-meaning-missing').textContent).toContain('확인된 한국어 뜻이 없습니다');
    expect(within(detail).getByTestId('hanja-meaning-legacy').textContent).toContain(`${c.legacyMeaning}`);
    expect(within(detail).getByTestId('hanja-meaning-legacy').textContent).toContain('출처 미확인');
    expect(within(detail).getByTestId('hanja-legal').dataset.legal).toBe('NOT_CONFIRMED');
    expect(within(detail).getByTestId('hanja-legal').textContent).toContain('출생신고 전에');
    press(within(detail).getByRole('button', { name: '목록으로' }));
    await waitFor(() => expect(document.activeElement).toBe(dialog.querySelector(`[data-result="${c.pick}"]`)));
    press(document.activeElement as HTMLElement);
    const commits = be.commits;
    press(await within(dialog).findByRole('button', { name: `${c.pick}(으)로 선택` }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(status()).toBe('idle'));
    expect(be.commits - commits).toBe(1);
    expect(committedNames(be, c.key, c.scope)).toEqual({ [c.fullName]: [c.pick] });
    const q = quick(cardOf(c.fullName), c.syl);
    expect(q.textContent).toContain(c.pick);
    expect(q.getAttribute('data-quick-status')).toBe('confirmed');
    expect(document.activeElement).toBe(trigger);
    const pdfName = pdfResults.at(-1)!.find(r => r.name.full === c.fullName)!;
    expect(pdfName.name.hanja.given[0]).toMatchObject({ hanja: c.pick, status: 'confirmed' });
    unmount();
    await open(mode);
    expect(quick(cardOf(c.fullName), c.syl).textContent).toContain(c.pick);
  }, 60000);

  it('an unavailable (unconfirmed) result can be inspected but not saved; Escape closes and focus returns', async () => {
    const c = context(mode);
    await open(mode);
    const { trigger, dialog } = await searchFor(c.syl, c.fullName, c.unavailable);
    press(dialog.querySelector(`[data-result="${c.unavailable}"]`) as HTMLElement);
    const detail = await within(dialog).findByTestId('hanja-search-detail');
    const choose = within(detail).getByRole('button', { name: '선택할 수 없음' }) as HTMLButtonElement;
    expect(choose.disabled).toBe(true);
    expect(within(detail).getByTestId('hanja-unavailable').textContent).toMatch(/공식 확인/);
    const commits = be.commits;
    fireEvent.click(choose);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(be.commits).toBe(commits);
    expect(committedNames(be, c.key, c.scope)).toBeUndefined();
    expect(quick(cardOf(c.fullName), c.syl).textContent).not.toContain(c.unavailable);
  }, 60000);

  it('the default list labels legacy glosses and the legal state; no option claims a verified meaning', async () => {
    const c = context(mode);
    await open(mode);
    press(quick(cardOf(c.fullName), c.syl));
    const dialog = await screen.findByRole('dialog');
    const labels = within(dialog).getAllByTestId('legacy-gloss-label');
    expect(labels).toHaveLength(getHanjaOptions(c.syl).length);
    expect(within(dialog).getAllByTestId('option-legal').every(e => e.dataset.legal === 'NOT_CONFIRMED')).toBe(true);
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
  }, 60000);
});

describe('Mode C card text', () => {
  it('the card marks legacy meanings and the detail shows "(출처 미확인)" next to 鉉', async () => {
    localStorage.setItem(HANJA_SELECTION_KEYS.modeC, JSON.stringify({ version: 2, scopes: { [context('C').scope]: { updatedAt: 1, names: { 김현서: ['鉉'] } } } }));
    await open('C');
    const card = cardOf('김현서');
    expect(within(card).getByTestId('card-meanings').textContent).toMatch(/뜻 출처 미확인.*쇠줄 현/);
    fireEvent.click(within(card).getByRole('button', { name: '세부 분석 보기' }));
    fireEvent.click(within(card).getAllByRole('button').find(b => b.getAttribute('aria-expanded') === 'false' && b.textContent?.includes('한자 분석'))!);
    expect(card.textContent).toContain('쇠줄 현 (출처 미확인)');
  }, 60000);
});
