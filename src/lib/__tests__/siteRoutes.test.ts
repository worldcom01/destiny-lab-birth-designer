// R5.10 — routing contract of the /birth zone: base path, legacy redirects, indexing rule, and that
// the analysis "back" buttons return to the mode selection (now /start, not the landing page).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';
import { BASE_PATH, LEGACY_REDIRECTS, indexingAllowed, LANDING_CANONICAL } from '@/lib/site/routes';

describe('R5.10 /birth routing', () => {
  it('the app is served under /birth', () => {
    expect(nextConfig.basePath).toBe('/birth');
    expect(BASE_PATH).toBe('/birth');
    expect(LANDING_CANONICAL).toBe('https://www.destiny-code.kr/birth');
  });

  it('every pre-R5.10 path of this deployment redirects (temporarily) to the same page under /birth', async () => {
    const r = await nextConfig.redirects!();
    expect(r).toEqual([...LEGACY_REDIRECTS]);
    const table = Object.fromEntries(r.map(x => [x.source, x.destination]));
    expect(table).toEqual({
      '/': '/birth/start',
      '/:mode(mode-a|mode-b|mode-c)': '/birth/:mode',
      '/:mode(mode-a|mode-b|mode-c)/results': '/birth/:mode/results',
      '/results': '/birth/results',
    });
    for (const x of r) { expect(x.basePath).toBe(false); expect(x.permanent).toBe(false); }
  });

  it('indexing only on the production deployment', () => {
    expect(indexingAllowed({ VERCEL_ENV: 'production' })).toBe(true);
    expect(indexingAllowed({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(indexingAllowed({})).toBe(false);
  });

  it('analysis back buttons go to the mode selection (/start), never to the landing page', () => {
    for (const m of ['a', 'b', 'c']) {
      const src = readFileSync(`src/app/mode-${m}/page.tsx`, 'utf8');
      expect(src).toContain("router.push('/start')");
      expect(src).not.toContain("router.push('/')");
    }
  });

  it('the landing page and its components stay server-only (no client JavaScript of their own) and import no R5 code', () => {
    const files = ['src/app/page.tsx', 'src/components/landing/LandingPage.tsx', 'src/components/landing/ResultPreview.tsx', 'src/components/landing/Motif.tsx', 'src/lib/site/samplePreview.ts'];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect([f, /^['"]use client['"]/m.test(src)]).toEqual([f, false]);
      expect([f, /server\/|features\/projects|payments|@destiny-lab/.test(src)]).toEqual([f, false]);
    }
  });
});
