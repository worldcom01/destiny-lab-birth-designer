# Birth Designer V2 landing page and the `/birth` zone (R5.10)

Status: **local only.** The work is on branch `feature/r510-landing`, created from
`hotfix/r4-mobile-result-layout` (fdc96d6). Nothing is committed, pushed or deployed, and no DNS or
Vercel setting was changed.

## Routes

| URL (on www.destiny-code.kr) | Served by | Content |
|---|---|---|
| `/birth` | Birth Designer (`src/app/page.tsx`) | new public landing page (static) |
| `/birth/start` | Birth Designer (`src/app/start/page.tsx`) | the former `/` page: Mode A/B/C selection |
| `/birth/mode-a`, `/birth/mode-b`, `/birth/mode-c` (+ `/results`), `/birth/results` | Birth Designer | existing analysis flows, unchanged |
| `/birth/og` | Birth Designer (`src/app/og/route.tsx`) | Open Graph image |
| `/`, `/code`, everything else | root Destiny Lab site | unchanged |

Birth Designer is built with `basePath: '/birth'` (`next.config.ts`, `src/lib/site/routes.ts`), so its
pages and build assets (`/birth/_next/...`) live entirely under `/birth`. The root site rewrites
`/birth` and `/birth/:path+` to the Birth Designer deployment (Next.js multi-zones). Links between the
two zones are plain `<a>` elements.

### Legacy links

Before R5.10 the analysis pages lived at the root of the Birth Designer deployment's own host
(`destiny-lab-birth-designer.vercel.app`): `/`, `/mode-a`, `/mode-a/results`, and so on. Those paths
now redirect temporarily (307) to the same page under `/birth` **on the same host**, keeping the query
string:

| Old path (Birth Designer host) | New path |
|---|---|
| `/` | `/birth/start` |
| `/mode-a` · `/mode-b` · `/mode-c` | `/birth/mode-a` · … |
| `/mode-*/results` | `/birth/mode-*/results` |
| `/results` | `/birth/results` |

On www.destiny-code.kr these old paths never existed (`/mode-a` returns 404 today), so nothing there
changes.

### Browser storage (important)

Inputs (`localStorage` `dlbd_mode_a|b|c`) and Hanja choices (IndexedDB `dlbd_hanja`) are scoped to the
**origin**:

- **Same host, new path** (vercel.app → vercel.app/birth/...): saved data stays available.
- **New host** (vercel.app → www.destiny-code.kr): the new origin starts empty. Browsers do not allow a
  cross-origin copy without an explicit export/import. Users who saved inputs on the vercel.app host
  keep them there, and the redirects keep that host working.

## Local preview

```bash
npm run build && npx next start -p 3000
# open http://localhost:3000/birth          landing
#      http://localhost:3000/birth/start    analysis entry
#      http://localhost:3000/mode-a         → 307 to /birth/mode-a (legacy redirect)
```

To preview both zones together, build the root site with the patch from the R5.10 handoff, then run
it with `BIRTH_DESIGNER_ORIGIN=http://127.0.0.1:3000 npx next start -p 3100`, and open
`http://localhost:3100/birth`.

## SEO

- Landing page:
  - title `Birth Designer V2 — 출생 일정과 이름 후보를 함께 비교 | Destiny Lab`;
  - description: the approved supporting message;
  - canonical `https://www.destiny-code.kr/birth`;
  - Open Graph and Twitter cards, image `/birth/og`;
  - JSON-LD `WebApplication` (no offers, ratings or reviews).
- `robots`: `index` only when `VERCEL_ENV=production`. Previews, any staging host and local builds are
  `noindex`.
- `robots.txt` and the sitemap belong to the root site. The root-site patch adds `/birth` to its sitemap.
- One `h1`; sections use `h2`/`h3` in order.

## Performance and accessibility

- The landing page is a static server component with no client component of its own. The FAQ uses
  native `<details>`. Fonts reuse the app's existing `next/font` setup.
- The motif is local SVG.
- Motion (one entrance fade, a slow dial rotation, smooth anchor scrolling) is disabled under
  `prefers-reduced-motion`.
- Visible focus rings; skip link; 44px or larger touch targets for the controls.
- Layout checked by device emulation at 320 and 390 CSS px: no horizontal overflow.
- Lighthouse has **not** been run. No scores are claimed.

