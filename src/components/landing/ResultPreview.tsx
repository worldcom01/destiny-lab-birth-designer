import type { PreviewCandidate } from '@/lib/site/samplePreview';
import s from './landing.module.css';

/**
 * Result preview in the R4 result-card language: combination rank, name, suggested Hanja with the
 * legal-status label, permitted date/time, overall score with grade and band, and the component
 * breakdown with weights. Values come from the current engine run on a fictional input (see caption).
 */
export default function ResultPreview({ candidates, inputText }: { candidates: PreviewCandidate[]; inputText: string }) {
  const [top, ...rest] = candidates;
  if (!top) return null;
  return (
    <figure className="m-0">
      <div className="rounded-[28px] border border-[#e6e1d6] bg-white shadow-[0_1px_0_rgba(23,23,28,0.04),0_24px_60px_-30px_rgba(23,23,28,0.25)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#efebe3] px-5 py-3 sm:px-7">
          <span className="text-xs font-semibold tracking-wide text-[#64646e]">결과 화면 미리보기</span>
          <span className="rounded-full border border-[#d9d4f5] bg-[#eeecfb] px-2.5 py-1 text-[11px] font-semibold text-[#3d33a8]">예시</span>
        </div>

        <article aria-label={`예시 조합 ${top.rank}위: ${top.name}, ${top.dateText} ${top.timeText}, 종합 ${top.overall}점 ${top.grade}등급`} className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#4f43c9]">종합 점수 {top.rank}위 조합</p>
              <p className={`${s.sectionTitle} mt-1 text-[2rem] font-bold sm:text-[2.4rem]`}>{top.name}</p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="추천 한자">
                {top.hanja.map(h => (
                  <li key={h.hangul} className="flex items-center gap-2 rounded-xl border border-[#ece8df] bg-[#fbfaf7] px-3 py-1.5">
                    <span className="text-lg text-[#17171c]" lang="zh-Hant">{h.hanja ?? '—'}</span>
                    <span className="text-xs text-[#64646e]">{h.hangul}</span>
                    {h.legal && <span className="rounded-md bg-[#f4f1ea] px-1.5 py-0.5 text-[11px] text-[#5a5a63]">{h.legal}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-[#46464f]">{top.dateText} · {top.timeText}</p>
              <p className="mt-0.5 text-xs text-[#64646e]">의료진이 허용한 범위 내 분석</p>
            </div>
            <div className="flex w-full shrink-0 items-center justify-center gap-6 rounded-2xl bg-[#f6f4ee] px-5 py-4 sm:w-auto sm:justify-start sm:gap-4">
              <div className="text-center">
                <p className="text-[11px] text-[#64646e]">이 조합의 종합 점수</p>
                <p className="text-3xl font-bold tabular-nums text-[#17171c]">{top.overall}<span className="ml-0.5 text-base font-medium text-[#64646e]">점</span></p>
              </div>
              <div className="text-center">
                <p className="flex h-12 w-12 items-center justify-center rounded-full bg-[#17171c] text-base font-bold text-white">{top.grade}</p>
                <p className="mt-1 text-[11px] text-[#64646e]">{top.gradeBand}</p>
              </div>
            </div>
          </div>

          <div className="mt-7">
            <p className="text-xs font-semibold text-[#17171c]">항목별 점수 <span className="font-normal text-[#64646e]">· 종합 점수 가중치</span></p>
            <ul className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {top.components.map(c => (
                <li key={c.label}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-[#46464f]">{c.label} <span className="text-[#8a8a93]">{c.weight}%</span></span>
                    <span className="tabular-nums font-semibold text-[#17171c]">{c.value}</span>
                  </div>
                  <div className={`${s.meter} mt-1.5 h-1.5 rounded-full`} style={{ ['--v' as string]: `${Math.max(0, Math.min(100, c.value))}%` }} aria-hidden="true" />
                </li>
              ))}
            </ul>
          </div>
        </article>

        {rest.length > 0 && (
          <ul className="border-t border-[#efebe3] px-5 py-2 sm:px-7" aria-label="다른 예시 조합">
            {rest.map(c => (
              <li key={c.name} className="flex items-center justify-between gap-3 border-b border-[#f3f0e9] py-3 last:border-0">
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="text-xs tabular-nums text-[#8a8a93]">{c.rank}위</span>
                  <span className="font-semibold text-[#17171c]">{c.name}</span>
                  <span className="truncate text-xs text-[#64646e]">{c.timeText}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-[#17171c]">{c.overall}점 · {c.grade}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <figcaption className="mt-4 text-xs leading-relaxed text-[#64646e]">
        예시 화면입니다. {inputText}으로 현재 분석 엔진을 실행한 결과이며, 실제 아이의 정보나 의료적 권고가 아닙니다.
        한자 옆의 표시는 결과 화면에서 보이는 인명용 확인 상태입니다.
      </figcaption>
    </figure>
  );
}
