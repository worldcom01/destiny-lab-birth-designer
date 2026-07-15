'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Filter, Sparkles } from 'lucide-react';
import { AnalysisResult, ModeBInput, Grade, GRADE_CONFIG } from '@/types';
import { runModeBAnalysis, formatKoreanDate } from '@/lib/analysis';
import { calculateFourPillars, getSajuOhaengBalance, getDisplayHour } from '@/lib/saju';
import NameRankCard from '@/components/NameRankCard';
import SajuSummary from '@/components/SajuSummary';
import PDFButton from '@/components/PDFButton';

type FG = Grade | 'ALL';

export default function ModeBResults() {
  const router = useRouter();
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [input, setInput] = useState<ModeBInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterGrade, setFilterGrade] = useState<FG>('ALL');
  const [showCount, setShowCount] = useState(20);

  useEffect(() => {
    const raw = localStorage.getItem('dlbd_mode_b');
    if (!raw) { setError('입력 데이터가 없습니다.'); setLoading(false); return; }
    try {
      const parsed: ModeBInput = JSON.parse(raw);
      setInput(parsed);
      setTimeout(() => {
        setResults(runModeBAnalysis(parsed));
        setLoading(false);
      }, 60);
    } catch { setError('데이터 오류'); setLoading(false); }
  }, []);

  const gc = useMemo(() => {
    const c: Record<FG, number> = { ALL: results.length, SS: 0, S: 0, A: 0, B: 0, C: 0 };
    for (const r of results) c[r.grade]++;
    return c;
  }, [results]);

  const filtered = useMemo(() => {
    if (filterGrade === 'ALL') return results;
    return results.filter(r => r.grade === filterGrade);
  }, [results, filterGrade]);

  const sajuData = useMemo(() => {
    if (!input || !results.length) return null;
    const d = new Date(input.birthDate + 'T00:00:00');
    const fp = calculateFourPillars(d, input.birthHour);
    return { fourPillars: fp, sajuBalance: getSajuOhaengBalance(fp) };
  }, [input, results]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
      <p className="font-bold text-slate-700">이름 설계 분석 중...</p>
      <p className="text-sm text-slate-500">사주와 조화로운 이름을 탐색합니다</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-red-600">{error}</p>
      <button onClick={() => router.push('/mode-b')} className="text-sm text-violet-600 underline">입력으로</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-gradient-to-r from-violet-900 to-purple-900 sticky top-[40px] z-40">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button onClick={() => router.push('/mode-b')} className="flex items-center gap-1.5 text-sm text-violet-300 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> 돌아가기
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-400" /> MODE B 결과
            </p>
            <p className="text-[11px] text-violet-300">
              {input && `${formatKoreanDate(new Date(input.birthDate + 'T00:00:00'))} ${getDisplayHour(input.birthHour)}`}
            </p>
          </div>
          <PDFButton
            results={results}
            top={20}
            surname={input?.surname ?? ''}
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

        {/* 등급 요약 */}
        <div className="grid grid-cols-4 gap-3">
          {(['SS', 'S', 'A', 'B'] as Grade[]).map(g => (
            <button key={g} onClick={() => { setFilterGrade(g === filterGrade ? 'ALL' : g); setShowCount(20); }}
              className={`bg-white rounded-xl p-3 text-center border-2 shadow-sm transition-all ${filterGrade === g ? GRADE_CONFIG[g].ring : 'border-slate-100'}`}>
              <div className={`text-2xl font-black ${GRADE_CONFIG[g].textColor}`}>{gc[g]}</div>
              <div className="text-[10px] text-slate-400"><span className={`font-bold ${GRADE_CONFIG[g].textColor}`}>{g}</span></div>
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-3">
            <Filter className="w-3.5 h-3.5" /> 등급 필터
          </div>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'SS', 'S', 'A', 'B', 'C'] as FG[]).map(g => {
              const cfg = g !== 'ALL' ? GRADE_CONFIG[g] : null;
              const active = filterGrade === g;
              return (
                <button key={g} onClick={() => { setFilterGrade(g); setShowCount(20); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${active ? (g === 'ALL' ? 'bg-slate-900 text-white' : `bg-gradient-to-r ${cfg?.bgFrom} ${cfg?.bgTo} text-white`) : 'bg-slate-100 text-slate-600'}`}>
                  {g === 'ALL' ? '전체' : g} <span className="opacity-70 font-normal">{gc[g]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 이름 목록 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">
              추천 이름 {filterGrade === 'ALL' ? '' : `(${filterGrade} 등급)`}
              <span className="text-slate-400 font-normal ml-1">({filtered.length}개)</span>
            </h2>
            <span className="text-xs text-slate-400">이름·사주 조화도 높은 순</span>
          </div>
          <div className="space-y-3">
            {filtered.slice(0, showCount).map((r, i) => (
              <div key={r.id} className="fade-up">
                <NameRankCard result={r} rank={filterGrade === 'ALL' ? r.rank : i + 1} />
              </div>
            ))}
            {showCount < filtered.length && (
              <button onClick={() => setShowCount(p => p + 20)}
                className="w-full py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                더 보기 ({filtered.length - showCount}개 남음)
              </button>
            )}
          </div>
        </div>

        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-xs text-violet-800 leading-relaxed">
          <p className="font-bold mb-1">이름 설계 모드 안내</p>
          <p>확정된 출생일·시간을 기준으로, 해당 사주와 이름-사주 조화도가 높은 이름을 추천합니다. 오행 보완, 음양 조화, 발음 안정성, 한자 의미를 종합 분석합니다.</p>
        </div>
        <p className="text-center text-xs text-indigo-500 font-bold pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
