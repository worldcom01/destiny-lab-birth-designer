'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { OhaengType, OHAENG_COLORS } from '@/types';
import { HanjaOption, getSuriOhaeng, findSurnameHanja } from '@/data/hanjaDB';
import HanjaPicker from './HanjaPicker';

interface HanjaInputRowProps {
  label: string;
  hangul: string;
  selected?: HanjaOption | null;
  onSelect: (opt: HanjaOption) => void;
  onClear: () => void;
  recommendedOhaeng?: OhaengType | null;
  isSurname?: boolean;
}

export function HanjaInputRow({
  label, hangul, selected, onSelect, onClear, recommendedOhaeng, isSurname = false
}: HanjaInputRowProps) {
  const [open, setOpen] = useState(false);

  // 성씨인 경우 DB에서 직접 로드
  const surnameData = isSurname ? findSurnameHanja(hangul) : null;
  const displayHanja = isSurname
    ? (surnameData?.hanja ?? hangul)
    : (selected?.hanja ?? '?');

  const displayMeaning = isSurname
    ? (surnameData?.meaning ?? '')
    : (selected?.meaning ?? '');

  const displayStrokes = isSurname
    ? (surnameData?.strokes ?? 0)
    : (selected?.strokes ?? 0);

  const displayJaWon = isSurname
    ? (surnameData?.jaWonOhaeng ?? null)
    : (selected?.jaWonOhaeng ?? null);

  const displaySuri = displayStrokes > 0 ? getSuriOhaeng(displayStrokes) : null;

  if (isSurname && surnameData) {
    return (
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="text-3xl font-black text-slate-800 w-10 text-center">{surnameData.hanja}</div>
        <div className="flex-1">
          <p className="text-xs font-bold text-slate-700">{hangul}씨 한자: {surnameData.hanja}</p>
          <p className="text-[11px] text-slate-500">{surnameData.meaning} · {surnameData.strokes}획 · {surnameData.radical}부</p>
          <div className="flex gap-1.5 mt-1">
            {displayJaWon && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: OHAENG_COLORS[displayJaWon] + '18', color: OHAENG_COLORS[displayJaWon] }}>
                자원 {displayJaWon}
              </span>
            )}
            {displaySuri && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: OHAENG_COLORS[displaySuri] + '18', color: OHAENG_COLORS[displaySuri] }}>
                수리 {displaySuri}
              </span>
            )}
            <span className="text-[10px] text-slate-400">{surnameData.origin.split(' ')[0]}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!hangul || hangul.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
          selected
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-dashed border-slate-300 bg-slate-50 hover:border-slate-400'
        }`}
      >
        {/* 한자 표시 */}
        <div className={`text-3xl font-black w-10 text-center flex-shrink-0 ${selected ? 'text-indigo-800' : 'text-slate-400'}`}>
          {displayHanja}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-700">
            {label}
            {selected ? ` — ${displayHanja}` : ' — 한자 선택'}
          </p>
          {selected ? (
            <>
              <p className="text-[11px] text-slate-500">{displayMeaning} · {displayStrokes}획</p>
              <div className="flex gap-1.5 mt-1">
                {displayJaWon && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: OHAENG_COLORS[displayJaWon] + '18', color: OHAENG_COLORS[displayJaWon] }}>
                    자원 {displayJaWon}
                  </span>
                )}
                {displaySuri && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: OHAENG_COLORS[displaySuri] + '18', color: OHAENG_COLORS[displaySuri] }}>
                    수리 {displaySuri}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">탭하여 한자를 선택하세요</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selected && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onClear(); }}
              className="text-[10px] text-slate-400 hover:text-red-400 px-1.5 py-0.5 rounded transition-colors"
            >
              초기화
            </button>
          )}
          <BookOpen className="w-4 h-4 text-slate-400" />
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </div>
      </button>

      {open && (
        <HanjaPicker
          hangul={hangul}
          selectedHanja={selected?.hanja}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
          recommendedOhaeng={recommendedOhaeng}
          label={label}
        />
      )}
    </>
  );
}
