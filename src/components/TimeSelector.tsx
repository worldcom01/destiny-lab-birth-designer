'use client';

import { SIJIN_OPTIONS } from '@/types';

interface Props {
  value: number | null; // null: nothing selected yet
  onChange: (hour: number) => void;
}

export default function TimeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {SIJIN_OPTIONS.map(({ hour, label, range, hanja }) => {
        const active = value === hour;
        return (
          <button
            key={hour}
            type="button"
            onClick={() => onChange(hour)}
            className={`flex flex-col items-center px-2 py-2.5 rounded-xl border-2 text-center transition-all ${
              active
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span className={`text-base font-black leading-none ${active ? 'text-indigo-600' : 'text-slate-700'}`}>
              {hanja}
            </span>
            <span className={`text-[11px] font-semibold mt-0.5 ${active ? 'text-indigo-700' : 'text-slate-600'}`}>
              {label.split(' ')[0]}
            </span>
            <span className="text-[9px] text-slate-400 mt-0.5 leading-tight">{range}</span>
          </button>
        );
      })}
    </div>
  );
}
