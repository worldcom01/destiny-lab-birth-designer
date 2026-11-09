import React from 'react';
import { PdfPage, SectionLabel, GoldDivider } from './PdfPage';
import { AnalysisResult } from '@/types';
import { FullInterpretation } from '@/lib/interpretationEngine';

interface Props {
  result: AnalysisResult;
  interpretation: FullInterpretation;
  pageNum: number;
  totalPages: number;
}

const DIMENSIONS = [
  { key: 'personality',  label: '성격 및 기질',      icon: '◆' },
  { key: 'strengths',    label: '핵심 강점',          icon: '◆' },
  { key: 'growth',       label: '성장 방향',          icon: '◆' },
  { key: 'learning',     label: '학습 성향',          icon: '◆' },
  { key: 'relationships',label: '대인관계',           icon: '◆' },
  { key: 'leadership',   label: '리더십 성향',        icon: '◆' },
  { key: 'creativity',   label: '창의성',             icon: '◆' },
] as const;

export default function PdfInterpretation({ result, interpretation, pageNum, totalPages }: Props) {
  return (
    <PdfPage pageNum={pageNum} totalPages={totalPages}>
      <SectionLabel>Comprehensive Interpretation</SectionLabel>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0D1B2A', marginBottom: '4px' }}>
        종합 해석 — {result.name.full}
      </div>
      <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '20px' }}>
        전통 명리학 기반 가능성·성향·기질 중심 분석 | 미래 보장 서비스가 아닙니다
      </div>

      {/* Summary box */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: '#FFF9E8',
        border: '1px solid #F0D080',
        borderRadius: '10px',
        marginBottom: '20px',
        borderLeft: '4px solid #C9A84C',
      }}>
        <p style={{ fontSize: '11px', color: '#78350F', lineHeight: 1.8, margin: 0 }}>
          {interpretation.summary}
        </p>
      </div>

      <GoldDivider mt={0} mb={20} />

      {/* Two-column interpretation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 32px' }}>
        {DIMENSIONS.map(({ key, label }) => (
          <div key={key} style={{ breakInside: 'avoid' }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, color: '#C9A84C',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span style={{ fontSize: '6px', color: '#C9A84C' }}>◆</span>
              {label}
            </div>
            <p style={{
              fontSize: '10px', color: '#374151', lineHeight: 1.8,
              margin: 0, padding: '10px',
              backgroundColor: '#F8FAFC', borderRadius: '6px',
              borderLeft: '2px solid #E2E8F0',
            }}>
              {interpretation[key]}
            </p>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div style={{
        marginTop: '20px',
        padding: '10px 14px',
        backgroundColor: '#F8FAFC',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
      }}>
        <p style={{ fontSize: '9px', color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
          ※ 본 해석은 전통 명리학의 이론적 분석에 기반한 참고 자료입니다. 성격, 재능, 적성의 발현은 양육 환경, 교육, 개인의 노력 등 다양한 요인에 의해 결정되며, 본 분석이 특정 결과를 보장하거나 예측하는 것이 아님을 명확히 합니다. 출산일 결정은 반드시 담당 의료진과 상의하시기 바랍니다.
        </p>
      </div>
    </PdfPage>
  );
}
