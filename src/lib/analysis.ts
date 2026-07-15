import {
  DesignerInput, ModeBInput, ModeCInput,
  AnalysisResult, GeneratedName, NameCharData,
  OhaengType, ImageType, Gender, NameStyle,
} from '@/types';
import { calculateFourPillars, getSajuOhaengBalance, getAnalysisHours } from './saju';
import { analyzeNameFromGenerated, combineOhaengBalances } from './sungmyung';
import { calcAllScores, getGrade, getCharacteristics, generateDescription } from './scoring';
import { generateCandidateNames, getImageMatchFromName } from './nameGenerator';
import { findCharByHangul } from '@/data/nameChars';

// ─── 공통 헬퍼 ───────────────────────────────────────────────────────────────

function singleAnalysis(
  name: GeneratedName,
  date: Date,
  hour: number,
  images: ImageType[],
  nameStyles: NameStyle[] = [],
): AnalysisResult {
  const fourPillars = calculateFourPillars(date, hour);
  const sajuOhaengBalance = getSajuOhaengBalance(fourPillars);
  const nameAnalysis = analyzeNameFromGenerated(name, images);
  const combinedOhaengBalance = combineOhaengBalances(sajuOhaengBalance, nameAnalysis.nameOhaengBalance);
  const imageMatches = getImageMatchFromName(name, images);

  // 신규: name + nameStyles 파라미터 전달
  const scores = calcAllScores(fourPillars, sajuOhaengBalance, nameAnalysis, name, nameStyles);
  const grade = getGrade(scores.overall);
  const characteristics = getCharacteristics(fourPillars, sajuOhaengBalance, nameAnalysis, imageMatches, nameStyles);
  const description = generateDescription(fourPillars, sajuOhaengBalance, nameAnalysis, imageMatches, nameStyles);

  return {
    id: `${date.toISOString().split('T')[0]}-${hour}-${name.given}`,
    name,
    date: new Date(date),
    hour,
    fourPillars,
    sajuOhaengBalance,
    combinedOhaengBalance,
    nameAnalysis,
    scores,
    grade,
    characteristics,
    description,
    imageMatches,
  };
}

// ─── Mode A ──────────────────────────────────────────────────────────────────

export function runModeAAnalysis(input: DesignerInput): AnalysisResult[] {
  const candidates = generateCandidateNames(input);
  const hours = getAnalysisHours(input.analysisLevel);
  const nameStyles: NameStyle[] = input.nameStyles ?? [];
  const results: AnalysisResult[] = [];

  const start = new Date(input.startDate + 'T00:00:00');
  const end   = new Date(input.endDate   + 'T00:00:00');

  const current = new Date(start);
  while (current <= end) {
    for (const hour of hours) {
      for (const name of candidates) {
        results.push(singleAnalysis(name, current, hour, input.images, nameStyles));
      }
    }
    current.setDate(current.getDate() + 1);
  }

  results.sort((a, b) => b.scores.overall - a.scores.overall);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

// ─── Mode B ──────────────────────────────────────────────────────────────────

export function runModeBAnalysis(input: ModeBInput): AnalysisResult[] {
  const nameStyles: NameStyle[] = input.nameStyles ?? [];

  const designerInput: DesignerInput = {
    startDate: input.birthDate,
    endDate: input.birthDate,
    surname: input.surname,
    gender: input.gender,
    dolrimChar: input.dolrimChar,
    dolrimPosition: input.dolrimPosition,
    images: input.images,
    nameStyles,          // ← 전달
    analysisLevel: '정밀',
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

export function parseRawNameToGenerated(fullName: string, gender: Gender): GeneratedName | null {
  const trimmed = fullName.trim();
  if (trimmed.length < 2) return null;

  const surname = trimmed.slice(0, 1);
  const given = trimmed.slice(1);
  if (!given) return null;

  const chars = given.split('');
  const char1 = findCharByHangul(chars[0]) ?? makeBasicChar(chars[0]);
  const char2 = chars[1] ? (findCharByHangul(chars[1]) ?? makeBasicChar(chars[1])) : char1;

  return { full: trimmed, surname, given, gender, char1, char2, nameQualityScore: 70 };
}

export function runModeCAnalysis(input: ModeCInput): AnalysisResult[] {
  const birthDate = new Date(input.birthDate + 'T00:00:00');
  const results: AnalysisResult[] = [];

  for (const nameStr of input.names) {
    if (!nameStr.trim()) continue;
    const name = parseRawNameToGenerated(nameStr, input.gender);
    if (!name) continue;
    results.push(singleAnalysis(name, birthDate, input.birthHour, [], []));
  }

  results.sort((a, b) => b.scores.overall - a.scores.overall);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

export function formatKoreanDate(date: Date): string {
  const d = new Date(date);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
}
