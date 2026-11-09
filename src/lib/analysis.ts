import {
  DesignerInput, ModeBInput, ModeCInput,
  AnalysisResult, GeneratedName, NameCharData,
  OhaengType, ImageType, Gender, NameStyle, TimeSlot,
} from '@/types';
import { calculateFourPillars, getSajuOhaengBalance } from './saju';
import { parseIsoCivilDate } from './calendar';
import { assertValid, validateDesignerInput, validateModeBInput, validateModeCInput } from './inputValidation';
import { buildDaySlots, isSlotPermitted, isoDatesBetween, normalizeSchedule } from './schedule';
import { analyzeNameFromGenerated, combineOhaengBalances } from './sungmyung';
import { calcAllScores, getGrade, getCharacteristics, generateDescription, stylesFittingName } from './scoring';
import { generateCandidateNames, getImageMatchFromName } from './nameGenerator';
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

/**
 * Evaluates only the medically permitted slots supplied by the user. Medical
 * eligibility is a hard filter (slots outside the window are never generated);
 * it is not a scoring factor. Throws InputValidationError for invalid input.
 */
export function runModeAAnalysis(rawInput: DesignerInput): AnalysisResult[] {
  const input = assertValid(validateDesignerInput(rawInput));
  const schedule = normalizeSchedule(input.schedule);
  const candidates = generateCandidateNames(input);
  const nameStyles: NameStyle[] = input.nameStyles ?? [];
  const results: AnalysisResult[] = [];

  for (const iso of isoDatesBetween(input.startDate, input.endDate)) {
    const civil = parseIsoCivilDate(iso)!;
    const date = new Date(iso + 'T00:00:00');
    for (const s of buildDaySlots(civil, schedule)) {
      if (!isSlotPermitted(s.slot, schedule)) throw new Error('Internal error: slot outside the permitted window');
      for (const name of candidates) {
        results.push(singleAnalysis(name, date, s.hour, input.images, nameStyles, { minute: s.minute, timeSlot: s.slot }));
      }
    }
  }

  results.sort((a, b) => b.scores.overall - a.scores.overall);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
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
