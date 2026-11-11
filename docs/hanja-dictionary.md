# Hanja dictionary (R4.1 foundation)

Source-traceable Hanja data for search, meanings, readings, variants and legal-status
evidence. **R4.1 does not change the picker, scoring, ranking, PDF or the R3.2 storage
format.** Scoring keeps reading `src/data/hanjaDB.ts`; nothing in `src/lib/scoring.ts`,
`analysis.ts`, `nameGenerator.ts`, `sungmyung.ts`, `hanjaModel.ts` or the PDF imports
the dictionary (enforced by a test).

Code: `src/lib/hanjaDictionary/` · data: `src/data/hanjaDictionary/` · tests:
`src/lib/__tests__/hanjaDictionary.test.ts`, `src/app/__tests__/hanjaDictionaryCompatPages.test.tsx`.

## 1. Existing data (inventory, `docs/hanja-r4-inventory.json`)

| Item | Value |
|---|---|
| `HANJA_DB` | 48 Hangul syllables, 118 records, 118 unique characters, one gloss each, no provenance |
| Surname table | 29 records |
| nameChars profiles | 62; 16 profile Hanja have no `HANJA_DB` record (strokes shown as unknown) |
| Readings not in Unihan | `빛/光`, `빛/炳` (빛 is not a Hanja reading), `린/琳` (Unihan: 림) |
| Initial-sound forms | `율/律`, `연/蓮`, `예/禮`, `나/羅`: Unihan lists them only from KS X 1001, without an E/N name-list flag |
| Strokes vs Unihan `kTotalStrokes` | 12 differ (e.g. 珉 10/9, 道 12/13, 健 11/10, 蓮 15/13, 彆 18/14); the legacy counting convention is undocumented and mixed |
| `鉉` | `HANJA_DB['현']`: meaning **"쇠줄 현"**, 13 strokes, radical 金 (`src/data/hanjaDB.ts:53`) |

Consumers: picker/quick select/display read `HANJA_DB` options; `hanjaModel` builds the
canonical model (meaning, strokes, 자원오행); scores do **not** depend on the selected
Hanja (`calcHanjaScore` uses syllable data only); strokes are only displayed
(`totalStrokes`). R3.2 stores only characters per position (`{ [fullName]: (hanja|null)[] }`).

## 2. Sources

