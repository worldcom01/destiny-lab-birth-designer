import { FourPillars, GeneratedName, Grade, ImageType, NameStyle, OhaengBalance, OhaengType, TimeSlot } from '@/types';
import { calculateFourPillars, getSajuOhaengBalance } from './saju';
import { analyzeNameFromGenerated } from './sungmyung';
import {
  calcHanjaScore, calcModernPreference, calcNameHarmonyScore, calcOhaengBalanceScore,
  calcPronunciationNaturalness, calcYinYangScore, combineOverall, getGrade,
} from './scoring';

// ─── Exact exhaustive Mode A search ──────────────────────────────────────────
//
// Every (permitted slot × candidate name) combination is scored with the same
// final formula as calcAllScores (combineOverall). Nothing is pruned.
//
// It is cheap because the formula separates:
//   overall = combineOverall(B(slot), Y(slot), H(slot, mask(name)), P, Q, B(slot), M, N)
// where P, Q, M, N depend only on the name, B and Y only on the slot, and the
// one interaction H (name·saju harmony) depends on the name only through which
// of the five elements are present in its pronunciation (a 5-bit mask, 32
// values). Each sub-score is computed once per slot / per name / per
// (slot, mask) by the production functions, so the arithmetic per combination
// is identical to calcAllScores, including floating-point operation order.

const ELEMENTS: OhaengType[] = ['목', '화', '토', '금', '수'];

export interface PermittedSlot {
  iso: string;        // civil date YYYY-MM-DD (KST)
  date: Date;
  hour: number;
  minute: number;
  timeSlot: TimeSlot;
}

interface SlotFeatures {
  pillars: FourPillars;
  sajuBal: OhaengBalance;
  balance: number;
  yinYang: number;
  harmonyByMask: Float64Array; // 32 entries
}

interface NameFeatures {
  mask: number;
  pronunciation: number;
  hanjaQuality: number;
  modern: number;
  natural: number;
}

export function elementMask(bal: OhaengBalance): number {
  let m = 0;
  ELEMENTS.forEach((k, i) => { if (bal[k] > 0) m |= 1 << i; });
  return m;
}

function maskBalance(mask: number): OhaengBalance {
  const b: OhaengBalance = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  ELEMENTS.forEach((k, i) => { if (mask & (1 << i)) b[k] = 1; });
  return b;
}

function slotFeatures(slot: PermittedSlot): SlotFeatures {
  const pillars = calculateFourPillars(slot.date, slot.hour, slot.minute);
  const sajuBal = getSajuOhaengBalance(pillars);
  const harmonyByMask = new Float64Array(32);
  // calcNameHarmonyScore reads the name balance only through `count > 0`.
  for (let m = 0; m < 32; m++) harmonyByMask[m] = calcNameHarmonyScore(sajuBal, maskBalance(m));
  return {
    pillars, sajuBal,
    balance: calcOhaengBalanceScore(sajuBal),
    yinYang: calcYinYangScore(pillars),
    harmonyByMask,
  };
}

function nameFeatures(name: GeneratedName, images: ImageType[], nameStyles: NameStyle[]): NameFeatures {
  const na = analyzeNameFromGenerated(name, images);
  return {
    mask: elementMask(na.nameOhaengBalance),
    pronunciation: na.pronunciationScore,
    hanjaQuality: calcHanjaScore(na),
    modern: calcModernPreference(name, nameStyles),
    natural: calcPronunciationNaturalness(name.given),
  };
}

export interface ExhaustiveRanking {
  slots: PermittedSlot[];
  names: GeneratedName[];
  /** overall score of combination c = slotIndex * names.length + nameIndex */
  overall: Uint8Array;
  /** combination indices in final rank order (rank = position + 1) */
  order: Uint32Array;
  /** [start, end) positions in `order` for each grade */
  gradeRanges: Record<Grade, [number, number]>;
}

const GRADES: Grade[] = ['SS', 'S', 'A', 'B', 'C'];

/**
 * Scores every combination and orders them by the documented policy:
 *   1. overall score, descending
 *   2. date, ascending
 *   3. slot start time, ascending (slots are given in that order per date)
 *   4. canonical candidate order (pre-score descending, then generation order)
 * Deterministic: no randomness, no host-time dependence.
 */
export function rankAllCombinations(
  slots: PermittedSlot[],
  names: GeneratedName[],
  images: ImageType[],
  nameStyles: NameStyle[],
): ExhaustiveRanking {
  const S = slots.length;
  const N = names.length;
  const total = S * N;
  if (total > 0xffffffff) throw new RangeError('Too many combinations');

  const nf = names.map(n => nameFeatures(n, images, nameStyles));
  const overall = new Uint8Array(total);
  const counts = new Uint32Array(101);

  for (let s = 0; s < S; s++) {
    const f = slotFeatures(slots[s]);
    const base = s * N;
    for (let n = 0; n < N; n++) {
      const x = nf[n];
      const v = combineOverall(
        f.balance, f.yinYang, f.harmonyByMask[x.mask],
        x.pronunciation, x.hanjaQuality, f.balance,
        x.modern, x.natural,
      );
      if (!(v >= 0 && v <= 100 && Number.isInteger(v))) throw new Error(`Internal error: overall ${v} out of range`);
      overall[base + n] = v;
      counts[v]++;
    }
  }

  // Counting sort, descending score; ascending combination index inside a score
  // gives date → slot → canonical name order.
  const start = new Uint32Array(101);
  for (let v = 100, pos = 0; v >= 0; v--) { start[v] = pos; pos += counts[v]; }
  const order = new Uint32Array(total);
  const next = start.slice();
  for (let c = 0; c < total; c++) order[next[overall[c]]++] = c;

  const gradeRanges = {} as Record<Grade, [number, number]>;
  for (const g of GRADES) gradeRanges[g] = [0, 0];
  // Grades are monotone in the score, so each grade is one contiguous range.
  for (let v = 100; v >= 0; v--) {
    if (!counts[v]) continue;
    const g = getGrade(v);
    const [a, b] = gradeRanges[g];
    gradeRanges[g] = a === b ? [start[v], start[v] + counts[v]] : [a, start[v] + counts[v]];
  }

  return { slots, names, overall, order, gradeRanges };
}
