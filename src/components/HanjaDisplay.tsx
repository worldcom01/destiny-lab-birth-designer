'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { OhaengType, OHAENG_COLORS } from '@/types';
import { HanjaOption, getHanjaOptions, getSuriOhaeng, findSurnameHanja } from '@/data/hanjaDB';
import HanjaPicker from './HanjaPicker';

interface CharInfo {
  hangul: string;
  defaultHanja: string;  // from nameChars.ts
  defaultMeaning: string;
}

interface Props {
  surname: string;
  char1: CharInfo;
  char2: CharInfo;
  weakestOhaeng?: OhaengType | null;
}

function SingleHanjaCard({
  charInfo,
  selected,
  onSelect,
  weakestOhaeng,
  label,
}: {
  charInfo: CharInfo;
  selected: HanjaOption | null;
  onSelect: (opt: HanjaOption | null) => void;
  weakestOhaeng?: OhaengType | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  const hanja = selected?.hanja ?? charInfo.defaultHanja;
  const meaning = selected?.meaning ?? charInfo.defaultMeaning;
  const strokes = selected?.strokes ?? 0;
  const jaWon = selected?.jaWonOhaeng ?? null;
  const suri = strokes > 0 ? getSuriOhaeng(strokes) : null;
  const options = getHanjaOptions(charInfo.hangul);

  return (
    <>
      <div
        className={`flex-1 border-2 rounded-xl p-3 text-center cursor-pointer transition-all ${
          selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
        }`}
        onClick={() => options.length > 0 && setOpen(true)}
      >
        <div className="text-3xl font-black text-slate-900 mb-1">{hanja}</div>
        <p className="text-[11px] font-semibold text-slate-700">{charInfo.hangul}</p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{meaning.split(' — ')[0] ?? meaning}</p>
        {strokes > 0 && (
          <p className="text-[10px] text-slate-400 mt-1">{strokes}획</p>
        )}
        <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
          {jaWon && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium"
              style={{ backgroundColor: OHAENG_COLORS[jaWon] + '18', color: OHAENG_COLORS[jaWon] }}>
              자원 {jaWon}
            </span>
          )}
          {suri && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium"
              style={{ backgroundColor: OHAENG_COLORS[suri] + '18', color: OHAENG_COLORS[suri] }}>
              수리 {suri}
            </span>
          )}
        </div>
        {options.length > 0 && (
          <p className="text-[9px] text-indigo-500 mt-1.5">탭하여 한자 변경</p>
        )}
      </div>

      {open && (
        <HanjaPicker
          hangul={charInfo.hangul}
          selectedHanja={hanja}
          onSelect={opt => { onSelect(opt); setOpen(false); }}
          onClose={() => setOpen(false)}
          recommendedOhaeng={weakestOhaeng}
          label={label}
        />
      )}
    </>
  );
}

export default function HanjaDisplay({ surname, char1, char2, weakestOhaeng }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sel1, setSel1] = useState<HanjaOption | null>(null);
  const [sel2, setSel2] = useState<HanjaOption | null>(null);

  const surnameData = findSurnameHanja(surname);

  const hanjaName = [
    surnameData?.hanja ?? surname,
    sel1?.hanja ?? char1.defaultHanja,
    sel2?.hanja ?? char2.defaultHanja,
  ].join('');

  const totalStrokes = [
    surnameData?.strokes ?? 0,
    sel1?.strokes ?? 0,
    sel2?.strokes ?? 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-semibold text-slate-700">한자 분석</span>
          <span className="text-xs font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
            {hanjaName}
          </span>
          {totalStrokes > 0 && (
            <span className="text-[10px] text-slate-400">총 {totalStrokes}획</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 bg-white">
          <p className="text-[11px] text-slate-500 mb-3">각 글자를 탭하면 다른 한자를 선택할 수 있습니다</p>

          <div className="flex gap-2">
            {/* 성씨 */}
            {surnameData && (
              <div className="flex-1 border-2 border-slate-200 bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-3xl font-black text-slate-900 mb-1">{surnameData.hanja}</div>
                <p className="text-[11px] font-semibold text-slate-700">{surname}씨</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{surnameData.meaning}</p>
                <p className="text-[10px] text-slate-400 mt-1">{surnameData.strokes}획</p>
                <div className="flex justify-center gap-1 mt-1.5">
                  <span className="text-[9px] px-1 py-0.5 rounded font-medium"
                    style={{ backgroundColor: OHAENG_COLORS[surnameData.jaWonOhaeng] + '18', color: OHAENG_COLORS[surnameData.jaWonOhaeng] }}>
                    자원 {surnameData.jaWonOhaeng}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 rounded font-medium"
                    style={{ backgroundColor: OHAENG_COLORS[getSuriOhaeng(surnameData.strokes)] + '18', color: OHAENG_COLORS[getSuriOhaeng(surnameData.strokes)] }}>
                    수리 {getSuriOhaeng(surnameData.strokes)}
                  </span>
                </div>
              </div>
            )}

            {/* 이름 첫 글자 */}
            <SingleHanjaCard
              charInfo={char1}
              selected={sel1}
              onSelect={opt => setSel1(opt)}
              weakestOhaeng={weakestOhaeng}
              label={`'${char1.hangul}' 한자 선택`}
            />

            {/* 이름 둘째 글자 */}
            <SingleHanjaCard
              charInfo={char2}
              selected={sel2}
              onSelect={opt => setSel2(opt)}
              weakestOhaeng={weakestOhaeng}
              label={`'${char2.hangul}' 한자 선택`}
            />
          </div>

          {/* 획수 합산 */}
          {totalStrokes > 0 && (
            <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
              <span className="font-semibold">획수 분석: </span>
              {surnameData && <span>{surnameData.hanja}({surnameData.strokes})</span>}
              {sel1 && <span> + {sel1.hanja}({sel1.strokes})</span>}
              {sel2 && <span> + {sel2.hanja}({sel2.strokes})</span>}
              {totalStrokes > 0 && (
                <span className="ml-1 font-bold text-indigo-700">
                  = 합계 {totalStrokes}획 (수리오행: {getSuriOhaeng(totalStrokes)})
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
