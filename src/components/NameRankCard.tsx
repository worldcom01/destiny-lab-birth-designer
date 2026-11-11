'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AnalysisResult, GRADE_CONFIG, OHAENG_COLORS, IMAGE_LABELS, OhaengType } from '@/types';
import OhaengChart from './OhaengChart';
import HanjaDisplay from './HanjaDisplay';
import HanjaPicker from './HanjaPicker';
import { isModalOpen } from './modalStack';
import HanjaQuickSelect from './HanjaQuickSelect';
import { hanjaSaveFailureMessage, hanjaStatusLabel } from '@/lib/hanjaModel';
import type { HanjaSaveState } from './HanjaSaveFeedback';
import { buildSajuReading } from '@/lib/sajuReading';
import { componentByKey } from '@/lib/scoreComponents';
import ScoreBreakdown from './ScoreBreakdown';

const GRADE_RING: Record<string, string> = {
  SS: 'ring-2 ring-amber-400 shadow-amber-100 shadow-md',
  S:  'ring-2 ring-indigo-400 shadow-indigo-100 shadow-md',
  A:  'ring-2 ring-emerald-400 shadow-emerald-100 shadow-sm',
  B:  'ring-1 ring-blue-300',
  C:  'ring-1 ring-slate-200',
};


export default function NameRankCard({ result, rank, onHanjaSelect, saveFeedback, selectionLocked = false, registerHanjaButton }: {
  result: AnalysisResult;
  rank?: number;
  /** Lifts a Hanja choice to the page-level selection state (persisted there). */
  onHanjaSelect?: (fullName: string, index: number, hanja: string) => void;
  /** The page's latest save result when it concerns this name (shown at the card, U4). */
  saveFeedback?: HanjaSaveState;
  /** R3.2: Hanja controls are disabled while persistence is not ready or a save is running. */
  selectionLocked?: boolean;
  /** R3.2: registers the card's "한자 선택" buttons by name and syllable index (page focus handling). */
  registerHanjaButton?: (fullName: string, index: number, el: HTMLButtonElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // The card's single Hanja picker (R3.1): opened from the visible "한자 선택"
  // buttons or from the detailed analysis; one save path (onHanjaSelect).
  const [picker, setPicker] = useState<{ index: number; trigger: HTMLElement } | null>(null);
  const g = result.grade;
  const gc = GRADE_CONFIG[g];
  const selectable = !!onHanjaSelect;
  // Only one active picker on the page (U2): a request while any dialog is open is ignored.
  // Focus returns to `trigger` through the shared modal stack (U5).
  const openPicker = (index: number, trigger: HTMLElement) => { if (!selectionLocked && !isModalOpen()) setPicker({ index, trigger }); };
  const closePicker = () => setPicker(null);
  const pickerIndex = picker?.index ?? null;
  // Number of confirmations made from this card; re-keys the local feedback so a
  // repeated identical result is shown as new (U4).
  const [attempts, setAttempts] = useState(0);
  const feedbackId = `hanja-feedback-${result.id}`;
  const feedback = selectable && saveFeedback && saveFeedback.fullName === result.name.full ? saveFeedback : null;
  // After a confirmation from this card, keep its result visible where the user is
  // working (a low-ranked card may be far below the page-level message).
  // R3.2: the result of an asynchronous save arrives later, so this also runs when it changes.
  useEffect(() => {
    if (attempts > 0 && feedback) document.getElementById(feedbackId)?.scrollIntoView?.({ block: 'nearest' });
  }, [attempts, feedback, feedbackId]);
  const pickerChar = pickerIndex !== null ? result.name.hanja.given[pickerIndex] : undefined;
  const weakestOhaeng: OhaengType | null = (() => {
    const b = result.sajuOhaengBalance;
    const min = Math.min(b.목, b.화, b.토, b.금, b.수);
    const entry = Object.entries(b).find(([, v]) => v === min);
    return entry ? entry[0] as OhaengType : null;
  })();

  return (
    <div className={`bg-white rounded-2xl overflow-hidden ${GRADE_RING[g]} transition-all`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          {/* 순위 */}
          {rank !== undefined && (
            <div className="flex-shrink-0 text-center w-9">
              <div className="text-2xl font-black text-slate-800 leading-none">{rank}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">위</div>
            </div>
          )}

          {/* 등급 배지 */}
          <div className={`flex-shrink-0 bg-gradient-to-br ${gc.bgFrom} ${gc.bgTo} rounded-xl px-3 py-2 text-center min-w-[52px]`}>
            <div className="text-[10px] text-white/80 leading-tight">{gc.description}</div>
            <div className="text-xl font-black text-white">{g}</div>
          </div>

          {/* 이름 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-2xl font-black text-slate-900">{result.name.full}</h3>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                {result.nameAnalysis.hanja}
              </span>
              <span className="text-[10px] text-slate-400">{hanjaStatusLabel(result.name.hanja)}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                result.name.gender === '남'
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-pink-50 text-pink-600 border-pink-200'
              }`}>
                {result.name.gender === '남' ? '남아' : '여아'}
              </span>
            </div>

            {/* 한자 의미 */}
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              {result.nameAnalysis.meanings.map((m, i) => (
                <span key={i}>
                  {m.split(' — ')[1] ?? m}
                  {i < result.nameAnalysis.meanings.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </p>

            {/* 발음오행 */}
            <div className="flex gap-1 mt-1.5">
              {result.nameAnalysis.pronunciationOhaeng.map((o, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: OHAENG_COLORS[o] + '15', color: OHAENG_COLORS[o], border: `1px solid ${OHAENG_COLORS[o]}30` }}>
                  {o}
                </span>
              ))}
            </div>
          </div>

          {/* 종합 점수 */}
          <div className="flex-shrink-0 text-right">
            <div className={`text-3xl font-black ${gc.textColor}`}>{result.scores.overall}</div>
            <div className="text-[9px] text-slate-400">종합</div>
          </div>
        </div>

        {/* 특징 태그 */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {result.characteristics.map((tag, i) => (
            <span key={i} className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{tag}</span>
          ))}
          {result.imageMatches.map(img => (
            <span key={img} className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-1 rounded-full">
              {IMAGE_LABELS[img].icon} {img}
            </span>
          ))}
        </div>

        {/* 설명 */}
        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{result.description}</p>
        <p data-testid="name-relation" className="text-[11px] text-indigo-800 bg-indigo-50/60 rounded-lg px-2.5 py-1.5 mt-2 leading-relaxed">
          <span className="font-semibold">이름과의 관계</span> · {buildSajuReading(result).nameRelation}
        </p>

        {selectable && <HanjaQuickSelect model={result.name.hanja} onOpen={openPicker} describedBy={feedback ? feedbackId : undefined} disabled={selectionLocked}
          buttonRef={registerHanjaButton ? (i, el) => registerHanjaButton(result.name.full, i, el) : undefined} />}
        {feedback && (
          // Not a live region: the page-level status/alert announces once; this text is
          // the visible result at the card and the description of its Hanja buttons.
          <p key={attempts} id={feedbackId} data-testid="hanja-card-feedback" data-state={feedback.ok ? 'ok' : 'error'} data-attempt={attempts}
            className={`fade-up mt-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
              feedback.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
            }`}>
            {feedback.ok
              ? `${feedback.fullName}의 한자 선택을 브라우저에 저장했습니다.`
              : feedback.message ?? hanjaSaveFailureMessage(feedback.fullName, feedback.reason)}
          </p>
        )}

        {/* 핵심 점수 미리보기 (이름·사주 조화 강조) */}
        <div className="mt-3 bg-slate-50 rounded-xl p-3">
          <div className="flex justify-between text-[11px] text-slate-600 mb-1">
            <span className="font-semibold">{componentByKey('nameHarmony').label} <span className="font-normal text-slate-400">(종합의 {componentByKey('nameHarmony').weight}%)</span></span>
            <span className="font-bold text-indigo-600">{result.scores.nameHarmony}점</span>
          </div>
          <div className="bg-slate-200 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
              style={{ width: `${result.scores.nameHarmony}%` }} />
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-slate-100 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
      >
        {expanded ? '닫기' : '세부 분석 보기'}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-5 bg-slate-50/50">
          {/* 한자 분석 */}
          <div className="mb-5">
            <HanjaDisplay model={result.name.hanja} onOpenPicker={selectable ? openPicker : undefined} describedBy={feedback ? feedbackId : undefined} disabled={selectionLocked} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3">통합 오행 분포 (사주+이름)</h4>
              <OhaengChart balance={result.combinedOhaengBalance} size={160} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3">세부 점수</h4>
              <ScoreBreakdown scores={result.scores} given={result.name.given} />
            </div>
          </div>
        </div>
      )}

      {pickerChar && pickerIndex !== null && onHanjaSelect && (
        <HanjaPicker
          hangul={pickerChar.hangul}
          selectedHanja={pickerChar.hanja ?? undefined}
          // HanjaPicker calls onSelect then onClose once per confirmed choice: one save.
          onSelect={opt => { setAttempts(a => a + 1); onHanjaSelect(result.name.full, pickerIndex, opt.hanja); }}
          onClose={closePicker}
          recommendedOhaeng={weakestOhaeng}
          label={`'${pickerChar.hangul}' 한자 선택`}
          returnFocusTo={picker?.trigger}
        />
      )}
    </div>
  );
}
