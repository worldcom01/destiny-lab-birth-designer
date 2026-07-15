import React from 'react';
import { AnalysisResult, Grade } from '@/types';
import PdfCover from './PdfCover';
import PdfExecutiveSummary from './PdfExecutiveSummary';
import PdfNameDetail from './PdfNameDetail';
import PdfInterpretation from './PdfInterpretation';
import PdfTop20 from './PdfTop20';
import { generateFullInterpretation } from '@/lib/interpretationEngine';

interface Props {
  results: AnalysisResult[];
  surname: string;
  gender: string;
  dateRange?: string;
}

function makeReportId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DBD-${dateStr}-${rand}`;
}

export default function PdfReport({ results, surname, gender, dateRange }: Props) {
  if (!results.length) return null;

  const top20 = results.slice(0, 20);
  const top3 = top20.slice(0, 3);
  const reportId = makeReportId();
  const analysisDate = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  const gradeCounts: Record<Grade, number> = { SS: 0, S: 0, A: 0, B: 0, C: 0 };
  for (const r of results) gradeCounts[r.grade]++;

  const interpretation = generateFullInterpretation(top20[0]);

  // Page counts:
  // 1: Cover
  // 2: Executive Summary
  // 3-5: Name Details (top 3, one per page)
  // 6: AI Interpretation
  // 7: TOP 1-10
  // 8: TOP 11-20
  const TOTAL_PAGES = 8;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
      {/* Page 1: Cover */}
      <PdfCover
        topResult={top20[0]}
        totalCount={results.length}
        surname={surname}
        gender={gender}
        dateRange={dateRange}
        reportId={reportId}
        analysisDate={analysisDate}
        ssCount={gradeCounts.SS}
        sCount={gradeCounts.S}
      />

      {/* Page 2: Executive Summary */}
      <PdfExecutiveSummary
        results={top20}
        pageNum={2}
        totalPages={TOTAL_PAGES}
      />

      {/* Pages 3-5: Name Details for top 3 */}
      {top3.map((result, i) => (
        <PdfNameDetail
          key={result.id}
          result={result}
          rank={i + 1}
          pageNum={3 + i}
          totalPages={TOTAL_PAGES}
        />
      ))}

      {/* Page 6: AI Interpretation */}
      <PdfInterpretation
        result={top20[0]}
        interpretation={interpretation}
        pageNum={6}
        totalPages={TOTAL_PAGES}
      />

      {/* Page 7: TOP 1-10 */}
      <PdfTop20
        results={top20.slice(0, 10)}
        startRank={1}
        pageNum={7}
        totalPages={TOTAL_PAGES}
        title="추천 순위 1위~10위"
      />

      {/* Page 8: TOP 11-20 */}
      {top20.length > 10 && (
        <PdfTop20
          results={top20.slice(10, 20)}
          startRank={11}
          pageNum={8}
          totalPages={TOTAL_PAGES}
          title="추천 순위 11위~20위"
        />
      )}
    </div>
  );
}
