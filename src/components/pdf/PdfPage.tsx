import React from 'react';

export const PAGE_W = 794;
export const PAGE_H = 1123;
export const MARGIN = 56;

interface Props {
  children: React.ReactNode;
  pageNum?: number;
  totalPages?: number;
  noBorder?: boolean;
  darkBg?: boolean;
}

const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export function PdfPage({ children, pageNum, totalPages, noBorder, darkBg }: Props) {
  const bg = darkBg ? '#0D1B2A' : '#FFFFFF';
  const footerColor = darkBg ? 'rgba(255,255,255,0.3)' : '#CBD5E1';
  const footerText = darkBg ? 'rgba(255,255,255,0.4)' : '#94A3B8';

  return (
    <div
      className="pdf-page"
      style={{
        width: `${PAGE_W}px`,
        minHeight: `${PAGE_H}px`,
        height: `${PAGE_H}px`,
        backgroundColor: bg,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Gold top accent bar */}
      <div style={{
        height: '6px',
        background: 'linear-gradient(90deg, #9A6E2E 0%, #D4A843 30%, #F0D080 50%, #D4A843 70%, #9A6E2E 100%)',
        width: '100%',
      }} />

      {/* Content area */}
      <div style={{
        padding: `${MARGIN}px ${MARGIN}px ${MARGIN + 32}px`,
        minHeight: `${PAGE_H - 6 - 52}px`,
      }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${MARGIN}px`,
        borderTop: `1px solid ${footerColor}`,
      }}>
        <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: footerText, textTransform: 'uppercase' }}>
          Destiny Lab Birth Designer
        </span>
        <span style={{ fontSize: '9px', color: footerText, letterSpacing: '0.08em' }}>
          BIRTH DESIGN REPORT
        </span>
        {pageNum != null && (
          <span style={{ fontSize: '9px', color: footerText }}>
            {pageNum} / {totalPages}
          </span>
        )}
      </div>
    </div>
  );
}

// Section header label (gold caps)
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: '#C9A84C',
      fontWeight: 700,
      marginBottom: '10px',
      fontFamily: "'Noto Sans KR', monospace",
    }}>
      {children}
    </div>
  );
}

// Thin gold divider line
export function GoldDivider({ mt = 24, mb = 24 }: { mt?: number; mb?: number }) {
  return (
    <div style={{
      height: '1px',
      background: 'linear-gradient(90deg, transparent, #C9A84C 20%, #C9A84C 80%, transparent)',
      marginTop: `${mt}px`,
      marginBottom: `${mb}px`,
    }} />
  );
}

// Data row
export function DataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
      <span style={{ fontSize: '10px', color: '#94A3B8', letterSpacing: '0.05em', minWidth: '120px', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: '12px',
        color: '#1E293B',
        fontWeight: 500,
        fontFamily: mono ? 'monospace' : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

// Horizontal ohaeng bar
export function OhaengBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '11px', color: '#94A3B8' }}>{value}개 · {Math.round(pct)}%</span>
      </div>
      <div style={{ height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: '4px',
          transition: 'width 0s',
        }} />
      </div>
    </div>
  );
}

// Score meter
export function ScoreMeter({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? '#16A34A' : value >= 65 ? '#D4A843' : value >= 50 ? '#3B82F6' : '#94A3B8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <span style={{ fontSize: '10px', color: '#64748B', minWidth: '130px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '28px', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
