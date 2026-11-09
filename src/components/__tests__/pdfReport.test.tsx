import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModeBInput } from '@/types';
import { runModeBAnalysis } from '@/lib/analysis';
import PdfReport from '@/components/pdf/PdfReport';

const BASE_B: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
};

const pageFooters = (html: string) => [...html.matchAll(/>(\d+) \/ (\d+)</g)].map(m => [Number(m[1]), Number(m[2])]);

describe('PDF report totals and page numbers', () => {
  const all = runModeBAnalysis(BASE_B);
  const grades = { SS: 0, S: 0, A: 0, B: 0, C: 0 };
  for (const r of all) grades[r.grade]++;

  it('uses whole-population stats while rendering only the top 20', () => {
    const html = renderToStaticMarkup(
      <PdfReport results={all.slice(0, 20)} stats={{ total: all.length, grades }} surname="김" gender="여" />,
    );
    expect(all.length).toBeGreaterThan(20);
    expect(html).toContain(`총 ${all.length.toLocaleString()}가지 조합`);
    expect(html).toContain(`${all.length.toLocaleString()}가지`);
    expect(html).not.toContain('{total}');
  });

  it('numbers pages 1..N with the real page count, including the cover', () => {
    const html = renderToStaticMarkup(<PdfReport results={all.slice(0, 20)} surname="김" gender="여" />);
    expect(pageFooters(html)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, 8]));
  });

  it('shrinks the page count when fewer results exist', () => {
    const html = renderToStaticMarkup(<PdfReport results={all.slice(0, 2)} surname="김" gender="여" />);
    // cover, summary, 2 name details, interpretation, one ranking table
    expect(pageFooters(html)).toEqual([1, 2, 3, 4, 5, 6].map(n => [n, 6]));
  });
});

describe('short Saju reading in UI and PDF', () => {
  it('shows the saju lines in the summary, the name line on name cards, and all four lines in Mode A cards and PDF pages', async () => {
    const { default: SajuSummary } = await import('@/components/SajuSummary');
    const { default: NameRankCard } = await import('@/components/NameRankCard');
    const { default: ResultCard } = await import('@/components/ResultCard');
    const { default: PdfNameDetail } = await import('@/components/pdf/PdfNameDetail');
    const { buildSajuReading } = await import('@/lib/sajuReading');
    const r = runModeBAnalysis(BASE_B)[0];
    const reading = buildSajuReading(r);

    const summary = renderToStaticMarkup(<SajuSummary date={r.date} hour={r.hour} fourPillars={r.fourPillars} sajuBalance={r.sajuOhaengBalance} />);
    expect(summary).toContain(reading.dayMaster);
    expect(summary).toContain(reading.distribution);
    expect(summary).toContain(reading.disclaimer);

    const card = renderToStaticMarkup(<NameRankCard result={r} rank={1} />);
    expect(card).toContain(reading.nameRelation.replace(/'/g, '&#x27;'));

    for (const html of [
      renderToStaticMarkup(<ResultCard result={r} />),
      renderToStaticMarkup(<PdfNameDetail result={r} rank={1} pageNum={3} totalPages={8} />),
    ]) {
      for (const line of [reading.dayMaster, reading.distribution, reading.nameRelation.replace(/'/g, '&#x27;'), reading.disclaimer]) {
        expect(html).toContain(line);
      }
    }
  });
});
