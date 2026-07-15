import React from 'react';
import { PdfPage, SectionLabel, GoldDivider } from './PdfPage';
import { AnalysisResult, OHAENG_COLORS, OhaengType, Grade } from '@/types';
import { formatKoreanDate } from '@/lib/analysis';
import { getDisplayHour } from '@/lib/saju';

interface Props {
  results: AnalysisResult[];  // TOP 10 per page
  startRank: number;
  pageNum: number;
  totalPages: number;
  title: string;
}

const GRADE_COLOR: Record<Grade, string> = {
  SS: '#D4A843', S: '#8B5CF6', A: '#10B981', B: '#3B82F6', C: '#94A3B8',
};

const GRADE_BG: Record<Grade, string> = {
  SS: '#FFF9E8', S: '#F5F3FF', A: '#ECFDF5', B: '#EFF6FF', C: '#F8FAFC',
};

function MiniOhaengDot({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ display: 'inline-block', width: `${Math.max(pct * 0.3, 4)}px`, height: '4px', backgroundColor: color, borderRadius: '2px', margin: '0 1px' }} />
  );
}

export default function PdfTop20({ results, startRank, pageNum, totalPages, title }: Props) {
  return (
    <PdfPage pageNum={pageNum} totalPages={totalPages}>
      <SectionLabel>Top Recommendations</SectionLabel>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0D1B2A', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '20px' }}>
        전통 명리학 종합 점수 기준 정렬 | 등급이 높다고 더 나은 삶을 보장하지 않습니다
      </div>

      <GoldDivider mt={0} mb={16} />

      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 60px 120px 100px 80px 50px 50px 60px 40px',
        gap: '0 8px',
        padding: '8px 12px',
        backgroundColor: '#F1F5F9',
        borderRadius: '8px',
        marginBottom: '6px',
      }}>
        {['순위', '등급', '이름 (한자)', '출생일', '출생시', '종합', '이름조화', '오행', '음양'].map(h => (
          <div key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textAlign: 'center' }}>
            {h}
          </div>
        ))}
      </div>

      {/* Table rows */}
      {results.map((r, i) => {
        const rank = startRank + i;
        const ohaengTotal = Object.values(r.sajuOhaengBalance).reduce((a, b) => a + b, 0);
        const isTop3 = rank <= 3;

        return (
          <div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '40px 60px 120px 100px 80px 50px 50px 60px 40px',
            gap: '0 8px',
            padding: '9px 12px',
            backgroundColor: isTop3 ? GRADE_BG[r.grade] : i % 2 === 0 ? '#FFFFFF' : '#FAFBFC',
            borderRadius: '6px',
            borderLeft: isTop3 ? `3px solid ${GRADE_COLOR[r.grade]}` : '3px solid transparent',
            marginBottom: '2px',
            alignItems: 'center',
          }}>
            {/* Rank */}
            <div style={{ fontSize: rank <= 3 ? '14px' : '11px', fontWeight: 900, color: rank <= 3 ? GRADE_COLOR[r.grade] : '#94A3B8', textAlign: 'center' }}>
              {rank}
            </div>
            {/* Grade */}
            <div style={{ textAlign: 'center' }}>
              <span style={{
                fontSize: '11px', fontWeight: 800, color: GRADE_COLOR[r.grade],
                backgroundColor: GRADE_BG[r.grade], padding: '2px 8px', borderRadius: '4px',
                border: `1px solid ${GRADE_COLOR[r.grade]}40`,
              }}>
                {r.grade}
              </span>
            </div>
            {/* Name */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0D1B2A' }}>{r.name.full}</div>
              <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace' }}>{r.nameAnalysis.hanja}</div>
            </div>
            {/* Date */}
            <div style={{ fontSize: '9px', color: '#475569' }}>
              {new Date(r.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
            </div>
            {/* Time */}
            <div style={{ fontSize: '9px', color: '#475569' }}>
              {getDisplayHour(r.hour)}
            </div>
            {/* Overall */}
            <div style={{ fontSize: '12px', fontWeight: 800, color: GRADE_COLOR[r.grade], textAlign: 'center' }}>
              {r.scores.overall}
            </div>
            {/* Name harmony */}
            <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
              {r.scores.nameHarmony}
            </div>
            {/* Mini ohaeng bars */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(['목', '화', '토', '금', '수'] as OhaengType[]).map(k => (
                <MiniOhaengDot key={k} value={r.sajuOhaengBalance[k]} total={ohaengTotal} color={OHAENG_COLORS[k]} />
              ))}
            </div>
            {/* Yin-Yang */}
            <div style={{ fontSize: '9px', color: '#64748B', textAlign: 'center' }}>
              {r.scores.yinYangHarmony}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <GoldDivider mt={16} mb={12} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
        {(['SS', 'S', 'A', 'B', 'C'] as Grade[]).map(g => (
          <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: GRADE_COLOR[g] }} />
            <span style={{ fontSize: '9px', color: '#64748B' }}>{g}등급</span>
          </div>
        ))}
      </div>
    </PdfPage>
  );
}
