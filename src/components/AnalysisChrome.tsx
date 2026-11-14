import DisclaimerBanner from '@/components/DisclaimerBanner';

/**
 * The chrome every analysis page had in the root layout before R5.10 (unchanged markup): the medical
 * disclaimer banner, the page body and the footer. Used by the layouts of /start, /mode-*, /results.
 */
export default function AnalysisChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DisclaimerBanner />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-5 mt-16">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-1">
          <p className="text-xs font-semibold text-indigo-600 tracking-wider">Powered by Destiny Lab</p>
          <p className="text-[11px] text-slate-400">
            Destiny Lab Birth Designer — 전통 명리학·성명학 기반 출생 설계 플랫폼
          </p>
          <p className="text-[11px] text-slate-400">
            본 서비스는 참고 분석 자료이며 의료적 판단, 투자 조언, 미래를 보장하지 않습니다.
          </p>
        </div>
      </footer>
    </>
  );
}
