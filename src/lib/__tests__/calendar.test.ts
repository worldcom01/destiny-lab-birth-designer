import { afterEach, describe, expect, it } from 'vitest';
import { calculateFourPillars, getDayPillar } from '@/lib/saju';
import {
  CalendarRangeError,
  SUPPORTED_KST_DATE_RANGE,
  civilDateToJdn,
  isSupportedIsoDate,
  parseIsoCivilDate,
} from '@/lib/calendar';
import { SOLAR_TERMS_HKT } from '@/data/solarTerms';
import { KASI_DAY_PILLARS } from './fixtures/kasiDayPillars';
import { KASI_SOLAR_TERMS_KST } from './fixtures/kasiSolarTerms';

// ─── Helpers (independent of the code under test) ────────────────────────────

const hanja = (label: string) => label.replace(/[가-힣·]/g, '');

const at = (iso: string, hour: number, minute = 0) =>
  calculateFourPillars(new Date(`${iso}T00:00:00`), hour, minute);

const pillarsAt = (iso: string, hour: number, minute = 0) => {
  const p = at(iso, hour, minute);
  return {
    year: hanja(p.year.label),
    month: hanja(p.month.label),
    day: hanja(p.day.label),
    hour: hanja(p.hour.label),
  };
};

/** KASI "MM-DD HH:mm" (KST) of `year` shifted by `deltaMinutes`, as [isoDate, hour, minute]. */
function kasiInstant(year: number, entry: string, deltaMinutes: number): [string, number, number] {
  const [md, hm] = entry.split(' ');
  const [mo, d] = md.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const t = new Date(Date.UTC(year, mo - 1, d, h, mi + deltaMinutes)); // KST wall clock in UTC fields
  return [t.toISOString().slice(0, 10), t.getUTCHours(), t.getUTCMinutes()];
}

// Standard sexagenary years (年干支) from 2018 to 2028.
const YEAR_GANJI: Record<number, string> = {
  2018: '戊戌', 2019: '己亥', 2020: '庚子', 2021: '辛丑', 2022: '壬寅', 2023: '癸卯',
  2024: '甲辰', 2025: '乙巳', 2026: '丙午', 2027: '丁未', 2028: '戊申',
};

// 五虎遁: stem of the 寅 month by year stem (甲己→丙, 乙庚→戊, 丙辛→庚, 丁壬→壬, 戊癸→甲).
const TIGER_MONTH_STEM: Record<string, string> = {
  甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲',
};
const STEMS = '甲乙丙丁戊己庚辛壬癸';

/** Month ganji for a year stem and month order (0 = 寅 ... 11 = 丑). */
function expectedMonth(yearGanji: string, order: number): string {
  const stem = STEMS[(STEMS.indexOf(TIGER_MONTH_STEM[yearGanji[0]]) + order) % 10];
  return stem + '寅卯辰巳午未申酉戌亥子丑'[order];
}

// Jie terms (even indices of the 24-term list) and the month order they start.
const JIE = [
  { index: 0, name: '소한', order: 11 }, { index: 2, name: '입춘', order: 0 },
  { index: 4, name: '경칩', order: 1 }, { index: 6, name: '청명', order: 2 },
  { index: 8, name: '입하', order: 3 }, { index: 10, name: '망종', order: 4 },
  { index: 12, name: '소서', order: 5 }, { index: 14, name: '입추', order: 6 },
  { index: 16, name: '백로', order: 7 }, { index: 18, name: '한로', order: 8 },
  { index: 20, name: '입동', order: 9 }, { index: 22, name: '대설', order: 10 },
];

const KASI_YEARS = Object.keys(KASI_SOLAR_TERMS_KST).map(Number);

// ─── Day pillar ──────────────────────────────────────────────────────────────

describe('day pillar', () => {
  it.each(KASI_DAY_PILLARS)('$date is $ganji (KASI)', ({ date, jd, ganji }) => {
    expect(civilDateToJdn(parseIsoCivilDate(date)!)).toBe(jd);
    expect(hanja(getDayPillar(new Date(`${date}T00:00:00`)).label)).toBe(ganji);
  });

  it('advances by exactly one ganji per day across month, year and leap-day transitions', () => {
    const STEM_BRANCH = (label: string) => hanja(label);
    const cycle: string[] = [];
    for (let i = 0; i < 60; i++) cycle.push(STEMS[i % 10] + '子丑寅卯辰巳午未申酉戌亥'[i % 12]);
    const start = new Date('1999-12-01T00:00:00');
    let prev = cycle.indexOf(STEM_BRANCH(getDayPillar(start).label));
    const d = new Date(start);
    for (let n = 0; n < 365 * 31; n++) { // through 2030
      d.setDate(d.getDate() + 1);
      const cur = cycle.indexOf(STEM_BRANCH(getDayPillar(d).label));
      expect((cur - prev + 60) % 60).toBe(1);
      prev = cur;
    }
  });

  it('rejects impossible dates', () => {
    expect(parseIsoCivilDate('1900-02-29')).toBeNull();
    expect(parseIsoCivilDate('2023-02-29')).toBeNull();
    expect(parseIsoCivilDate('2024-02-29')).not.toBeNull();
    expect(parseIsoCivilDate('2000-02-29')).not.toBeNull();
    expect(() => civilDateToJdn({ year: 2023, month: 2, day: 29 })).toThrow(RangeError);
    expect(() => getDayPillar(new Date('not a date'))).toThrow(RangeError);
  });
});

