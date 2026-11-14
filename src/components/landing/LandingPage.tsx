import Link from 'next/link';
import { DESTINY_LAB_HOME, ROUTES } from '@/lib/site/routes';
import type { PreviewCandidate } from '@/lib/site/samplePreview';
import { FAQ, FINAL_CTA, HERO, LEGAL_PENDING, MODES, PRICING, SAFETY, STEPS, VALUES } from './content';
import Motif from './Motif';
import ResultPreview from './ResultPreview';
import s from './landing.module.css';

const PRIMARY = `${s.focusRing} inline-flex min-h-12 items-center justify-center rounded-full bg-[#17171c] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-[#2b2b33]`;
const SECONDARY = `${s.focusRing} inline-flex min-h-12 items-center justify-center rounded-full border border-[#d6d0c3] bg-white/70 px-7 text-[15px] font-semibold text-[#17171c] transition-colors hover:border-[#17171c]`;
const WRAP = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
const NAV = [
  { href: '#modes', label: '분석 모드' },
  { href: '#preview', label: '결과 미리보기' },
  { href: '#how', label: '이용 방법' },
  { href: '#faq', label: '자주 묻는 질문' },
];

function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.18em] text-[#4f43c9] uppercase">{eyebrow}</p>
      <h2 id={id} className={`${s.sectionTitle} mt-3 text-[1.75rem] font-bold sm:text-[2.35rem]`}>{title}</h2>
      {lead && <p className={`${s.lead} mt-4 text-[15px] leading-relaxed text-[#46464f] sm:text-base`}>{lead}</p>}
    </div>
  );
}

