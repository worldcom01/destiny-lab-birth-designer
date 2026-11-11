# Canonical Hanja model

`GeneratedName.hanja` (`NameHanjaModel`, `src/types/index.ts`) is the single source of
Hanja for analysis text, result cards, `HanjaDisplay`, and every PDF page.
Helpers live in `src/lib/hanjaModel.ts`. Tests: `src/lib/__tests__/hanja.test.ts` and
`src/components/__tests__/hanjaRender.test.tsx`.

## Character states

| status | Meaning | Source |
|---|---|---|
| `confirmed` | Chosen by the user (result card picker, or generational Hanja on the input form) | `HANJA_DB` record of that exact character |
| `suggested` | System recommendation, labelled "추천" | nameChars profile Hanja. Meaning, strokes and jaWon come from the `HANJA_DB` record of that exact character |
| `unassigned` | No Hanja, shown as `□` / "미지정" | Mode C names before selection, syllables without data, compound surnames |

- When the suggested character has no `HANJA_DB` record (e.g. 媛, 時), `strokes` and
  `jaWonOhaeng` are `null` and the UI/PDF show "획수 미확인". Data is never borrowed
  from another character.
- Nothing uses `HANJA_DB[hangul][0]` as a fallback.
- R4.1: a STORED confirmed selection whose character is not (or no longer) offered for
  its syllable is still shown as that exact character, `confirmed`, with meaning,
  strokes and jaWon `null` ("뜻 정보 없음", "획수 미확인") — `storedSelectionChar`. It
  is never dropped, replaced by another character or folded to a variant. New
  selections still come only from the offered options (`confirmedChar`). See
  `docs/hanja-dictionary.md`.
- Single-syllable surnames in the surname table get their representative Hanja as a
  suggestion. Compound surnames stay unassigned (no data, no guessing).
- `char1`/`char2` are syllable scoring profiles. Their `hanja`/`meaning` mirror the
  model ('?' when unassigned) and are not used for display.

## Selections and persistence

- Mode B/C result pages hold `HanjaSelections` (`{ [fullName]: (hanja | null)[] }`)
  and persist them in localStorage (`dlbd_mode_b_hanja`, `dlbd_mode_c_hanja`,
  `{ version: 1, names }`).
- On load, results are recomputed, then `applyHanjaSelections` re-applies the
  stored choices. A choice that is not a valid option for its syllable is ignored,
  and malformed stored data is dropped.
- A generational Hanja is stored as `dolrimHanja` in the Mode A/B input. Older
  inputs without it still work.

## Scoring limitation (unchanged in P0-B)

No score depends on Hanja meaning or strokes. `hanjaQuality` ("한자 의미 품질") is
`(readabilityScore + modernityScore) / 2`, and `modernityScore` comes from the
syllable profiles. Changing a Hanja therefore re-derives only the name text and
description (through the same `singleAnalysis` pipeline). Scores and ranks stay the
same. The metric name and weights were left unchanged on purpose.

Scoring profiles still use the first two given-name syllables, and a one-syllable
name reuses its only syllable. A third syllable is part of the name, pronunciation
analysis and Hanja model, but not of the modernity/style profile.

## Mode C name parsing (`src/lib/nameParser.ts`)

- A space separates surname and given name explicitly ("남궁 민", "남 궁민").
- Without a space, the surname is 1 syllable, or 2 when the input starts with a
  known compound surname and 2-3 syllables follow.
- "Compound surname + 1 syllable" (남궁민, 선우진) is ambiguous and rejected with a
  request to add a space.
- Only Hangul syllables are accepted. Given names must be 1-3 syllables.

## Selections saved before duplicate normalization (R3-CLOSE)

Selections are stored per analysis scope (`analysisScope`, canonical JSON of
the validated input). Before R3-FIX the validator kept duplicate `nameStyles`
/ `images` entries, so a selection confirmed for `['전통형','전통형']` lives
under a different scope than the same input now validates to (`['전통형']`).

`loadHanjaSelectionsWithLegacy` (Mode B results) handles this read-only:

