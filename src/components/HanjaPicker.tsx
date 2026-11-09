'use client';

import { useState, useMemo } from 'react';
import { X, Star, TrendingUp, Sparkles } from 'lucide-react';
import { OhaengType, OHAENG_COLORS } from '@/types';
import { HanjaOption, getHanjaOptions, getSuriOhaeng, getRecommendedHanja } from '@/data/hanjaDB';

interface Props {
  hangul: string;
  selectedHanja?: string;
  onSelect: (opt: HanjaOption) => void;
  onClose: () => void;
  recommendedOhaeng?: OhaengType | null;  // 사주에서 부족한 오행
  label?: string;  // e.g., "돌림자 '민'"
}

function OhaengBadge({ ohaeng, label }: { ohaeng: OhaengType; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: OHAENG_COLORS[ohaeng] + '18', color: OHAENG_COLORS[ohaeng], border: `1px solid ${OHAENG_COLORS[ohaeng]}35` }}
    >
      {label && <span className="opacity-60">{label}</span>}{ohaeng}
    </span>
  );
}

function FreqBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="bg-slate-100 rounded-full h-1 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function HanjaPicker({ hangul, selectedHanja, onSelect, onClose, recommendedOhaeng, label }: Props) {
  const options = useMemo(() => getHanjaOptions(hangul), [hangul]);
  const recommended = useMemo(
    () => getRecommendedHanja(hangul, recommendedOhaeng ?? null),
    [hangul, recommendedOhaeng]
  );

  const [hovered, setHovered] = useState<string | null>(null);

  if (options.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">{`'${hangul}' 한자 정보`}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-slate-500">이 글자의 한자 데이터가 없습니다. 향후 업데이트에서 추가될 예정입니다.</p>
          <button onClick={onClose} className="mt-4 w-full py-2 bg-slate-100 rounded-xl text-sm text-slate-600">닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-900 text-lg">
              {label ?? `'${hangul}' 한자 선택`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {options.length}가지 한자 · 자원오행과 수리오행 포함 분석
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 추천 안내 */}
        {recommended && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
            <p className="text-xs text-indigo-700">
              <strong>{recommended.hanja}</strong>({recommended.meaning})이
              {recommendedOhaeng ? ` 사주의 부족한 ${recommendedOhaeng} 기운을 보완합니다.` : ' 종합 균형에 추천됩니다.'}
            </p>
          </div>
        )}

        {/* 한자 목록 */}
        <div className="overflow-y-auto p-5 space-y-3" style={{ maxHeight: 'calc(90vh - 160px)' }}>
          {options.map(opt => {
            const isSelected = selectedHanja === opt.hanja;
            const isRecommended = recommended?.hanja === opt.hanja;
            const suriOhaeng = getSuriOhaeng(opt.strokes);
            const isHovered = hovered === opt.hanja;

            return (
              <button
                key={opt.hanja}
                onClick={() => { onSelect(opt); onClose(); }}
                onMouseEnter={() => setHovered(opt.hanja)}
                onMouseLeave={() => setHovered(null)}
                className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm shadow-indigo-100'
                    : isHovered
                      ? 'border-slate-300 bg-slate-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* 한자 대형 표시 */}
                  <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center text-4xl font-black border ${
                    isSelected ? 'border-indigo-300 bg-indigo-100 text-indigo-900' : 'border-slate-200 bg-slate-50 text-slate-800'
                  }`}>
                    {opt.hanja}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 뱃지 행 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {isRecommended && (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
                          <Star className="w-2.5 h-2.5" /> 추천
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">선택됨</span>
                      )}
                    </div>

                    {/* 뜻 */}
                    <p className="font-bold text-sm text-slate-800">{opt.meaning}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{opt.fullMeaning}</p>

                    {/* 오행 뱃지 */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-slate-500">자원:</span>
                      <OhaengBadge ohaeng={opt.jaWonOhaeng} />
                      <span className="text-[10px] text-slate-500 ml-1">수리:</span>
                      <OhaengBadge ohaeng={suriOhaeng} />
                      <span className="text-[10px] text-slate-400 ml-1 font-mono">{opt.strokes}획 · {opt.radical}부</span>
                    </div>

                    {/* 빈도 바 */}
                    <div className="grid grid-cols-2 gap-2 mt-2.5">
                      <FreqBar value={opt.usageFreq} label="사용 빈도" />
                      <FreqBar value={opt.modernPref} label="현대 선호도" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* 선택 안 함 */}
          <button
            onClick={() => onClose()}
            className="w-full text-center py-3 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            선택하지 않음 (기본값 유지)
          </button>
        </div>
      </div>
    </div>
  );
}
