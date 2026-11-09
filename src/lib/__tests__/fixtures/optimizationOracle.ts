// Independent exhaustive reference evaluator for Mode A.
//
// Shares only the preserved calendar engine (calculateFourPillars), the slot
// builder (buildDaySlots) and the source character data with production. The
// candidate universe and the final score are re-implemented here from the
// documented rules and do not call nameGenerator, sungmyung, scoring or the
// optimizer, so a defect in those modules shows up as a mismatch.

import { DesignerInput, FourPillars, NameCharData, NameStyle, OhaengType } from '@/types';
import { NAME_CHARS } from '@/data/nameChars';
import { calculateFourPillars } from '@/lib/saju';
import { buildDaySlots, isoDatesBetween, normalizeSchedule } from '@/lib/schedule';
import { parseIsoCivilDate } from '@/lib/calendar';

const BASE = 0xac00;
const initial = (h: string) => Math.floor((h.charCodeAt(0) - BASE) / 588);
const vowel = (h: string) => Math.floor((h.charCodeAt(0) - BASE) / 28) % 21;
const final = (h: string) => (h.charCodeAt(0) - BASE) % 28;

// Initial consonant clashes that are not allowed side by side.
const CLASH: [number, number][] = [[0, 15], [3, 16], [7, 17], [9, 14], [12, 13]];

export interface OracleName {
  given: string;
  c1: NameCharData;
  c2: NameCharData;
}

function genderPool(gender: '남' | '여'): NameCharData[] {
  const g = gender === '남' ? 'male' : 'female';
  return NAME_CHARS.filter(c => (c.gender === g || c.gender === 'neutral') && c.hangul !== '윤2');
}

/** Every supported two-syllable given name for the input (no cap). */
export function oracleUniverse(input: DesignerInput): OracleName[] {
  const pool = genderPool(input.gender as '남' | '여');
  const dolrim = input.dolrimChar?.trim() ?? '';
  const ok = (a: NameCharData, b: NameCharData) => {
    const x = initial(a.hangul), y = initial(b.hangul);
    if (x === y) return false;
    if (CLASH.some(([p, q]) => (x === p && y === q) || (x === q && y === p))) return false;
    return (a.modernity + b.modernity) / 2 >= 35;
  };
  const out: OracleName[] = [];
  const seen = new Set<string>();
  const add = (a: NameCharData, b: NameCharData) => {
    const given = a.hangul + b.hangul;
    if (seen.has(given) || !ok(a, b)) return;
    seen.add(given);
    out.push({ given, c1: a, c2: b });
  };
  if (dolrim) {
    const d: NameCharData = NAME_CHARS.find(c => c.hangul === dolrim) ?? {
      hangul: dolrim, hanja: '?', meaning: '', ohaeng: '토', yinyang: '양', gender: 'neutral',
      modernity: 80, positivity: 80, nameStyleFit: [], images: [],
    };
    for (const c of pool) {
      if (c.hangul === dolrim) continue;
      if (input.dolrimPosition !== 'second') add(d, c);
      if (input.dolrimPosition !== 'first') add(c, d);
    }
  } else {
    for (const a of pool) for (const b of pool) if (a !== b) add(a, b);
  }
  return out;
}

// Pronunciation element of an initial consonant index (오음).
const INITIAL_ELEMENT: OhaengType[] = ['목', '목', '화', '화', '화', '화', '수', '수', '수', '금', '금', '토', '금', '금', '금', '목', '화', '수', '토'];
// Final consonant index → the initial consonant that carries its element.
const FINAL_AS_INITIAL = [-1, 0, 0, 0, 2, 2, 2, 3, 5, 5, 5, 5, 5, 5, 5, 5, 6, 7, 7, 9, 9, 11, 12, 14, 15, 16, 17, 18];
const FAMILY = [0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 3, 3, 3, 3, 1, 2, 4];
const OPEN_VOWELS = [0, 2, 4, 6, 8, 10, 12, 13, 18, 19];
const ELEMENTS: OhaengType[] = ['목', '화', '토', '금', '수'];

