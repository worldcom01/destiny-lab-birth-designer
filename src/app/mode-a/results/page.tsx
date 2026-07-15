'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Filter, Sparkles, TrendingUp } from 'lucide-react';
import { AnalysisResult, DesignerInput, Grade, GRADE_CONFIG, ImageType, IMAGE_LABELS } from '@/types';
import { runModeAAnalysis } from '@/lib/analysis';
import ResultCard from '@/components/ResultCard';
import PDFButton from '@/components/PDFButton';
import OhaengChart from '@/components/OhaengChart';

type FG = Grade | 'ALL';

export default function ModeAResults() {
  const router = useRouter();
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [input, setInput] = useState<DesignerInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterGrade, setFilterGrade] = useState<FG>('ALL');
  const [filterImage, setFilterImage] = useState<ImageType | ''>('');
  const [showCount, setShowCount] = useState(20);

  useEffect(() => {
    const raw = localStorage.getItem('dlbd_mode_a');
    if (!raw) { setError('입력 데이터가 없습니다.'); setLoading(false); return; }
    try {
      const parsed: DesignerInput = JSON.parse(raw);
      setInput(parsed);
      setTimeout(() => {
        setResults(runModeAAnalysis(parsed));
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
    let l = results;
    if (filterGrade !== 'ALL') l = l.filter(r => r.grade === filterGrade);
    if (filterImage) l = l.filter(r => r.imageMatches.includes(filterImage as ImageType));
    return l;
  }, [results, filterGrade, filterImage]);

  const topOhaeng = useMemo(() => {
    if (!results.length) return null;
    const acc = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    for (const r of results.slice(0, 5)) for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] += r.combinedOhaengBalance[k];
    return acc;
  }, [results]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      <p className="font-bold text-slate-700">출생 설계 분석 중...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-red-600">{error}</p>
      <button onClick={() => router.push('/mode-a')} className="text-sm text-indigo-600 underline">입력으로</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-gradient-to-r from-indigo-900 to-violet-900 sticky top-[40px] z-40">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button onClick={() => router.push('/mode-a')} className="flex items-center gap-1.5 text-sm text-indigo-300 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> 돌아가기
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" /> MODE A 결과
            </p>
            <p className="text-[11px] text-indigo-300">{results.length.toLocaleString()}가지 조합 분석 완료</p>
          </div>
          <PDFButton
            results={results}
            surname={input?.surname ?? ''}
            gender={input?.gender ?? ''}
            dateRange={input ? `${input.startDate} ~ ${input.endDate}` : undefined}
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {(['SS', 'S', 'A', 'B'] as Grade[]).map(g => (
            <button key={g} onClick={() => { setFilterGrade(g === filterGrade ? 'ALL' : g); setShowCount(20); }}
              className={`bg-white rounded-xl p-3 text-center border-2 shadow-sm transition-all ${filterGrade === g ? GRADE_CONFIG[g].ring : 'border-slate-100'}`}>
              <div className={`text-2xl font-black ${GRADE_CONFIG[g].textColor}`}>{gc[g]}</div>
              <div className="text-[10px] text-slate-400 mt-0.5"><span className={`font-bold ${GRADE_CONFIG[g].textColor}`}>{g}</span> 등급</div>
            </button>
          ))}
        </div>

        {topOhaeng && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> 상위 5개 조합 오행 분포
            </h3>
            <OhaengChart balance={topOhaeng} size={165} />
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <Filter className="w-3.5 h-3.5" /> 필터
          </div>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'SS', 'S', 'A', 'B', 'C'] as FG[]).map(g => {
              const cfg = g !== 'ALL' ? GRADE_CONFIG[g] : null;
              const active = filterGrade === g;
              return (
                <button key={g} onClick={() => { setFilterGrade(g); setShowCount(20); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${active ? (g === 'ALL' ? 'bg-slate-900 text-white' : `bg-gradient-to-r ${cfg?.bgFrom} ${cfg?.bgTo} text-white shadow-sm`) : 'bg-slate-100 text-slate-600'}`}>
                  {g === 'ALL' ? '전체' : g} <span className="opacity-70 font-normal">{gc[g]}</span>
                </button>
              );
            })}
          </div>
          {input && input.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              <button onClick={() => setFilterImage('')}
                className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all ${!filterImage ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
                전체
              </button>
              {input.images.map(img => (
                <button key={img} onClick={() => setFilterImage(img === filterImage ? '' : img)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] border transition-all ${filterImage === img ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {IMAGE_LABELS[img].icon} {img}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">
              {filterGrade === 'ALL' ? '전체' : `${filterGrade} 등급`}
              <span className="text-slate-400 font-normal ml-1">({filtered.length.toLocaleString()}개)</span>
            </h2>
            <span className="text-xs text-slate-400">종합 점수 높은 순</span>
          </div>
          <div className="space-y-3">
            {filtered.slice(0, showCount).map(r => (
              <div key={r.id} className="fade-up">
                <ResultCard result={r} showRank={filterGrade === 'ALL' && !filterImage} />
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

        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-800 leading-relaxed">
          <p className="font-bold mb-1">분석 기준</p>
          <p>사주 오행 균형·음양 조화·이름-사주 조화·발음 안정성·한자 의미·현대적 사용성·이미지 부합도 기준으로 종합 분석합니다. 높은 등급이 더 나은 삶을 보장하지 않습니다.</p>
        </div>
        <p className="text-center text-xs text-indigo-500 font-bold pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