## Result-count wording (Gate 2)

Verified against the result pages, with no change to ranking, limits, scores or paging:

| Mode | Ranked | Shown first | "더 보기" | PDF |
|---|---|---|---|---|
| A | every permitted name·date·time combination | 20 | +20 | top 20 combinations |
| B | every generated name candidate | 20 | +20 | top 20 |
| C | the entered names (max 10) | all | — | all |

A grade filter restarts the list at 20. Measured on sample inputs:

- Mode B generates 1,044–1,672 candidates (6 surname/gender inputs).
- Mode A produces 2,088 combinations for 1 day × 1.5 h and 36,540 for 7 days × 9 h.

The former "TOP 50" (Mode B) and "TOP 20을 추천" (Mode A) wording on `/birth/start` now describes this
behaviour. A test pins the wording to the implementation.

## Two-zone Preview (no Production change)

Facts, checked read-only on 2026-11-14:

- **Birth Designer Preview URLs are protected by Vercel Authentication.** A request without a login gets
  302 → vercel.com SSO, and Vercel adds `x-robots-tag: noindex` to previews.
- **The projects do not connect by themselves.** A rewrite from the root Preview is a server-side
  request without the visitor's login cookie, so it would be sent to the SSO page.
- **Rewrite destinations are fixed at build time** (routes manifest). Environment variables must exist
  **before** the Preview builds.

Plan:

1. **Birth Designer Preview (BD-P).** Push `feature/r510-landing` (approval needed). Vercel builds a
   Preview deployment.
   - Record its deployment URL. The branch alias may be shortened with a hash, so do not guess it.
   - Visual QA can start here directly on the device: log in to Vercel in Safari, then open
     `<BD-P>/birth`. Check that `VERCEL_ENV=preview` makes the page `noindex`.
2. **Root Preview (R-P) setup** (approval needed). In the root project, add Preview-scoped
   environment variables, limited to the root Preview branch where possible:
   - `BIRTH_DESIGNER_ORIGIN` = the BD-P URL.
   - `BIRTH_DESIGNER_PROTECTION_BYPASS` = the Birth Designer project's "Protection Bypass for
     Automation" secret.
     - Generate it in the BD project settings (Deployment Protection).
     - Store it in the password manager immediately.
     - Never commit it, paste it in chat, or log it.
     - Never add it to Production.
3. **Root Preview.** Push a root branch with the integration patch (approval needed). The patch's
   `proxy.ts` adds the bypass header to the server-side `/birth/*` rewrite, and only when the secret is
   present and `VERCEL_ENV` is not `production`.
4. **QA on the root Preview:**
   - `/`, `/code`, `/birth`, `/birth/start`, `/birth/mode-a|b|c`;
   - assets under `/birth/_next`, `/birth/og`;
   - a trailing-slash URL such as `/birth/` must 308 to `/birth` on the same host;
   - no request may reach the BD-P host from the browser;
   - `x-robots-tag: noindex` on both Previews.
5. **Clean-up after QA:**
   - remove `BIRTH_DESIGNER_PROTECTION_BYPASS` from the root project, or rotate the secret in the BD
     project;
   - keep Vercel Authentication on.

Verified locally:

- A local gate stands in for Vercel protection. With the bypass, `/birth/*`, the assets and `/birth/og`
  return 200.
- Without the bypass, the response is the SSO 302, which reproduces the real problem.
- With `VERCEL_ENV=production` the bypass is ignored.
- `/` and `/code` stay 200 in every case.
- The secret never appears in browser responses, client bundles or server bundles.

## Release plan (Production; each step needs explicit approval)

The order avoids a broken window:

1. **Birth Designer Production first.** Pages move under `/birth` on its own host, and the old root
   paths 307 to `/birth/...` on the same host (storage preserved there). The root site is unaffected:
   its `/birth` still 307s to the home page.
2. **Verify on the BD host:**
   - `/birth`, `/birth/start`, the modes, legacy redirects with query strings, the PDF, Hanja
     persistence;
   - `index, follow` on `/birth`, with the canonical `https://www.destiny-code.kr/birth`.
