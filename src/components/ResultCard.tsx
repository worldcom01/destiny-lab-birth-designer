'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { AnalysisResult, GRADE_CONFIG, OHAENG_COLORS, IMAGE_LABELS } from '@/types';
import { getDisplayHour, getHourLabel, getSijinLabel } from '@/lib/saju';
import { formatKoreanDate } from '@/lib/analysis';
import { formatTimeSlot } from '@/lib/schedule';
import { LEGACY_GLOSS_LABEL } from '@/lib/hanjaModel';
import { buildSajuReading } from '@/lib/sajuReading';
import SajuReadingBlock from './SajuReadingBlock';
import OhaengChart from './OhaengChart';
import ScoreBreakdown from './ScoreBreakdown';


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

  // The score belongs to the whole combination (name + date + time), not to any part of it.
  const ranked = showRank && !!result.rank;
  const comboLabel = ranked ? `종합 점수 ${result.rank}위 조합` : '분석 조합';
  const dateText = formatKoreanDate(result.date);
  const timeText = result.timeSlot ? formatTimeSlot(result.timeSlot) : getDisplayHour(result.hour);
  const sijin = result.timeSlot ? getHourLabel(result.hour).split('(')[0] : getSijinLabel(result.hour);

  return (
    <article
      aria-label={`${comboLabel}: ${result.name.full}, ${dateText} ${timeText}, 이 조합의 종합 점수 ${result.scores.overall}점, ${g}등급`}
      className={`bg-white rounded-2xl overflow-hidden ${GRADE_RING[g]} transition-all`}>
      <div className="p-4 sm:p-5">
        {/* 1. 조합 순위 + 등급 */}
        <div className="flex items-center justify-between gap-2">
          <p className={`min-w-0 break-keep text-xs font-bold ${ranked ? 'text-slate-800' : 'text-slate-500'}`} data-testid="card-combo-label">
            {comboLabel}
          </p>
          <span data-testid="card-grade" className={`inline-flex shrink-0 items-baseline gap-1 rounded-lg bg-gradient-to-br ${gc.bgFrom} ${gc.bgTo} px-2.5 py-1 text-white shadow-sm`}>
            <span className="text-sm font-black leading-none">{g}</span>
            <span className="text-[10px] font-light leading-none text-white/85">{gc.description}</span>
          </span>
        </div>

        {/* 2. 이름 + 한자 */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="min-w-0 text-2xl font-black tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{result.name.full}</h3>
          <span className="min-w-0 text-base font-medium text-slate-500 break-all">{result.nameAnalysis.hanja}</span>
          {result.name.gender === '남' ? (
            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">남아</span>
          ) : (
            <span className="text-[10px] bg-pink-50 text-pink-600 border border-pink-200 px-2 py-0.5 rounded-full">여아</span>
          )}
        </div>

        {/* 3·4. 출생 날짜 · 출생 시간 + 5. 이 조합의 종합 점수 */}
        <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <dl className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="w-[4.25rem] shrink-0 text-xs font-medium text-slate-500">출생 날짜</dt>
              <dd className="min-w-0 break-keep text-lg font-bold leading-snug text-slate-900 sm:text-xl" data-testid="card-birth-date">{dateText}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="w-[4.25rem] shrink-0 text-xs font-medium text-slate-500">출생 시간</dt>
              <dd className="min-w-0 break-keep text-lg font-bold leading-snug text-slate-900 sm:text-xl" data-testid="card-birth-time">{timeText}</dd>
            </div>
          </dl>
          {/* The grade is shown once, in the badge above; the score row carries no grade label. */}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
            <div className="min-w-0 break-keep leading-tight">
              <p className="text-sm font-semibold text-slate-700">이 조합의 종합 점수</p>
              <p className="mt-0.5 text-[11px] text-slate-400">현재 분석 모델 기준</p>
            </div>
            <p className={`shrink-0 whitespace-nowrap leading-none ${gc.textColor}`} data-testid="card-overall">
              <span className="text-2xl font-black tabular-nums">{result.scores.overall}</span>
              <span className="ml-0.5 text-base font-bold">점</span>
            </p>
          </div>
        </div>

        {/* 6. 보조 정보 */}
        <p className="mt-1.5 break-keep text-xs text-slate-500" data-testid="card-meta">
          {sijin}{result.timeSlot ? ' · 의료진이 허용한 범위 내 분석' : ''}
        </p>
        {/* 한자 의미: pre-R4 glosses without a documented source (R4 audit P1) */}
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed" data-testid="card-meanings">
          {result.name.hanja.given.some(c => c.hanja && c.meaning) && (
            <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">뜻 {LEGACY_GLOSS_LABEL}</span>
          )}
          {result.nameAnalysis.meanings.map((m, i) => (
            <span key={i}>{m.split(' — ')[1] ?? m}{i < result.nameAnalysis.meanings.length - 1 ? ' · ' : ''}</span>
          ))}
        </p>

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
        <SajuReadingBlock compact {...buildSajuReading(result)} />

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
        aria-expanded={expanded}
        className="w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2 border-t border-slate-100 text-xs text-slate-500 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
      >
        <BookOpen className="w-3 h-3" aria-hidden />
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
              <ScoreBreakdown scores={result.scores} given={result.name.given} />

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
    </article>
  );
}
