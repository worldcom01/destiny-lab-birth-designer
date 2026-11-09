import { AnalysisResult, FourPillars, NameHanjaModel, OhaengBalance, OhaengType } from '@/types';

// Short four-line Saju reading built only from computed values (day stem,
// Five-Elements counts, the name's pronunciation/Hanja elements). It describes
// traditional symbolism and naming conventions; it never predicts personality,
// health, development or the future.

const OHAENG_ORDER: OhaengType[] = ['목', '화', '토', '금', '수'];
const OHAENG_HANJA: Record<OhaengType, string> = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };

// Day stems (日干) with their traditional nature imagery.
const DAY_STEMS: { kr: string; hanja: string; image: string }[] = [
  { kr: '갑', hanja: '甲', image: '곧게 자라는 큰 나무' },
  { kr: '을', hanja: '乙', image: '부드럽게 뻗어 가는 풀과 덩굴' },
  { kr: '병', hanja: '丙', image: '하늘의 태양' },
  { kr: '정', hanja: '丁', image: '어둠을 밝히는 등불' },
  { kr: '무', hanja: '戊', image: '넓고 높은 산' },
  { kr: '기', hanja: '己', image: '곡식을 기르는 논밭의 흙' },
  { kr: '경', hanja: '庚', image: '단단한 쇠와 바위' },
  { kr: '신', hanja: '辛', image: '정교하게 다듬은 보석' },
  { kr: '임', hanja: '壬', image: '넓은 바다와 큰 강' },
  { kr: '계', hanja: '癸', image: '이슬과 빗물' },
];

export const READING_DISCLAIMER = '전통 명리학의 상징적 해석이며, 성격·건강·미래를 예측하지 않습니다.';

/** 이/가 particle for a Hangul word (based on the last syllable's final consonant). */
function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가';
}

const joinElements = (items: OhaengType[]) => items.join('·');

export interface SajuPart {
  dayMaster: string;     // line 1
  distribution: string;  // line 2
  weak: OhaengType[];    // elements counted as lacking (0, or the minimum count)
}

export function describeSaju(fourPillars: FourPillars, balance: OhaengBalance): SajuPart {
  const stem = DAY_STEMS[fourPillars.day.stemIndex];
  const element = fourPillars.day.stemOhaeng;
  const name = `${stem.kr}${element}(${stem.hanja}${OHAENG_HANJA[element]})`;
  const dayMaster = `${name} 일간입니다. 전통 해석에서 ${stem.kr}${element}${subjectParticle(element) === '이' ? '은' : '는'} ${stem.image}에 비유됩니다.`;

  const counts = OHAENG_ORDER.map(o => balance[o]);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const strong = OHAENG_ORDER.filter(o => balance[o] === max);
  const weak = max === min ? [] : OHAENG_ORDER.filter(o => balance[o] === min);
  const tally = OHAENG_ORDER.map(o => `${o} ${balance[o]}`).join(' · ');

  let distribution: string;
  if (weak.length === 0) {
    distribution = `${tally} — 다섯 오행이 고르게 분포합니다.`;
  } else {
    const strongText = `${joinElements(strong)}${subjectParticle(strong[strong.length - 1])} ${strong.length > 1 ? '각 ' : ''}${max}개로 가장 많고`;
    const weakText = min === 0
      ? `${joinElements(weak)}${subjectParticle(weak[weak.length - 1])} 없습니다`
      : `${joinElements(weak)}${subjectParticle(weak[weak.length - 1])} ${weak.length > 1 ? '각 ' : ''}${min}개로 가장 적습니다`;
    distribution = `${tally} — ${strongText}, ${weakText}.`;
  }
  return { dayMaster, distribution, weak };
}

/** Line 3: does the given name's pronunciation or Hanja element supply the lacking elements? */
export function describeNameRelation(
  given: string, pronunciation: OhaengType[], hanja: NameHanjaModel, weak: OhaengType[],
): string {
  const jaWon = hanja.given.map(c => c.jaWonOhaeng).filter((o): o is OhaengType => o !== null);
  const parts = [`이름 '${given}'의 발음오행은 ${joinElements(pronunciation)}`];
  if (jaWon.length > 0) parts.push(`한자 자원오행은 ${joinElements(jaWon)}`);
  const head = parts.join(', ') + '입니다.';
  if (weak.length === 0) return `${head} 사주의 오행이 고르게 분포해 전통 작명에서 따로 보완할 오행을 두지 않습니다.`;

  const supplied = weak.filter(o => pronunciation.includes(o) || jaWon.includes(o));
  if (supplied.length === 0) {
    return `${head} 사주에 적은 ${joinElements(weak)}${subjectParticle(weak[weak.length - 1])} 이름에는 없습니다. 전통 작명에서는 적은 오행을 이름으로 보완하는 것을 선호합니다.`;
  }
  return `${head} 사주에 적은 ${joinElements(weak)} 가운데 ${joinElements(supplied)}${subjectParticle(supplied[supplied.length - 1])} 이름에 들어 있어, 전통 작명에서 말하는 보완에 해당합니다.`;
}

export interface SajuReading extends SajuPart {
  nameRelation: string;  // line 3
  disclaimer: string;    // line 4
}

export function buildSajuReading(result: AnalysisResult): SajuReading {
  const saju = describeSaju(result.fourPillars, result.sajuOhaengBalance);
  return {
    ...saju,
    nameRelation: describeNameRelation(result.name.given, result.nameAnalysis.pronunciationOhaeng, result.name.hanja, saju.weak),
    disclaimer: READING_DISCLAIMER,
  };
}
