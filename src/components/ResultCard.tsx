'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { AnalysisResult, GRADE_CONFIG, OHAENG_COLORS, IMAGE_LABELS } from '@/types';
import { getDisplayHour, getHourLabel } from '@/lib/saju';
import { formatKoreanDate } from '@/lib/analysis';
import OhaengChart from './OhaengChart';

const SCORE_LABELS: { key: keyof AnalysisResult['scores']; label: string }[] = [
  { key: 'sajuOhaengBalance',    label: '사주 오행 균형' },
  { key: 'yinYangHarmony',       label: '음양 조화' },
  { key: 'nameHarmony',          label: '이름·사주 조화' },
  { key: 'pronunciationStability', label: '발음 안정성' },
  { key: 'hanjaQuality',         label: '한자 의미 품질' },
  { key: 'modernUsability',      label: '현대적 사용성' },
  { key: 'imageMatch',           label: '이미지 부합도' },
];

const GRADE_RING: Record<string, string> = {
  SS: 'ring-2 ring-amber-400 shadow-amber-100 shadow-md',
  S:  'ring-2 ring-indigo-400 shadow-indigo-100 shadow-md',
  A:  'ring-2 ring-emerald-400 shadow-emerald-100 shadow-sm',
  B:  'ring-1 ring-blue-300 shadow-sm',
  C:  'ring-1 ring-slate-200',
};

export default function ResultCard({ result, showRank = true }: { result: AnalysisResult; showRank?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const g = result.grade;
  const gc = GRADE_CONFIG[g];

  return (
    <div className={`bg-white rounded-2xl overflow-hidden ${GRADE_RING[g]} transition-all`}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* 순위 */}
          {showRank && result.rank && (
            <div className="flex-shrink-0 text-center w-10">
              <div className="text-2xl font-black text-slate-800 leading-none">{result.rank}</div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wide mt-0.5">위</div>
            </div>
          )}

          {/* 등급 배지 */}
          <div className={`flex-shrink-0 bg-gradient-to-br ${gc.bgFrom} ${gc.bgTo} rounded-xl px-3 py-2.5 text-center min-w-[54px] shadow-sm`}>
            <div className="text-[10px] text-white/80 font-light leading-tight">{gc.description}</div>
            <div className="text-2xl font-black text-white leading-tight">{g}</div>
          </div>

          {/* 이름 + 날짜 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{result.name.full}</h3>
              <span className="text-xs font-mono text-slate-400">{result.nameAnalysis.hanja}</span>
              {result.name.gender === '남' ? (
                <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">남아</span>
              ) : (
                <span className="text-[10px] bg-pink-50 text-pink-600 border border-pink-200 px-2 py-0.5 rounded-full">여아</span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-0.5">{formatKoreanDate(result.date)}</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">
              {getDisplayHour(result.hour)}
              <span className="text-xs text-slate-400 ml-2">{getHourLabel(result.hour)}</span>
            </p>
            {/* 한자 의미 */}
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              {result.nameAnalysis.meanings.map((m, i) => (
                <span key={i}>{m.split(' — ')[1] ?? m}{i < result.nameAnalysis.meanings.length - 1 ? ' · ' : ''}</span>
              ))}
            </p>
          </div>

          {/* 종합 점수 */}
          <div className="flex-shrink-0 text-right">
            <div className={`text-3xl font-black ${gc.textColor}`}>{result.scores.overall}</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">종합</div>
          </div>
        </div>

        {/* 특징 태그 */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {result.characteristics.map((tag, i) => (
            <span key={i} className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
              {tag}
            </span>
          ))}
          {result.imageMatches.map(img => (
            <span key={img} className="text-[11px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded-full">
              {IMAGE_LABELS[img].icon} {img}
            </span>
          ))}
        </div>

        {/* 설명 */}
        <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed">{result.description}</p>

        {/* 사주 요약 */}
        <div className="flex gap-1.5 mt-3">
          {[
            { label: '년주', p: result.fourPillars.year },
            { label: '월주', p: result.fourPillars.month },
            { label: '일주', p: result.fourPillars.day },
            { label: '시주', p: result.fourPillars.hour },
          ].map(({ label, p }) => (
            <div key={label} className="flex-1 bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
              <div className="text-[9px] text-slate-400 mb-1">{label}</div>
              <div className="text-[11px] font-semibold text-slate-700">{p.label.split('·')[0]}</div>
              <div className="flex justify-center gap-0.5 mt-1">
                <span className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: OHAENG_COLORS[p.stemOhaeng] + '20', color: OHAENG_COLORS[p.stemOhaeng] }}>{p.stemOhaeng}</span>
                <span className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: OHAENG_COLORS[p.branchOhaeng] + '20', color: OHAENG_COLORS[p.branchOhaeng] }}>{p.branchOhaeng}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 펼치기 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-slate-100 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
      >
        <BookOpen className="w-3 h-3" />
        {expanded ? '닫기' : '상세 분석 보기'}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-5 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3">사주 오행 분포</h4>
              <OhaengChart balance={result.sajuOhaengBalance} size={170} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3">세부 점수</h4>
              <div className="space-y-2">
                {SCORE_LABELS.map(({ key, label }) => {
                  const val = result.scores[key] as number;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>{label}</span>
                        <span className="font-semibold">{val}점</span>
                      </div>
                      <div className="bg-slate-200 rounded-full h-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                          style={{ width: `${val}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-semibold text-slate-600 mb-2">이름 발음오행</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.nameAnalysis.pronunciationOhaeng.map((o, i) => (
                    <span key={i} className="text-[11px] px-2 py-1 rounded-lg font-medium"
                      style={{ backgroundColor: OHAENG_COLORS[o] + '15', color: OHAENG_COLORS[o], border: `1px solid ${OHAENG_COLORS[o]}30` }}>
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