3. **Root site Production second**, with the patch and `BIRTH_DESIGNER_ORIGIN` = the BD production URL.
   Do not set the bypass variable. This removes the `/birth` → home redirect and the pre-launch page, and
   adds the rewrites, the sitemap entry and the Services link.
4. **Verify on www:**
   - `/`, `/code`, `/birth`, `/birth/start`, assets, `/birth/og`;
   - the sitemap contains `/birth`;
   - `robots.txt` is unchanged.

There is no incompatible window:

- Before step 3, www/birth keeps its current behaviour (redirect to home).
- After step 1, BD still serves every old link through redirects.

Rollback:

| Situation | Action | Effect |
|---|---|---|
| Problem after step 3 | Vercel "Instant Rollback" of the root project to the previous deployment | www/birth → home again; `/code` and `/` untouched |
| Problem after step 1 | Instant Rollback of the BD project | root paths return; `/birth` 404s on the BD host |

If the BD project is rolled back, the root site must also be rolled back, or `/birth` on www would 404.
Revert the root site first when rolling back both.

SEO:

- **Canonical** `https://www.destiny-code.kr/birth`; `noindex` everywhere except BD Production.
- **Sitemap:** `/birth` is added, and the analysis pages are left out on purpose.
- **Legacy redirects:** temporary (307) until confirmed, then optionally 308.
- **Existing indexing:** BD analysis pages are not in the root sitemap. The vercel.app root URLs redirect
  to their `/birth` equivalents.

Publication safety:

- This branch was created from the R4 line and contains no R5 code. `src/server`, `src/features`, the
  payment modules and the private Destiny Payment package are absent.
- The build was checked for R5 and payment identifiers: 0 hits.

## iPhone Safari QA checklist (to be performed by the operator)

Check every item at 320 px (iPhone SE in display zoom, or a narrow window), 390 px (iPhone 14/15) and
desktop.

- [ ] Hero: the title reads exactly "한 사람의 시작을, / 더 깊이 설계하다."; no clipped glyphs; motif centred; both CTAs fit
- [ ] Korean typography: no mid-word breaks (`keep-all`); line height comfortable; no faux-bold
- [ ] Header: logo → Destiny Lab home; "분석 시작하기" → `/birth/start`; desktop anchor nav scrolls to sections
- [ ] Spacing: even section rhythm; nothing touches the screen edge; no horizontal scroll
- [ ] Mode cards: A/B/C copy matches the app; each card button opens the right mode
- [ ] Result preview: "예시" badge and the caption (fictional input, current engine) are visible; Hanja chips show "인명용 미확인"
- [ ] CTAs: hero, final and footer "분석 시작하기" → `/birth/start`; "어떻게 분석하나요?" scrolls to the steps
- [ ] FAQ: each item opens and closes by tap; VoiceOver announces expanded/collapsed
- [ ] Footer: policy items show "공개 준비 중" (not links); disclaimer visible
- [ ] Analysis entry: `/birth/start` → Mode A/B/C → each page's "back" button returns to `/birth/start`; Safari back/forward works
- [ ] Persistence: enter Mode B data → results → reload restores; Hanja choice survives reload
- [ ] PDF: the download works from the Mode A, B and C results on iPhone Safari (share sheet / Files)
- [ ] Reduced motion (Settings → Accessibility → Motion): the dial stops and there is no entrance fade
- [ ] Dark mode on the device: the page stays light, and is readable

Local screenshots (device emulation) are evidence of layout only, not of real-device QA.

## Open content items (product / legal)

- Final prices, access period, renewal and refund terms (pricing shows an information state only).
- Terms of service, privacy policy, cancellation/refund policy and business information. The footer
  shows these as "공개 준비 중" text, not links.
- Whether to describe the product as "AI". The engine is a rule-based scoring model, so the page makes
  no AI claim.
  - The current BD Production `<title>` says "AI 출생일·작명 설계 플랫폼". This branch's analysis pages say
    "출생일·작명 설계 플랫폼".
- The root site's Birth Designer card still says "개발 중" and lists "브랜드명": update at launch.
- The `/birth/start` header line no longer claims an "optimal combination" ("최적의 조합을 추천"). Mode A's
  subtitle no longer says dates/times are "recommended" ("추천"): they are compared within the permitted window.
