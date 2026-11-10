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

### Remaining risk: concurrent tabs

`localStorage` has no transactions. Two tabs saving at the same time can still
interleave read → write so that the later write does not contain the earlier
tab's change to *another* name or scope (last writer wins for the whole key).
Within one tab, every save re-reads the stored record immediately before
writing, so a change made in another tab earlier is kept. Cross-tab locking
(e.g. Web Locks API or a `storage` event re-check) is not implemented.
