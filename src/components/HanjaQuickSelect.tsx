'use client';

import { NameHanjaModel } from '@/types';
import { getHanjaOptions } from '@/data/hanjaDB';
import { STATUS_LABEL, UNASSIGNED_MARK } from '@/lib/hanjaModel';

export const NO_HANJA_CANDIDATES = '현재 제공되는 한자 후보가 없습니다.';
const NONE_SELECTABLE = '이 이름의 글자에는 현재 제공되는 한자 후보가 없어 한자를 선택할 수 없습니다.';

/**
 * Overall note when no syllable has candidates (U3). "No candidates" is not the
 * same as "unassigned": the canonical model may still carry a system suggestion
 * (e.g. Mode B 김기시 → 基時), which is described as such.
 */
export function noCandidatesNote(model: NameHanjaModel): string {
  const shown = model.given.filter(c => c.hanja);
  const missing = model.given.filter(c => !c.hanja);
  if (shown.length === 0) return `${NONE_SELECTABLE} 이름 글자는 한자 미지정으로 표시됩니다.`;
  const kinds = new Set(shown.map(c => c.status));
  const what = kinds.size === 1 && kinds.has('suggested') ? '시스템 추천 한자' : '한자';
  const shownText = `표시된 ${what}(${shown.map(c => c.hanja).join('·')})는 그대로 유지되며 바꿀 수 없습니다.`;
  const missingText = missing.length ? ` ${missing.map(c => c.hangul).join('·')}은(는) 한자 미지정입니다.` : '';
  return `${NONE_SELECTABLE} ${shownText}${missingText}`;
}

const STATUS_CHIP: Record<string, string> = {
  confirmed: 'bg-indigo-600 text-white',
  suggested: 'bg-amber-100 text-amber-700',
  unassigned: 'bg-slate-200 text-slate-600',
};

/**
 * Visible "한자 선택" section of a result card (R3.1). One button per given-name
 * syllable that has Hanja candidates; it only asks the card to open its single
 * HanjaPicker. Nothing is stored here: the shown values come from the result's
 * canonical Hanja model, which the page updates only after a verified save.
 * Surname Hanja are not selectable and are not listed.
 */
export default function HanjaQuickSelect({ model, onOpen, describedBy, disabled = false, buttonRef }: {
  model: NameHanjaModel;
  onOpen: (index: number, trigger: HTMLElement) => void;
  /** id of the card's save-feedback text, read with the buttons (U4). */
  describedBy?: string;
  /** R3.2: while persistence is not ready or saving. */
  disabled?: boolean;
  /** R3.2: exposes each syllable's button (focus destination after a legacy adoption). */
  buttonRef?: (index: number, el: HTMLButtonElement | null) => void;
}) {
  const chars = model.given.map(c => ({ c, available: getHanjaOptions(c.hangul).length > 0 }));
  const anyAvailable = chars.some(x => x.available);

  return (
    <section data-testid="hanja-quick-select" aria-label="한자 선택" className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h4 className="text-xs font-bold text-slate-700">한자 선택</h4>
        {anyAvailable && <span className="text-[10px] text-slate-500">이름 글자를 눌러 한자를 고르세요</span>}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {chars.map(({ c, available }, i) => (
          <li key={i} className="min-w-0">
            {available ? (
              <button
                type="button"
                ref={buttonRef ? el => { buttonRef(i, el); } : undefined}
                data-hanja-quick={i}
                data-quick-status={c.status}
                aria-label={`'${c.hangul}' 한자 선택 (현재: ${c.hanja ? `${c.hanja} ${STATUS_LABEL[c.status]}` : '미지정'})`}
                aria-describedby={describedBy}
                // aria-disabled (not the disabled attribute): the button keeps focus, so the
                // picker can return focus to it while a save is running (R3.2)
                aria-disabled={disabled || undefined}
                onClick={e => { if (!disabled) onOpen(i, e.currentTarget); }}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <span className="text-sm font-bold text-slate-800">{c.hangul}</span>
                <span className={`text-lg font-black leading-none ${c.hanja ? 'text-slate-900' : 'text-slate-300'}`}>{c.hanja ?? UNASSIGNED_MARK}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </button>
            ) : (
              <div data-hanja-quick-unavailable={i} data-syllable={c.hangul} data-quick-status={c.status}
                className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="text-sm font-bold text-slate-500">{c.hangul}</span>
                {/* the canonical value is shown as it is (suggested ≠ unassigned) */}
                <span className={`text-lg font-black leading-none ${c.hanja ? 'text-slate-700' : 'text-slate-300'}`}>{c.hanja ?? UNASSIGNED_MARK}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                <span className="text-[10px] text-slate-500">{NO_HANJA_CANDIDATES}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!anyAvailable && (
        <p data-testid="hanja-quick-none" className="mt-2 text-[11px] leading-relaxed text-slate-600">{noCandidatesNote(model)}</p>
      )}
    </section>
  );
}
