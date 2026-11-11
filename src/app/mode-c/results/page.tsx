'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Sparkles, Trophy } from 'lucide-react';
import { AnalysisResult, ModeCInput, GRADE_CONFIG } from '@/types';
import { analyzeModeCNames, applyHanjaSelections, formatKoreanDate, ModeCAnalysis } from '@/lib/analysis';
import { validateModeCInput } from '@/lib/inputValidation';
import { useStoredAnalysis } from '@/lib/useStoredAnalysis';
import AnalysisErrorPanel from '@/components/AnalysisErrorPanel';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { useHanjaPersistence } from '@/lib/useHanjaPersistence';
import HanjaPersistenceStatus, { hanjaAttemptMessage } from '@/components/HanjaPersistenceStatus';
import type { ExternalCandidate } from '@/lib/hanjaPersistenceCore';
import { calculateFourPillars, getSajuOhaengBalance, getDisplayHour } from '@/lib/saju';
import NameRankCard from '@/components/NameRankCard';
import SajuSummary from '@/components/SajuSummary';
import PDFButton from '@/components/PDFButton';
import HanjaSaveFeedback, { HanjaSaveState } from '@/components/HanjaSaveFeedback';
import { componentByKey, OVERALL_SCORE_EXPLANATION } from '@/lib/scoreComponents';

interface ModeCData { results: AnalysisResult[]; rejected: ModeCAnalysis['rejected']; scope: string }

// The analysis is synchronous; Hanja selections come from the R3.2 persistence hook.
function runModeC(input: ModeCInput): ModeCData {
  const analysis = analyzeModeCNames(input);
  return { results: analysis.results, rejected: analysis.rejected, scope: analysisScope(input) };
}

const EMPTY: AnalysisResult[] = [];

