# Scoring transparency

Implementation: `src/lib/scoring.ts` (`calcAllScores`, `combineOverall`),
`src/lib/sungmyung.ts` (`analyzeNameFromGenerated`). User-facing wording:
`src/lib/scoreComponents.ts` (single source for every label, weight and
explanation in the UI and the PDF). Tests: `scoreTransparency.test.tsx`,
`scoreBaseline.test.ts`.

## What the score is

The overall score is a **relative score inside one traditional Saju/naming
model**. It compares candidate combinations (birth slot × name) with the same
rule set. It is not a measurement of a child, and it has no scientific
validation: it does not predict personality, ability, health, development or
future outcomes. A higher grade does not mean a better life.

```
overall = round( 0.40 × (0.40·B + 0.25·Y + 0.35·H)
               + 0.20 × (0.50·P + 0.50·Q)
               + 0.10·B + 0.20·M + 0.10·N )
```

Grades: SS ≥ 87, S 75–86, A 60–74, B 45–59, C < 45.

## Components

| Shown as | Field / function | Actual input | Weight | Styles | Images | Hanja | Birth time | Shown in |
|---|---|---|---:|---|---|---|---|---|
| 사주 오행 균형 | `sajuOhaengBalance` / `calcOhaengBalanceScore` | Element counts of the 8 Saju characters | 26 % (16 % + 10 %, counted twice) | no | no | no | yes | Mode A/B/C cards, PDF summary + detail, PDF top-20 (dots) |
| 사주 음양 균형 | `yinYangHarmony` / `calcYinYangScore` | Yang/yin count difference of the 8 Saju characters | 10 % | no | no | no | yes | cards, PDF summary + detail, PDF top-20 |
| 이름 발음오행·사주 조화 | `nameHarmony` / `calcNameHarmonyScore` | Which elements the given name's initial and final consonants carry (오음), against scarce/abundant Saju elements | 14 % | no | no | no | yes | cards (highlighted in B/C), PDF, PDF top-20, Mode C table |
| 발음 안정성(된소리·거센소리) | `pronunciationStability` | −18 per tense, −7 per aspirated initial in the given name | 10 % | no | no | no | no | cards, PDF |
| 글자 수·음절 현대성 | `hanjaQuality` (historical field name) / `calcHanjaScore` | Syllable count (2 → 100, 3 → 85, else 65) and the average modernity index of the first two given-name syllables | 10 % | no | no | **no** | no | cards, PDF |
| 현대 선호도(스타일 가산) | `modernPreference` (= `modernUsability`) / `calcModernPreference` | Syllable modernity (first syllable 40 %, second 60 %) + 12 per selected style a syllable is classified under, bonus capped at 24, halved (adds at most 12) | 20 % | **yes** | no | no | no | cards, PDF |
| 발음 자연스러움 | `pronunciationNaturalness` / `calcPronunciationNaturalness` | Initial-consonant families of syllables 1 and 2, vowel and final consonant of syllable 2, ㅇ/ㅎ; fixed 75 for a one-syllable name | 10 % | no | no | no | no | cards, PDF |
| 이미지 분류 일치(종합 미반영) | `imageMatch` | 50 + 15 per selected image syllable 1 or 2 is classified under (max 100) | **0 %** | no | yes | no | no | cards only |

The modernity index and the style/image classifications belong to the Hangul
syllable profiles in `src/data/nameChars.ts`. For a Mode C syllable that is not
in that data the modernity is a default of 70.

### Data provenance

The syllable modernity index (`nameChars.ts`) and the Hanja `usageFreq` /
`modernPref` values (`hanjaDB.ts`) are **internal model indices**. Earlier code
comments described them as based on 2020–2024 birth registrations and grouped
syllables as year-specific "TOP 5 / TOP 20 / popular" characters, but no
primary source, sample, extraction script or version could be found, so all of
those claims were removed (R3-FIX, R3-CLOSE). The comments now describe only
internal index bands (e.g. "internal modernity index 80-89"). The values are kept unchanged; they have not been
empirically validated. The UI labels them "내부 지수" and the overall explanation
says so (`INDEX_PROVENANCE_NOTE`, `OVERALL_SCORE_EXPLANATION`).

