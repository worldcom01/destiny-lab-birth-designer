# Saju calendar engine

Implementation: `src/lib/calendar.ts` (calendar core) and `src/lib/saju.ts` (pillars).
Data: `src/data/solarTerms.ts`. Tests: `src/lib/__tests__/calendar.test.ts`.

## Conventions

| Topic | Convention |
|---|---|
| Calendar | Proleptic Gregorian civil dates |
| Input time | Korea Standard Time (KST), fixed UTC+9 wall clock |
| Daylight saving time | Not applied (Korea has had no DST since 1988) |
| True solar time / birthplace longitude | Not applied |
| Day pillar | Civil date; the day changes at 00:00 KST |
| Year pillar | Changes at the exact Ipchun (입춘) instant |
| Month pillar | Changes at the exact instant of each of the 12 jie (節) terms: 소한, 입춘, 경칩, 청명, 입하, 망종, 소서, 입추, 백로, 한로, 입동, 대설 |
| Transition minute | Belongs to the new period (instant >= transition). Source precision is 1 minute |
| Month stem | 五虎遁 (甲己→丙寅, 乙庚→戊寅, 丙辛→庚寅, 丁壬→壬寅, 戊癸→甲寅) |
| Hour branch | 子 = 23:00-00:59, 丑 = 01:00-02:59, ... 亥 = 21:00-22:59 |
| Hour stem | 五鼠遁 from the stem of the same civil date |
| 23:00-23:59 | Preserved existing behaviour: the day does not roll over, and the hour stem uses the same civil date's stem. 23:00 and 00:00 of one date therefore give the same 子 pillar. This convention is unchanged and still needs a domain decision (see below) |

`calculateFourPillars(date, hour, minute = 0)` reads only the host-local
year/month/day of `date` (callers build it as `new Date('YYYY-MM-DDT00:00:00')`).
`hour`/`minute` are KST. The results do not depend on the host time zone.

## Day pillar

Day index = (JDN + 49) mod 60, where 0 = 甲子. JDN is the Julian Day Number of
the civil date (Fliegel & Van Flandern integer algorithm). Offset 49 follows from
JDN 2451545 (2000-01-01) being 戊午 (index 54). It is valid for any Gregorian date.
This replaces the previous host-local millisecond difference from
`new Date(1900, 0, 1)`. In Asia/Seoul that anchor uses the historical offset
UTC+8:27:52, so every modern day pillar was shifted by one day.

## Solar term data

- Source: Hong Kong Observatory, "Date and Time of the 24 Solar Terms",
  `https://www.hko.gov.hk/en/gts/astronomy/data/files/24SolarTerms_<YEAR>.xml`.
  HKO bases the data on HM Nautical Almanac Office and US Naval Observatory data.
- Retrieved 2026-11-04. Values are copied verbatim, by script, from the XML files.
- Coverage: 2019-2028. Time standard: HKT (UTC+8). Precision: 1 minute.
- Independent cross-check: KASI calendar data (KST,
  `https://astro.kasi.re.kr/life/post/calendardata`). All 192 terms of 2021-2028
  are identical to the minute (`src/lib/__tests__/fixtures/kasiSolarTerms.ts`).
  KASI states that page is not the official 월력요항 release.

## Supported range

- Instants from 2019 소한 (2019-01-06 00:39 KST) up to, but not including, 2029-01-01 00:00 KST.
- Whole civil days: `SUPPORTED_KST_DATE_RANGE` = 2019-01-07 to 2028-12-31.
- Outside that range `calculateFourPillars` throws `CalendarRangeError` (a `RangeError`).
  Invalid dates, hours outside 0-23 and minutes outside 0-59 throw `RangeError`.
  The Mode A/B/C input forms reject dates outside the supported range.
- The day pillar alone (`getDayPillar`) works for any valid Gregorian date.

To extend the range, add HKO/KASI years to `SOLAR_TERMS_HKT` and the KASI fixture.
The dataset tests check the order, spacing and HKO/KASI agreement.

## Medically permitted scheduling (Mode A, `src/lib/schedule.ts`)

- The user enters the permitted date range (at most 30 days) and permitted daily
  time ranges `[start, end)` and/or exact times, all in KST "HH:mm". An end of
  "00:00" means 24:00. The user must also confirm the window comes from their
  medical provider. There is no default availability.
- Each range is cut at hour-branch boundaries (odd hours) and at jie instants on
  that date. Every resulting slot has constant pillars and is evaluated once at
  its start, so a window is never widened to a whole 2-hour branch.
- Eligibility is a hard filter: slots outside the window are never generated, and
  eligibility is never scored. `validateDesignerInput` runs on the input page and
  again inside `runModeAAnalysis`.

## Known limitations

- Mode B/C collect a 시진 (2-hour slot) as a representative hour, not an exact time.
  When a jie transition falls inside the chosen 시진 on that date, the month pillar
  depends on the exact time. Such inputs are now rejected with an explanation
  (`findTransitionInSijin`) instead of being approximated. An exact-time input for
  Mode B/C is not implemented yet.
- The 23:00 hour-stem convention above gives 23:00 the stem of the previous 子 hour.
  The usual 子時 schools (자시 일진 교체 / 야자시) give it the following day's 子 stem.
  This was kept as-is and needs a decision.

## Tests

```
npm test          # vitest run
npm run test:tz   # whole suite under Asia/Seoul, UTC and America/Los_Angeles
```

Expected values come from sources independent of the application code: KASI day
pillars and JDN (`/life/solc`), KASI solar term instants, the standard sexagenary
year list, and the 五虎遁/五鼠遁 rules written out in the test file.
