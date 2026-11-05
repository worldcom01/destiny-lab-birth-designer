import { SOLAR_TERM_SOURCE, SOLAR_TERM_NAMES, SOLAR_TERMS_HKT } from '@/data/solarTerms';

// ─── Conventions ─────────────────────────────────────────────────────────────
// - Dates are proleptic Gregorian civil dates.
// - Time of day is Korea Standard Time (KST, fixed UTC+9). No daylight saving
//   time and no true-solar-time (longitude) correction are applied. KST has had
//   no DST since 1988, so this is exact for the supported range below.
// - Day pillar: the civil date changes at 00:00 KST (midnight rollover).
// - Year pillar changes at the exact Ipchun (입춘) instant; month pillars change
//   at the exact instants of the 12 "jie" (節) terms. A transition minute belongs
//   to the new period (instant >= transition).
// See docs/calendar.md.

export const KST_UTC_OFFSET_HOURS = 9;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export class CalendarRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarRangeError';
  }
}

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

// ─── Civil date arithmetic (host-timezone independent) ───────────────────────

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isValidCivilDate({ year, month, day }: CivilDate): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function assertValidCivilDate(date: CivilDate): void {
  if (!isValidCivilDate(date)) {
    throw new RangeError(`Invalid civil date: ${date.year}-${date.month}-${date.day}`);
  }
}

/** Parses "YYYY-MM-DD". Returns null when the string is not a real calendar date. */
export function parseIsoCivilDate(value: string): CivilDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidCivilDate(date) ? date : null;
}

/**
 * Reads the civil date carried by a JS Date. Only the host-local Y/M/D fields are
 * used, matching how callers build dates (`new Date('YYYY-MM-DDT00:00:00')`).
 */
