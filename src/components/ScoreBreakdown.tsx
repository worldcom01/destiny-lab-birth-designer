import { Scores } from '@/types';
import { OVERALL_SCORE_EXPLANATION, SCORE_COMPONENTS, nameLengthScopeNote, weightText } from '@/lib/scoreComponents';

/**
 * Component scores with their real weight in the overall score and what each
 * is computed from. Labels come from scoreComponents.ts (single source).
 */
export default function ScoreBreakdown({ scores, given }: { scores: Scores; given?: string }) {
  const lengthNote = given ? nameLengthScopeNote(given) : null;
  return (
    <div className="space-y-2.5" data-testid="score-breakdown">
      {lengthNote && (
        <p data-testid="name-length-note" className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-snug">{lengthNote}</p>
      )}
      {SCORE_COMPONENTS.map(c => {
        const val = scores[c.key];
        return (
          <div key={c.key} data-score-key={c.key}>
            <div className="flex justify-between gap-2 text-[11px] text-slate-600 mb-0.5">
              <span>
                {c.label} <span className="text-slate-400">· {weightText(c)}</span>
              </span>
              <span className="font-semibold shrink-0">{val}점</span>
            </div>
            <div className="bg-slate-200 rounded-full h-1 overflow-hidden">
              <div
                className={`h-full rounded-full ${c.weight > 0 ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-slate-400'}`}
                style={{ width: `${val}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{c.basis}</p>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-500 leading-relaxed pt-1 border-t border-slate-200">{OVERALL_SCORE_EXPLANATION}</p>
    </div>
  );
}
