import { DesignerInput, GeneratedName, ImageType, OhaengType, NameCharData, NameStyle } from '@/types';
import { getCharsByGender, findDolrimChar } from '@/data/nameChars';
import { buildSurnameHanja, confirmedChar, suggestedCharFromProfile, syncProfile } from './hanjaModel';

// ─── 이름 스타일 → 오행 선호 매핑 ───────────────────────────────────────────
const STYLE_OHAENG_WEIGHTS: Record<NameStyle, Record<OhaengType, number>> = {
  '현대형':      { 목: 1.2, 화: 1.2, 토: 1.0, 금: 1.5, 수: 1.2 },
  '전통형':      { 목: 1.0, 화: 1.0, 토: 2.0, 금: 1.5, 수: 1.5 },
  '고급형':      { 목: 1.0, 화: 1.0, 토: 1.5, 금: 2.5, 수: 1.0 },
  '지적인 느낌': { 목: 1.5, 화: 1.0, 토: 1.0, 금: 2.0, 수: 2.5 },
  '부드러운 느낌':{ 목: 1.5, 화: 1.5, 토: 2.0, 금: 1.0, 수: 2.0 },
  '리더형':      { 목: 1.0, 화: 2.5, 토: 1.5, 금: 2.0, 수: 1.0 },
  '글로벌형':    { 목: 1.5, 화: 1.5, 토: 1.0, 금: 2.0, 수: 2.5 },
  '예술형':      { 목: 2.5, 화: 2.0, 토: 1.0, 금: 1.0, 수: 1.5 },
};


// ─── 이름 품질 사전 점수 (사주 분석 전 필터링용) ────────────────────────────
// 새 가중치:
//   현대 선호도 35%  ← 핵심 변화
//   스타일 부합 25%
//   의미 긍정성 20%
//   오행/음양 다양성 10%
//   발음 자연스러움 10%
function calcNameQuality(
  char1: NameCharData,
  char2: NameCharData,
  images: ImageType[],
  nameStyles: NameStyle[],
): number {
  let score = 0;

  // 1. 현대 이름 선호도 (35%): 뒷 글자가 이름 인상을 더 많이 결정
  const modernityScore = char1.modernity * 0.40 + char2.modernity * 0.60;
  score += modernityScore * 0.35;

  // 2. 스타일 부합도 (25%)
  let styleScore = 50;
  if (nameStyles.length > 0) {
    let matches = 0;
    for (const style of nameStyles) {
      if (char1.nameStyleFit?.includes(style)) matches += 20;
      if (char2.nameStyleFit?.includes(style)) matches += 20;
    }
    styleScore = Math.min(100, 50 + matches);
    // 오행 스타일 가중치 보너스
    const w1 = nameStyles.reduce((s, st) => s + (STYLE_OHAENG_WEIGHTS[st][char1.ohaeng] ?? 1), 0) / nameStyles.length;
    const w2 = nameStyles.reduce((s, st) => s + (STYLE_OHAENG_WEIGHTS[st][char2.ohaeng] ?? 1), 0) / nameStyles.length;
    styleScore = Math.min(100, styleScore + (w1 + w2 - 2) * 5);
  } else if (images.length > 0) {
    let imageMatch = 0;
    for (const img of images) {
      if (char1.images.includes(img)) imageMatch += 20;
      if (char2.images.includes(img)) imageMatch += 20;
    }
    styleScore = Math.min(100, 50 + imageMatch);
  }
  score += styleScore * 0.25;

  // 3. 의미 긍정성 (20%)
  score += (char1.positivity + char2.positivity) / 2 * 0.20;

  // 4. 오행·음양 다양성 (10%)
  if (char1.yinyang !== char2.yinyang) score += 5;
  if (char1.ohaeng !== char2.ohaeng) score += 5;

  // 5. 발음 자연스러움 보너스/페널티 (10%)
  const nat = calcSimplePairNaturalness(char1.hangul, char2.hangul);
  score += nat * 0.10;

  return Math.min(Math.round(score), 100);
}

// 간단 발음 자연스러움 (초성 계열 다양성)
function calcSimplePairNaturalness(h1: string, h2: string): number {
  const getFamily = (h: string) => {
    const code = h.charCodeAt(0);
    if (code < 0xAC00) return -1;
    const cho = Math.floor((code - 0xAC00) / 28 / 21);
    const families = [0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 3, 3, 3, 3, 1, 2, 4];
    return families[cho] ?? -1;
  };
  const getJong = (h: string) => (h.charCodeAt(0) - 0xAC00) % 28;
  const f1 = getFamily(h1), f2 = getFamily(h2);
  let score = 70;
  if (f1 !== f2 && f1 >= 0 && f2 >= 0) score += 15;
  if (getJong(h2) === 0) score += 10; // 열린 음절
  if (f2 === 4) score += 5; // ㅇ/ㅎ 계열 = 부드러움
  return Math.min(score, 100);
}

// 발음 충돌 검사
function hasPronunciationConflict(h1: string, h2: string): boolean {
  const code1 = h1.charCodeAt(0), code2 = h2.charCodeAt(0);
  if (code1 < 0xAC00 || code2 < 0xAC00) return false;
  const cho1 = Math.floor((code1 - 0xAC00) / 28 / 21);
  const cho2 = Math.floor((code2 - 0xAC00) / 28 / 21);
  if (cho1 === cho2) return true;
  const hard = [[0, 15], [3, 16], [7, 17], [9, 14], [12, 13]];
  return hard.some(([a, b]) => (cho1 === a && cho2 === b) || (cho1 === b && cho2 === a));
}

