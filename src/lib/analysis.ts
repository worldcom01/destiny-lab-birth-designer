import {
  DesignerInput, ModeBInput, ModeCInput,
  AnalysisResult, GeneratedName, NameCharData,
  OhaengType, ImageType, Gender, NameStyle, TimeSlot, Grade,
} from '@/types';
import { calculateFourPillars, getSajuOhaengBalance } from './saju';
import { parseIsoCivilDate } from './calendar';
import { assertValid, validateDesignerInput, validateModeBInput, validateModeCInput, ValidDesignerInput } from './inputValidation';
import { buildDaySlots, isSlotPermitted, isoDatesBetween, normalizeSchedule } from './schedule';
import { analyzeNameFromGenerated, combineOhaengBalances } from './sungmyung';
import { calcAllScores, getGrade, getCharacteristics, generateDescription, stylesFittingName } from './scoring';
import { generateCandidateNames, getImageMatchFromName } from './nameGenerator';
import { PermittedSlot, rankAllCombinations } from './modeAOptimizer';
import { findCharByHangul } from '@/data/nameChars';
import { HanjaSelections, applySelectionToName, buildSurnameHanja, syncProfile, unassignedChar } from './hanjaModel';
import { parseKoreanName } from './nameParser';

// ─── 공통 헬퍼 ───────────────────────────────────────────────────────────────

