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
