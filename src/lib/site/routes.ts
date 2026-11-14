// R5.10 — route map of the Birth Designer zone (served under www.destiny-code.kr/birth).
//
//   /birth                → public landing page             (src/app/page.tsx)
//   /birth/start          → analysis entry: Mode A/B/C       (src/app/start/page.tsx, formerly `/`)
//   /birth/mode-a|b|c/... → existing analysis flows, unchanged
//
// The root Destiny Lab site (separate repository and deployment) rewrites `/birth` and
// `/birth/:path*` to this deployment. With `basePath`, this app's build assets live under
// `/birth/_next/...` and cannot collide with the root site's `/_next`.
//
// LEGACY LINKS: before R5.10 this app served its pages at the root of its own host
// (e.g. destiny-lab-birth-designer.vercel.app/mode-a). The redirects below (`basePath: false`)
// send those paths to the same page under `/birth` on the SAME host, so links keep working and the
// browser storage of that host (localStorage `dlbd_*`, IndexedDB `dlbd_hanja`) remains available.
// They are temporary (307) until the migration is confirmed in production.
export const BASE_PATH = '/birth';

/** In-app paths (without the base path; next/link and the router add it). */
export const ROUTES = {
  landing: '/',
  start: '/start',
  modeA: '/mode-a',
  modeB: '/mode-b',
  modeC: '/mode-c',
} as const;

export const LEGACY_REDIRECTS = [
  { source: '/', destination: `${BASE_PATH}/start`, basePath: false, permanent: false },
  { source: '/:mode(mode-a|mode-b|mode-c)', destination: `${BASE_PATH}/:mode`, basePath: false, permanent: false },
  { source: '/:mode(mode-a|mode-b|mode-c)/results', destination: `${BASE_PATH}/:mode/results`, basePath: false, permanent: false },
  { source: '/results', destination: `${BASE_PATH}/results`, basePath: false, permanent: false },
] as const;

/** Public canonical origin of the Destiny Lab site (the root site already uses it). */
export const SITE_ORIGIN = 'https://www.destiny-code.kr';
export const DESTINY_LAB_HOME = `${SITE_ORIGIN}/`;
export const LANDING_CANONICAL = `${SITE_ORIGIN}${BASE_PATH}`;

/**
 * Search indexing is allowed only for the production deployment (Vercel sets VERCEL_ENV). Previews,
 * a future staging host and local builds are `noindex`, so a temporary host never competes with
 * the canonical URL.
 */
export function indexingAllowed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}