1. An entry under the current scope always wins (even an empty one).
2. Otherwise a stored scope is used only if `isDuplicateOnlyVariant` proves it
   is the same input: identical key set, every other field byte-identical
   (date, hour, sijinVersion, surname, gender, generational character and
   Hanja, position), and its preference lists equal the current ones after
   removing duplicates. A different set of styles or images never matches.
3. Every such scope takes part, **including empty ones** (`{}`): an empty
   record may mean the user cleared the selection, so it is never overridden.
   If the matching scopes hold different selections (empty vs `敏`, or `珉`
   vs `敏`), nothing is loaded ('ambiguous') and the user is asked to
   reselect. Identical non-empty records are recovered deterministically
   (independent of storage order); all-empty records mean nothing to recover.
4. Nothing is written, copied or deleted. A later edit is saved under the
   current scope as usual; the old entry stays (subject to the existing
   20-scope write limit, which is unchanged).
5. Read limits (fail closed, never throw, never delete): stored JSON longer
   than 1,000,000 characters is not parsed on page load ('skipped: size' —
   on an explicit edit the page then reads this analysis' full record first so
   the save never overwrites it); stores with more than 50 scopes are not
   scanned for legacy variants ('skipped: scopes'; the current scope is still
   loaded).

A notice tells the user when a selection was recovered or must be reselected.
Legacy 자시 inputs (no `sijinVersion`) never match, because the time must be
chosen again. Mode A stores no selections; Mode C has no preference lists.

## Legacy v1 keys are kept

`dlbd_mode_b_hanja` / `dlbd_mode_c_hanja` (v1, keyed by full name only) are
never applied, because they cannot be attributed to an analysis input. Since
the R3 final patch they are also never deleted: opening Mode B or Mode C
results only reads storage. `purgeLegacyHanjaSelections` remains available
for a separate, explicit cleanup policy but no page calls it.

## Storage contract (R3 data-safety hotfix)

All writes of confirmed Hanja go through one fail-closed path
(`saveHanjaSelectionPatch` / `saveHanjaSelections` → `writeScope`):

1. `readHanjaStore` reads **once** and returns an explicit result:
   `missing` (key absent — the only state that may start a new store),
   `empty`, `nonempty`, or a failure: `no-storage`, `read-error` (getItem
   threw), `malformed-json`, `invalid-schema` (anything a rewrite would drop or
   change: unknown keys, wrong version, invalid scope key, invalid Hanja value,
   non-numeric `updatedAt`), `too-large` (over 1,000,000 characters — refused
   before `JSON.parse`).
2. On any read failure nothing is written and the raw stored text is left
   exactly as it was. A failure is never treated as an empty store.
3. The new choice is patched into the record **actually stored** for the
   analysis scope (one name, one position), so other positions of the same
   name, other names and other scopes are kept. The selections currently shown
   (e.g. recovered legacy ones) seed the record only when the scope has no
   stored record; an existing record, even `{}`, wins.
4. Retention keeps at most 20 scopes (size unchanged). The scope being saved is
   always kept; the other 19 places go to the most recently updated other
   scopes. With ordinary timestamps this equals "20 most recent"; it only
   differs when stored timestamps lie in the future (e.g. after a clock change),
   where the old rule dropped the record just saved while reporting success
   (audit H1). A write whose result would exceed the read limit is refused (no
   silent truncation).
4a. Inputs are validated before any storage access (audit H2): the full name
   must be a string (no coercion, H2-T) of 2-5 Hangul, the Hanja a single
   character, and the position an integer with `0 <= index < given-name
   length` (H2-P). The given-name length comes from the analysis scope being
   saved to (`resolveAnalysisScope` + `givenLengthInScope`), never from the caller: Mode C parses each
   entered name with `parseKoreanName` (the analysis parser) and matches the
   full name; Mode B uses the validated surname. A name that is not part of
   the scope, or whose surname boundary has two readings in the same scope
   ('남궁 민' and '남 궁민'), is refused. The seed and a whole-scope
   replacement (`saveHanjaSelections`) must fit the same rule. Otherwise
   `invalid-selection`.
