import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisResult, ModeBInput } from '@/types';
import { analyzeModeCNames, applyHanjaSelections, runModeBAnalysis } from '@/lib/analysis';
import { formatFullHanja, withSelection } from '@/lib/hanjaModel';
import NameRankCard from '@/components/NameRankCard';
import HanjaDisplay, { HanjaCharCard } from '@/components/HanjaDisplay';
import PdfNameDetail from '@/components/pdf/PdfNameDetail';
import PdfTop20 from '@/components/pdf/PdfTop20';
import PdfExecutiveSummary from '@/components/pdf/PdfExecutiveSummary';

// Server-side static rendering of the real components. This verifies rendered
// output for a given state; it does not simulate browser clicks.

const BASE_B: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
};

/** Hanja characters rendered in PDF detail cards, in order. */
function pdfCardChars(html: string): { hanja: string; status: string }[] {
  return [...html.matchAll(/data-hanja-char="([^"]*)" data-hanja-status="([^"]*)"/g)]
    .map(m => ({ hanja: m[1], status: m[2] }));
}

function expectUiPdfEquivalent(r: AnalysisResult) {
  const model = r.name.hanja;
  const full = formatFullHanja(model);
  const card = renderToStaticMarkup(<NameRankCard result={r} rank={1} />);
  const display = renderToStaticMarkup(<HanjaDisplay model={model} />);
  const pdf = renderToStaticMarkup(<PdfNameDetail result={r} rank={1} pageNum={3} totalPages={8} />);
  const top = renderToStaticMarkup(<PdfTop20 results={[r]} startRank={1} pageNum={7} totalPages={8} title="t" />);
  const summary = renderToStaticMarkup(<PdfExecutiveSummary results={[r]} pageNum={2} totalPages={8} />);

  expect(card).toContain(r.name.full);
  expect(card).toContain(r.nameAnalysis.hanja);
  expect(display).toContain(full);
  expect(pdf).toContain(r.name.full);
  expect(pdf).toContain(full);
  expect(top).toContain(r.nameAnalysis.hanja);
  expect(summary).toContain(r.nameAnalysis.hanja);
  expect(pdfCardChars(pdf)).toEqual(
    [...model.surname, ...model.given].map(c => ({ hanja: c.hanja ?? '', status: c.status })),
  );
  for (const c of [...model.surname, ...model.given]) {
    if (c.hanja && c.meaning) expect(pdf).toContain(c.meaning);
    if (c.hanja && c.strokes != null) expect(pdf).toContain(`${c.strokes}획`);
  }
}

describe('UI and PDF render the same canonical Hanja', () => {
  it.each([
    ['현', '炫', '賢'],
    ['예', '睿', '藝'],
    ['유', '柔', '侑'],
    ['원', '媛', '源'],
  ])('suggested %s: %s in card and PDF, never the first DB option %s', (hangul, expected, oldPdf) => {
    const [r] = runModeBAnalysis({ ...BASE_B, dolrimChar: hangul, dolrimPosition: 'first' });
    expect(r.name.hanja.given[0].hanja).toBe(expected);
    expectUiPdfEquivalent(r);
    const pdf = renderToStaticMarkup(<PdfNameDetail result={r} rank={1} pageNum={3} totalPages={8} />);
    expect(pdfCardChars(pdf)[1]).toEqual({ hanja: expected, status: 'suggested' });
    expect(pdf).not.toContain(oldPdf);
  });

  it('user-confirmed selection is identical in card, PDF detail, PDF tables and after remount', () => {
    const before = runModeBAnalysis({ ...BASE_B, dolrimChar: '현', dolrimPosition: 'first' });
    const [r] = applyHanjaSelections(before, withSelection({}, before[0].name.full, 0, '賢'));
    expect(r.name.hanja.given[0]).toMatchObject({ hanja: '賢', status: 'confirmed' });
    expectUiPdfEquivalent(r);
    const pdf = renderToStaticMarkup(<PdfNameDetail result={r} rank={1} pageNum={3} totalPages={8} />);
    expect(pdf).toContain('어질 현');
    expect(pdf).toContain('15획');
    expect(pdf).not.toContain('炫');
    // State lives in the result, so a closed-and-reopened (re-mounted) card shows the same choice.
    const first = renderToStaticMarkup(<HanjaDisplay model={r.name.hanja} />);
    const second = renderToStaticMarkup(<HanjaDisplay model={r.name.hanja} />);
    expect(second).toBe(first);
    expect(first).toContain('金賢');
  });

  it('confirmed generational Hanja reaches the PDF', () => {
    const [r] = runModeBAnalysis({ ...BASE_B, dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'first' });
    expectUiPdfEquivalent(r);
    const pdf = renderToStaticMarkup(<PdfNameDetail result={r} rank={1} pageNum={3} totalPages={8} />);
    expect(pdfCardChars(pdf)[1]).toEqual({ hanja: '敏', status: 'confirmed' });
    expect(pdf).not.toContain('珉');
  });

  it('Mode C: compound surname, 1- and 3-syllable names and unassigned Hanja are explicit', () => {
    const { results } = analyzeModeCNames({
      birthDate: '2027-07-04', birthHour: 9, gender: '남', names: ['남궁민준', '김준', '김가나다'],
    });
    for (const r of results) expectUiPdfEquivalent(r);
    const nam = results.find(r => r.name.full === '남궁민준')!;
    const pdf = renderToStaticMarkup(<PdfNameDetail result={nam} rank={1} pageNum={3} totalPages={8} />);
    expect(pdfCardChars(pdf).map(c => c.status)).toEqual(['unassigned', 'unassigned', 'unassigned', 'unassigned']);
    expect(pdf).toContain('□□□□');
    expect(pdf).toContain('획수 합계 미산출');
    const jun = results.find(r => r.name.full === '김준')!;
    expect(pdfCardChars(renderToStaticMarkup(<PdfNameDetail result={jun} rank={1} pageNum={3} totalPages={8} />)))
      .toHaveLength(2); // 김 + 준, no duplicated syllable
    const ganada = results.find(r => r.name.full === '김가나다')!;
    expect(pdfCardChars(renderToStaticMarkup(<PdfNameDetail result={ganada} rank={1} pageNum={3} totalPages={8} />)))
      .toHaveLength(4);
  });

  it('UI card marks unknown strokes and syllables without Hanja data', () => {
    const [won] = runModeBAnalysis({ ...BASE_B, dolrimChar: '원', dolrimPosition: 'first' });
    const wonCard = renderToStaticMarkup(<HanjaCharCard char={won.name.hanja.given[0]} caption="원" onOpen={() => {}} />);
    expect(wonCard).toContain('媛');
    expect(wonCard).toContain('획수 미확인');
    expect(wonCard).toContain('추천');

    const { results } = analyzeModeCNames({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: ['김똥개'] });
    const ddong = renderToStaticMarkup(<HanjaCharCard char={results[0].name.hanja.given[0]} caption="똥" onOpen={() => {}} />);
    expect(ddong).toContain('미지정');
    expect(ddong).toContain('한자 데이터 없음');
  });
});