// ─── 한국식 이름 규칙 검증 ───────────────────────────────────────────────────
// 규칙: 이름 글자는 반드시 Sino-Korean 음독(音讀)이어야 함.
//       한자의 훈(뜻)을 그대로 이름으로 사용하는 것을 방지.
//       ex) '빛' (炳의 훈) → 금지 / '병' (炳의 음독) → 허용
//
// 검증 방법: nameChars.ts DB에 등록된 글자만 사용 (DB 자체가 음독 기준으로 관리)
// 외부 dolrimChar 입력 시, 한글 전용 단어 필터로 2차 방어
const HANGUL_ONLY_WORDS = new Set([
  '빛', '봄', '여름', '가을', '겨울', '하늘', '바람', '구름', '별빛', '달빛',
  '새벽', '노을', '무지개', '미소', '행복', '사랑', '기쁨', '보람', '슬기',
]);

export function isValidNameChar(hangul: string): boolean {
  // 2자 이상 순 우리말 단어 차단
  if (HANGUL_ONLY_WORDS.has(hangul)) return false;
  // 한 글자이고 완성형 한글이면 허용 (DB에 있는 글자)
  const code = hangul.charCodeAt(0);
  return hangul.length === 1 && code >= 0xAC00 && code <= 0xD7A3;
}

// ─── 후보 이름 생성 ──────────────────────────────────────────────────────────
/**
 * The complete supported candidate universe for Mode A/B (two-syllable given
 * names). Every name that passes the documented hard filters is returned; there
 * is no pre-selection cap (see docs/optimization.md):
 *  - both syllables from the gender pool in nameChars.ts, or the generational
 *    character plus one pool syllable in the requested position(s);
 *  - the two syllables differ, have different initials and no listed initial clash;
 *  - average modernity >= 35;
 *  - each given name once.
 */
export function generateCandidateNames(input: DesignerInput): GeneratedName[] {
  const genderKey = input.gender === '남' ? 'male' : 'female';
  const charPool = getCharsByGender(genderKey);
  const nameStyles: NameStyle[] = input.nameStyles ?? [];
  const results: GeneratedName[] = [];

  // 돌림자 검증: 순 우리말 단어(훈)는 이름에 사용 불가
  // Invalid constraints are rejected, never silently dropped (see classifyDolrim).
  const rawDolrim = input.dolrimChar?.trim() ?? '';
  if (rawDolrim && !isValidNameChar(rawDolrim)) {
    throw new RangeError(`Invalid generational character: ${rawDolrim}`);
  }
  const dolrimData = rawDolrim
    ? findDolrimChar(rawDolrim) ?? {
        hangul: rawDolrim,
        hanja: '?',
        meaning: '돌림자',
        ohaeng: '토' as OhaengType,
        yinyang: '양' as const,
        gender: 'neutral' as const,
        modernity: 80,
        positivity: 80,
        nameStyleFit: [] as NameStyle[],
        images: [] as ImageType[],
      }
    : null;

  // Canonical Hanja of the generational character: the user's confirmed choice,
  // otherwise the profile's suggestion. An incompatible confirmed choice is an error.
  let dolrimHanja = dolrimData ? suggestedCharFromProfile(dolrimData) : null;
  if (input.dolrimHanja) {
    const confirmed = dolrimData ? confirmedChar(dolrimData.hangul, input.dolrimHanja) : null;
    if (!confirmed) throw new RangeError(`Generational Hanja ${input.dolrimHanja} does not match ${rawDolrim || '(none)'}`);
    dolrimHanja = confirmed;
  }
  const surnameHanja = buildSurnameHanja(input.surname);

  const seen = new Set<string>();

  const addName = (char1: NameCharData, char2: NameCharData) => {
    const given = char1.hangul + char2.hangul;
    const full = input.surname + given;
    if (seen.has(given)) return;
    if (hasPronunciationConflict(char1.hangul, char2.hangul)) return;

    // 현대 선호도 하한 필터: modernity < 35는 제외 (너무 구식)
    const avgModernity = (char1.modernity + char2.modernity) / 2;
    if (avgModernity < 35) return;

    seen.add(given);
    const quality = calcNameQuality(char1, char2, input.images, nameStyles);
    const h1 = char1 === dolrimData && dolrimHanja ? dolrimHanja : suggestedCharFromProfile(char1);
    const h2 = char2 === dolrimData && dolrimHanja ? dolrimHanja : suggestedCharFromProfile(char2);
    results.push({
      full, surname: input.surname, given, gender: input.gender,
      char1: syncProfile(char1, h1), char2: syncProfile(char2, h2),
      nameQualityScore: quality,
      hanja: { surname: surnameHanja, given: [h1, h2] },
    });
  };

  if (dolrimData) {
    for (const ch of charPool) {
      if (ch.hangul === input.dolrimChar) continue;
      if (input.dolrimPosition === 'first' || input.dolrimPosition === 'auto') addName(dolrimData, ch);
      if (input.dolrimPosition === 'second' || input.dolrimPosition === 'auto') addName(ch, dolrimData);
    }
  } else {
    for (let i = 0; i < charPool.length; i++) {
      for (let j = 0; j < charPool.length; j++) {
        if (i === j) continue;
        addName(charPool[i], charPool[j]);
      }
    }
  }

  // Canonical order: pre-score descending, ties in generation order (stable sort).
  // This order is only a deterministic tie-break; it never removes a candidate.
  results.sort((a, b) => b.nameQualityScore - a.nameQualityScore);
  return results;
}

// ─── 이미지/스타일 매칭 ──────────────────────────────────────────────────────
export function getImageMatchFromName(name: GeneratedName, images: ImageType[]): ImageType[] {
  if (images.length === 0) return [];
  return images.filter(img => name.char1.images.includes(img) || name.char2.images.includes(img));
}
