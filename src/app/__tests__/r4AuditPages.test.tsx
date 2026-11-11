// @vitest-environment jsdom
// R4 audit remediation on the real result pages: S1 (zero-legacy search entry with a
// FIXTURE-ONLY confirmed pair), A1 (detail focus) and P1 (PDF provenance).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnalysisResult, ModeBInput, ModeCInput } from '@/types';

// Test fixture: human-confirmed pairs that do NOT exist in production data.
vi.mock('@/data/hanjaDictionary/legal-confirmed.json', () => ({ default: { note: 'test fixture', pairs: [['侍', '시'], ['訓', '훈']] } }));
vi.mock('@/data/hanjaDictionary/legal-reviews.json', () => ({
  default: {
    schemaVersion: 1, note: 'test fixture',
    reviews: [['訓', '훈', 'U+8A13'], ['侍', '시', 'U+4F8D']].map(([char, reading, codePoint], i) => ({
      id: `test-fixture-${i}`, reviewer: 'test-fixture', reviewedAt: '2026-11-11T10:00:00Z', decision: 'exact-match', char, codePoint, reading,
      evidence: { kind: 'court-lookup', source: 'efamily-lookup', url: 'https://efamily.scourt.go.kr/', lookedUpAt: '2026-11-11', shownReading: reading, shownMark: '인명용' },
    })),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
const pdfResults: AnalysisResult[][] = [];
vi.mock('@/components/PDFButton', () => ({ default: (p: { results: AnalysisResult[] }) => { pdfResults.push(p.results); return null; } }));

const { HANJA_SELECTION_KEYS, analysisScope } = await import('@/lib/hanjaModel');
const { validateModeBInput, validateModeCInput } = await import('@/lib/inputValidation');
const { runModeBAnalysis, analyzeModeCNames, applyHanjaSelections } = await import('@/lib/analysis');
const { overrideHanjaBackend } = await import('@/lib/hanjaPersistence');
const { MemoryHanjaBackend } = await import('@/test-utils/memoryHanjaBackend');
const { committedNames } = await import('@/test-utils/hanjaTestBackend');
const { getHanjaOptions } = await import('@/data/hanjaDB');
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;
const PdfNameDetail = (await import('@/components/pdf/PdfNameDetail')).default;

const B_INPUT: ModeBInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'] };
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김정훈', '김현서'] };

let be: InstanceType<typeof MemoryHanjaBackend>;
beforeEach(() => { localStorage.clear(); pdfResults.length = 0; be = new MemoryHanjaBackend(); overrideHanjaBackend(be); });
afterEach(() => { cleanup(); overrideHanjaBackend(null); });

const status = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const cardOf = (name: string) => screen.getByRole('heading', { name }).closest('div.bg-white') as HTMLElement;
const press = (el: HTMLElement) => { el.focus(); fireEvent.keyDown(el, { key: 'Enter' }); fireEvent.click(el); };
async function open(mode: 'B' | 'C') {
  localStorage.setItem(mode === 'B' ? 'dlbd_mode_b' : 'dlbd_mode_c', JSON.stringify(mode === 'B' ? B_INPUT : C_INPUT));
  const r = render(mode === 'B' ? <ModeBResults /> : <ModeCResults />);
  await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
  await waitFor(() => expect(status()).toBe('idle'));
  return r;
}
const scopeOf = (mode: 'B' | 'C') => { const v = mode === 'B' ? validateModeBInput(B_INPUT) : validateModeCInput(C_INPUT); if (!v.ok) throw new Error('x'); return analysisScope(v.value); };

describe.each([
  ['C', '김정훈', '훈', '訓'],
  ['B', '김시우', '시', '侍'],
] as const)('S1 Mode %s: zero-legacy syllable %s/%s', (mode, fullName, syl, fixture) => {
  it('search is reachable; only the confirmed fixture is selectable; the selection is saved, shown and kept on reload', async () => {
    if (mode === 'B') expect(runModeBAnalysis((validateModeBInput(B_INPUT) as { value: ModeBInput }).value).slice(0, 20).map(r => r.name.full)).toContain(fullName);
    expect(getHanjaOptions(syl)).toEqual([]);
    const { unmount } = await open(mode);
    const card = cardOf(fullName);
    const entry = within(card).getByRole('button', { name: new RegExp(`^'${syl}' 한자 검색`) });
    press(entry);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('hanja-no-legacy-options').textContent).toContain('기존 목록의 한자 후보가 없습니다');
    const input = within(dialog).getByRole('searchbox', { name: '한자 검색' });
    input.focus();
    fireEvent.change(input, { target: { value: syl } });
    await within(dialog).findByTestId('hanja-search-results', {}, { timeout: 15000 });
    const rows = [...dialog.querySelectorAll<HTMLElement>('[data-result]')];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.filter(r => r.dataset.eligibility === 'verified-reading').map(r => r.dataset.result)).toEqual([fixture]);
    expect(rows.filter(r => r.dataset.result !== fixture).every(r => r.dataset.eligibility !== 'verified-reading' && r.dataset.eligibility !== 'legacy-offered')).toBe(true);
    // an unverified result cannot be chosen
    press(rows.find(r => r.dataset.result !== fixture)!);
    const detail1 = await within(dialog).findByTestId('hanja-search-detail');
    expect((within(detail1).getByRole('button', { name: '선택할 수 없음' }) as HTMLButtonElement).disabled).toBe(true);
    press(within(detail1).getByRole('button', { name: '목록으로' }));
    // the fixture is selectable and labelled confirmed
    press(dialog.querySelector(`[data-result="${fixture}"]`) as HTMLElement);
    const detail2 = await within(dialog).findByTestId('hanja-search-detail');
    expect(within(detail2).getByTestId('hanja-legal').dataset.legal).toBe('CONFIRMED');
    expect(within(detail2).getByTestId('hanja-meaning-missing')).toBeTruthy(); // no invented meaning
    const commits = be.commits;
    press(within(detail2).getByRole('button', { name: `${fixture}(으)로 선택` }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(status()).toBe('idle'));
    expect(be.commits - commits).toBe(1);
    const index = Array.from(fullName).slice(1).indexOf(syl);
    const expected: (string | null)[] = []; expected[index] = fixture;
    expect(committedNames(be, mode === 'B' ? HANJA_SELECTION_KEYS.modeB : HANJA_SELECTION_KEYS.modeC, scopeOf(mode))![fullName][index]).toBe(fixture);
    const box = within(cardOf(fullName)).getByRole('button', { name: new RegExp(`^'${syl}' 한자 검색`) });
    expect(box.getAttribute('aria-label')).toContain(`현재: ${fixture} 확정)`); // confirmed, not "음 미확인"
    expect(document.activeElement).toBe(box);
    expect(pdfResults.at(-1)!.find(r => r.name.full === fullName)!.name.hanja.given[index]).toMatchObject({ hanja: fixture, status: 'confirmed' });
    unmount();
    await open(mode);
    expect(within(cardOf(fullName)).getByRole('button', { name: new RegExp(`^'${syl}' 한자 검색`) }).getAttribute('aria-label')).toContain(`현재: ${fixture} 확정)`);
  }, 60000);
});

describe('A1: search detail focus (Mode C)', () => {
  it('opening a result moves focus to the detail heading; returning focuses the same row; Escape restores the trigger', async () => {
    await open('C');
    const trigger = within(cardOf('김현서')).getByRole('button', { name: /^'현' 한자 선택/ });
    press(trigger);
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('searchbox', { name: '한자 검색' });
    input.focus();
    fireEvent.change(input, { target: { value: '현' } });
    await within(dialog).findByTestId('hanja-search-results', {}, { timeout: 15000 });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    const row = document.activeElement as HTMLElement;
    expect(row.dataset.result).toBeTruthy();
    press(row);
    const detail = await within(dialog).findByTestId('hanja-search-detail');
    const heading = within(detail).getByRole('heading', { level: 4, name: /상세 정보$/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.activeElement).not.toBe(document.body);
    press(within(detail).getByRole('button', { name: '목록으로' }));
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.result).toBe(row.dataset.result));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  }, 60000);

  it('when the row is gone (query changed while in detail), focus falls back to the search box, never BODY', async () => {
    await open('C');
    press(within(cardOf('김현서')).getByRole('button', { name: /^'현' 한자 선택/ }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('searchbox', { name: '한자 검색' });
    fireEvent.change(input, { target: { value: '鉉' } });
    await within(dialog).findByTestId('hanja-search-results', {}, { timeout: 15000 });
    press(dialog.querySelector('[data-result="鉉"]') as HTMLElement);
    const detail = await within(dialog).findByTestId('hanja-search-detail');
    // the dictionary changes underneath: simulate the row disappearing by clearing the results map
    fireEvent.change(input, { target: { value: '珉' } });
    await waitFor(() => expect(within(dialog).queryByTestId('hanja-search-detail')).toBeNull());
    expect(detail.isConnected).toBe(false);
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  }, 60000);
});

describe('P1: PDF meaning provenance (rendered PDF component)', () => {
  it('鉉 with the legacy gloss "쇠줄 현": the status stays "확정" and every occurrence of the gloss is marked 출처 미확인', () => {
    const base = analyzeModeCNames({ ...C_INPUT, names: ['김현서'] }).results;
    const r = applyHanjaSelections(base, { 김현서: ['鉉'] })[0];
    const { container } = render(<PdfNameDetail result={r} rank={1} pageNum={1} totalPages={1} />);
    const text = container.textContent!;
    expect(text).toContain('확정');
    expect(text).toContain('쇠줄 현 (출처 미확인)');
    const total = text.split('쇠줄 현').length - 1;
    const labelled = (text.match(/쇠줄 현 \(출처 미확인\)/g) ?? []).length + (text.match(/쇠줄 현[^)]{0,20}입니다\(출처 미확인/g) ?? []).length;
    expect(total).toBeGreaterThan(0);
    expect(labelled).toBe(total);
    expect(text).not.toMatch(/뜻을 지닌 한자입니다/);
    expect(text).not.toContain('시험용 합성 뜻'); // no research/test meaning as a replacement
  });
});
