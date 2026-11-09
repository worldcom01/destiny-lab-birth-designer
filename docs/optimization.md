# Mode A optimization universe and search

Implementation: `src/lib/nameGenerator.ts` (candidate universe),
`src/lib/modeAOptimizer.ts` (exhaustive scoring and ordering),
`src/lib/analysis.ts` (`analyzeModeA`, on-demand detailed results).
Tests: `src/lib/__tests__/optimization.test.ts` with the independent oracle in
`src/lib/__tests__/fixtures/optimizationOracle.ts`.

## What is optimized

Mode A returns every combination of

1. **a medically permitted evaluation slot** (from the user's provider-confirmed
   schedule), and
2. **a name from the supported candidate universe** (below),

ranked by the traditional scoring model in `scoring.ts`. The top entry is the
highest-scoring combination **within this finite universe**. It is not an
optimum over arbitrary Korean names, other name lengths, or times outside the
permitted window.

## 1. Supported candidate universe

| Rule | Value |
|---|---|
| Given-name length | Exactly two syllables. One- and three-syllable given names are not generated |
| Syllable source | `NAME_CHARS` in `src/data/nameChars.ts`: syllables of the child's gender plus `neutral` (male 45, female 36; the duplicate `윤2` entry is excluded) |
| Same syllable twice | Excluded |
| Same initial consonant | Excluded |
| Clashing initials | Excluded: ㄱ/ㅋ, ㄷ/ㅌ, ㅂ/ㅍ, ㅅ/ㅊ, ㅈ/ㅉ |
| Modernity floor | Average syllable modernity below 35 is excluded |
| Duplicates | Each given name once (first occurrence kept) |
| Generational character (돌림자) | Fixed in the requested position (`first`, `second`, or both for `auto`), paired with every pool syllable other than itself. A syllable outside the data is allowed with a neutral profile (modernity 80, no style tags) |
| Generational Hanja | The confirmed Hanja (or the profile's suggestion) is attached; Hanja does not change any score |
| Images / styles | Do not filter candidates. Styles affect the score (modern preference bonus); images only affect the pre-score tie-break and the image filter in the UI |
| Cap | **None.** Every name that passes the rules above is evaluated |

Sizes without a generational character: male **1,672**, female **1,044**.
With a generational character the universe is small (e.g. 준 auto: 82 / 66).

Mode B evaluates the same universe at its single birth time.

## 2. Permitted slots

`buildDaySlots` splits each permitted daily range at 2-hour branch boundaries
and at jie (solar-term) instants, plus any exact permitted times. Each slot's
pillars are computed at its start minute. Times outside the window are never
generated (hard filter, not a score). A full-day 30-day schedule has about 391
slots.

## 3. Evaluated combinations

`slots × candidates`, all scored. Example: 30 days, full day, male →
391 × 1,672 = **653,752** combinations.

## 4. Excluded by documented constraints

Only the universe rules in section 1 and the medical window exclude
combinations. Nothing is excluded by a proxy score.

## Exactness

The final score separates into slot-only terms (오행 균형, 음양), name-only
terms (발음 안정성, 한자 품질 항목, 현대 선호도, 발음 자연스러움) and one
interaction, 이름·사주 조화, which depends on the name only through which of
the five elements are present in its pronunciation (32 possibilities). The
optimizer computes each term once per slot / name / (slot, element set) with the
production functions and combines them with `combineOverall`, the same function
`calcAllScores` uses, so every score is bit-for-bit identical to the detailed
result. Detailed results are built on demand and checked against the ranked
score.

The pre-score (`nameQualityScore`) no longer selects candidates. It only orders
names for tie-breaking.

## Order and ties

1. Overall score, descending
2. Date, ascending
3. Slot start time, ascending
4. Canonical candidate order: pre-score descending, then generation order

There is no randomness. Integer rounding produces many equal scores; tied
entries are equal under the model and the order among them is a display policy.

## Verification

The oracle re-implements the universe rules and the scoring formula without
calling production name, scoring or optimizer code (it shares the calendar
engine, slot builder and character data). Tests compare the complete ranking,
including every combination and its score, for both genders, several surnames
and styles, 7- and 14-day schedules, exact times, solar-term boundaries,
generational characters (inside and outside the data, with confirmed Hanja) and
the audit counterexample (김가서 79 > former winner 김윤준 76, 2026-11-10 09:00).

## Performance (reference)

Intel Core i9-8950HK, Node 24.16, no style/generational filter, full-day
schedule from 2026-11-01. Time is the median of 5 runs of scoring + ordering;
building the 20 displayed results takes under 1 ms.

| Days | Male combinations | Time | Female combinations | Time |
|---|---:|---:|---:|---:|
| 7 | 153,824 | ~19 ms | 96,048 | ~12 ms |
| 14 | 305,976 | ~26 ms | 191,052 | ~18 ms |
| 30 | 653,752 | ~42 ms (first run ~71 ms) | 408,204 | ~31 ms |

The former capped engine took ~950 ms for 78,200 combinations (30 days). Memory
is two typed arrays (1 + 4 bytes per combination) plus the detailed results that
are actually displayed. Browser and mobile timings are not measured here.
