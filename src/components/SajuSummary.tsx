'use client';

import { FourPillars, OhaengBalance, OHAENG_COLORS } from '@/types';
import OhaengChart from './OhaengChart';
import { formatKoreanDate } from '@/lib/analysis';
import { getDisplayHour, getSijinLabel } from '@/lib/saju';
import { describeSaju, READING_DISCLAIMER } from '@/lib/sajuReading';
import SajuReadingBlock from './SajuReadingBlock';

interface Props {
  date: Date;
  hour: number;
  fourPillars: FourPillars;
  sajuBalance: OhaengBalance;
}

export default function SajuSummary({ date, hour, fourPillars, sajuBalance }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-700">확정 사주 정보</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {formatKoreanDate(date)} · {getDisplayHour(hour)}
          <span className="ml-1.5 text-slate-400">({getSijinLabel(hour)})</span>
        </p>
      </div>

      {/* 4주 */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: '년주', p: fourPillars.year },
          { label: '월주', p: fourPillars.month },
          { label: '일주', p: fourPillars.day },
          { label: '시주', p: fourPillars.hour },
        ].map(({ label, p }) => (
          <div key={label} className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-[10px] text-slate-400 mb-1">{label}</div>
            <div className="text-xs font-bold text-slate-800">{p.label.split('·')[0]}</div>
            <div className="text-[10px] text-slate-500">{p.label.split('·')[1]}</div>
            <div className="flex justify-center gap-1 mt-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: OHAENG_COLORS[p.stemOhaeng] + '20', color: OHAENG_COLORS[p.stemOhaeng] }}>
                {p.stemOhaeng}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: OHAENG_COLORS[p.branchOhaeng] + '20', color: OHAENG_COLORS[p.branchOhaeng] }}>
                {p.branchOhaeng}
              </span>
            </div>
          </div>
        ))}
      </div>

      <OhaengChart balance={sajuBalance} size={160} />

      {(() => {
        const saju = describeSaju(fourPillars, sajuBalance);
        return <SajuReadingBlock dayMaster={saju.dayMaster} distribution={saju.distribution} disclaimer={READING_DISCLAIMER} />;
      })()}
    </div>
  );
}
