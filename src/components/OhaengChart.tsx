'use client';

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { OhaengBalance, OHAENG_COLORS } from '@/types';

const ORDER: (keyof OhaengBalance)[] = ['목', '화', '토', '금', '수'];
const HANJA: Record<keyof OhaengBalance, string> = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };

interface Props {
  balance: OhaengBalance;
  size?: number;
  showBars?: boolean;
}

export default function OhaengChart({ balance, size = 180, showBars = true }: Props) {
  const total = Object.values(balance).reduce((a, b) => a + b, 0) || 1;

  const data = ORDER.map(k => ({
    element: `${HANJA[k]} ${k}`,
    value: balance[k],
    fullMark: 8,
  }));

  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width={size} height={size}>
        <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis
            dataKey="element"
            tick={{ fontSize: 10, fill: '#475569', fontWeight: 500 }}
          />
          <Radar
            name="오행"
            dataKey="value"
            stroke="#6366F1"
            fill="#6366F1"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip
            formatter={(v: number | string | readonly (number | string)[] | null | undefined) => [`${v}개`, '오행']}
          />
        </RadarChart>
      </ResponsiveContainer>

      {showBars && (
        <div className="w-full space-y-1.5">
          {ORDER.map(k => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-600 w-10 text-right">
                {HANJA[k]} {k}
              </span>
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(balance[k] / total) * 100}%`, backgroundColor: OHAENG_COLORS[k] }}
                />
              </div>
              <span className="text-[10px] text-slate-400 w-6 text-right">{balance[k]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
