import type { Metadata } from 'next';
import AnalysisChrome from '@/components/AnalysisChrome';

export const metadata: Metadata = {
  title: '분석 시작 | Destiny Lab Birth Designer',
  description: '출생 설계(Mode A), 이름 설계(Mode B), 이름 평가(Mode C) 중 필요한 분석을 선택하세요.',
  alternates: { canonical: '/birth/start' },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return <AnalysisChrome>{children}</AnalysisChrome>;
}
