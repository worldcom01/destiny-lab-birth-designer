import { FourPillars, OhaengBalance, OhaengType, NameAnalysis, Grade, Scores, ImageType, GeneratedName, NameStyle } from '@/types';
import { getYinYangCounts } from './saju';
import { UNASSIGNED_MEANING } from './hanjaModel';

// ─── 오행 균형 점수 ─────────────────────────────────────────────────────────
export function calcOhaengBalanceScore(bal: OhaengBalance): number {
  const vals = Object.values(bal) as number[];
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  const present = vals.filter(v => v > 0).length;
  const maxRatio = Math.max(...vals) / total;
  const mean = total / 5;
  const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / 5;
  const stdNorm = Math.sqrt(variance) / mean;

  let score = present * 10;
  if (maxRatio <= 0.25) score += 30;
  else if (maxRatio <= 0.35) score += 20;
  else if (maxRatio <= 0.45) score += 10;
  if (stdNorm < 0.3) score += 20;
  else if (stdNorm < 0.6) score += 10;
  else if (stdNorm < 0.9) score += 5;
  return Math.min(score, 100);
}

// ─── 음양 조화 점수 ─────────────────────────────────────────────────────────
export function calcYinYangScore(pillars: FourPillars): number {
  const { yang, yin } = getYinYangCounts(pillars);
  const map: Record<number, number> = { 0: 100, 1: 85, 2: 60, 3: 35, 4: 10, 5: 0, 6: 0, 7: 0, 8: 0 };
  return map[Math.abs(yang - yin)] ?? 0;
}

// ─── 이름-사주 오행 조화 점수 ───────────────────────────────────────────────
export function calcNameHarmonyScore(sajuBal: OhaengBalance, nameBal: OhaengBalance): number {
  const total = Object.values(sajuBal).reduce((a, b) => a + b, 0);
  if (total === 0) return 50;
  let score = 50;
  for (const k of Object.keys(sajuBal) as OhaengType[]) {
    const ratio = sajuBal[k] / total;
    const nameCount = nameBal[k];
    if (ratio < 0.1 && nameCount > 0) score += 18;
    else if (ratio < 0.2 && nameCount > 0) score += 10;
    else if (ratio > 0.4 && nameCount > 0) score -= 12;
    else score += 3;
  }
  return Math.max(0, Math.min(score, 100));
}

// ─── 글자 수·음절 현대성 (field name hanjaQuality is historical) ─────────────
// Uses only the syllable count and the Hangul syllables' modernity index; the
// selected Hanja (meaning, strokes) is not an input.
export function calcHanjaScore(nameAnalysis: NameAnalysis): number {
  return Math.round((nameAnalysis.readabilityScore + nameAnalysis.modernityScore) / 2);
}

// ─── 현대 이름 선호도 (20%) ─────────────────────────────────────────────────
// Internal syllable modernity index (no documented source, not empirically
// validated; see docs/scoring.md) + style matching bonus
export function calcModernPreference(
  name: GeneratedName,
  nameStyles: NameStyle[],
): number {
  // 글자별 현대성 점수 (뒷 글자가 이름 인상을 더 많이 결정)
  const charModernity = name.char1.modernity * 0.40 + name.char2.modernity * 0.60;

  // 스타일 부합 보너스
  let styleBonus = 0;
  if (nameStyles.length > 0) {
    for (const style of nameStyles) {
      if (name.char1.nameStyleFit?.includes(style)) styleBonus += 12;
      if (name.char2.nameStyleFit?.includes(style)) styleBonus += 12;
    }
    styleBonus = Math.min(styleBonus, 24);
  }

  return Math.min(Math.round(charModernity + styleBonus * 0.5), 100);
}

// ─── 발음 자연스러움 (10%) ──────────────────────────────────────────────────
// 초성 다양성, 모음 개방성, 받침 패턴 분석

function decomposeHangul(char: string) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  const offset = code - 0xAC00;
  return { cho: Math.floor(offset / 28 / 21), jung: Math.floor(offset / 28) % 21, jong: offset % 28 };
}

// 초성 → 발음 계열 (비슷한 것끼리 묶음)
const CHO_FAMILY: Record<number, number> = {
  0: 0, 1: 0,             // ㄱ,ㄲ → 아음
  2: 1, 3: 1, 4: 1, 5: 1, 16: 1, // ㄴ,ㄷ,ㄸ,ㄹ,ㅌ → 설음
  6: 2, 7: 2, 8: 2, 17: 2,       // ㅁ,ㅂ,ㅃ,ㅍ → 순음
  9: 3, 10: 3, 12: 3, 13: 3, 14: 3, 15: 3, // ㅅ,ㅆ,ㅈ,ㅉ,ㅊ,ㅋ → 치음
  11: 4, 18: 4,           // ㅇ,ㅎ → 후음
};

