import { Pillar, FourPillars, OhaengBalance, OhaengType, YinYangType } from '@/types';

const STEMS_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const STEMS_KR    = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const STEMS_OHAENG: OhaengType[]   = ['목', '목', '화', '화', '토', '토', '금', '금', '수', '수'];
const STEMS_YINYANG: YinYangType[] = ['양', '음', '양', '음', '양', '음', '양', '음', '양', '음'];

const BRANCHES_HANJA  = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const BRANCHES_KR     = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCHES_OHAENG: OhaengType[]   = ['수', '토', '목', '목', '토', '화', '화', '토', '금', '금', '토', '수'];
const BRANCHES_YINYANG: YinYangType[] = ['양', '음', '양', '음', '양', '음', '양', '음', '양', '음', '양', '음'];

const SOLAR_TERMS = [
  { month: 1,  day: 6,  branchIdx: 1,  order: 11 },
  { month: 2,  day: 4,  branchIdx: 2,  order: 0  },
  { month: 3,  day: 6,  branchIdx: 3,  order: 1  },
  { month: 4,  day: 5,  branchIdx: 4,  order: 2  },
  { month: 5,  day: 6,  branchIdx: 5,  order: 3  },
  { month: 6,  day: 6,  branchIdx: 6,  order: 4  },
  { month: 7,  day: 7,  branchIdx: 7,  order: 5  },
  { month: 8,  day: 7,  branchIdx: 8,  order: 6  },
  { month: 9,  day: 8,  branchIdx: 9,  order: 7  },
  { month: 10, day: 8,  branchIdx: 10, order: 8  },
  { month: 11, day: 7,  branchIdx: 11, order: 9  },
  { month: 12, day: 7,  branchIdx: 0,  order: 10 },
];

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

export function getMonthPillar(date: Date): Pillar {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const md = m * 100 + d;

  const sorted = [...SOLAR_TERMS].sort((a, b) => a.month * 100 + a.day - (b.month * 100 + b.day));
  let term = sorted[sorted.length - 1];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (md >= sorted[i].month * 100 + sorted[i].day) { term = sorted[i]; break; }
  }

  let solarYear = date.getFullYear();
  if (m === 1 || (m === 2 && d < 4)) solarYear -= 1;

  const yStem = ((solarYear - 4) % 10 + 10) % 10;
  const stemIdx = (MONTH_STEM_BASES[yStem % 5] + term.order) % 10;
  return makePillar(stemIdx, term.branchIdx);
}

export function getDayPillar(date: Date): Pillar {
  const ref = new Date(1900, 0, 1).getTime();
  const diff = Math.floor((date.getTime() - ref) / 86400000);
  const pos = ((diff + 10) % 60 + 60) % 60;
  return makePillar(pos % 10, pos % 12);
}

export function getHourPillar(hour: number, dayStemIdx: number): Pillar {
  const branchIdx = hour === 23 ? 0 : Math.floor((hour + 1) / 2);
  const stemIdx = (HOUR_STEM_BASES[dayStemIdx % 5] + branchIdx) % 10;
  return makePillar(stemIdx, branchIdx);
}

export function calculateFourPillars(date: Date, hour: number): FourPillars {
  const year = getYearPillar(date.getFullYear());
  const month = getMonthPillar(date);
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

export function getAnalysisHours(level: string): number[] {
  return level === '정밀'
    ? Array.from({ length: 24 }, (_, i) => i)
    : [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
}
