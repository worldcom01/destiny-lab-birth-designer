import React from 'react';
import { PdfPage, SectionLabel, GoldDivider, OhaengBar, ScoreMeter } from './PdfPage';
import { AnalysisResult, OHAENG_COLORS, GRADE_CONFIG, OhaengType } from '@/types';
import { formatKoreanDate } from '@/lib/analysis';
import { getDisplayHour, getHourLabel } from '@/lib/saju';
import { findSurnameHanja, getHanjaOptions, getSuriOhaeng } from '@/data/hanjaDB';

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
      padding: '14px 8px', border: '1px solid #E2E8F0',
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

function HanjaCharCard({ hangul, hanja, meaning, strokes, jaWon, suri }: {
  hangul: string; hanja: string; meaning: string; strokes?: number; jaWon?: OhaengType; suri?: OhaengType;
}) {
  return (
    <div style={{
      flex: 1, textAlign: 'center',
      backgroundColor: '#FAFBFC', borderRadius: '10px',
      border: '1px solid #E2E8F0', padding: '16px 8px',
    }}>
      <div style={{ fontSize: '36px', fontWeight: 900, color: '#0D1B2A', lineHeight: 1, marginBottom: '6px' }}>{hanja}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>{hangul}</div>
      <div style={{ fontSize: '10px', color: '#64748B', lineHeight: 1.5, marginBottom: '8px' }}>
        {meaning.split(' — ').map((m, i) => <div key={i}>{m}</div>)}
      </div>
      {strokes != null && (
        <div style={{ fontSize: '10px', color: '#94A3B8' }}>{strokes}획</div>
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

  // Hanja data
  const surnameHanja = findSurnameHanja(result.name.surname);
  const char1Opts = getHanjaOptions(result.name.char1.hangul);
  const char2Opts = getHanjaOptions(result.name.char2.hangul);
  const char1H = char1Opts[0];
  const char2H = char2Opts[0];

  const hanjaNameDisplay = [
    surnameHanja?.hanja ?? result.name.surname,
    char1H?.hanja ?? result.name.char1.hanja,
    char2H?.hanja ?? result.name.char2.hanja,
  ].join('');

  const totalStrokes = (surnameHanja?.strokes ?? 0) + (char1H?.strokes ?? 0) + (char2H?.strokes ?? 0);

  return (
    <PdfPage pageNum={pageNum} totalPages={totalPages}>
      <SectionLabel>Name Analysis · {rank}위 추천</SectionLabel>

      {/* Name hero */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px',
        padding: '20px 24px', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0',
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
            {formatKoreanDate(result.date)} · {getDisplayHour(result.hour)} · {getHourLabel(result.hour)}
          </div>
          {totalStrokes > 0 && (
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
              총 획수 {totalStrokes}획 · 수리오행 {getSuriOhaeng(totalStrokes)}
            </div>
          )}
        </div>
      </div>

      <GoldDivider mt={0} mb={20} />

      {/* Hanja breakdown */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
          한자 분석
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {surnameHanja && (
            <HanjaCharCard
              hangul={result.name.surname + '씨'}
              hanja={surnameHanja.hanja}
              meaning={surnameHanja.meaning}
              strokes={surnameHanja.strokes}
              jaWon={surnameHanja.jaWonOhaeng}
              suri={getSuriOhaeng(surnameHanja.strokes)}
            />
          )}
          {char1H && (
            <HanjaCharCard
              hangul={result.name.char1.hangul}
              hanja={char1H.hanja}
              meaning={char1H.meaning}
              strokes={char1H.strokes}
              jaWon={char1H.jaWonOhaeng}
              suri={getSuriOhaeng(char1H.strokes)}
            />
          )}
          {char2H && (
            <HanjaCharCard
              hangul={result.name.char2.hangul}
              hanja={char2H.hanja}
              meaning={char2H.meaning}
              strokes={char2H.strokes}
              jaWon={char2H.jaWonOhaeng}
              suri={getSuriOhaeng(char2H.strokes)}
            />
          )}
        </div>
      </div>

      {/* 4 Pillars */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
          사주 구조
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <PillarCard label="년주 (年柱)" pillar={fp.year} />
          <PillarCard label="월주 (月柱)" pillar={fp.month} />
          <PillarCard label="일주 (日柱)" pillar={fp.day} />
          <PillarCard label="시주 (時柱)" pillar={fp.hour} />
        </div>
      </div>

      <GoldDivider mt={0} mb={20} />

      {/* Ohaeng + Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            오행 분포
          </div>
          {(['목', '화', '토', '금', '수'] as OhaengType[]).map(k => (
            <OhaengBar key={k} label={OHAENG_LABEL[k]} value={ohaeng[k]} total={ohaengTotal} color={OHAENG_COLORS[k]} />
          ))}
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
            분석 점수
          </div>
          <ScoreMeter label="사주 오행 균형" value={result.scores.sajuOhaengBalance} />
          <ScoreMeter label="음양 조화" value={result.scores.yinYangHarmony} />
          <ScoreMeter label="이름·사주 조화" value={result.scores.nameHarmony} />
          <ScoreMeter label="발음 안정성" value={result.scores.pronunciationStability} />
          <ScoreMeter label="한자 의미 품질" value={result.scores.hanjaQuality} />
          <ScoreMeter label="현대적 사용성" value={result.scores.modernUsability} />

          {/* Description */}
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '8px', borderLeft: '3px solid #C9A84C' }}>
            <p style={{ fontSize: '10px', color: '#475569', lineHeight: 1.7, margin: 0 }}>
              {result.description}
            </p>
          </div>
        </div>
      </div>
    </PdfPage>
  );
}
