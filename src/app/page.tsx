// R5.10 — public landing page of Birth Designer V2, served at www.destiny-code.kr/birth (basePath).
// Static server component: no client JavaScript of its own, no backend capability, no R5 code.
// The previous root page (Mode A/B/C selection) now lives at /birth/start.
import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';
import { HERO } from '@/components/landing/content';
import { DESTINY_LAB_HOME, LANDING_CANONICAL, indexingAllowed } from '@/lib/site/routes';
import { buildSamplePreview, SAMPLE_INPUT_TEXT } from '@/lib/site/samplePreview';

const TITLE = 'Birth Designer V2 — 출생 일정과 이름 후보를 함께 비교 | Destiny Lab';
const DESCRIPTION = HERO.subtitle;
/** served by src/app/og/route.tsx; written with the base path because metadata URLs do not get it */
const OG_IMAGE = '/birth/og';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/birth' },
  robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: 'website', locale: 'ko_KR', siteName: 'Destiny Lab', url: '/birth',
    title: '한 사람의 시작을, 더 깊이 설계하다. — Birth Designer V2', description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Birth Designer V2 — Destiny Lab' }],
  },
  twitter: { card: 'summary_large_image', title: 'Birth Designer V2 | Destiny Lab', description: DESCRIPTION, images: [OG_IMAGE] },
};

/** Truthful structured data only: what the page is, who publishes it. No offers, ratings or reviews. */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Birth Designer V2',
  url: LANDING_CANONICAL,
  description: DESCRIPTION,
  inLanguage: 'ko-KR',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web browser',
  publisher: { '@type': 'Organization', name: 'Destiny Lab', url: DESTINY_LAB_HOME },
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }} />
      <LandingPage preview={buildSamplePreview(3)} previewInputText={SAMPLE_INPUT_TEXT} />
    </>
  );
}