4c. The scope must be a verified analysis scope (audit C1): it is parsed and
   run through the same `validateModeBInput` / `validateModeCInput` the result
   pages use (default options), and `analysisScope(validated value)` must equal
   the scope string byte for byte. Exactly one mode must match; the mode is
   never inferred from a single field. Fragments (`{"surname":"남"}`,
   `{"names":["김민서"]}`), missing or invalid fields, mixed B/C fields,
   unknown fields, legacy 자시 without `sijinVersion`, and noncanonical
   spellings (key order, whitespace, untrimmed or duplicated values, unsorted
   lists) are refused before any storage access: `invalid-scope` for the patch
   API, `false` for `saveHanjaSelections`. Nothing is repaired or migrated.
   Read-only legacy recovery (R36) still reads old noncanonical scopes; it never
   writes to them.
4d. The complete final selection map must fit the analysis in both save APIs
   (audit C2), including positions already stored. A stored record with a
   position beyond the given name or a name outside the analysis (possible
   only for data written before H2) is refused as a whole with
   `invalid-stored-selection`; it is not truncated, cleaned or migrated, and the
   raw stored text is unchanged. Such a record cannot be changed from the
   result page; its valid positions are still displayed.
4b. `updatedAt` must be a finite number (audit H3): `1e309` parses to Infinity
   and would be written back as `null`, so such a store is `invalid-schema` and
   never rewritten. Before `setItem`, the final text is parsed (bounded by the
   read limit) and must pass the strict reader with exactly the intended record
   and the kept scopes; otherwise `invalid-output` and nothing is written.
5. Success is reported only after `localStorage.setItem` returned.
   `QuotaExceededError` → `quota-exceeded`, other exceptions → `write-error`.
   Failed writes are not retried.
6. The result pages show the persisted state only: on success a status line and
   the saved Hanja; on failure an alert with the cause, and the choice is not
   applied on screen. The user can retry after fixing the storage problem.
   A verified save clears the earlier "cannot read / will not save" notice
   (audit H4); a failed save keeps it.

Display reads use the same strict reader. Mode B reports `unreadable` /
`skipped(size)` and Mode C a read notice instead of showing "no selection".

### Concurrent tabs (superseded by R3.2)

`localStorage` has no transactions, and in Chromium each tab reads its own
asynchronously updated copy. Measured with two real tabs, a whole-key
read-modify-write lost updates even when every update held an exclusive Web
Lock. Since R3.2 Hanja selections are therefore persisted in IndexedDB (below);
the localStorage functions above remain only as the strict reader of legacy
data and for their own tests. Result pages never write Hanja selections to
localStorage.

## R3.2 multi-tab persistence contract (IndexedDB)

Scope: one browser profile, one origin. Nothing is synchronised between
browsers or devices (no server). Preview and Production are different origins.

### 1. Schema (database `dlbd_hanja`, version 1)

- Object store `documents`: key = the existing storage key
  (`dlbd_mode_b_hanja_v2` / `dlbd_mode_c_hanja_v2`), value = the **unchanged v2
  JSON text** (`{"version":2,"scopes":{...}}`). All existing validation applies
  to it: strict lossless reader, 1,000,000-character limit, finite `updatedAt`,
  canonical analysis scope (C1), name/position fit (H2/C2), at most 20 scopes.
- Object store `metadata`: same key, value =
  `{ protocol: 1, status: 'complete', generation, revision, epoch, seq,
  nextIncarnation, scopes: { [scope]: { incarnation, order, positions:
  { ["name#index"]: revision } } }, source: { kind, digest, length },
  externalAcks: [{ scope, digest }] }`.
  - `generation`: random id of this initialisation. A new database (e.g. after
    eviction) has a new generation, so every older token is invalid.
  - `revision`: +1 per committed document change. `seq`: commit sequence used
    for retention order. `epoch`: +1 whenever a scope is evicted.
  - `scopes` has exactly the scopes of the document (invariant). `positions`
    holds only positions that were changed since import (bounded by the
    document: at most 20 scopes × names × 3).
  - `source`: what was imported (`missing` or `v2`), its digest and length.
    Digests are a deterministic 53-bit cyrb53 hash plus the text length
    (`<hex>:<length>`): change detection only — not a security hash and never
    a conflict authority. An oversized text (> 1,000,000 characters) is never
    scanned: its identity is `oversize:<length>:<digest of the first 4,096
    characters>`.
  - `externalAcks`: per analysis scope, the digest of the legacy snapshot the
    user dismissed there (newest last, at most 20). No per-save history is kept.