// 개방 모음 (아,야,어,여,오,요,우,유,에,예 계열)
const OPEN_VOWEL = new Set([0, 2, 4, 6, 8, 10, 12, 13, 18, 19]);

export function calcPronunciationNaturalness(given: string): number {
  const chars = given.split('');
  const decomposed = chars.map(decomposeHangul).filter(Boolean);
  if (decomposed.length < 2) return 75;

  let score = 80;

  const [d1, d2] = decomposed as NonNullable<ReturnType<typeof decomposeHangul>>[];

  // 서로 다른 초성 계열이면 유창성 향상
  const fam1 = CHO_FAMILY[d1.cho] ?? 9;
  const fam2 = CHO_FAMILY[d2.cho] ?? 9;
  if (fam1 !== fam2) score += 12;
  else score -= 8; // 같은 계열: 어색

  // 개방 모음으로 끝나면 발음이 밝고 현대적
  if (OPEN_VOWEL.has(d2.jung)) score += 8;

  // 끝 글자에 받침 없으면 현대적 느낌 (서아, 시우, 지호 등)
  if (d2.jong === 0) score += 8;
  else if (d2.jong <= 4) score += 2; // 가벼운 받침 (ㄴ,ㄱ 등)

  // 후음(ㅇ,ㅎ)으로 시작하는 글자가 있으면 부드러운 느낌
  if (fam1 === 4 || fam2 === 4) score += 4;

  return Math.max(0, Math.min(score, 100));
}

// ─── 종합 점수 계산 (새 가중치) ─────────────────────────────────────────────
//
// 사주 적합도  40% = 오행균형(40%) + 음양(25%) + 이름-사주 조화(35%)
// 성명학       20% = 발음안정성(50%) + 한자품질(50%)
// 오행 균형    10%
// 현대 선호도  20%  ← 대폭 상향
// 발음 자연스러움 10%  ← 신규
//
export function calcAllScores(
  pillars: FourPillars,
  sajuBal: OhaengBalance,
  nameAnalysis: NameAnalysis,
  name: GeneratedName,
  nameStyles: NameStyle[] = [],
): Scores {
  // 사주 적합도 하위 점수
  const sajuOhaengBalance = calcOhaengBalanceScore(sajuBal);
  const yinYangHarmony = calcYinYangScore(pillars);
  const nameHarmony = calcNameHarmonyScore(sajuBal, nameAnalysis.nameOhaengBalance);

  // 성명학 하위 점수
  const pronunciationStability = nameAnalysis.pronunciationScore;
  const hanjaQuality = calcHanjaScore(nameAnalysis);

  // 오행 균형 (통합)
  const ohaengBalance = calcOhaengBalanceScore(sajuBal);

  // 현대 선호도 (20%)
  const modernPreference = calcModernPreference(name, nameStyles);

  // 발음 자연스러움 (10%)
  const pronunciationNaturalness = calcPronunciationNaturalness(name.given);

  // 이미지 부합
  const imageMatch = nameAnalysis.imageMatchScore;

  const overall = combineOverall(
    sajuOhaengBalance, yinYangHarmony, nameHarmony,
    pronunciationStability, hanjaQuality, ohaengBalance,
    modernPreference, pronunciationNaturalness,
  );

  return {
    sajuOhaengBalance,
    yinYangHarmony,
    nameHarmony,
    pronunciationStability,
    hanjaQuality,
    modernPreference,
    pronunciationNaturalness,
    modernUsability: modernPreference,  // legacy alias
    imageMatch,
    overall,
  };
}

/**
 * The overall score from its sub-scores. This is the single definition of the
 * final formula: calcAllScores and the Mode A optimizer both call it, so every
 * ranked score is bit-for-bit the same number (same operation order).
 */
export function combineOverall(
  sajuOhaengBalance: number,
  yinYangHarmony: number,
  nameHarmony: number,
  pronunciationStability: number,
  hanjaQuality: number,
  ohaengBalance: number,
  modernPreference: number,
  pronunciationNaturalness: number,
): number {
  const sajuScore = sajuOhaengBalance * 0.40 + yinYangHarmony * 0.25 + nameHarmony * 0.35;
  const sungmyungScore = pronunciationStability * 0.50 + hanjaQuality * 0.50;
  return Math.round(
    sajuScore             * 0.40 +
    sungmyungScore        * 0.20 +
    ohaengBalance         * 0.10 +
    modernPreference      * 0.20 +
    pronunciationNaturalness * 0.10
  );
}

export function getGrade(overall: number): Grade {
  if (overall >= 87) return 'SS';
  if (overall >= 75) return 'S';
  if (overall >= 60) return 'A';
  if (overall >= 45) return 'B';
  return 'C';
}

/**
 * Selected styles that the name's characters are actually classified under
 * (nameStyleFit). Only these may be labelled "○○ 적합" or "○○ 스타일에 어울리는";
 * a selected style the name does not fit is never claimed.
 */