export default function LandingPage({ preview, previewInputText }: { preview: PreviewCandidate[]; previewInputText: string }) {
  return (
    <div className={`${s.page} min-h-screen`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#17171c]">본문으로 건너뛰기</a>

      <header className="border-b border-[#ece8df]/80">
        <div className={`${WRAP} flex h-16 items-center justify-between gap-4`}>
          <a href={DESTINY_LAB_HOME} className={`${s.focusRing} flex min-h-11 items-center gap-2`}>
            <span className="text-[15px] font-bold tracking-tight text-[#17171c]">Destiny Lab</span>
            <span className="hidden text-xs font-medium text-[#64646e] min-[400px]:inline">Birth Designer</span>
          </a>
          <nav aria-label="페이지 내 이동" className="hidden md:block">
            <ul className="flex items-center gap-7 text-sm text-[#46464f]">
              {NAV.map(n => <li key={n.href}><a href={n.href} className={`${s.focusRing} inline-flex min-h-11 items-center hover:text-[#17171c]`}>{n.label}</a></li>)}
            </ul>
          </nav>
          <Link href={ROUTES.start} className={`${s.focusRing} inline-flex min-h-10 items-center rounded-full bg-[#17171c] px-4 text-sm font-semibold text-white hover:bg-[#2b2b33]`}>{HERO.primaryCta}</Link>
        </div>
      </header>

      <main id="main">
        {/* A. HERO */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div className={`${WRAP} grid items-center gap-10 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6 lg:pb-24 lg:pt-24`}>
            <div className={s.reveal}>
              <p className="text-xs font-semibold tracking-[0.18em] text-[#4f43c9] uppercase">{HERO.eyebrow}</p>
              <h1 id="hero-title" className={`${s.title} mt-5 text-[2.35rem] font-bold min-[400px]:text-[2.7rem] sm:text-6xl lg:text-[4.25rem]`}>
                {HERO.titleLines[0]}<br />{HERO.titleLines[1]}
              </h1>
              <p className={`${s.lead} mt-6 max-w-xl text-base leading-relaxed text-[#46464f] sm:text-lg`}>{HERO.subtitle}</p>
              <div className="mt-9 flex flex-col gap-3 min-[400px]:flex-row">
                <Link href={ROUTES.start} className={PRIMARY}>{HERO.primaryCta}</Link>
                <a href="#how" className={SECONDARY}>{HERO.secondaryCta}</a>
              </div>
              <p className="mt-6 text-xs text-[#64646e]">{HERO.medicalNote}</p>
            </div>
            <div className={`${s.revealLate} mx-auto w-full max-w-[420px] lg:max-w-[480px]`}>
              <Motif className="h-auto w-full" />
              <ul className="mt-2 flex justify-center gap-5 text-[11px] text-[#64646e]" aria-hidden="true">
                <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-[#17171c]/60" />허용된 일정</li>
                <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-[#17171c]/60" />이름 후보</li>
                <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#4f43c9]" />비교 결과</li>
              </ul>
            </div>
          </div>
        </section>

        {/* B. VALUE */}
        <section aria-labelledby="value-title" className="border-t border-[#ece8df] bg-white py-20 sm:py-28">
          <div className={WRAP}>
            <SectionHead id="value-title" eyebrow="Why" title="복잡한 선택을, 같은 기준 위에서." lead="가능한 일정과 이름 후보는 생각보다 많습니다. Birth Designer는 같은 기준으로 계산한 결과를 나란히 놓아, 무엇이 왜 앞서는지 비교할 수 있게 합니다." />
            <ul className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-[#ece8df] bg-[#ece8df] md:grid-cols-3">
              {VALUES.map((v, i) => (
                <li key={v.title} className="bg-white p-7 sm:p-8">
                  <span className="text-sm font-semibold tabular-nums text-[#4f43c9]">0{i + 1}</span>
                  <h3 className="mt-4 text-lg font-bold text-[#17171c]">{v.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#46464f]">{v.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* C. MODES */}
        <section aria-labelledby="modes" className="py-20 sm:py-28">
          <div className={WRAP}>
            <SectionHead id="modes" eyebrow="Modes" title="상황에 맞는 세 가지 분석." lead="출생 일정을 정하는 단계인지, 이미 정해졌는지, 생각해 둔 이름이 있는지에 따라 고르세요." />
            <ul className="mt-12 grid gap-5 lg:grid-cols-3">
              {MODES.map(m => (
                <li key={m.id} className="flex flex-col rounded-3xl border border-[#e6e1d6] bg-white p-7 sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eeecfb] text-sm font-bold text-[#3d33a8]" aria-hidden="true">{m.id}</span>
                    <p className="text-xs font-semibold tracking-wide text-[#64646e]">MODE {m.id} · {m.lead}</p>
                  </div>
                  <h3 className="mt-5 text-2xl font-bold tracking-tight text-[#17171c]">{m.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#46464f]">{m.body}</p>
                  <p className="mt-6 text-xs font-semibold text-[#17171c]">입력</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-[#46464f]">
                    {m.inputs.map(x => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#4f43c9]" aria-hidden="true" />{x}</li>)}
                  </ul>
                  <div className="mt-auto pt-8">
                    <Link href={m.href} className={`${s.focusRing} inline-flex min-h-11 w-full items-center justify-between rounded-2xl border border-[#d6d0c3] px-5 text-sm font-semibold text-[#17171c] transition-colors hover:border-[#17171c]`}>
                      {m.cta}<span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* D. RESULT PREVIEW */}
        <section aria-labelledby="preview" className="border-t border-[#ece8df] bg-white py-20 sm:py-28">
          <div className={`${WRAP} grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start`}>
            <div className="lg:sticky lg:top-10">
              <SectionHead id="preview" eyebrow="Results" title="점수 하나가 아니라, 그 이유까지." lead="결과 화면은 조합의 종합 점수와 등급, 항목별 점수와 가중치, 추천 한자와 인명용 확인 상태를 함께 보여줍니다." />
              <ul className="mt-8 space-y-3 text-sm text-[#46464f]">
                <li className="flex gap-3"><span className="shrink-0 whitespace-nowrap font-semibold text-[#17171c]">상세 비교</span>후보마다 사주 요약과 항목별 근거를 펼쳐 볼 수 있습니다.</li>
                <li className="flex gap-3"><span className="shrink-0 whitespace-nowrap font-semibold text-[#17171c]">PDF 리포트</span>세 가지 모드 모두 결과를 PDF로 내려받을 수 있습니다.</li>
              </ul>
            </div>
            <ResultPreview candidates={preview} inputText={previewInputText} />
          </div>
        </section>

        {/* E. HOW IT WORKS */}
        <section aria-labelledby="how" className="py-20 sm:py-28">
          <div className={WRAP}>
            <SectionHead id="how" eyebrow="How it works" title="네 단계로 끝나는 비교." />
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((st, i) => (
                <li key={st.title} className="rounded-3xl border border-[#e6e1d6] bg-white p-7">
                  <span className="text-xs font-semibold tabular-nums text-[#4f43c9]">STEP {i + 1}</span>
                  <h3 className="mt-3 text-lg font-bold text-[#17171c]">{st.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#46464f]">{st.body}</p>
                </li>
              ))}
            </ol>
            <aside aria-labelledby="safety-title" className="mt-8 rounded-3xl border border-[#e8dcc0] bg-[#fbf6ea] p-7 sm:p-8">
              <h3 id="safety-title" className="text-base font-bold text-[#17171c]">먼저 알아두세요</h3>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-[#4a4335]">
                {SAFETY.map(x => <li key={x} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#a07b2c]" aria-hidden="true" />{x}</li>)}
              </ul>
            </aside>
          </div>
        </section>

        {/* F. PRODUCTS AND PRICING (information only until terms are approved) */}
        <section aria-labelledby="pricing" className="border-t border-[#ece8df] bg-white py-20 sm:py-28">
          <div className={WRAP}>
            <SectionHead id="pricing" eyebrow="Plans" title={PRICING.title} />
            <div className="mt-10 rounded-3xl border border-dashed border-[#d6d0c3] bg-[#fbfaf7] p-7 sm:p-10">
              <p className="inline-flex rounded-full bg-[#f1eee6] px-3 py-1 text-xs font-semibold text-[#5a5a63]">{PRICING.status}</p>
              <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#46464f]">{PRICING.body}</p>
              <ul className="mt-6 flex flex-wrap gap-2 text-sm text-[#46464f]" aria-label="안내 예정 항목">
                {PRICING.items.map(x => <li key={x} className="rounded-full border border-[#e6e1d6] bg-white px-3 py-1.5">{x}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* G. FAQ */}
        <section aria-labelledby="faq" className="py-20 sm:py-28">
          <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr]`}>
            <SectionHead id="faq" eyebrow="FAQ" title="자주 묻는 질문" />
            <div className="divide-y divide-[#e6e1d6] border-y border-[#e6e1d6]">
              {FAQ.map(f => (
                <details key={f.q} className={s.faq}>
                  <summary className="flex min-h-14 items-center justify-between gap-4 py-5 text-left text-base font-semibold text-[#17171c]">
                    {f.q}
                    <span className={`${s.chevron} shrink-0 text-xl leading-none text-[#4f43c9]`} aria-hidden="true">+</span>
                  </summary>
                  <p className="pb-6 pr-8 text-[15px] leading-relaxed text-[#46464f]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* H. FINAL CTA */}
        <section aria-labelledby="final-title" className="px-5 pb-20 sm:px-8 sm:pb-28">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[#17171c] px-7 py-16 text-center sm:px-12 sm:py-20">
            <h2 id="final-title" className="text-[1.75rem] font-bold leading-tight tracking-[-0.03em] text-white [text-wrap:balance] sm:text-[2.5rem]">{FINAL_CTA.title}</h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] text-[#c9c9d1]">{FINAL_CTA.body}</p>
            <Link href={ROUTES.start} className={`${s.focusRing} mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-8 text-[15px] font-semibold text-[#17171c] hover:bg-[#ecebf5]`}>{FINAL_CTA.cta}</Link>
            <p className="mt-6 text-xs text-[#a3a3ad]">{HERO.medicalNote}</p>
          </div>
        </section>
      </main>

      {/* I. FOOTER */}
      <footer className="border-t border-[#ece8df] bg-white">
        <div className={`${WRAP} flex flex-col gap-8 py-12 md:flex-row md:justify-between`}>
          <div>
            <p className="text-[15px] font-bold text-[#17171c]">Destiny Lab <span className="font-medium text-[#64646e]">Birth Designer</span></p>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-[#64646e]">본 서비스는 참고 분석 자료이며 의료적 판단을 대신하거나 미래를 보장하지 않습니다.</p>
          </div>
          <nav aria-label="바닥글">
            <ul className="text-sm">
              <li><a href={DESTINY_LAB_HOME} className={`${s.focusRing} inline-flex min-h-11 items-center text-[#46464f] hover:text-[#17171c]`}>Destiny Lab 홈</a></li>
              <li><Link href={ROUTES.start} className={`${s.focusRing} inline-flex min-h-11 items-center text-[#46464f] hover:text-[#17171c]`}>분석 시작하기</Link></li>
            </ul>
          </nav>
          <div>
            <p className="text-xs font-semibold text-[#17171c]">정책 · 사업자 정보</p>
            <ul className="mt-2 space-y-1.5 text-xs text-[#64646e]" aria-label="공개 준비 중인 문서">
              {LEGAL_PENDING.map(x => <li key={x}>{x} <span className="text-[#8a8a93]">· 공개 준비 중</span></li>)}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
