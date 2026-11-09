import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';
import DisclaimerBanner from '@/components/DisclaimerBanner';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Destiny Lab Birth Designer | 출생일·작명 설계 플랫폼',
  description: '전통 명리학·성명학 기반 이름 생성 및 출생 조합 분석 서비스. 의료진 결정 최우선.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoSansKR.className} h-full`}>
      <body className="min-h-full flex flex-col bg-[#F4F6F9]">
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
      </body>
    </html>
  );
}