export function stylesFittingName(name: GeneratedName, nameStyles: NameStyle[]): NameStyle[] {
  return nameStyles.filter(s => name.char1.nameStyleFit?.includes(s) || name.char2.nameStyleFit?.includes(s));
}

// ─── 특징 태그 ──────────────────────────────────────────────────────────────
export function getCharacteristics(
  pillars: FourPillars,
  sajuBal: OhaengBalance,
  nameAnalysis: NameAnalysis,
  imageMatches: ImageType[],
  nameStyles: NameStyle[] = [],
): string[] {
  const tags: string[] = [];
  const total = Object.values(sajuBal).reduce((a, b) => a + b, 0) || 1;
  const sorted = (Object.entries(sajuBal) as [OhaengType, number][]).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const dominantRatio = sorted[0][1] / total;
  const present = Object.values(sajuBal).filter(v => v > 0).length;

  const ohaengTraits: Record<OhaengType, string> = {
    목: '목 기운 중심(생장 상징)', 화: '화 기운 중심(표현 상징)',
    토: '토 기운 중심(조화 상징)', 금: '금 기운 중심(결실 상징)', 수: '수 기운 중심(지혜 상징)',
  };

  // Tags state facts about the saju and the name's characters; they make no
  // suitability or outcome claim.
  if (dominantRatio > 0.3) tags.push(ohaengTraits[dominant]);
  if (present === 5) tags.push('사주 오행 5종 모두 있음');
  else if (present === 4) tags.push('사주 오행 4종');

  const { yang, yin } = getYinYangCounts(pillars);
  if (Math.abs(yang - yin) <= 2) tags.push(`사주 음양 ${yang}:${yin}`);

  // Only styles/images the name's characters are classified under (see stylesFittingName).
  for (const style of nameStyles.slice(0, 2)) tags.push(`${style} 분류 글자 포함`);
  if (nameStyles.length === 0) {
    for (const img of imageMatches.slice(0, 2)) tags.push(`${img} 분류 글자 포함`);
  }

  const firstOhaeng = nameAnalysis.pronunciationOhaeng[0];
  if (firstOhaeng) tags.push(`첫 소리 발음오행 ${firstOhaeng}`);

  return tags.slice(0, 5);
}

// ─── 설명 생성 ───────────────────────────────────────────────────────────────
export function generateDescription(
  pillars: FourPillars,
  sajuBal: OhaengBalance,
  nameAnalysis: NameAnalysis,
  imageMatches: ImageType[],
  nameStyles: NameStyle[] = [],
): string {
  const sorted = (Object.entries(sajuBal) as [OhaengType, number][]).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const present = Object.values(sajuBal).filter(v => v > 0).length;

  const descs: Record<OhaengType, string> = {
    목: '전통 해석에서 이 사주의 중심 기운인 목(木)은 생장과 어짊을 상징합니다',
    화: '전통 해석에서 이 사주의 중심 기운인 화(火)는 밝음과 표현을 상징합니다',
    토: '전통 해석에서 이 사주의 중심 기운인 토(土)는 중심과 믿음을 상징합니다',
    금: '전통 해석에서 이 사주의 중심 기운인 금(金)은 결실과 의로움을 상징합니다',
    수: '전통 해석에서 이 사주의 중심 기운인 수(水)는 저장과 지혜를 상징합니다',
  };

  const balanceText = present >= 4
    ? '전통적 오행 해석에서는 이러한 분포를 균형 있는 구성으로 봅니다. '
    : '전통적 오행 해석에서는 특정 오행이 두드러진 구성으로 봅니다. ';

  const styleText = nameStyles.length > 0
    ? `선택하신 '${nameStyles[0]}' 스타일로 분류된 글자가 들어 있습니다(현대 선호도 가산 대상). `
    : imageMatches.length > 0
      ? `선택하신 '${imageMatches[0]}' 이미지로 분류된 글자가 들어 있습니다(종합 점수에는 반영되지 않음). `
      : '';

  // Only Hanja that are actually assigned contribute a meaning sentence.
  const assignedMeanings = nameAnalysis.meanings.filter(m => m !== UNASSIGNED_MEANING);
  const hanjaSentence = assignedMeanings.length === 0
    ? ''
    : `이름 ${nameAnalysis.hanja}(${nameAnalysis.given})은 ` + assignedMeanings
      .map(m => m.split(' — ')[1] ?? m)
      .join('·')
      .substring(0, 20) + '의 뜻을 지닌 한자입니다(뜻은 점수에 반영되지 않음). ';

  return `${balanceText}${styleText}${hanjaSentence}${descs[dominant] ?? '균형 잡힌 사주 구조입니다'}. 전통 명리학·현대 선호도를 함께 고려한 참고 분석입니다.`;
}