| Source | Publisher / id | Version | License / reuse | Provides | Status in R4.1 |
|---|---|---|---|---|---|
| 가족관계의 등록 등에 관한 규칙 제37조, [별표 1] 인명용추가한자표, [별표 2] 인명용한자허용자체표 | 대법원 (법원행정처 가족관계등록과), law.go.kr | Appendices: 대법원규칙 제3151호 (2024. 5. 30., 시행 2024. 6. 11.). Current rule: 제3220호 (2025. 6. 26., 시행 2025. 7. 19.) amends 제23조 only | Court rules are not protected works (저작권법 제7조); files are not redistributed here | Readings, notes and **glyph images** (no character text) | **Acquired (R4.1A)**, structure extracted (§10). Character identities are images, so no `CONFIRMED` status is set. |
| 대법원 전자가족관계등록시스템 인명용 한자 조회 | efamily.scourt.go.kr | live service | terms not obtained | per-character lookup | **Not acquired** (interactive; empty response to automated access; no bulk/API found). |
| Unihan (UAX #38) | Unicode, Inc. | Unicode 18.0.0, files dated 2026-07-31, zip sha256 `4c93ea9c…3d43e` | Unicode License v3: use/copy/modify/redistribute with the notice (`UNICODE-LICENSE.txt`) | `kHangul` readings with sources (0 KS X 1001, 1 KS X 1002, E 교육용 기초 한자, N 인명용 한자), `kKoreanName` (list year 2015/2018), `kTotalStrokes`, `kRSUnicode`, English `kDefinition`, variants | **Used** (8,525 characters with a Korean reading). E/N are recorded as *secondary indicators* only: they reflect the 2015/2018 lists, not the 2024 table. |
| English Wiktionary 鉉 | Wikimedia / contributors | revision 87578964 (2025-10-24) | CC BY-SA 4.0 (attribution + share-alike) | Korean eumhun; translingual senses with cited print references | **Researched only; not included in the repository** (license not approved; option B). See §9. |
| Korean Wiktionary 鉉 | ko.wiktionary.org | — | CC BY-SA | — | page does not exist (404). |
| ctext.org (說文解字 etc.) | ctext.org | — | site forbids automated access | — | **Not used** (anti-scraping notice; not bypassed). |
| 표준국어대사전 / 우리말샘 | 국립국어원 | — | reported CC BY-SA 2.0 KR (official terms not confirmed) | word entries; not a character (훈음) dictionary | **Not used**; license and fit unconfirmed. |
| Commercial 자전 (e.g. 민중서림, portal Hanja dictionaries) | — | — | copyrighted / terms restrict reuse | 훈음, senses | **Not used** (no redistribution permission). |

Conclusion: no legally reusable, complete source of **Korean glosses (훈)** was found,
and the **official legal table** could not be acquired in machine-readable form. R4.1
therefore ships a validated Unihan layer (readings, strokes, variants, English
definitions, secondary name-list indicators), keeps the legacy glosses as explicitly
unverified, and adds curated attested records only where a source was read.

## 3. Schema (`src/lib/hanjaDictionary/types.ts`)

- `HanjaEntry`: `char` (exact code point — the identity), `codePoint`, `readings[]`,
  `meanings[]`, `strokes[]`, `variants[]`, `legal`, `verification`
  (`source-derived` | `legacy-only`), `reviewedAt`; dataset `version`
  (`r4.1-2026-11-11+unihan-18.0.0`) and `sources[]`.
- Every reading, meaning, stroke count, relation and legal indicator carries
  `evidence[]` (`source`, `locator`, verbatim `detail`).
- `MeaningRecord`: stable `id` (e.g. `U+9249#tripod-carrier`), `lang` (`ko`/`en`), `text`,
  `primary` (at most one; must be an **attested Korean** gloss), `verification`
  (`attested` | `legacy-unverified`).
- `StrokeRecord`: `value` + `convention` (`unicode-kTotalStrokes` | `legacy-app`). Both
  are kept; the dictionary never feeds strokes to scoring.
- `VariantRelation`: `compatibility | semantic | specialized-semantic | z | simplified |
  traditional` → target character. Related characters are **never merged**; Unihan
  self-references (a character listed as its own simplified/traditional form) are not
  relations and are skipped.
- `LegalRecord`: `status` `CONFIRMED | NOT_CONFIRMED | INELIGIBLE`; `CONFIRMED` and
  `INELIGIBLE` require evidence from a source of kind `official-legal` (validator
  rule). Unicode or dictionary data can only add `indicators`.
- `SourceRef`: publisher, locator, version, retrieval date, license, `licenseStatus`
  (`cleared` | `pending-approval` | `restricted`), `kind`.

Identity rules: lookups are by exact code point (no NFC: 270 CJK compatibility
ideographs, e.g. U+F914 樂 "낙", stay separate from U+6A02 樂); choosing or displaying a
meaning never changes the character, strokes, score or the R3.2 conflict token (which
compares stored characters only).

## 4. Validation (`validateDataset`)

Rejects: malformed characters (lone surrogates, several code points, non-Han),
code-point mismatch, duplicate entries, malformed/duplicate readings, missing or unknown
provenance, duplicate/empty meanings, foreign meaning ids, more than one primary, a
primary that is not an attested Korean gloss, legacy glosses marked attested,
conflicting stroke counts within one convention, invalid/self relations, legal status
without official evidence, incomplete source records. `createHanjaDictionary` refuses an
invalid dataset.

## 5. Workflow

```
npm run hanja:build -- <Unihan.zip>            # verify pinned sha256, regenerate unihan-korean.json
npm run hanja:build -- <Unihan.zip> --check    # fail if the committed JSON does not reproduce
npm run hanja:verify                           # validate the assembled dataset, print coverage
npm run hanja:inventory -- <unihanDir> <out>   # inventory of the existing app data
```

## 6. Coverage (R4.1)

| Measure | Count |
|---|---|
| Entries (unique characters) | 8,525 (all with Unihan evidence; 270 compatibility ideographs) |
| Reading records / distinct readings | 8,920 / 487; 386 characters with several readings |
| Readings with legacy evidence only | 3 (`빛/光`, `빛/炳`, `린/琳`) |
| Attested meanings (production) | 7,799 English Unihan definitions; **Korean: 0** |
| Legacy unverified glosses | 118 |
| Legal status | CONFIRMED 0 · INELIGIBLE 0 · NOT_CONFIRMED 8,525 (8,094 with a 2015/2018 name-list indicator) |
| Human legal reviews / confirmed new pairs | 0 / **0** |
| Selectable pairs | the existing 118 legacy pairs only — available, but **legally unconfirmed** |
| Stroke counts | Unicode total 8,525 · legacy 118 (12 differ) |
| Variant relations | 5,959 (3,689 point to characters without a Korean reading) |
| Records citing a non-cleared license | production 0; the research build adds 3 **synthetic test fixtures** only (§9) |

This is **not** full official coverage: the 2024 table lists 9,389 characters; legal
status is unconfirmed for every entry; production has **no verified Korean meaning**.

## 7. 鉉 (U+9249)

- Legacy app gloss: "쇠줄 현" — no source found for it; kept as `legacy-unverified` and shown
  as "출처 미확인"; never a primary meaning.
- Production attested meaning: "device for carrying a tripod" (Unihan kDefinition, English,
  shown as a reference, not as a Korean meaning). **No verified Korean primary meaning.**
- Researched but not included (§9): a Korean eumhun and a figurative sense on English
  Wiktionary (CC BY-SA 4.0); excluded because the license is not approved.
- Unihan: `현:0N` (KS X 1001 + 2015 personal-name list), 13 strokes, radical 167.5,
  simplified form 铉 (related, not identical).
- The app picker still shows the legacy gloss in R4.1 (UI unchanged by scope); switching
  the displayed gloss is an R4.2 decision once the license question is settled.
- A user's confirmed selection of 鉉 is a choice of the character only; it does not verify any
  meaning, and the stored character stays exactly U+9249.

## 8. Open items

1. Character identities of the official appendices (glyph images) — see §10 for the manual step.
2. A reusable, verifiable source of Korean 훈음 (or an owner decision on CC BY-SA).
3. Rules for initial-sound (두음법칙) name readings (율/률 etc.) from an official text.
4. Legacy stroke convention: document or replace (scoring is unaffected; display only).
5. Preferred-meaning storage is out of scope (R4.3); R4.1 adds no persistence.

## 9. Gloss source policy (R4.1A; license cleanup option B)

Research finding (R4.1A, kept for the record): English Wiktionary, revision 87578964
(`https://en.wiktionary.org/w/index.php?title=%E9%89%89&oldid=87578964`), gives a Korean
eumhun for 鉉 and a figurative translingual sense with cited print references. Reusing either
would be CC BY-SA 4.0 material (attribution, indication of changes, and ShareAlike for adapted
material). Whether a one-word conventional gloss is protectable is a legal judgement for the owner.
**Decision (option B): no Wiktionary-derived text is stored in this repository.**

- Policy implemented: sources carry `licenseStatus`; `buildHanjaDataset()` (production,
  used by `getHanjaDictionary()`) keeps only records whose every source is `cleared`.
  A research build is made only by passing `{ research: { sources, meanings } }` explicitly
  (version suffix `+research`); any `restricted` source is refused everywhere. Production
  contains **0** records citing a non-cleared license.
- `src/data/hanjaDictionary/research/overlay.ts` holds **synthetic test fixtures only**:
  three visibly fake records on 一 (U+4E00) — "[시험용 합성 뜻 A/B · 실제 뜻 아님]" and
  "[synthetic test sense C — not a real definition]" — citing a fake `pending-approval` source
  (`test-fixture://pending-license-source`). They exist to test several meanings per character,
  provenance, the pending-license gate and production isolation. They are not meanings of 一 or
  of any character, never touch 鉉, and must never reach production: an import-graph test and the
  postbuild scan (`scripts/hanja/forbidden-markers.mjs`) enforce this.
- Future multiple-meaning entries: (1) official or permissively licensed sources first
  (public-law texts, Unicode); (2) a Korean gloss is quoted exactly as published with
  source, revision and locator — never translated or composed; (3) CC BY-SA material only
  after an owner decision, kept in a separately licensed overlay with full attribution;
  (4) no bulk import from Wiktionary or commercial dictionaries; (5) sites that forbid
  automated access are never fetched.
- Status: production verified Korean meanings **0**; officially confirmed new legal
  character/reading pairs **0**; the 118 legacy selectable pairs stay available but legally
  unconfirmed.

## 10. Official appendices (R4.1A)

Data: `src/data/hanjaDictionary/official-structure.json`
(`node scripts/hanja/official-structure.mjs <appendix1.hwpx> <appendix2.pdf> [--check]`).

- Versions: appendices of 대법원규칙 제3151호 (2024. 5. 30.; "1,070자 추가, 별표 1 및 별표 2").
  The newest rule, 제3220호 (2025. 6. 26., 시행 2025. 7. 19.), changes 제23조 only, so the
  appendices in force are the 3151 versions. Both file headers read "<개정 2024. 5. 30.>".
- Files: [별표 1] HWPX sha256 `66e8005a…c3daed` (10,797,446 bytes);
  [별표 2] PDF sha256 `5ea97665…2f22df` (800,526 bytes, Hancom PDF, created 2025-06-25).
- **Every Hanja in both files is an embedded glyph image** (65×65 BMP in the HWPX; images in
  the PDF). Only readings, headers and notes are text.
- Structure: [별표 1] 7,272 entries under 469 readings (7,265 distinct glyph images; 7
  images listed under two readings, e.g. 나/라, 현/형); [별표 2] 291 base characters with
  317 permitted forms under 168 readings. 1,800 (교육용 기초한자, 제37조 제1항 제1호) +
  7,272 + 317 = **9,389**, the official total.
- Official notes (verbatim): readings are only those in the table, but a character whose
  initial is ㄴ/ㄹ may be used with ㅇ/ㄴ as pronounced; 示/礻 and ++/卄 radicals are
  interchangeable.
- Against Unihan 18.0 (`kHangul` N flag, 2015/2018 lists): 6,469 N reading records vs
  7,272 official entries (+803); readings only in the official table: 녈, 놜, 늘, 론, 휵;
  only in Unihan N: 쌍; 15 readings have more Unihan N records than official entries (e.g.
  서 44/40), consistent with Unihan also flagging permitted forms.
- Identification pilot (glyph matching against same-reading candidates rendered in macOS
  CJK fonts, '현', 45 images): correlations 0.24–0.83, frequent near-ties and the same
  character chosen for several images, and compatibility code points indistinguishable
  from their unified forms. Full run over all 7,272 glyphs: only 46 score ≥ 0.8 and 543 have
  score ≥ 0.7 with a margin ≥ 0.15; in 1,032 cases one candidate was chosen for several
  images of the same reading. **Not reliable enough for legal status.** No CONFIRMED or
  INELIGIBLE value is set; absence from an extraction never means ineligible.
- Minimal manual step: a person verifies each glyph against the candidate list (review
  sheet generated outside the repository), or the court provides a text list
  (e.g. 대법원 전자가족관계등록시스템 data or a request to 법원행정처 가족관계등록과).

## 11. Stored selection audit (R4.1A)

`classifyStoredSelection(syllable, hanja)` in `src/lib/hanjaModel.ts`:

| Kind | Example | Display | Stored value |
|---|---|---|---|
| `offered` | 민/珉 | confirmed, full record (all 118 pairs; no pair was ever removed from `HANJA_DB`, so every value this app saved is here) | unchanged |
| `unknown-reading` | 민/閔 | exact character, confirmed, **"확정·음 미확인"**, meaning/strokes unknown | unchanged |
| `compatibility-form` | 낙/U+F914 | exact code point (never folded to U+6A02), "확정·음 미확인" | unchanged |
| `reading-mismatch` | 현/俊 (app lists 俊 only under 준) | not applied; the position keeps its suggestion/unassigned state | unchanged |
| `invalid` | non-Han, several characters, lone surrogate | not applied | unchanged |

No storage contract change was needed. Limitation: the mismatch test uses the app's own
table only; a character the app does not know cannot be checked against its reading
until the picker uses the dictionary (R4.2).

## 12. Human legal review workflow (R4.1B)

### Sources

| Source | URL | Publisher | Version | Permitted use | Format | Reliability |
|---|---|---|---|---|---|---|
| [별표 1] 인명용추가한자표 | https://www.law.go.kr/BYL/grtFile/law0105692024053003151KC_000100E.hwpx | 대법원 | 제3151호 (2024. 5. 30.) | court rule, not a protected work (저작권법 제7조) | HWPX; Hanja as glyph images | official; identities need human reading |
| [별표 2] 인명용한자허용자체표 | https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110201&flSeq=153523507 | 대법원 | 제3151호 | same | PDF; Hanja as images | official; images not yet extracted |
| 인명용 한자 조회 | https://efamily.scourt.go.kr/ | 대법원 전자가족관계등록시스템 | live | `robots.txt`: `Disallow: /` (only notice pages allowed) → **no automated access**; a person may look up a character in a browser | interactive web page | official; one character at a time |
| 한문 교육용 기초 한자 1,800자 (제37조 제1항 제1호) | — (no official text source found) | 교육인적자원부 (announced 2000-12-30; form corrections 2007, per secondary sources) | 2000 | — | — | **not acquired**; Unihan `E` (1,800 characters) is a secondary indicator only |

No permitted text interface exists, so the official image files and manual court lookups
remain the legal evidence.

### Review records (`src/data/hanjaDictionary/legal-reviews.json`)

`LegalReview` (`src/lib/hanjaDictionary/legalReviews.ts`): `id`, `reviewer`, `reviewedAt`
(ISO), `decision` (`exact-match` | `ambiguous` | `unable-to-identify`), `char`, `codePoint`,
`reading`, `evidence` — either `appendix1-image` (pinned file SHA-256, image id, the table
reading) or `court-lookup` (efamily URL, lookup date, shown reading, shown mark) — `notes`,
and `machineSuggestion` (audit only, never evidence).

`evaluateLegalReviews` fails closed:
- invalid records (other file, unknown image, reading ≠ table reading, code point mismatch,
  missing reviewer/time, lookup without "인명용", non-efamily URL, duplicate id) are refused;
- one image with different characters, or exact-match plus ambiguous/unable → unresolved;
- one character/reading on two different images → unresolved;
- a lookup contradicted by another review → unresolved.

Only confirmed pairs set `ReadingRecord.legal` (per reading); the character is `CONFIRMED`
only through a confirmed reading. Note 1 (ㄴ/ㄹ initial sound) derives another reading
only from a confirmed one (`legalReading` basis `initial-sound-rule`). Compatibility code
points are never merged.

### Tool

```
swiftc -O scripts/hanja/glyph-suggest.swift -o /tmp/glyph-suggest          # macOS, optional ordering aid
npm run hanja:review-tool -- <appendix1.hwpx> <outDir> [--suggestions suggestions.tsv]
# open <outDir>/index.html, review, export JSON
npm run hanja:import-reviews -- <export.json> [--dry-run]                  # validates, then merges
npm run hanja:verify
```

The page shows the official image (enlarged), its file/image id, the table reading,
candidates with code points (labelled unverified, compatibility forms tagged), an enlarged
side-by-side comparison, decision buttons (exact / ambiguous / unable) and a manual
court-lookup form. Nothing is pre-selected; exact-match needs a selection **and** the
reviewer's explicit "I checked it myself" confirmation. Decisions stay in the browser and
are exported as JSON.

### Priority queue (`reviewQueue.ts`)

| Tier | Content | Count |
|---|---|---|
| 1 | the app's 118 `HANJA_DB` pairs | 118 (route: [별표 1] 43, court lookup for basic-list characters 73, lookup only 2: 빛/光, 빛/炳) |
| 2 | reported characters | 鉉/현 (already tier 1; tagged reported) |
| 3 | nameChars recommendation Hanja not in tier 1 | 15 (`윤2` profile skipped: not a syllable) |
| 4 | all official images under the readings the app uses | 2,426 images |
| 5 | remaining official images | 4,839 images (backlog) |

Confirmed counts are reported per basis (`appendix1-image-review`, `court-lookup-review`)
and per reading by `npm run hanja:verify`. Current count: **0** (no human review yet). The
9,389 reconciliation does not verify any individual character.

## 13. Gloss policy and R4.2 display requirements (R4.1B)

- No legally reusable Korean 훈음 dataset was found (public-data portals list none; 우리말샘
  is CC BY-SA 2.0 KR per secondary sources and contains word senses, not character glosses;
  commercial 자전 need a license). CC BY-SA records stay out of production.
- "쇠줄 현" stays `legacy-unverified` and is never a primary gloss.
- Without an approved source: verified primary gloss = empty; character and reading are kept;
  the UI shows an explicit "뜻 정보 없음 (확인된 출처 없음)" state; nothing is invented.
- R4.2 display requirements: (1) every displayed meaning shows its source title, version /
  revision and license, with a link; (2) the verified primary gloss, other attested senses
  and the legacy gloss are visually distinct, the legacy one labelled "출처 미확인 (이전 데이터)";
  (3) meanings never change the selected character, strokes, score or stored value;
  (4) CC BY-SA content only after owner approval, shown with "Wiktionary contributors,
  CC BY-SA 4.0, revision N, changes: …"; (5) legal status is shown per reading
  ("인명용 확인됨: 현 (대법원규칙 제3151호 별표 1, 검토 ID)" / "인명용 미확인").

## 14. R4.2 search and selection (result-card picker)

- `HanjaPicker` gets `searchable` (result cards only; the input-form picker is unchanged) and
  `onSelectChar`. `HanjaSearchPanel` loads the dictionary on first search through a dynamic
  `import()` (separate ~0.9 MB chunk, not in the initial page bundle). `src/lib/hanjaSearch.ts`
  is the pure search: exact characters (no normalisation), Hangul reading (plus the official
  note-1 initial-sound form, e.g. 율 finds 律 listed as 률), meaning (attested Korean meanings,
  then legacy glosses labelled as such).
- Searchable: every dictionary entry (8,525 characters, 487 readings); characters not in the
  dictionary are reported as such. **Selectable**: only `legacy-offered` (the 118 `HANJA_DB`
  pairs) and `verified-reading` (human-confirmed legal pairs from
  `legal-confirmed.json`, generated by `import-reviews`; currently 0). Every other result shows
  why it cannot be chosen (`unknown-reading`: needs official confirmation; `reading-mismatch`
  / undocumented reading; not in the dictionary).
- Meanings: verified primary and further attested Korean meanings with source/license; the
  Unihan English definition as reference ("한국어 뜻이 아닙니다"); legacy glosses in a separate
  box labelled "출처 미확인"; otherwise "확인된 한국어 뜻이 없습니다". The default list, the card
  meaning line and the detailed analysis label legacy glosses "출처 미확인". The PDF text is
  unchanged (left for an owner decision).
- Legal: "인명용 확인됨" / "인명용 미확인 — 출생신고 전 공식 확인 필요" / "인명용 아님(공식 근거)"
  per reading; no coverage claim.
- Stored values: a human-confirmed pair outside the legacy list is stored and shown as a normal
  confirmed character (meaning/strokes unknown); everything else keeps the R4.1A policy.
- External assets: the review tool (official images) and Chrome smoke scripts live outside the
  repository and are regenerated with the documented scripts (§12); official image copies are
  not committed.

## 15. R4 audit remediation

- L1: research-only records moved to `src/data/hanjaDictionary/research/overlay.ts` (since the license
  cleanup: synthetic test fixtures only, no third-party text);
  no production module imports it (import-graph test). `npm run build` runs `prebuild`
  (`hanja:verify`) and `postbuild` (`scripts/hanja/check-bundle.mjs`), which fails when any
  marker from `scripts/hanja/forbidden-markers.mjs` appears in `.next`.
- R1: any invalid review record rejects the whole batch (no confirmation); `buildHanjaDataset`
  throws on invalid reviews; verify cross-checks dataset legal readings, review records and
  `legal-confirmed.json`.
- R2: `scripts/hanja/import-core.mjs` validates the envelope (schema 1, official source id and
  file hash), compares reused ids by canonical content, evaluates the merged set, and publishes
  both files via temp files + journal (`recover()` rolls forward or discards; verify refuses a
  pending import).
- R3: the review tool verifies each save by reading it back; unreadable stored data is kept and
  never overwritten; failures keep decisions in memory with a persistent warning, retry and export.
- P1: legacy glosses are labelled "출처 미확인" in the picker, result cards (Mode A/B/C), detailed
  analysis, the generated description sentence and the PDF detail page. Text only.
- S1: zero-legacy syllables get a "한자 검색" entry; the picker opens in search mode.
- A1/A2: detail focus moves to its heading and back to the row; a failed lazy load is not cached and
  can be retried explicitly.
- R4: review timestamps and lookup dates must be real calendar values.
