// @vitest-environment jsdom
// R4 G2 Mode A mobile result refinement (real-iPhone QA):
// - the header's back label must not wrap into single syllables and must stay tappable next to
//   the PDF action; on narrow screens the summary moves to its own row.
// - each card reads as one combination: name, birth date, birth time and the composite score
//   that belongs to the whole combination, with date/time set large on mobile.
// jsdom has no layout engine: these tests pin the class contracts and the rendered values;
// geometry at 375/390px is checked in a real browser separately.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DesignerInput } from '@/types';
import { analyzeModeA, formatKoreanDate } from '@/lib/analysis';
import { formatTimeSlot } from '@/lib/schedule';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/components/PDFButton', () => ({ default: () => <button type="button">프리미엄 PDF</button> }));
const ModeAResults = (await import('@/app/mode-a/results/page')).default;
const { default: ResultCard } = await import('@/components/ResultCard');

const INPUT: DesignerInput = {
  startDate: '2027-01-15', endDate: '2027-01-17', surname: '강', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
  schedule: { providerConfirmed: true, timeRanges: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }], exactTimes: [] },
};

beforeEach(() => { localStorage.clear(); localStorage.setItem('dlbd_mode_a', JSON.stringify(INPUT)); });
afterEach(cleanup);

const classes = (e: Element) => (e.getAttribute('class') ?? '').split(/\s+/);
/** Unprefixed fixed widths or min-widths wider than a 320px screen. */
function wideFixedWidths(root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>('[class]')].flatMap(e => classes(e).filter(c => {
    const m = /^(?:min-)?w-(?:\[(\d+)px\]|(\d+))$/.exec(c);
    return m ? (m[1] ? Number(m[1]) : Number(m[2]) * 4) > 320 : false;
  }));
}
async function renderPage() {
  render(<ModeAResults />);
  await screen.findByText(/MODE A 결과/, {}, { timeout: 30000 });
  return screen.getAllByRole('article');
}

describe('Mode A result header on narrow screens', () => {
  it('keeps 돌아가기 on one line with a 44px tap target, and the PDF action on the first row', async () => {
    await renderPage();
    const header = screen.getByTestId('mode-a-result-header');
    const back = within(header).getByRole('button', { name: '돌아가기' });
    expect(classes(back)).toEqual(expect.arrayContaining(['whitespace-nowrap', 'shrink-0', 'min-h-[44px]', 'order-1']));
    expect(classes(back).some(c => c.startsWith('focus-visible:ring'))).toBe(true);
    // wrapping header: summary takes its own full-width row below sm, inline from sm
    expect(classes(header)).toEqual(expect.arrayContaining(['flex-wrap', 'sm:flex-nowrap']));
    const summary = within(header).getByText(/가지 조합 분석 완료/).parentElement!;
    expect(classes(summary)).toEqual(expect.arrayContaining(['order-3', 'w-full', 'sm:order-2', 'sm:w-auto']));
    const pdf = within(header).getByRole('button', { name: '프리미엄 PDF' }).parentElement!;
    expect(classes(pdf)).toEqual(expect.arrayContaining(['order-2', 'shrink-0', 'whitespace-nowrap']));
    // DOM order unchanged for keyboard focus: back → PDF
    const buttons = within(header).getAllByRole('button').map(b => b.textContent?.trim());
    expect(buttons).toEqual(['돌아가기', '프리미엄 PDF']);
    expect(wideFixedWidths()).toEqual([]);
  }, 60000);
});

describe('Mode A result cards present one combination', () => {
  it('every card shows the actual name, date, time and composite score of its combination, ranked in order', async () => {
    const cards = await renderPage();
    const expected = analyzeModeA(INPUT).slice(0, cards.length);
    expect(cards.length).toBe(20);
    cards.forEach((card, i) => {
      const r = expected[i];
      const q = (id: string) => within(card).getByTestId(id);
      expect(q('card-combo-label').textContent).toBe(`종합 점수 ${i + 1}위 조합`);
      expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(r.name.full);
      expect(q('card-birth-date').textContent).toBe(formatKoreanDate(r.date));
      expect(q('card-birth-time').textContent).toBe(formatTimeSlot(r.timeSlot!));
      expect(q('card-overall').textContent).toBe(`종합 ${r.scores.overall}점 · ${r.grade}등급`);
      expect(q('card-meta').textContent).toContain('의료진이 허용한 범위 내 분석');
      // date and time are set large on mobile on every card, not only the first
      for (const id of ['card-birth-date', 'card-birth-time']) {
        expect(classes(q(id))).toEqual(expect.arrayContaining(['text-lg', 'font-bold', 'sm:text-xl', 'break-keep']));
      }
      expect(card.getAttribute('aria-label')).toContain(`${r.name.full}, ${formatKoreanDate(r.date)}`);
    });
    expect(wideFixedWidths()).toEqual([]);
  }, 60000);

  it('detail expand/collapse and load-more still work', async () => {
    const cards = await renderPage();
    const toggle = within(cards[0]).getByRole('button', { name: /상세 분석 보기/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(cards[0]).getByText('세부 점수')).toBeTruthy();
    fireEvent.click(within(cards[0]).getByRole('button', { name: /닫기/ }));
    expect(within(cards[0]).queryByText('세부 점수')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /더 보기/ }));
    const more = screen.getAllByRole('article');
    expect(more.length).toBe(40);
    expect(within(more[20]).getByTestId('card-combo-label').textContent).toBe('종합 점수 21위 조합');
  }, 60000);

  it('filtered lists label cards as 분석 조합 instead of a rank', async () => {
    await renderPage();
    const sButton = screen.getAllByRole('button').find(b => { const m = /^(SS|S|A|B) (\d+)$/.exec(b.textContent ?? ''); return !!m && Number(m[2]) > 0; });
    fireEvent.click(sButton!);
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) expect(within(c).getByTestId('card-combo-label').textContent).toBe('분석 조합');
  }, 60000);

  it('long names and Hanja strings can wrap instead of overflowing', () => {
    const r = analyzeModeA(INPUT).slice(0, 1)[0];
    const long = { ...r, name: { ...r.name, full: '강' + '가나다라마바사아자차카타'.repeat(2) }, nameAnalysis: { ...r.nameAnalysis, hanja: '賢珉'.repeat(12) } };
    render(<ResultCard result={long} />);
    const card = screen.getByRole('article');
    const name = within(card).getByRole('heading', { level: 3 });
    expect(name.textContent).toBe(long.name.full);
    expect(classes(name)).toEqual(expect.arrayContaining(['min-w-0', '[overflow-wrap:anywhere]']));
    expect(classes(within(card).getByText(long.nameAnalysis.hanja))).toEqual(expect.arrayContaining(['min-w-0', 'break-all']));
  });
});

describe('combination wording', () => {
  it('Mode A UI does not introduce labels that recommend a birth date or time on its own', () => {
    const SRC = path.resolve(__dirname, '../..');
    for (const f of ['components/ResultCard.tsx', 'app/mode-a/results/page.tsx']) {
      const text = fs.readFileSync(path.join(SRC, f), 'utf8');
      for (const w of ['추천 출산', '추천 출생', '최적 출산일', '최고의 출생', '최적의 출생', '좋은 출생 시간']) expect(text.includes(w), `${f}: ${w}`).toBe(false);
    }
  });
});