// ─── Year / month pillars around solar term instants ─────────────────────────

describe('year pillar at Ipchun', () => {
  it.each(KASI_YEARS)('%i switches at the KASI Ipchun minute', year => {
    const entry = KASI_SOLAR_TERMS_KST[year][2];
    expect(pillarsAt(...kasiInstant(year, entry, -1)).year).toBe(YEAR_GANJI[year - 1]);
    expect(pillarsAt(...kasiInstant(year, entry, 0)).year).toBe(YEAR_GANJI[year]);
  });

  it('known cases', () => {
    // 2024 입춘 2024-02-04 17:27 KST (KASI)
    expect(pillarsAt('2024-02-04', 17, 26)).toMatchObject({ year: '癸卯', month: '乙丑' });
    expect(pillarsAt('2024-02-04', 17, 27)).toMatchObject({ year: '甲辰', month: '丙寅' });
    // Jan 15 is always before Ipchun: previous sexagenary year
    expect(pillarsAt('2027-01-15', 9)).toMatchObject({ year: '丙午', month: '辛丑' });
    // 2026-02-03 is before 2026 입춘 (02-04 05:02 KST): 乙巳 year, 己丑 month
    expect(pillarsAt('2026-02-03', 9)).toMatchObject({ year: '乙巳', month: '己丑' });
  });
});

describe('month pillar at jie instants', () => {
  const cases = KASI_YEARS.flatMap(year => JIE.map(j => ({ year, ...j })));

  it.each(cases)('$year $name: previous month 1 minute before, new month at the minute', ({ year, index, order }) => {
    const entry = KASI_SOLAR_TERMS_KST[year][index];
    // Saju year in effect after the transition (소한 belongs to the previous year)
    const yearAfter = index === 0 ? year - 1 : year;
    const yearBefore = index === 2 ? year - 1 : yearAfter;
    const before = pillarsAt(...kasiInstant(year, entry, -1));
    const after = pillarsAt(...kasiInstant(year, entry, 0));
    expect(after.month).toBe(expectedMonth(YEAR_GANJI[yearAfter], order));
    expect(before.month).toBe(expectedMonth(YEAR_GANJI[yearBefore], (order + 11) % 12));
  });

  it('known cases', () => {
    // 2024 경칩 2024-03-05 11:23 KST (KASI)
    expect(pillarsAt('2024-03-05', 11, 22).month).toBe('丙寅');
    expect(pillarsAt('2024-03-05', 11, 23).month).toBe('丁卯');
    // 2027 소한 2027-01-05 23:10 KST (KASI): 丙午 year continues, 庚子 → 辛丑
    expect(pillarsAt('2027-01-05', 23, 9)).toMatchObject({ year: '丙午', month: '庚子' });
    expect(pillarsAt('2027-01-05', 23, 10)).toMatchObject({ year: '丙午', month: '辛丑' });
    // 2028 대설 2028-12-06 23:25 KST (KASI): 戊申 year, 癸亥 → 甲子
    expect(pillarsAt('2028-12-06', 23, 24).month).toBe('癸亥');
    expect(pillarsAt('2028-12-06', 23, 25).month).toBe('甲子');
  });
});

// ─── Hour pillar (existing convention, preserved) ────────────────────────────

describe('hour pillar boundaries', () => {
  // 2024-03-01 is 甲子 day, 2024-03-02 is 乙丑 day (KASI).
  it('follows 五鼠遁 from the civil-date day stem', () => {
    expect(pillarsAt('2024-03-01', 0).hour).toBe('甲子');
    expect(pillarsAt('2024-03-01', 0, 59).hour).toBe('甲子');
    expect(pillarsAt('2024-03-01', 1).hour).toBe('乙丑');
    expect(pillarsAt('2024-03-01', 2, 59).hour).toBe('乙丑');
    expect(pillarsAt('2024-03-01', 11).hour).toBe('庚午');
    expect(pillarsAt('2024-03-01', 21).hour).toBe('乙亥');
    expect(pillarsAt('2024-03-01', 22, 59).hour).toBe('乙亥');
    expect(pillarsAt('2024-03-02', 0).hour).toBe('丙子');
  });

  it('keeps the current 23:00 convention: same civil day, 子 stem of that day', () => {
    expect(pillarsAt('2024-03-01', 23)).toMatchObject({ day: '甲子', hour: '甲子' });
    expect(pillarsAt('2024-03-01', 23, 59)).toMatchObject({ day: '甲子', hour: '甲子' });
    expect(pillarsAt('2024-03-02', 0)).toMatchObject({ day: '乙丑', hour: '丙子' });
  });
});

