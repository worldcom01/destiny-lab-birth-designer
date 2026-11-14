// @vitest-environment jsdom
// R5.10 Gate 2 — the analysis entry (/birth/start) describes result counts exactly as the result pages
// behave: Mode A and B rank EVERY candidate/combination, list 20 at a time (+20 per "더 보기"), and the
// PDF holds the top 20; Mode C evaluates up to 10 names. No "TOP 50" (never implemented).
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import StartPage from '@/app/start/page';
import { MODES } from '@/components/landing/content';

afterEach(cleanup);

describe('R5.10 Gate 2 — result-count wording', () => {
  it('/start: no TOP-N claims; the 20-at-a-time view and the PDF top 20 are stated', () => {
    const { container } = render(<StartPage />);
    const text = container.textContent!;
    expect(text).not.toMatch(/TOP ?\d+/);
    expect(text).not.toMatch(/최적|최고의|가장 잘 어울리는/);                 // no 'optimal/best' claims
    expect(text).not.toMatch(/날짜[^.]{0,12}추천|추천 (출산|출생)/);              // dates/times are compared, never recommended
    expect(text).toContain('생성된 후보 전체를 종합 점수 순으로');
    expect(text).toContain('20개씩');
    expect(text).toContain('PDF 상위 20개');
  });

  it('the wording matches the implementation (page size 20, increment 20, PDF top 20)', () => {
    for (const m of ['a', 'b']) {
      const src = readFileSync(`src/app/mode-${m}/results/page.tsx`, 'utf8');
      expect(src).toContain('useState(20)');
      expect(src).toContain('setShowCount(p => p + 20)');
    }
    expect(readFileSync('src/app/mode-a/results/page.tsx', 'utf8')).toContain('results?.slice(0, 20)');
    expect(readFileSync('src/app/mode-b/results/page.tsx', 'utf8')).toMatch(/top=\{20\}/);
    expect(readFileSync('src/components/pdf/PdfReport.tsx', 'utf8')).toContain('results.slice(0, 20)');
    expect(readFileSync('src/app/mode-c/page.tsx', 'utf8')).toContain('names.length < 10');
  });

  it('landing mode copy uses the same precise wording', () => {
    expect(MODES[0].body).toContain('20개씩');
    expect(MODES[0].body).toContain('PDF에는 상위 20개');
    expect(MODES[1].body).toContain('생성된 후보 전체');
    expect(MODES[2].body).toContain('최대 10개');
    for (const m of MODES) expect(m.body).not.toMatch(/TOP ?\d+|상위 20개 조합을 보여/);
  });
});
