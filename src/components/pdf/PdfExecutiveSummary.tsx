import React from 'react';
import { PdfPage, SectionLabel, GoldDivider, OhaengBar, ScoreMeter } from './PdfPage';
import { AnalysisResult, GRADE_CONFIG, OHAENG_COLORS, Grade } from '@/types';
import { formatKoreanDate } from '@/lib/analysis';
import { getDisplayHour, getHourLabel } from '@/lib/saju';
import { formatTimeSlot } from '@/lib/schedule';

interface Props {
  results: AnalysisResult[];
  stats?: { total: number; grades: Record<Grade, number> };
  pageNum: number;
  totalPages: number;
}

const GRADE_COLOR: Record<Grade, string> = {
  SS: '#D4A843', S: '#8B5CF6', A: '#10B981', B: '#3B82F6', C: '#94A3B8',
};

function GradeStat({ grade, count, total }: { grade: Grade; count: number; total: number }) {
  const color = GRADE_COLOR[grade];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ textAlign: 'center', padding: '16px 8px', border: '1px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FAFBFC' }}>
      <div style={{ fontSize: '22px', fontWeight: 900, color }}>{count}</div>
      <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{grade}등급</div>
      <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px' }}>{pct}%</div>
    </div>
  );
}

export default function PdfExecutiveSummary({ results, stats, pageNum, totalPages }: Props) {
  const top = results[0];
  if (!top) return null;

  const grades: Record<Grade, number> = stats?.grades ?? results.reduce<Record<Grade, number>>((acc, r) => ({ ...acc, [r.grade]: acc[r.grade] + 1 }), { SS: 0, S: 0, A: 0, B: 0, C: 0 });
  const total = stats?.total ?? results.length;
  const ohaeng = top.sajuOhaengBalance;
  const ohaengTotal = Object.values(ohaeng).reduce((a, b) => a + b, 0);
  const gc = GRADE_CONFIG[top.grade];

  return (
    <PdfPage pageNum={pageNum} totalPages={totalPages}>
      <SectionLabel>Executive Summary</SectionLabel>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0D1B2A', marginBottom: '4px' }}>
        종합 분석 결과
      </div>
      <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '24px' }}>
        총 {total.toLocaleString()}가지 조합을 전통 명리학 기준으로 분석한 결과입니다
      </div>

      <GoldDivider mt={0} mb={24} />

      {/* #1 Best Result */}
      <div style={{
        display: 'flex', gap: '20px', alignItems: 'stretch',
        padding: '24px', backgroundColor: '#F8FAFC', borderRadius: '14px',
        border: '2px solid #E2E8F0', marginBottom: '24px',
      }}>
        {/* Grade badge */}
        <div style={{
          flexShrink: 0, width: '72px',
          borderRadius: '12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: top.grade === 'SS' ? 'linear-gradient(135deg, #D4A843, #F0C060)' :
                       top.grade === 'S'  ? 'linear-gradient(135deg, #8B5CF6, #A78BFA)' :
                       top.grade === 'A'  ? 'linear-gradient(135deg, #10B981, #34D399)' :
                                           'linear-gradient(135deg, #3B82F6, #60A5FA)',
        }}>
          <div style={{ fontSize: '9px', color: 'rgba(0,0,0,0.5)', letterSpacing: '0.05em' }}>{gc.description}</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#FFF', lineHeight: 1 }}>{top.grade}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)' }}>{top.scores.overall}점</div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: '#C9A84C', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            #1 최우선 추천
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
            <span style={{ fontSize: '30px', fontWeight: 900, color: '#0D1B2A' }}>{top.name.full}</span>
            <span style={{ fontSize: '14px', color: '#C9A84C', fontFamily: 'monospace', fontWeight: 600 }}>{top.nameAnalysis.hanja}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '3px' }}>
            {formatKoreanDate(top.date)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
            {top.timeSlot ? formatTimeSlot(top.timeSlot) : getDisplayHour(top.hour)} · {top.timeSlot ? getHourLabel(top.hour).split('(')[0] : getHourLabel(top.hour)}
          </div>

          {/* Characteristics */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {top.characteristics.map((t, i) => (
              <span key={i} style={{
                fontSize: '10px', padding: '3px 10px', borderRadius: '20px',
                backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Grade distribution */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '12px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          등급 분포
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {(['SS', 'S', 'A', 'B', 'C'] as Grade[]).map(g => (
            <GradeStat key={g} grade={g} count={grades[g]} total={total} />
          ))}
        </div>
      </div>

      <GoldDivider mt={0} mb={20} />

      {/* Two column: Ohaeng + Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        {/* Ohaeng balance */}
        <div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            추천 1위 오행 분포
          </div>
          <OhaengBar label="木 목" value={ohaeng.목} total={ohaengTotal} color={OHAENG_COLORS.목} />
          <OhaengBar label="火 화" value={ohaeng.화} total={ohaengTotal} color={OHAENG_COLORS.화} />
          <OhaengBar label="土 토" value={ohaeng.토} total={ohaengTotal} color={OHAENG_COLORS.토} />
          <OhaengBar label="金 금" value={ohaeng.금} total={ohaengTotal} color={OHAENG_COLORS.금} />
          <OhaengBar label="水 수" value={ohaeng.수} total={ohaengTotal} color={OHAENG_COLORS.수} />
        </div>

        {/* Scores */}
        <div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            세부 분석 점수
          </div>
          <ScoreMeter label="사주 오행 균형" value={top.scores.sajuOhaengBalance} />
          <ScoreMeter label="음양 조화" value={top.scores.yinYangHarmony} />
          <ScoreMeter label="이름·사주 조화" value={top.scores.nameHarmony} />
          <ScoreMeter label="발음 안정성" value={top.scores.pronunciationStability} />
          <ScoreMeter label="한자 의미 품질" value={top.scores.hanjaQuality} />
          <ScoreMeter label="현대적 사용성" value={top.scores.modernUsability} />
        </div>
      </div>
    </PdfPage>
  );
}