// ─── Host timezone independence ──────────────────────────────────────────────

describe('host timezone independence', () => {
  const originalTz = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTz; });

  const ZONES = ['Asia/Seoul', 'UTC', 'America/Los_Angeles'];
  const SAMPLES: [string, number, number][] = [
    ['2019-01-07', 0, 0], ['2020-02-29', 23, 59], ['2024-02-04', 17, 26], ['2024-02-04', 17, 27],
    ['2024-03-10', 2, 30], ['2024-11-03', 1, 30], ['2026-11-04', 9, 0], ['2028-12-31', 23, 59],
  ];

  it('produces identical pillars under Asia/Seoul, UTC and America/Los_Angeles', () => {
    const results = ZONES.map(zone => {
      process.env.TZ = zone;
      return {
        offset: new Date(2024, 0, 1).getTimezoneOffset(),
        pillars: JSON.stringify(SAMPLES.map(s => pillarsAt(...s))),
        days: JSON.stringify(KASI_DAY_PILLARS.map(r => hanja(getDayPillar(new Date(`${r.date}T00:00:00`)).label))),
      };
    });
    expect(new Set(results.map(r => r.offset)).size).toBe(ZONES.length); // TZ switch took effect
    expect(new Set(results.map(r => r.pillars)).size).toBe(1);
    expect(new Set(results.map(r => r.days)).size).toBe(1);
    expect(JSON.parse(results[0].days)).toEqual(KASI_DAY_PILLARS.map(r => r.ganji));
  });
});

// ─── Supported range and invalid input ───────────────────────────────────────

describe('supported range and invalid input', () => {
  it('exposes the whole-day supported KST range', () => {
    expect(SUPPORTED_KST_DATE_RANGE).toEqual({ first: '2019-01-07', last: '2028-12-31' });
    expect(isSupportedIsoDate('2019-01-06')).toBe(false); // 2019 소한 is 00:39 KST on this day
    expect(isSupportedIsoDate('2019-01-07')).toBe(true);
    expect(isSupportedIsoDate('2028-12-31')).toBe(true);
    expect(isSupportedIsoDate('2029-01-01')).toBe(false);
    expect(isSupportedIsoDate('2023-02-29')).toBe(false);
    expect(isSupportedIsoDate('garbage')).toBe(false);
  });

  it('throws CalendarRangeError outside the solar term table', () => {
    expect(() => at('2019-01-06', 0, 38)).toThrow(CalendarRangeError);
    expect(() => at('2019-01-06', 0, 39)).not.toThrow();
    expect(() => at('2028-12-31', 23, 59)).not.toThrow();
    expect(() => at('2029-01-01', 0, 0)).toThrow(CalendarRangeError);
    expect(() => at('2018-06-01', 12)).toThrow(CalendarRangeError);
    expect(() => at('2035-06-01', 12)).toThrow(CalendarRangeError);
  });

  it('throws RangeError for invalid dates and times', () => {
    expect(() => calculateFourPillars(new Date('bad'), 9)).toThrow(RangeError);
    expect(() => at('2024-05-01', 24)).toThrow(RangeError);
    expect(() => at('2024-05-01', -1)).toThrow(RangeError);
    expect(() => at('2024-05-01', 9.5)).toThrow(RangeError);
    expect(() => at('2024-05-01', 9, 60)).toThrow(RangeError);
  });
});

// ─── Dataset integrity ───────────────────────────────────────────────────────

describe('solar term dataset', () => {
  const toUtc = (year: number, entry: string, offset: number) => {
    const [md, hm] = entry.split(' ');
    const [mo, d] = md.split('-').map(Number);
    const [h, mi] = hm.split(':').map(Number);
    return Date.UTC(year, mo - 1, d, h - offset, mi);
  };

  it('HKO (HKT) matches KASI (KST) to the minute for every term of 2021-2028', () => {
    for (const year of KASI_YEARS) {
      const hko = SOLAR_TERMS_HKT[year].map(e => toUtc(year, e, 8));
      const kasi = KASI_SOLAR_TERMS_KST[year].map(e => toUtc(year, e, 9));
      expect(hko).toEqual(kasi);
    }
  });

  it('has 24 increasing terms per year spaced 14-17 days apart', () => {
    const all = Object.entries(SOLAR_TERMS_HKT).flatMap(([y, es]) => {
      expect(es).toHaveLength(24);
      return es.map(e => toUtc(Number(y), e, 8));
    });
    for (let i = 1; i < all.length; i++) {
      const days = (all[i] - all[i - 1]) / 86_400_000;
      expect(days).toBeGreaterThan(14);
      expect(days).toBeLessThan(17);
    }
  });
});