export function toCivilDate(date: Date): CivilDate {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid Date');
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** Julian Day Number of a Gregorian civil date (Fliegel & Van Flandern, 1968). */
export function civilDateToJdn(date: CivilDate): number {
  assertValidCivilDate(date);
  const a = Math.floor((14 - date.month) / 12);
  const y = date.year + 4800 - a;
  const m = date.month + 12 * a - 3;
  return date.day + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/**
 * Sexagenary (60 갑자) index of the day: 0 = 甲子 ... 59 = 癸亥.
 * Offset 49 follows from JDN 2451545 (2000-01-01) being 戊午 (index 54).
 */
export function getDayGanjiIndex(date: CivilDate): number {
  return (((civilDateToJdn(date) + 49) % 60) + 60) % 60;
}

/** UTC epoch milliseconds of a KST wall-clock time. */
export function kstToUtcMs(date: CivilDate, hour: number, minute: number): number {
  assertValidCivilDate(date);
  return Date.UTC(date.year, date.month - 1, date.day, hour - KST_UTC_OFFSET_HOURS, minute);
}

// ─── Solar term table ────────────────────────────────────────────────────────

export interface SolarTermInstant {
  year: number;
  index: number; // 0 = 소한 ... 23 = 동지
  name: string;
  utcMs: number;
}

function parseSolarTerms(): SolarTermInstant[] {
  const terms: SolarTermInstant[] = [];
  for (let year = SOLAR_TERM_SOURCE.firstYear; year <= SOLAR_TERM_SOURCE.lastYear; year++) {
    const entries = SOLAR_TERMS_HKT[year];
    if (!entries || entries.length !== 24) throw new Error(`Solar term data missing for ${year}`);
    entries.forEach((entry, index) => {
      const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(entry);
      if (!m) throw new Error(`Malformed solar term entry ${year} ${entry}`);
      const utcMs = Date.UTC(year, Number(m[1]) - 1, Number(m[2]),
        Number(m[3]) - SOLAR_TERM_SOURCE.utcOffsetHours, Number(m[4]));
      terms.push({ year, index, name: SOLAR_TERM_NAMES[index], utcMs });
    });
  }
  for (let i = 1; i < terms.length; i++) {
    if (terms[i].utcMs <= terms[i - 1].utcMs) throw new Error('Solar term data out of order');
  }
  return terms;
}

export const SOLAR_TERMS: readonly SolarTermInstant[] = parseSolarTerms();

// Month boundaries are the 12 jie terms (even indices: 소한, 입춘, 경칩, ... 대설).
interface JieTransition {
  utcMs: number;
  solarYear: number;   // Saju year in effect from this instant
  branchIndex: number; // month branch: 소한→丑(1), 입춘→寅(2) ... 대설→子(0)
  monthOrder: number;  // months counted from 寅: 입춘 0 ... 대설 10, 소한 11
}

const JIE_TRANSITIONS: readonly JieTransition[] = SOLAR_TERMS
  .filter(t => t.index % 2 === 0)
  .map(t => {
    const k = t.index / 2;
    return {
      utcMs: t.utcMs,
      solarYear: k === 0 ? t.year - 1 : t.year, // 소한 precedes Ipchun of its civil year
      branchIndex: (k + 1) % 12,
      monthOrder: (k + 11) % 12,
    };
  });

/** Supported instants: [first 소한 in the table, 00:00 KST on Jan 1 after the last table year). */
export const SUPPORTED_RANGE_UTC_MS = {
  start: JIE_TRANSITIONS[0].utcMs,
  end: Date.UTC(SOLAR_TERM_SOURCE.lastYear + 1, 0, 1, -KST_UTC_OFFSET_HOURS),
} as const;

function formatKst(utcMs: number): string {
  return new Date(utcMs + KST_UTC_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 16).replace('T', ' ') + ' KST';
}

function formatIsoDate(utcMs: number): string {
  return new Date(utcMs + KST_UTC_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** First and last civil dates (KST) whose whole day lies inside the supported range. */
export const SUPPORTED_KST_DATE_RANGE = (() => {
  const day = 24 * HOUR_MS;
  const startDayMs = SUPPORTED_RANGE_UTC_MS.start + KST_UTC_OFFSET_HOURS * HOUR_MS;
  const firstMidnight = Math.ceil(startDayMs / day) * day - KST_UTC_OFFSET_HOURS * HOUR_MS;
  return {
    first: formatIsoDate(firstMidnight),
    last: formatIsoDate(SUPPORTED_RANGE_UTC_MS.end - MINUTE_MS),
  };
})();

export function isSupportedKstDate(date: CivilDate): boolean {
  if (!isValidCivilDate(date)) return false;
  const dayStart = kstToUtcMs(date, 0, 0);
  return dayStart >= SUPPORTED_RANGE_UTC_MS.start && dayStart + 24 * HOUR_MS <= SUPPORTED_RANGE_UTC_MS.end;
}

/** True when "YYYY-MM-DD" is a real date whose whole KST day can be analysed. */
export function isSupportedIsoDate(value: string): boolean {
  const date = parseIsoCivilDate(value);
  return date !== null && isSupportedKstDate(date);
}

export interface SolarMonth {
  solarYear: number;
  branchIndex: number;
  monthOrder: number;
}

/** Saju year and month in effect at a UTC instant. Throws outside the supported range. */
export function getSolarMonthAt(utcMs: number): SolarMonth {
  if (!Number.isFinite(utcMs)) throw new RangeError('Invalid instant');
  if (utcMs < SUPPORTED_RANGE_UTC_MS.start || utcMs >= SUPPORTED_RANGE_UTC_MS.end) {
    throw new CalendarRangeError(
      `${formatKst(utcMs)} is outside the supported solar term range ` +
      `(${formatKst(SUPPORTED_RANGE_UTC_MS.start)} to before ${formatKst(SUPPORTED_RANGE_UTC_MS.end)})`,
    );
  }
  let lo = 0;
  let hi = JIE_TRANSITIONS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (JIE_TRANSITIONS[mid].utcMs <= utcMs) lo = mid;
    else hi = mid - 1;
  }
  const { solarYear, branchIndex, monthOrder } = JIE_TRANSITIONS[lo];
  return { solarYear, branchIndex, monthOrder };
}
