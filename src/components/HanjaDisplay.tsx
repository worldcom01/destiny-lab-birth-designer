'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { NameCharHanja, NameHanjaModel, OhaengType, OHAENG_COLORS } from '@/types';
import { HanjaOption, getHanjaOptions, getSuriOhaeng } from '@/data/hanjaDB';
import { STATUS_LABEL, UNASSIGNED_MARK, formatFullHanja, totalStrokes } from '@/lib/hanjaModel';
import HanjaPicker from './HanjaPicker';

interface Props {
  model: NameHanjaModel;
  /** Called with the given-name index and the chosen option. Omit for read-only display. */
  onSelect?: (index: number, opt: HanjaOption) => void;
  weakestOhaeng?: OhaengType | null;
}

const STATUS_STYLE: Record<NameCharHanja['status'], string> = {
  confirmed: 'bg-indigo-600 text-white',
  suggested: 'bg-amber-100 text-amber-700',
  unassigned: 'bg-slate-200 text-slate-600',
};

export function HanjaCharCard({
  char,
  caption,
  onSelect,
  weakestOhaeng,
}: {
  char: NameCharHanja;
  caption: string;
  onSelect?: (opt: HanjaOption) => void;
  weakestOhaeng?: OhaengType | null;
}) {
  const [open, setOpen] = useState(false);
  const options = onSelect ? getHanjaOptions(char.hangul) : [];
  const selectable = options.length > 0;
  const suri = char.strokes != null ? getSuriOhaeng(char.strokes) : null;

  return (
    <>
      <div
        data-hanja-char={char.hanja ?? ''}
        data-hanja-status={char.status}
        className={`flex-1 border-2 rounded-xl p-3 text-center transition-all ${selectable ? 'cursor-pointer' : ''} ${
          char.status === 'confirmed' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
        }`}
        onClick={() => selectable && setOpen(true)}
      >
        <div className={`text-3xl font-black mb-1 ${char.hanja ? 'text-slate-900' : 'text-slate-300'}`}>
          {char.hanja ?? UNASSIGNED_MARK}
        </div>
        <p className="text-[11px] font-semibold text-slate-700">{caption}</p>
        <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-bold mt-1 ${STATUS_STYLE[char.status]}`}>
          {STATUS_LABEL[char.status]}
        </span>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
          {char.hanja ? (char.meaning ?? '뜻 정보 없음') : '한자를 선택하지 않았습니다'}
        </p>
        {char.hanja && (
          <p className="text-[10px] text-slate-400 mt-1">{char.strokes != null ? `${char.strokes}획` : '획수 미확인'}</p>
        )}
        <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
          {char.jaWonOhaeng && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium"
              style={{ backgroundColor: OHAENG_COLORS[char.jaWonOhaeng] + '18', color: OHAENG_COLORS[char.jaWonOhaeng] }}>
              자원 {char.jaWonOhaeng}
            </span>
          )}
          {suri && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium"
              style={{ backgroundColor: OHAENG_COLORS[suri] + '18', color: OHAENG_COLORS[suri] }}>
              수리 {suri}
            </span>
          )}
        </div>
        {onSelect && (
          <p className={`text-[9px] mt-1.5 ${selectable ? 'text-indigo-500' : 'text-slate-400'}`}>
            {selectable ? '탭하여 한자 변경' : '한자 데이터 없음'}
          </p>
        )}
      </div>

      {open && onSelect && (
        <HanjaPicker
          hangul={char.hangul}
          selectedHanja={char.hanja ?? undefined}
          onSelect={opt => { onSelect(opt); setOpen(false); }}
          onClose={() => setOpen(false)}
          recommendedOhaeng={weakestOhaeng}
          label={`'${char.hangul}' 한자 선택`}
        />
      )}
    </>
  );
}

export default function HanjaDisplay({ model, onSelect, weakestOhaeng }: Props) {
  const [expanded, setExpanded] = useState(false);
  const allChars = [...model.surname, ...model.given];
  const strokesSum = totalStrokes(allChars);

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
            {formatFullHanja(model)}
          </span>
          {strokesSum != null && (
            <span className="text-[10px] text-slate-400">총 {strokesSum}획</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 bg-white">
          {onSelect && (
            <p className="text-[11px] text-slate-500 mb-3">각 글자를 탭하면 다른 한자를 선택할 수 있습니다</p>
          )}

          <div className="flex gap-2">
            {model.surname.map((c, i) => (
              <HanjaCharCard key={`s${i}`} char={c} caption={model.surname.length === 1 ? `${c.hangul}씨` : c.hangul} />
            ))}
            {model.given.map((c, i) => (
              <HanjaCharCard
                key={`g${i}`}
                char={c}
                caption={c.hangul}
                onSelect={onSelect ? opt => onSelect(i, opt) : undefined}
                weakestOhaeng={weakestOhaeng}
              />
            ))}
          </div>

          {/* 획수 합산 */}
          <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
            <span className="font-semibold">획수 분석: </span>
            {strokesSum != null ? (
              <>
                {allChars.map((c, i) => (
                  <span key={i}>{i > 0 ? ' + ' : ''}{c.hanja}({c.strokes})</span>
                ))}
                <span className="ml-1 font-bold text-indigo-700">
                  = 합계 {strokesSum}획 (수리오행: {getSuriOhaeng(strokesSum)})
                </span>
              </>
            ) : (
              <span>한자 미지정 또는 획수 미확인 글자가 있어 합계를 계산하지 않습니다</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
