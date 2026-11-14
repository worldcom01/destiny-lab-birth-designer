// @vitest-environment jsdom
// R5.10 — public landing page (/birth): structure, CTA destinations, truthful content, safety copy,
// non-purchasable pricing, no dead legal links, SEO metadata. (In tests next/link renders the in-app
// path; the build prefixes the /birth base path — verified separately against `next start`.)
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import Page, { metadata } from '@/app/page';
import { FAQ, MODES } from '@/components/landing/content';
import { buildSamplePreview } from '@/lib/site/samplePreview';
import { analyzeModeA } from '@/lib/analysis';
import { SAMPLE_INPUT } from '@/lib/site/samplePreview';

afterEach(cleanup);
const hrefOf = (el: HTMLElement) => el.closest('a')!.getAttribute('href');

describe('R5.10 landing page', () => {
  it('hero: one h1 with the approved message, both CTAs lead somewhere real', () => {
    render(<Page />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('한 사람의 시작을,더 깊이 설계하다.');
    expect(screen.getByText('출생 가능 일정과 이름 후보를 함께 탐색하고, 여러 기준이 교차하는 결과를 한눈에 비교하세요.')).toBeTruthy();
    const starts = screen.getAllByRole('link', { name: '분석 시작하기' });
    expect(starts.length).toBeGreaterThanOrEqual(3);                       // header, hero, final CTA (+ footer)
    for (const a of starts) expect(a.getAttribute('href')).toBe('/start');
    const how = screen.getByRole('link', { name: '어떻게 분석하나요?' });
    expect(how.getAttribute('href')).toBe('#how');
    expect(document.getElementById('how')).toBeTruthy();
  });

  it('every in-page anchor has a target; every link has a destination (no dead controls)', () => {
    const { container } = render(<Page />);
    for (const a of container.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      expect(href, a.textContent ?? '').toBeTruthy();
      if (href!.startsWith('#')) expect(document.getElementById(href!.slice(1)), href!).toBeTruthy();
      else expect(href).toMatch(/^(\/(start|mode-[abc])|https:\/\/www\.destiny-code\.kr\/)$/);
    }
    expect(container.querySelectorAll('button')).toHaveLength(0);           // static page: nothing that needs JS
  });

  it('modes: A/B/C each link into the existing flow', () => {
    render(<Page />);
    for (const m of MODES) expect(hrefOf(screen.getByRole('link', { name: new RegExp(m.cta) }))).toBe(m.href);
    expect(MODES.map(m => m.href)).toEqual(['/mode-a', '/mode-b', '/mode-c']);
  });

  it('result preview is labelled as an example and equals the current engine run on the fictional input', () => {
    render(<Page />);
    const preview = buildSamplePreview(3);
    const top = analyzeModeA(SAMPLE_INPUT).at(0);
    expect(preview[0].name).toBe(top.name.full);
    expect(preview[0].overall).toBe(top.scores.overall);
    expect(preview[0].grade).toBe(top.grade);
    expect(screen.getByText('예시')).toBeTruthy();
    expect(screen.getByText(/예시 화면입니다\. 가상의 입력/)).toBeTruthy();
    expect(screen.getByText(/실제 아이의 정보나 의료적 권고가 아닙니다/)).toBeTruthy();
    const card = screen.getByRole('article');
    expect(within(card).getByText(preview[0].name)).toBeTruthy();
    expect(within(card).getByText(`${preview[0].overall}`)).toBeTruthy();
  });

  it('safety: medical priority, no prediction, Hanja legal check — stated plainly', () => {
    const { container } = render(<Page />);
    const text = container.textContent!;
    expect(text).toContain('담당 의료진의 판단이 우선합니다');
    expect(text).toContain('의료적 안전성이나 적절한 출산 시점을 판단하지 않습니다');
    expect(text).toContain('미래를 예측하지 않습니다');
    expect(text).toContain('대법원 전자가족관계등록시스템');
  });

  it('no unapproved commercial or unverifiable claims', () => {
    const { container } = render(<Page />);
    const text = container.textContent!;
    expect(text).not.toMatch(/\d[\d,]*\s*원(?![가-힣])|₩|무료|할인|구독/);     // no prices or free/discount claims
    expect(text).not.toMatch(/\bAI\b|인공지능/);                           // the engine is a rule-based scoring model
    expect(text).not.toMatch(/후기|리뷰|만 명|명이 사용|누적|보장합니다|정확도|과학적으로/);
    expect(text).not.toMatch(/TOP 50|50개/);                                // unverified count from the old copy
  });

  it('pricing is an information state: no link or form into a payment flow', () => {
    render(<Page />);
    const pricing = screen.getByRole('heading', { name: '이용 안내' }).closest('section')!;
    expect(within(pricing).getByText('요금 안내 준비 중')).toBeTruthy();
    expect(within(pricing).queryAllByRole('link')).toHaveLength(0);
    expect(pricing.querySelector('form, button')).toBeNull();
  });

  it('FAQ: the six required questions, keyboard-operable without JavaScript, grounded storage answer', () => {
    const { container } = render(<Page />);
    expect(container.querySelectorAll('details > summary')).toHaveLength(6);
    expect(FAQ.map(f => f.q)).toEqual([
      'Birth Designer는 무엇인가요?', 'Mode A, B, C는 어떻게 다른가요?', '분석 결과는 어떻게 이해하면 되나요?',
      '의료진의 판단을 대신하나요?', '결과를 저장하거나 내려받을 수 있나요?', '입력한 정보는 어떻게 처리되나요?',
    ]);
    expect(FAQ[4].a).toContain('계정에 저장하는 기능은 아직 제공하지 않습니다');   // R5 accounts are not launched
  });

  it('footer: legal and business items are text, not dead links', () => {
    render(<Page />);
    const legal = screen.getByRole('list', { name: '공개 준비 중인 문서' });
    expect(within(legal).queryAllByRole('link')).toHaveLength(0);
    expect(legal.textContent).toContain('개인정보처리방침');
  });

  it('structured data is truthful (no offers, ratings or reviews)', () => {
    const { container } = render(<Page />);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld).toMatchObject({ '@type': 'WebApplication', name: 'Birth Designer V2', url: 'https://www.destiny-code.kr/birth', inLanguage: 'ko-KR' });
    expect(Object.keys(ld)).not.toEqual(expect.arrayContaining(['offers']));
    expect(JSON.stringify(ld)).not.toMatch(/offers|aggregateRating|review/);
  });

  it('metadata: Korean title/description, canonical /birth, OG image under the base path, noindex outside production', () => {
    expect(String((metadata.title as { absolute: string }).absolute)).toContain('Birth Designer V2');
    expect(metadata.description).toContain('출생 가능 일정과 이름 후보');
    expect(metadata.alternates?.canonical).toBe('/birth');
    const og = metadata.openGraph as { images: { url: string }[]; locale: string };
    expect(og.images[0].url).toBe('/birth/og');
    expect(og.locale).toBe('ko_KR');
    expect(metadata.robots).toEqual({ index: false, follow: false });       // tests do not run as VERCEL_ENV=production
  });
});