- Metadata validation is strict and fail-closed: exact keys at every level,
  canonical position keys (`<2–5 Hangul>#<0–2>`) that exist in the document,
  position revisions within the document revision, unique incarnations and
  orders, `nextIncarnation` above every incarnation, `seq` at least the scope
  count, a well-formed generation and digests, a bounded `externalAcks` list
  and at most 200,000 serialised characters. Anything else is `corrupt`
  (read-only; never repaired or deleted).
- The v2 payload never contains metadata. Every initialisation, save and
  metadata change uses **one readwrite transaction over both stores**.

### 2. Atomic, idempotent initialisation (per key)

1. The page enters `initializing`; no Hanja save is possible.
2. Outside any transaction the localStorage v2 text is read without modifying
   it and classified: `missing`, `inaccessible` (getItem threw / no storage),
   `too-large` (> 1,000,000), `malformed`/`invalid` (strict reader),
   `over-retention` (> 20 scopes) or `valid`. Nothing is normalised or dropped;
   a valid text is imported verbatim (records that later fail C2 stay as they
   are and are refused on save, exactly as before).
3. One readwrite transaction reads `documents[key]` and `metadata[key]`:
   - both present and valid → use them; **never overwrite** (a second, stale
     initialiser loses no data and imports nothing);
   - exactly one present, or invalid → `corrupt`: read-only, nothing written,
     nothing deleted or recreated;
   - both absent → only a `missing` or `valid` source is imported (missing →
     explicit empty v2 document). Any other source class stops with a read-only
     error; a failed read never becomes an empty store.
4. Document and metadata are put in the same transaction; the page becomes
   `ready` only after `complete`.
5. localStorage v2/v1 and every legacy record are left untouched.
6. Retention order of an imported document: `updatedAt` descending, then scope
   string ascending; the newest gets the highest `order`.
7. After a first completed import a per-key marker `dlbd_hanja_idb_v1:<key>`
   (generation) is written to localStorage (new keys; no legacy key is
   touched). Per key, so initialising one mode never makes the first
   initialisation of the other mode look like a lost database. If the
   database record is later missing while its marker exists (eviction / user
   deletion), the page does **not** re-import automatically: it shows
   `reimport-confirm`, read-only, and imports the (possibly older) legacy
   snapshot only after explicit confirmation. If the marker is gone as well,
   earlier use cannot be detected (documented limitation).

### 3. Old-version tabs (no automatic merge)

After initialisation localStorage is a legacy external source only. On
`storage` events for the key, page visibility/focus and reload, the page reads
the legacy text once (bounded by 1,000,000 characters; bursts of events are
debounced into one check). If its digest equals the imported source, or the
snapshot dismissed **for the current scope**, nothing happens. Otherwise:
- unreadable/invalid → a read-only notice (nothing changes);
- valid → for the **current analysis scope only**, positions whose legacy value
  is a valid, fitting Hanja that differs from the IndexedDB value are listed
  (name, syllable, current value, legacy value). Missing, empty, `{}` or `null`
  legacy values are never treated as deletions. `updatedAt` is never used to
  decide.
- The user may adopt a listed value; adoption goes through the page's normal
  save handler (an ordinary conditional save with the latest token), so
  success, conflict, quota, aborted and unknown outcomes get the same named
  feedback as a normal selection. Dismissing records the digest for the
  current scope only; candidates of other scopes stay visible there. The whole
  document is never replaced. The notice asks the user to reload older
  application tabs.

### 4. Target tokens and conflicts

A snapshot carries, per scope, `{ generation, epoch, incarnation }` (incarnation
0 = the scope had no record) and per position `{ revision, value }` where value
is the effective confirmed value (own record, or the R36-recovered value when
the scope has no record; system suggestions and unassigned are `null`, never
confirmed). A save request carries the token of the target position.

Inside one readwrite transaction:
1. document + metadata are strictly validated (invariants included);
2. scope (C1), name and position (H2/C2) are validated as before;
3. `generation` or `epoch` differ, or the scope's incarnation differs from a
   non-zero expected incarnation → `reload-required` (typed conflict, no write);
