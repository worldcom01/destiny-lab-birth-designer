import { OhaengType, OhaengBalance, NameAnalysis, ImageType } from '@/types';
import { GeneratedName } from '@/types';

const CHOSUNG_OHAENG: Record<number, OhaengType> = {
  0: '목', 1: '목',           // ㄱ, ㄲ
  2: '화', 3: '화', 4: '화', 5: '화', // ㄴ, ㄷ, ㄸ, ㄹ
  6: '수', 7: '수', 8: '수',  // ㅁ, ㅂ, ㅃ
  9: '금', 10: '금', 11: '토', // ㅅ, ㅆ, ㅇ
  12: '금', 13: '금', 14: '금', // ㅈ, ㅉ, ㅊ
  15: '목', 16: '화', 17: '수', 18: '토', // ㅋ, ㅌ, ㅍ, ㅎ
};

const JONGSUNG_CHO_MAP: Record<number, number> = {
  0: -1, 1: 0, 2: 0, 3: 0, 4: 2, 5: 2, 6: 2,
  7: 3, 8: 5, 9: 5, 10: 5, 11: 5, 12: 5, 13: 5, 14: 5, 15: 5,
  16: 6, 17: 7, 18: 7, 19: 9, 20: 9, 21: 11, 22: 12,
  23: 14, 24: 15, 25: 16, 26: 17, 27: 18,
};

function decomposeHangul(char: string) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  const offset = code - 0xAC00;
  return {
    cho: Math.floor(offset / 28 / 21),
    jung: Math.floor(offset / 28) % 21,
    jong: offset % 28,
  };
}

function getChosungOhaeng(idx: number): OhaengType {
  return CHOSUNG_OHAENG[idx] ?? '토';
}

export function analyzeNameFromGenerated(
  name: GeneratedName,
  images: ImageType[],
): NameAnalysis {
  const given = name.given;
  const pronunciationOhaeng: OhaengType[] = [];
  const ohaengBalance: OhaengBalance = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const hasJongsung: boolean[] = [];

  for (const char of given.split('')) {
    const d = decomposeHangul(char);
    if (!d) continue;
    const cho = getChosungOhaeng(d.cho);
    pronunciationOhaeng.push(cho);
    ohaengBalance[cho]++;
    hasJongsung.push(d.jong !== 0);
    // 종성도 포함
    if (d.jong !== 0) {
      const jongCho = JONGSUNG_CHO_MAP[d.jong];
      if (jongCho >= 0) ohaengBalance[getChosungOhaeng(jongCho)]++;
    }
  }

  // 발음 안정성 점수
  let pronunciationScore = 100;
  for (const char of given.split('')) {
    const d = decomposeHangul(char);
    if (!d) continue;
    if ([1, 4, 8, 10, 13].includes(d.cho)) pronunciationScore -= 18; // 된소리
    if ([14, 15, 16, 17].includes(d.cho)) pronunciationScore -= 7;   // 거센소리
  }
  pronunciationScore = Math.max(pronunciationScore, 0);

  // 이름 사용성 점수 (2자 이름 최적)
  const syllableCount = given.length;
  const readabilityScore = syllableCount === 2 ? 100 : syllableCount === 3 ? 85 : 65;

  // 현대성 점수
  const modernityScore = Math.round((name.char1.modernity + name.char2.modernity) / 2);

  // 이미지 부합 점수
  let imageMatchScore = 50;
  if (images.length > 0) {
    let count = 0;
    for (const img of images) {
      if (name.char1.images.includes(img)) count++;
      if (name.char2.images.includes(img)) count++;
    }
    imageMatchScore = Math.min(50 + count * 15, 100);
  }

  // 한자 및 의미 조합
  const hanja = `${name.char1.hanja}${name.char2.hanja}`;
  const meanings = [name.char1.meaning, name.char2.meaning];

  return {
    name: name.full,
    given,
    pronunciationOhaeng,
    nameOhaengBalance: ohaengBalance,
    hanja,
    meanings,
    rhythmScore: readabilityScore,
    pronunciationScore,
    readabilityScore,
    modernityScore,
    imageMatchScore,
  };
}

export function combineOhaengBalances(a: OhaengBalance, b: OhaengBalance): OhaengBalance {
  return {
    목: a.목 + b.목,
    화: a.화 + b.화,
    토: a.토 + b.토,
    금: a.금 + b.금,
    수: a.수 + b.수,
  };
}