interface EvaluationTime {
  minute: number;
  timeSlot?: TimeSlot;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const civilIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function singleAnalysis(
  name: GeneratedName,
  date: Date,
  hour: number,
  images: ImageType[],
  nameStyles: NameStyle[] = [],
  time: EvaluationTime = { minute: 0 },
): AnalysisResult {
  const fourPillars = calculateFourPillars(date, hour, time.minute);
  const sajuOhaengBalance = getSajuOhaengBalance(fourPillars);
  const nameAnalysis = analyzeNameFromGenerated(name, images);
  const combinedOhaengBalance = combineOhaengBalances(sajuOhaengBalance, nameAnalysis.nameOhaengBalance);
  const imageMatches = getImageMatchFromName(name, images);

  // 신규: name + nameStyles 파라미터 전달
  const scores = calcAllScores(fourPillars, sajuOhaengBalance, nameAnalysis, name, nameStyles);
  const grade = getGrade(scores.overall);
  // Text only claims styles the name actually fits; scoring above still uses all selected styles.
  const fitStyles = stylesFittingName(name, nameStyles);
  const characteristics = getCharacteristics(fourPillars, sajuOhaengBalance, nameAnalysis, imageMatches, fitStyles);
  const description = generateDescription(fourPillars, sajuOhaengBalance, nameAnalysis, imageMatches, fitStyles);

  return {
    id: `${civilIso(date)}-${pad2(hour)}${pad2(time.minute)}-${name.full}`,
    name,
    date: new Date(date),
    hour,
    minute: time.minute,
    ...(time.timeSlot ? { timeSlot: time.timeSlot } : {}),
    fourPillars,
    sajuOhaengBalance,
    combinedOhaengBalance,
    nameAnalysis,
    scores,
    grade,
    characteristics,
    description,
    imageMatches,
    context: { images, nameStyles },
  };
}

/**
 * Applies user-confirmed Hanja to results and re-derives every Hanja-dependent
 * field (name analysis text, description) through the same analysis pipeline.
 * Scores do not depend on Hanja, so ranks are kept.
 */
export function applyHanjaSelections(results: AnalysisResult[], selections: HanjaSelections): AnalysisResult[] {
  return results.map(r => {
    const name = applySelectionToName(r.name, selections[r.name.full]);
    if (name === r.name) return r;
    const next = singleAnalysis(name, r.date, r.hour, r.context.images, r.context.nameStyles,
      { minute: r.minute, timeSlot: r.timeSlot });
    next.rank = r.rank;
    return next;
  });
}

// ─── Mode A ──────────────────────────────────────────────────────────────────

export interface ModeACoverage {
  dates: number;           // civil dates in the requested range
  slots: number;           // medically permitted evaluation slots
  candidates: number;      // complete supported candidate universe (no cap)
  combinations: number;    // slots × candidates, every one scored
}

export interface ModeAEntry {
  date: string;        // YYYY-MM-DD
  timeSlot: TimeSlot;
  name: string;        // full name
  candidateIndex: number; // position in the canonical candidate order
  overall: number;
}

/** A filtered, rank-ordered view of the Mode A results. */
export interface ModeAResultView {
  length: number;
  slice(start: number, end: number): AnalysisResult[];
}

/**
 * The full Mode A ranking. Every combination is scored exactly; full result
 * objects are built on demand (identical to the eager pipeline) so a 30-day
 * schedule does not hold hundreds of thousands of objects in memory.
 */
export interface ModeAResultSet extends ModeAResultView {
  coverage: ModeACoverage;
  gradeCounts: Record<Grade, number>;
  at(position: number): AnalysisResult;
  /** Cheap identity and score of a ranked combination (no detailed result built). */
  entry(position: number): ModeAEntry;
  view(filter?: { grade?: Grade; image?: ImageType }): ModeAResultView;
}

function permittedSlots(input: ValidDesignerInput): PermittedSlot[] {
  const schedule = normalizeSchedule(input.schedule);
  const out: PermittedSlot[] = [];
  for (const iso of isoDatesBetween(input.startDate, input.endDate)) {
    const civil = parseIsoCivilDate(iso)!;
    const date = new Date(iso + 'T00:00:00');
    for (const s of buildDaySlots(civil, schedule)) {
      if (!isSlotPermitted(s.slot, schedule)) throw new Error('Internal error: slot outside the permitted window');
      out.push({ iso, date, hour: s.hour, minute: s.minute, timeSlot: s.slot });
    }
  }
  return out;
}

/**
 * Evaluates only the medically permitted slots supplied by the user. Medical
 * eligibility is a hard filter (slots outside the window are never generated);
 * it is not a scoring factor. Every candidate in the supported universe is
 * scored at every permitted slot. Throws InputValidationError for invalid input.
 */
export function analyzeModeA(rawInput: DesignerInput): ModeAResultSet {
  const input = assertValid(validateDesignerInput(rawInput));
  const nameStyles: NameStyle[] = input.nameStyles ?? [];
  const slots = permittedSlots(input);
  const names = generateCandidateNames(input);
  const ranking = rankAllCombinations(slots, names, input.images, nameStyles);
  const N = names.length;
  const cache = new Map<number, AnalysisResult>();

  const at = (position: number): AnalysisResult => {
    if (!(position >= 0 && position < ranking.order.length)) throw new RangeError(`No result at ${position}`);
    const hit = cache.get(position);
    if (hit) return hit;
    const c = ranking.order[position];
    const slot = slots[Math.floor(c / N)];
    const r = singleAnalysis(names[c % N], slot.date, slot.hour, input.images, nameStyles,
      { minute: slot.minute, timeSlot: slot.timeSlot });
    // The detailed result must reproduce the ranked score exactly.
    if (r.scores.overall !== ranking.overall[c]) throw new Error('Internal error: ranked score mismatch');
    r.rank = position + 1;
    cache.set(position, r);
    return r;
  };

  const positionsView = (positions: ArrayLike<number>): ModeAResultView => ({
    length: positions.length,
    slice: (a, b) => {
      const out: AnalysisResult[] = [];
      for (let i = Math.max(0, a); i < Math.min(b, positions.length); i++) out.push(at(positions[i]));
      return out;
    },
  });
  const rangeView = ([a, b]: [number, number]): ModeAResultView => ({
    length: b - a,
    slice: (x, y) => {
      const out: AnalysisResult[] = [];
      for (let i = a + Math.max(0, x); i < Math.min(a + y, b); i++) out.push(at(i));
      return out;
    },
  });

  const total = ranking.order.length;
  const gradeCounts = {} as Record<Grade, number>;
  for (const g of Object.keys(ranking.gradeRanges) as Grade[]) {
    const [a, b] = ranking.gradeRanges[g];
    gradeCounts[g] = b - a;
  }
  const all = rangeView([0, total]);

  const view = (filter: { grade?: Grade; image?: ImageType } = {}): ModeAResultView => {
    const range: [number, number] = filter.grade ? ranking.gradeRanges[filter.grade] : [0, total];
    if (!filter.image) return rangeView(range);
    const img = filter.image;
    const matches = names.map(n => n.char1.images.includes(img) || n.char2.images.includes(img));
    const positions: number[] = [];
    for (let i = range[0]; i < range[1]; i++) if (matches[ranking.order[i] % N]) positions.push(i);
    return positionsView(positions);
  };

  const entry = (position: number): ModeAEntry => {
    if (!(position >= 0 && position < total)) throw new RangeError(`No result at ${position}`);
    const c = ranking.order[position];
    const slot = slots[Math.floor(c / N)];
    return { date: slot.iso, timeSlot: slot.timeSlot, name: names[c % N].full, candidateIndex: c % N, overall: ranking.overall[c] };
  };

  return {
    length: total,
    slice: all.slice,
    at,
    entry,
    view,
    gradeCounts,
    coverage: { dates: new Set(slots.map(s => s.iso)).size, slots: slots.length, candidates: N, combinations: total },
  };
}

/**
 * Every Mode A result, fully built, in rank order. Intended for tests and small
 * schedules; the UI uses analyzeModeA, which builds results on demand.
 */
export function runModeAAnalysis(rawInput: DesignerInput): AnalysisResult[] {
  const set = analyzeModeA(rawInput);
  return set.slice(0, set.length);
}

// ─── Mode B ──────────────────────────────────────────────────────────────────

export function runModeBAnalysis(rawInput: ModeBInput): AnalysisResult[] {
  const input = assertValid(validateModeBInput(rawInput));
  const nameStyles: NameStyle[] = input.nameStyles ?? [];

  const designerInput: DesignerInput = {
    startDate: input.birthDate,
    endDate: input.birthDate,
    surname: input.surname,
    gender: input.gender,
    dolrimChar: input.dolrimChar,
    dolrimPosition: input.dolrimPosition,
    dolrimHanja: input.dolrimHanja,
    images: input.images,
    nameStyles,          // ← 전달
  };

  const candidates = generateCandidateNames(designerInput);
  const birthDate = new Date(input.birthDate + 'T00:00:00');

  const results: AnalysisResult[] = candidates.map(name =>
    singleAnalysis(name, birthDate, input.birthHour, input.images, nameStyles)
  );

  results.sort((a, b) => b.scores.overall - a.scores.overall);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

// ─── Mode C ──────────────────────────────────────────────────────────────────

function getChosungOhaeng(idx: number): OhaengType {
  const map: Record<number, OhaengType> = {
    0: '목', 1: '목', 2: '화', 3: '화', 4: '화', 5: '화',
    6: '수', 7: '수', 8: '수', 9: '금', 10: '금', 11: '토',
    12: '금', 13: '금', 14: '금', 15: '목', 16: '화', 17: '수', 18: '토',
  };
  return map[idx] ?? '토';
}

function makeBasicChar(hangul: string): NameCharData {
  const code = hangul.charCodeAt(0);
  let ohaeng: OhaengType = '토';
  if (code >= 0xAC00 && code <= 0xD7A3) {
    ohaeng = getChosungOhaeng(Math.floor((code - 0xAC00) / 28 / 21));
  }
  return {
    hangul,
    hanja: '?',
    meaning: '(한자 미조회)',
    ohaeng,
    yinyang: '양',
    gender: 'neutral',
    modernity: 70,
    positivity: 70,
    nameStyleFit: [],   // ← 필수 필드
    images: [],
  };
}

/**
 * Builds an evaluation name from user input. Surname and given name are kept in
 * full; no Hanja is assigned to the given name until the user selects one.
 * Returns null for invalid or ambiguous input (see parseKoreanName).
 */
export function parseRawNameToGenerated(fullName: string, gender: Gender): GeneratedName | null {
  const parsed = parseKoreanName(fullName);
  if (!parsed.ok) return null;
  const { surname, given } = parsed;

  const givenHanja = Array.from(given).map(unassignedChar);
  // Scoring profiles keep the existing behaviour: first two syllables, a
  // one-syllable name reuses its only syllable for the second profile.
  const profiles = Array.from(given).slice(0, 2)
    .map((h, i) => syncProfile(findCharByHangul(h) ?? makeBasicChar(h), givenHanja[i]));
  const char1 = profiles[0];
  const char2 = profiles[1] ?? char1;

  return {
    full: surname + given, surname, given, gender, char1, char2, nameQualityScore: 70,
    hanja: { surname: buildSurnameHanja(surname), given: givenHanja },
  };
}

export interface ModeCAnalysis {
  results: AnalysisResult[];
  rejected: { input: string; message: string }[];
}

export function analyzeModeCNames(rawInput: ModeCInput): ModeCAnalysis {
  const input = assertValid(validateModeCInput(rawInput));
  const birthDate = new Date(input.birthDate + 'T00:00:00');
  const results: AnalysisResult[] = [];
  const rejected: ModeCAnalysis['rejected'] = [];
  const seen = new Set<string>();

  for (const nameStr of input.names) {
    if (!nameStr.trim()) continue;
    const parsed = parseKoreanName(nameStr);
    if (!parsed.ok) { rejected.push({ input: nameStr, message: parsed.message }); continue; }
    const name = parseRawNameToGenerated(nameStr, input.gender)!;
    if (seen.has(name.full)) { rejected.push({ input: nameStr, message: '중복된 이름입니다' }); continue; }
    seen.add(name.full);
    results.push(singleAnalysis(name, birthDate, input.birthHour, [], []));
  }

  results.sort((a, b) => b.scores.overall - a.scores.overall);
  results.forEach((r, i) => { r.rank = i + 1; });
  return { results, rejected };
}

export function runModeCAnalysis(input: ModeCInput): AnalysisResult[] {
  return analyzeModeCNames(input).results;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

export function formatKoreanDate(date: Date): string {
  const d = new Date(date);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
}