4. base selections = the scope's record, or — without a record — the R36
   recovery recomputed **from the latest document** (never the screen's copy);
5. if the target already holds the requested value → idempotent success, no
   write, no retention change;
6. if the target revision or value differs from the token → `conflict` with
   the current value, no write (first committed writer wins; ABA such as
   A→B→A is detected by the revision);
7. otherwise exactly one position is patched on the latest document; the
   position revision, document revision and `seq`/`order` are incremented; a
   new scope gets a new incarnation; retention keeps the saved scope and the 19
   highest `order` scopes; an eviction increments `epoch` (stale tokens of
   every scope must reload, so an evicted scope cannot be resurrected);
8. output size, schema, scope fit and invariants are re-validated, then both
   records are put.
Different names, positions and scopes therefore never overwrite each other.

### 5. Transaction lifecycle and failures

- The database is opened (with a timeout) before any transaction; random ids
  and digests are computed before the transaction. Inside the transaction only
  synchronous validation runs between the `get` results and the `put`s; no
  awaits, timers or network.
- Transactions request `{ durability: 'strict' }`. The observed
  `transaction.durability` is reported as a capability (`strict`, `relaxed`,
  `default` or `unknown` when the browser does not expose it). Strict
  durability lowers power-loss risk; it is not a backup and does not prevent
  eviction or user deletion. Browsers without the hint still commit normally.
  The `durability` option/attribute is available from Chrome/Edge 82,
  Firefox 126 and Safari 15; older or option-ignoring browsers commit with
  their default (reported as `unknown`/`default`) — saving stays enabled there
  and this residual power-loss risk is accepted and documented, not hidden.
- Success is reported only on `complete`. Results: `success`, `conflict`,
  `reload-required`, validation failure, `quota`, `aborted`, `unavailable`,
  `blocked-upgrade`, `unknown-outcome`. A transaction whose `complete`/`abort`
  is not observed within the timeout is `unknown-outcome`: neither saved nor
  rolled back is claimed; the page offers a re-check that reloads the snapshot.
- A later read that differs because another tab committed afterwards never
  turns a completed save into a failure.
- `versionchange` closes the connection and disables saving
  (`blocked-upgrade`); `blocked` on open is reported the same way. A damaged
  database is never deleted or recreated automatically.
- IndexedDB unavailable / open failure → `read-only-error`: verified legacy
  localStorage selections are shown read-only, saving is disabled with an
  explanation and a retry. There is no localStorage write fallback.

### 6. Page states (Mode B / Mode C)

`initializing → ready ⇄ saving → ready | conflict | unknown-outcome`, plus
`read-only-error`, `blocked-upgrade` and `reimport-confirm`. Before `ready`
and while `saving`, every Hanja control is disabled (one save at a time per
page); results are rendered without confirmed selections or with the
read-only legacy ones, never with an empty record presented as confirmed.
Success applies the returned canonical snapshot (quick selection, detailed
analysis and PDF input use the same results). Conflict refreshes the snapshot
and names the name, syllable and both values. Stale responses are ignored by
operation id; unmount/StrictMode never claims an outcome. R3.1 modal, focus
and card feedback behaviour is unchanged.

### 7. Verification

The pure decision functions are unit-tested; pages are tested in jsdom with an
in-memory serialising backend (`src/test-utils/memoryHanjaBackend.ts`, never
imported by application code; injected through the module-scope
`overrideHanjaBackend`). **Cross-tab safety is only claimed from real Chrome
runs with two same-origin tabs.**

Production code contains no test instrumentation (audit F1): no global
callbacks, no harness object, no test abort path; the production bundle is
checked for their absence. The real-browser tests instead instrument
IndexedDB inside the test browser only (scripts injected through the
DevTools protocol before the page loads): the deterministic barrier blocks a
transaction's read step with a synchronous request until the other tab's
transaction exists, and an abort after `put` is injected by wrapping
`IDBObjectStore.put`. Direct API runs use a separately built, test-only
bundle of the unchanged persistence module served next to the app on a test
proxy origin.
