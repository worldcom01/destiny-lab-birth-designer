import React from 'react';
import { OVERALL_COMPONENTS, nameLengthScopeNote } from '@/lib/scoreComponents';
import { PdfPage, SectionLabel, GoldDivider, OhaengBar, ScoreMeter } from './PdfPage';
import { AnalysisResult, OHAENG_COLORS, GRADE_CONFIG, OhaengType, NameCharHanja } from '@/types';
import { formatKoreanDate } from '@/lib/analysis';
import { getDisplayHour, getHourLabel, getSijinLabel } from '@/lib/saju';
import { formatTimeSlot } from '@/lib/schedule';
import { buildSajuReading } from '@/lib/sajuReading';
import { getSuriOhaeng } from '@/data/hanjaDB';
import { LEGACY_GLOSS_LABEL, charStatusLabel, UNASSIGNED_MARK, formatFullHanja, hanjaStatusLabel, totalStrokes } from '@/lib/hanjaModel';

interface Props {
  result: AnalysisResult;
  rank: number;
  pageNum: number;
  totalPages: number;
}

const OHAENG_LABEL: Record<OhaengType, string> = { 목: '木 목', 화: '火 화', 토: '土 토', 금: '金 금', 수: '水 수' };

function PillarCard({ label, pillar }: {
  label: string;
  pillar: { label: string; stemOhaeng: OhaengType; branchOhaeng: OhaengType };
}) {
  const parts = pillar.label.split('·');
  return (
    <div style={{
      flex: 1, textAlign: 'center',
      backgroundColor: '#F8FAFC', borderRadius: '10px',
      padding: '10px 8px', border: '1px solid #E2E8F0',
    }}>
      <div style={{ fontSize: '9px', color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0D1B2A', marginBottom: '8px' }}>{parts[0] ?? pillar.label}</div>
      <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>{parts[1] ?? ''}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
        {[pillar.stemOhaeng, pillar.branchOhaeng].map((o, i) => (
          <span key={i} style={{
            fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700,
            backgroundColor: OHAENG_COLORS[o] + '18', color: OHAENG_COLORS[o],
            border: `1px solid ${OHAENG_COLORS[o]}30`,
          }}>{o}</span>
        ))}
      </div>
    </div>
  );
}

function HanjaCharCard({ caption, char }: { caption: string; char: NameCharHanja }) {
  const jaWon = char.jaWonOhaeng;
  const suri = char.strokes != null ? getSuriOhaeng(char.strokes) : null;
  return (
    <div data-hanja-char={char.hanja ?? ''} data-hanja-status={char.status} style={{
      flex: 1, textAlign: 'center',
      backgroundColor: '#FAFBFC', borderRadius: '10px',
      border: '1px solid #E2E8F0', padding: '12px 8px',
    }}>
      <div style={{ fontSize: '36px', fontWeight: 900, color: char.hanja ? '#0D1B2A' : '#CBD5E1', lineHeight: 1, marginBottom: '6px' }}>
        {char.hanja ?? UNASSIGNED_MARK}
      </div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>{caption}</div>
      <div style={{ fontSize: '9px', fontWeight: 700, color: char.status === 'confirmed' ? '#4F46E5' : '#94A3B8', marginBottom: '4px' }}>
        {charStatusLabel(char)}
      </div>
      <div style={{ fontSize: '10px', color: '#64748B', lineHeight: 1.5, marginBottom: '8px' }}>
        {char.hanja ? (char.meaning ? `${char.meaning} (${LEGACY_GLOSS_LABEL})` : '확인된 뜻 없음') : '한자 미지정'}
      </div>
      {char.hanja && (
        <div style={{ fontSize: '10px', color: '#94A3B8' }}>{char.strokes != null ? `${char.strokes}획` : '획수 미확인'}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
        {jaWon && (
          <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: OHAENG_COLORS[jaWon] + '18', color: OHAENG_COLORS[jaWon], border: `1px solid ${OHAENG_COLORS[jaWon]}30` }}>
            자원 {jaWon}
          </span>
        )}
        {suri && (
          <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', backgroundColor: OHAENG_COLORS[suri] + '18', color: OHAENG_COLORS[suri], border: `1px solid ${OHAENG_COLORS[suri]}30` }}>
            수리 {suri}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PdfNameDetail({ result, rank, pageNum, totalPages }: Props) {
  const fp = result.fourPillars;
  const ohaeng = result.sajuOhaengBalance;
  const ohaengTotal = Object.values(ohaeng).reduce((a, b) => a + b, 0);
  const gc = GRADE_CONFIG[result.grade];

  // Hanja data: canonical model only (no independent lookup or fallback)
  const model = result.name.hanja;
  const reading = buildSajuReading(result);
  const hanjaNameDisplay = formatFullHanja(model);
  const strokesSum = totalStrokes([...model.surname, ...model.given]);

  return (
    <PdfPage pageNum={pageNum} totalPages={totalPages}>
      <SectionLabel>Name Analysis · {rank}위 추천</SectionLabel>

      {/* Name hero */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '10px',
        padding: '12px 24px', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0',
      }}>
        {/* Grade */}
        <div style={{
          flexShrink: 0, width: '64px', height: '64px', borderRadius: '12px',
          background: result.grade === 'SS' ? 'linear-gradient(135deg,#D4A843,#F0C060)' :
                       result.grade === 'S' ? 'linear-gradient(135deg,#8B5CF6,#A78BFA)' :
                       result.grade === 'A' ? 'linear-gradient(135deg,#10B981,#34D399)' :
                                             'linear-gradient(135deg,#3B82F6,#60A5FA)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#FFF', lineHeight: 1 }}>{result.grade}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)' }}>{result.scores.overall}</div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '36px', fontWeight: 900, color: '#0D1B2A' }}>{result.name.full}</span>
            <span style={{ fontSize: '18px', color: '#C9A84C', fontFamily: 'monospace', fontWeight: 700 }}>{hanjaNameDisplay}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {formatKoreanDate(result.date)} · {result.timeSlot ? formatTimeSlot(result.timeSlot) : getDisplayHour(result.hour)} · {result.timeSlot ? getHourLabel(result.hour).split('(')[0] : getSijinLabel(result.hour)}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
            {hanjaStatusLabel(model)}
            {strokesSum != null
              ? ` · 총 획수 ${strokesSum}획 · 수리오행 ${getSuriOhaeng(strokesSum)}`
              : ' · 획수 합계 미산출 (미지정·미확인 글자 포함)'}
          </div>
        </div>
      </div>

      <GoldDivider mt={0} mb={10} />

      {/* Hanja breakdown */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          한자 분석
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {model.surname.map((c, i) => (
            <HanjaCharCard key={`s${i}`} caption={model.surname.length === 1 ? `${c.hangul}씨` : c.hangul} char={c} />
          ))}
          {model.given.map((c, i) => (
            <HanjaCharCard key={`g${i}`} caption={c.hangul} char={c} />
          ))}
        </div>
      </div>

      {/* 4 Pillars */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          사주 구조
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <PillarCard label="년주 (年柱)" pillar={fp.year} />
          <PillarCard label="월주 (月柱)" pillar={fp.month} />
          <PillarCard label="일주 (日柱)" pillar={fp.day} />
          <PillarCard label="시주 (時柱)" pillar={fp.hour} />
        </div>
      </div>

      <GoldDivider mt={0} mb={10} />

      {/* Ohaeng + Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            오행 분포
          </div>
          {(['목', '화', '토', '금', '수'] as OhaengType[]).map(k => (
            <OhaengBar key={k} label={OHAENG_LABEL[k]} value={ohaeng[k]} total={ohaengTotal} color={OHAENG_COLORS[k]} />
          ))}
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            분석 점수
          </div>
          {OVERALL_COMPONENTS.map(c => (
            <ScoreMeter key={c.key} label={`${c.label} ${c.weight}%`} value={result.scores[c.key]} />
          ))}
          {nameLengthScopeNote(result.name.given, { compact: true }) && (
            <p data-testid="pdf-name-length-note" style={{ fontSize: '9px', color: '#92400E', lineHeight: 1.5, margin: '6px 0 0' }}>
              {nameLengthScopeNote(result.name.given, { compact: true })}
            </p>
          )}

          {/* Description */}
          <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: '8px', borderLeft: '3px solid #C9A84C' }}>
            <p style={{ fontSize: '10px', color: '#475569', lineHeight: 1.7, margin: 0 }}>
              {result.description}
            </p>
          </div>
        </div>
      </div>

      {/* Short Saju reading */}
      <div data-testid="pdf-saju-reading" style={{
        marginTop: '10px', padding: '10px 16px', backgroundColor: '#F5F3FF', borderRadius: '10px', border: '1px solid #E0E7FF',
      }}>
        <div style={{ fontSize: '11px', color: '#3730A3', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '8px' }}>
          짧은 사주풀이
        </div>
        {[
          ['사주 구성', reading.dayMaster],
          ['오행 분포', reading.distribution],
          ['이름과의 관계', reading.nameRelation],
        ].map(([label, text]) => (
          <p key={label} style={{ fontSize: '10px', color: '#334155', lineHeight: 1.7, margin: '0 0 4px 0' }}>
            <span style={{ fontWeight: 700, color: '#3730A3' }}>{label}</span> · {text}
          </p>
        ))}
        <p style={{ fontSize: '9px', color: '#94A3B8', margin: '6px 0 0 0' }}>{reading.disclaimer}</p>
      </div>
    </PdfPage>
  );
}
