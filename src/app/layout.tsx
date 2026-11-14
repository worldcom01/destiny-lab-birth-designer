import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';
import { SITE_ORIGIN, indexingAllowed } from '@/lib/site/routes';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: 'Destiny Lab Birth Designer | 출생일·작명 설계 플랫폼',
  description: '전통 명리학·성명학 기반 이름 생성 및 출생 조합 분석 서비스. 의료진 결정 최우선.',
  robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
};

// R5.10: the analysis chrome (disclaimer banner, footer) moved to src/components/AnalysisChrome.tsx and
// wraps the analysis segments (/start, /mode-*, /results); the landing page has its own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoSansKR.className} h-full`}>
      <body className="min-h-full flex flex-col bg-[#F4F6F9]">{children}</body>
    </html>
  );
}