### Name length (Mode C only)

Modes A and B only produce two-syllable given names. Mode C accepts 1–3
syllables, and the existing calculations then read (numbers unchanged):

| Component | 1 syllable | 2 syllables | 3 syllables |
|---|---|---|---|
| 발음 안정성, 이름 발음오행·사주 조화 | that syllable | both | all three |
| 글자 수 part of 글자 수·음절 현대성 | 65 | 100 | 85 |
| modernity part, 현대 선호도, 이미지 분류 | the syllable twice (as 1st and 2nd) | both | first two only |
| 발음 자연스러움 | fixed 75 | both | first two only ("final" rules use syllable 2) |

The card's score breakdown and the PDF name page show this as a note
(`nameLengthScopeNote`) for every non-two-syllable name.

## Inputs that do not enter the score

- **Selected Hanja** (meaning, strokes, 자원오행, 수리오행): display only. Changing
  a Hanja re-derives the Hanja text; every score and rank stays the same. The
  "글자 수·음절 현대성" item was previously labelled "한자 의미 품질", which was
  wrong.
- **Images**: no effect on the overall score. They set the unweighted image
  item, the image tags and the Mode A image filter. When no style is selected
  they also feed the pre-score that orders tied candidates.
- **Medical window** (Mode A): a hard filter on which slots exist; never scored.

## Inputs that only constrain or order candidates

- **Gender, generational character and position**: define the candidate
  universe (`docs/optimization.md`).
- **Styles and images**: never filter candidates. Through the pre-score
  (`nameQualityScore`) they only order candidates whose overall scores are
  equal. Styles additionally add up to 12 points to 현대 선호도, i.e. at most
  2.4 points of the overall score **before rounding**. Because the overall
  score is rounded once at the end, the displayed integer can rise by
  at most 3 points (e.g. 김승우, 2027-07-04 09:00 male: 77 → 80; 323 of 1,672
  names gain +3 with 전통형+리더형). `STYLE_EFFECT_LIMITS` holds the three numbers.
- **Visibility of preferences**: Mode B shows the style toggles (restored values
  appear selected and can be cleared); the results page states the styles and
  images used. Duplicate stored values are normalized to one (validator),
  malformed ones are dropped with a notice, keeping the rest of the input.

## Supported candidate universe

Modes A and B only consider two-syllable given names built from the syllable
data (male 1,672, female 1,044 without a generational character). Results are
the best combinations inside this universe, not among all Korean names. Mode C
scores exactly the names the user typed.

## Tags and descriptions

Tags state facts: the dominant Saju element with its traditional symbol,
`사주 오행 5종 모두 있음` / `4종`, `사주 음양 x:y`, `○○ 분류 글자 포함` (only when a
syllable is classified under that style or image), `첫 소리 발음오행 ○`. They do
not claim suitability. The PDF interpretation page presents the dominant
element's traditional symbolism under neutral headings and states that it does
not predict the child's personality, ability or future.

## Hanja recommendation reasons

`getRecommendedHanja` is unchanged. `explainRecommendedHanja` classifies the
record it returned: `jawon` (its 자원오행 equals the requested element), `suri`
(no 자원오행 match exists for the syllable; its stroke-count 수리오행 matches),
`fallback` (neither exists; first registered Hanja) or `preference` (no
element requested). The picker only says the Hanja complements an element by
its 자원오행 in the `jawon` case. Example: 민 for 수 returns 珉, 자원오행 금,
10 strokes → 수리오행 수, so it is a `suri` recommendation. Over 48 syllables × 5
elements, 144 of 240 recommendations are `suri` or `fallback`.
