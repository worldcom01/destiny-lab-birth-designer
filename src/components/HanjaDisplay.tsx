'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { NameCharHanja, NameHanjaModel, OHAENG_COLORS } from '@/types';
import { getHanjaOptions, getSuriOhaeng } from '@/data/hanjaDB';
import { charStatusLabel, LEGACY_GLOSS_LABEL, UNASSIGNED_MARK, formatFullHanja, totalStrokes } from '@/lib/hanjaModel';

interface Props {
  model: NameHanjaModel;
  /**
   * Asks the owner (the result card) to open its single HanjaPicker for the
   * given-name index. Omit for read-only display.
   */
  onOpenPicker?: (index: number, trigger: HTMLElement) => void;
  /** id of the card's save-feedback text (U4). */
  describedBy?: string;
  /** R3.2: Hanja buttons disabled while persistence is not ready or saving. */
  disabled?: boolean;
}

const STATUS_STYLE: Record<NameCharHanja['status'], string> = {
  confirmed: 'bg-indigo-600 text-white',
  suggested: 'bg-amber-100 text-amber-700',
  unassigned: 'bg-slate-200 text-slate-600',
};

/**
 * One syllable of the detailed Hanja analysis. With `onOpen` and available
 * candidates it is a real button (keyboard and screen-reader operable); the
 * picker itself belongs to the card, so only one picker exists per card.
 * The caption comes first in the DOM (shown below the Hanja via CSS order) so
 * the accessible text starts with the syllable, not with a Hanja.
 */
export function HanjaCharCard({
  char,
  caption,
  onOpen,
  describedBy,
  disabled = false,
}: {
  char: NameCharHanja;
  caption: string;
  onOpen?: (trigger: HTMLElement) => void;
  describedBy?: string;
  /** R3.2: while persistence is not ready or saving. */
  disabled?: boolean;
}) {
  const selectable = !!onOpen && getHanjaOptions(char.hangul).length > 0;
  const suri = char.strokes != null ? getSuriOhaeng(char.strokes) : null;
  const className = `flex-1 min-w-0 flex flex-col items-center border-2 rounded-xl p-3 text-center transition-all ${
    selectable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2' : ''
  } ${char.status === 'confirmed' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`;

  const body = (
    <>
      <span className="order-2 block text-[11px] font-semibold text-slate-700">{caption}</span>
      <span className={`order-1 block text-3xl font-black mb-1 ${char.hanja ? 'text-slate-900' : 'text-slate-300'}`}>
        {char.hanja ?? UNASSIGNED_MARK}
      </span>
      <span className={`order-3 inline-block text-[9px] px-1.5 py-0.5 rounded-full font-bold mt-1 ${STATUS_STYLE[char.status]}`}>
        {charStatusLabel(char)}
      </span>
      <span className="order-4 block text-[10px] text-slate-500 mt-0.5 leading-tight">
        {char.hanja ? (char.meaning ? `${char.meaning} (${LEGACY_GLOSS_LABEL})` : '확인된 뜻 없음') : '한자를 선택하지 않았습니다'}
      </span>
      {char.hanja && (
        <span className="order-5 block text-[10px] text-slate-400 mt-1">{char.strokes != null ? `${char.strokes}획` : '획수 미확인'}</span>
      )}
      <span className="order-6 flex justify-center gap-1 mt-1.5 flex-wrap">
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
      </span>
      {onOpen && (
        <span className={`order-7 block text-[9px] mt-1.5 ${selectable ? 'text-indigo-500' : 'text-slate-400'}`}>
          {selectable ? '탭하여 한자 변경' : '한자 데이터 없음'}
        </span>
      )}
    </>
  );

  return selectable ? (
    <button
      type="button"
      data-hanja-char={char.hanja ?? ''}
      data-hanja-status={char.status}
      aria-label={`'${char.hangul}' 한자 선택`}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className={`${className} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
      onClick={e => { if (!disabled) onOpen!(e.currentTarget); }}
    >
      {body}
    </button>
  ) : (
    <div data-hanja-char={char.hanja ?? ''} data-hanja-status={char.status} className={className}>
      {body}
    </div>
  );
}

export default function HanjaDisplay({ model, onOpenPicker, describedBy, disabled = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const allChars = [...model.surname, ...model.given];
  const strokesSum = totalStrokes(allChars);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
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
          {onOpenPicker && (
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
                onOpen={onOpenPicker ? trigger => onOpenPicker(i, trigger) : undefined}
                describedBy={describedBy}
                disabled={disabled}
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
