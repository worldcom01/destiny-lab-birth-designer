import React from 'react';
import { PAGE_W, PAGE_H } from './PdfPage';
import { AnalysisResult, GRADE_CONFIG, OhaengBalance } from '@/types';
import { formatKoreanDate } from '@/lib/analysis';

interface Props {
  topResult: AnalysisResult;
  totalCount: number;
  totalPages: number;
  surname: string;
  gender: string;
  dateRange?: string;
  reportId: string;
  analysisDate: string;
  ssCount: number;
  sCount: number;
}

const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export default function PdfCover({
  topResult, totalCount, totalPages, surname, gender, dateRange, reportId, analysisDate, ssCount, sCount,
}: Props) {
  const gc = GRADE_CONFIG[topResult.grade];

  return (
    <div
      className="pdf-page"
      style={{
        width: `${PAGE_W}px`,
        height: `${PAGE_H}px`,
        backgroundColor: '#0D1B2A',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Gold top bar */}
      <div style={{ height: '6px', background: 'linear-gradient(90deg, #9A6E2E, #D4A843, #F0D080, #D4A843, #9A6E2E)' }} />

      {/* Subtle background pattern */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 70% 20%, rgba(212,168,67,0.08) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div style={{ padding: '64px 64px 0', position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px', letterSpacing: '0.25em', color: '#C9A84C',
            textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px',
          }}>
            Destiny Lab
          </div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Birth Designer
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '6px', letterSpacing: '0.06em' }}>
            AI 출생일 · 출생시 · 작명 설계 플랫폼
          </div>
        </div>

        {/* Gold divider */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, #C9A84C 0%, rgba(201,168,76,0.3) 100%)',
          margin: '32px 0',
        }} />

        {/* Report title */}
        <div style={{
          fontSize: '22px', fontWeight: 800, color: '#FFFFFF',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: '32px',
        }}>
          Birth Design Report
        </div>

        {/* Report metadata box */}
        <div style={{
          border: '1px solid rgba(201,168,76,0.35)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '32px',
          backgroundColor: 'rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              { label: 'Report ID', value: reportId },
              { label: 'Generated', value: analysisDate },
              { label: '의뢰인 성씨', value: `${surname}씨` },
              { label: '성별', value: gender === '남' ? '남아 (男兒)' : '여아 (女兒)' },
              ...(dateRange ? [{ label: '분석 기간', value: dateRange }] : []),
              { label: '총 분석 조합', value: `${totalCount.toLocaleString()}가지` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  {label}
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* #1 Recommendation highlight */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%)',
          border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '32px',
        }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: '#C9A84C', textTransform: 'uppercase', marginBottom: '12px' }}>
            최우선 추천 조합
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
            {/* Grade badge */}
            <div style={{
              width: '60px', height: '60px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #D4A843, #F0D080)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: '9px', color: 'rgba(0,0,0,0.5)', letterSpacing: '0.08em' }}>{gc.description}</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#000', lineHeight: 1 }}>{topResult.grade}</div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontSize: '28px', fontWeight: 900, color: '#FFFFFF' }}>{topResult.name.full}</span>
                <span style={{ fontSize: '14px', color: '#C9A84C', fontFamily: 'monospace' }}>{topResult.nameAnalysis.hanja}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                {formatKoreanDate(topResult.date)}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                종합점수 <span style={{ color: '#D4A843', fontWeight: 700 }}>{topResult.scores.overall}점</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grade summary */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { grade: 'SS', count: ssCount, color: '#D4A843' },
            { grade: 'S', count: sCount, color: '#8B5CF6' },
          ].map(({ grade, count, color }) => (
            <div key={grade} style={{
              flex: 1, padding: '14px', borderRadius: '8px',
              border: `1px solid ${color}40`, backgroundColor: `${color}10`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color }}>{count}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{grade}등급</div>
            </div>
          ))}
          <div style={{ flex: 2, padding: '14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: '4px' }}>DISCLAIMER</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              전통 명리학 참고 분석 자료<br />의료적 판단을 대체하지 않음
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '44px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 64px', borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
          Powered by Destiny Lab
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>CONFIDENTIAL</span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>1 / {totalPages}</span>
      </div>
    </div>
  );
}
