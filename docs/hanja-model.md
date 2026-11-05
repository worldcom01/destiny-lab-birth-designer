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
