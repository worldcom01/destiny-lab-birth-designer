import { Pillar, FourPillars, OhaengBalance, OhaengType, YinYangType } from '@/types';
import { toCivilDate, kstToUtcMs, getDayGanjiIndex, getSolarMonthAt, type SolarMonth } from './calendar';

const STEMS_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const STEMS_KR    = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const STEMS_OHAENG: OhaengType[]   = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
const STEMS_YINYANG: YinYangType[] = ['양', '음', '양', '음', '양', '음', '양', '음', '양', '음'];

const BRANCHES_HANJA  = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const BRANCHES_KR     = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCHES_OHAENG: OhaengType[]   = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
const BRANCHES_YINYANG: YinYangType[] = ['양', '음', '양', '음', '양', '음', '양', '음', '양', '음', '양', '음'];

const MONTH_STEM_BASES = [2, 4, 6, 8, 0];
const HOUR_STEM_BASES  = [0, 2, 4, 6, 8];

function makePillar(si: number, bi: number): Pillar {
  const s = ((si % 10) + 10) % 10;
  const b = ((bi % 12) + 12) % 12;
  return {
    stemIndex: s,
    branchIndex: b,
    label: `${STEMS_KR[s]}${STEMS_HANJA[s]}·${BRANCHES_KR[b]}${BRANCHES_HANJA[b]}`,
    stemOhaeng: STEMS_OHAENG[s],
    branchOhaeng: BRANCHES_OHAENG[b],
    stemYinYang: STEMS_YINYANG[s],
    branchYinYang: BRANCHES_YINYANG[b],
  };
}

export function getYearPillar(year: number): Pillar {
  return makePillar(((year - 4) % 10 + 10) % 10, ((year - 4) % 12 + 12) % 12);
}

// The Date argument only carries the civil date (host-local Y/M/D fields);
// hour/minute are KST wall-clock time. See src/lib/calendar.ts for conventions.
function getSolarMonth(date: Date, hour: number, minute: number): SolarMonth {
  return getSolarMonthAt(kstToUtcMs(toCivilDate(date), hour, minute));
}

function monthPillarFrom(sm: SolarMonth): Pillar {
  const yStem = ((sm.solarYear - 4) % 10 + 10) % 10;
  const stemIdx = (MONTH_STEM_BASES[yStem % 5] + sm.monthOrder) % 10;
  return makePillar(stemIdx, sm.branchIndex);
}

export function getMonthPillar(date: Date, hour = 0, minute = 0): Pillar {
  return monthPillarFrom(getSolarMonth(date, hour, minute));
}

export function getDayPillar(date: Date): Pillar {
  const pos = getDayGanjiIndex(toCivilDate(date));
  return makePillar(pos % 10, pos % 12);
}

// Existing convention (preserved): 23:00-00:59 is 子. The hour stem is derived
// from the stem of the same civil date, so 23:00 and 00:00 of one date share
// the same 子 pillar and the day does not roll over at 23:00.
export function getHourPillar(hour: number, dayStemIdx: number): Pillar {
  const branchIdx = hour === 23 ? 0 : Math.floor((hour + 1) / 2);
  const stemIdx = (HOUR_STEM_BASES[dayStemIdx % 5] + branchIdx) % 10;
  return makePillar(stemIdx, branchIdx);
}

function assertTimeOfDay(hour: number, minute: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError(`Invalid hour: ${hour}`);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new RangeError(`Invalid minute: ${minute}`);
}

/**
 * Four pillars for a KST civil date and time. Year/month pillars switch at the
 * exact Ipchun / jie instants; throws CalendarRangeError outside the supported range.
 */
export function calculateFourPillars(date: Date, hour: number, minute = 0): FourPillars {
  assertTimeOfDay(hour, minute);
  const sm = getSolarMonth(date, hour, minute);
  const year = getYearPillar(sm.solarYear);
  const month = monthPillarFrom(sm);
  const day = getDayPillar(date);
  const hourP = getHourPillar(hour, day.stemIndex);
  return { year, month, day, hour: hourP };
}

export function getSajuOhaengBalance(pillars: FourPillars): OhaengBalance {
  const bal: OhaengBalance = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of [pillars.year, pillars.month, pillars.day, pillars.hour]) {
    bal[p.stemOhaeng]++;
    bal[p.branchOhaeng]++;
  }
  return bal;
}

export function getYinYangCounts(pillars: FourPillars): { yang: number; yin: number } {
  let yang = 0, yin = 0;
  for (const p of [pillars.year, pillars.month, pillars.day, pillars.hour]) {
    p.stemYinYang === '양' ? yang++ : yin++;
    p.branchYinYang === '양' ? yang++ : yin++;
  }
  return { yang, yin };
}

export function getDisplayHour(hour: number): string {
  if (hour === 0) return '오전 12시';
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '오후 12시';
  return `오후 ${hour - 12}시`;
}

export function getHourLabel(hour: number): string {
  const labels = [
    '자시(23~1시)', '축시(1~3시)', '인시(3~5시)', '묘시(5~7시)',
    '진시(7~9시)', '사시(9~11시)', '오시(11~13시)', '미시(13~15시)',
    '신시(15~17시)', '유시(17~19시)', '술시(19~21시)', '해시(21~23시)',
  ];
  return labels[hour === 23 ? 0 : Math.floor((hour + 1) / 2)];
}

/**
 * Label of a Mode B/C sijin choice. 자시 is two separate choices on the same
 * civil date (조자시 00:00-01:00, 야자시 23:00-24:00); others as getHourLabel.
 */
export function getSijinLabel(hour: number): string {
  if (hour === 0) return '조자시(0~1시)';
  if (hour === 23) return '야자시(23~24시)';
  return getHourLabel(hour);
}

export function getAnalysisHours(level: string): number[] {
  return level === '정밀'
    ? Array.from({ length: 24 }, (_, i) => i)
    : [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
}