export default function ModeCResults() {
  const router = useRouter();
  const state = useStoredAnalysis('dlbd_mode_c', validateModeCInput, runModeC, 40);
  const [saveState, setSaveState] = useState<HanjaSaveState>(null);
  const base = state.status === 'ready' ? state.data : null;
  const persistence = useHanjaPersistence(HANJA_SELECTION_KEYS.modeC, base?.scope ?? null, false);
  const names = persistence.names;
  const results = useMemo(() => (base ? (names ? applyHanjaSelections(base.results, names) : base.results) : EMPTY), [base, names]);
  const rejected = base?.rejected ?? [];
  const input = state.status === 'ready' ? state.input : null;
  const readNotice = persistence.snapshot ? null : persistence.readOnly?.readNotice ?? null;

  const handleHanjaSelect = async (fullName: string, index: number, hanja: string) => {
    // One conditional patch in one IndexedDB transaction; see Mode B.
    setSaveState(null);
    const attempt = await persistence.save(fullName, index, hanja);
    if (attempt.ok) { setSaveState({ ok: true, fullName }); return; }
    const syllable = base?.results.find(r => r.name.full === fullName)?.name.hanja.given[index]?.hangul;
    setSaveState({ ok: false, fullName, reason: attempt.reason, message: hanjaAttemptMessage(fullName, index, syllable, hanja, attempt) });
  };
  // R3.2 adoption focus: the card's "한자 선택" button for the adopted syllable, else the save message.
  const hanjaButtons = useRef(new Map<string, HTMLButtonElement>());
  const saveMessageRef = useRef<HTMLParagraphElement>(null);
  const registerHanjaButton = useCallback((fullName: string, index: number, el: HTMLButtonElement | null) => {
    if (el) hanjaButtons.current.set(`${fullName}#${index}`, el);
  }, []);
  const adoptionFocusFallback = useCallback((it: ExternalCandidate | null) => {
    const quick = it ? hanjaButtons.current.get(`${it.fullName}#${it.index}`) : undefined;
    return quick?.isConnected && quick.getAttribute('aria-disabled') !== 'true' ? quick : saveMessageRef.current;
  }, []);
  const syllableOf = (fullName: string, index: number) => base?.results.find(r => r.name.full === fullName)?.name.hanja.given[index]?.hangul;

  const sajuData = useMemo(() => {
    if (!input) return null;
    const d = new Date(input.birthDate + 'T00:00:00');
    const fp = calculateFourPillars(d, input.birthHour);
    return { fourPillars: fp, sajuBalance: getSajuOhaengBalance(fp) };
  }, [input]);

  if (state.status === 'loading') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
      <p className="font-bold text-slate-700">이름 평가 분석 중...</p>
    </div>
  );

  if (state.status === 'error') return (
    <AnalysisErrorPanel error={state.error} onBack={() => router.push('/mode-c')} />
  );

  const best = results[0];

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-gradient-to-r from-teal-900 to-emerald-900 sticky top-[40px] z-40">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button onClick={() => router.push('/mode-c')} className="flex items-center gap-1.5 text-sm text-teal-300 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> 돌아가기
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-teal-400" /> MODE C 결과
            </p>
            {input && (
              <p className="text-[11px] text-teal-300">
                {formatKoreanDate(new Date(input.birthDate + 'T00:00:00'))} {getDisplayHour(input.birthHour)}
              </p>
            )}
          </div>
          <PDFButton
            results={results}
            top={results.length}
            gender={input?.gender ?? ''}
            dateRange={input?.birthDate}
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* 확정 사주 요약 */}
        {sajuData && input && (
          <SajuSummary
            date={new Date(input.birthDate + 'T00:00:00')}
            hour={input.birthHour}
            fourPillars={sajuData.fourPillars}
            sajuBalance={sajuData.sajuBalance}
          />
        )}

        {/* 최우선 추천 배너 */}
        {best && (
          <div className="bg-gradient-to-br from-teal-900 via-emerald-800 to-teal-900 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">전통 명리학 기준 최우선 추천</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black">{best.name.full}</span>
              <span className="text-lg font-mono text-teal-300">{best.nameAnalysis.hanja}</span>
              <span className={`text-sm font-black bg-gradient-to-r ${GRADE_CONFIG[best.grade].bgFrom} ${GRADE_CONFIG[best.grade].bgTo} bg-clip-text text-transparent`}>
                {best.grade}등급
              </span>
            </div>
            <p className="text-xs text-teal-400 mt-1.5">{best.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {best.characteristics.map((t, i) => (
                <span key={i} className="text-[10px] bg-white/10 text-white/80 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        )}

        {readNotice && (
          <p role="status" data-testid="hanja-read-notice" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{readNotice}</p>
        )}
        <HanjaPersistenceStatus persistence={persistence} syllableOf={syllableOf} onAdopt={it => handleHanjaSelect(it.fullName, it.index, it.legacy)} focusFallback={adoptionFocusFallback} />
        <HanjaSaveFeedback state={saveState} messageRef={saveMessageRef} />
        {/* 이름 순위 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">
              이름 평가 결과
              <span className="text-slate-400 font-normal ml-1">({results.length}개 이름 분석)</span>
            </h2>
            <span className="text-xs text-slate-400">종합 점수 높은 순</span>
          </div>

          {rejected.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800 space-y-0.5">
              {rejected.map((r, i) => (
                <p key={i}>‘{r.input}’ 은(는) 분석하지 않았습니다: {r.message}</p>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center text-slate-400">유효한 이름이 없습니다</div>
          ) : (
            <div className="space-y-3">
              {results.map((r, i) => (
                <div key={r.id} className="fade-up">
                  <NameRankCard result={r} rank={i + 1} onHanjaSelect={handleHanjaSelect} saveFeedback={saveState} selectionLocked={!persistence.canSave} registerHanjaButton={registerHanjaButton} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 비교 요약 테이블 */}
        {results.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-700">이름 비교 요약</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[11px]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">순위</th>
                    <th className="text-left px-4 py-2.5 font-semibold">이름</th>
                    <th className="text-left px-4 py-2.5 font-semibold">한자</th>
                    <th className="text-center px-4 py-2.5 font-semibold">등급</th>
                    <th className="text-right px-4 py-2.5 font-semibold">종합점수</th>
                    <th className="text-right px-4 py-2.5 font-semibold">{componentByKey('nameHarmony').short}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r, i) => (
                    <tr key={r.id} className={i === 0 ? 'bg-teal-50' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-2.5 font-black text-slate-700">{i + 1}위</td>
                      <td className="px-4 py-2.5 font-bold text-slate-900">{r.name.full}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{r.nameAnalysis.hanja}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block font-black text-xs px-2 py-0.5 rounded ${GRADE_CONFIG[r.grade].textColor}`}>
                          {r.grade}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-700">{r.scores.overall}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{r.scores.nameHarmony}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-xs text-teal-800 leading-relaxed">
          <p className="font-bold mb-1">이름 평가 모드 안내</p>
          <p>동일한 사주(확정 출생일·시간)를 기준으로 입력한 이름을 같은 종합 점수 공식으로 비교합니다. 이름 데이터에 없는 음절은 현대 선호 지수(내부 지수)를 기본값 70으로 계산하며, 발음오행은 한글 자음으로 계산합니다. 현대성·현대 선호도·이미지·발음 자연스러움은 이름의 처음 두 글자만 계산하므로, 외자·세 글자 이름은 각 카드의 세부 분석에서 계산 범위를 확인하세요. 전통 명리학 참고 자료입니다.</p>
          <p className="mt-1.5">{OVERALL_SCORE_EXPLANATION}</p>
        </div>
        <p className="text-center text-xs text-indigo-500 font-bold pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