/** Final overall score, re-derived from the documented formula. */
export function oracleScore(n: OracleName, p: FourPillars, styles: NameStyle[]): number {
  const saju: Record<OhaengType, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let yang = 0;
  for (const x of [p.year, p.month, p.day, p.hour]) {
    saju[x.stemOhaeng]++; saju[x.branchOhaeng]++;
    if (x.stemYinYang === '양') yang++;
    if (x.branchYinYang === '양') yang++;
  }
  const vals = ELEMENTS.map(k => saju[k]);
  const total = vals.reduce((a, b) => a + b, 0);
  const mean = total / 5;
  const maxRatio = Math.max(...vals) / total;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / 5) / mean;
  const balance = Math.min(100, vals.filter(v => v > 0).length * 10
    + (maxRatio <= 0.25 ? 30 : maxRatio <= 0.35 ? 20 : maxRatio <= 0.45 ? 10 : 0)
    + (std < 0.3 ? 20 : std < 0.6 ? 10 : std < 0.9 ? 5 : 0));
  const yinYang = ([100, 85, 60, 35, 10] as number[])[Math.abs(2 * yang - 8)] ?? 0;

  const nameEl: Record<OhaengType, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let stability = 100;
  for (const h of Array.from(n.given)) {
    nameEl[INITIAL_ELEMENT[initial(h)]]++;
    if (final(h)) nameEl[INITIAL_ELEMENT[FINAL_AS_INITIAL[final(h)]]]++;
    if ([1, 4, 8, 10, 13].includes(initial(h))) stability -= 18;
    if ([14, 15, 16, 17].includes(initial(h))) stability -= 7;
  }
  stability = Math.max(0, stability);

  let harmony = 50;
  for (const k of ELEMENTS) {
    const r = saju[k] / total;
    const has = nameEl[k] > 0;
    harmony += r < 0.1 && has ? 18 : r < 0.2 && has ? 10 : r > 0.4 && has ? -12 : 3;
  }
  harmony = Math.max(0, Math.min(100, harmony));

  const hanjaQuality = Math.round((100 + Math.round((n.c1.modernity + n.c2.modernity) / 2)) / 2);
  const bonus = Math.min(24, styles.reduce((s, st) => s + (n.c1.nameStyleFit.includes(st) ? 12 : 0) + (n.c2.nameStyleFit.includes(st) ? 12 : 0), 0));
  const modern = Math.min(100, Math.round(n.c1.modernity * 0.4 + n.c2.modernity * 0.6 + bonus * 0.5));

  const [a, b] = Array.from(n.given);
  const fa = FAMILY[initial(a)], fb = FAMILY[initial(b)];
  let natural = 80 + (fa !== fb ? 12 : -8) + (OPEN_VOWELS.includes(vowel(b)) ? 8 : 0)
    + (final(b) === 0 ? 8 : final(b) <= 4 ? 2 : 0) + (fa === 4 || fb === 4 ? 4 : 0);
  natural = Math.max(0, Math.min(100, natural));

  return Math.round(
    (balance * 0.40 + yinYang * 0.25 + harmony * 0.35) * 0.40
    + (stability * 0.50 + hanjaQuality * 0.50) * 0.20
    + balance * 0.10 + modern * 0.20 + natural * 0.10,
  );
}

export interface OracleCombo { key: string; date: string; start: string; full: string; overall: number }

export const comboKey = (date: string, start: string, end: string | null, full: string) => `${date}|${start}|${end ?? ''}|${full}`;

/** Every permitted slot × every supported name, scored independently. */
export function oracleEvaluate(input: DesignerInput): Map<string, OracleCombo> {
  const names = oracleUniverse(input);
  const schedule = normalizeSchedule(input.schedule!);
  const out = new Map<string, OracleCombo>();
  for (const iso of isoDatesBetween(input.startDate, input.endDate)) {
    const date = new Date(iso + 'T00:00:00');
    for (const s of buildDaySlots(parseIsoCivilDate(iso)!, schedule)) {
      const pillars = calculateFourPillars(date, s.hour, s.minute);
      for (const n of names) {
        const full = input.surname + n.given;
        const key = comboKey(iso, s.slot.start, s.slot.end, full);
        out.set(key, { key, date: iso, start: s.slot.start, full, overall: oracleScore(n, pillars, input.nameStyles ?? []) });
      }
    }
  }
  return out;
}
