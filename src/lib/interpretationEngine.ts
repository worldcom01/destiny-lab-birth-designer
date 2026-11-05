import { OhaengBalance, OhaengType, AnalysisResult } from '@/types';
import { getYinYangCounts } from './saju';

export interface FullInterpretation {
  personality: string;
  strengths: string;
  growth: string;
  learning: string;
  relationships: string;
  leadership: string;
  creativity: string;
  summary: string;
}

// The texts describe traditional Five-Elements (오행) symbolism only. They do not
// state or predict a child's personality, abilities, development, health or
// future outcomes.

const PERSONALITY: Record<OhaengType, string> = {
  목: `전통 오행 해석에서 목(木)은 봄과 생장을 상징하며, 성품으로는 어짊(仁)과 위로 곧게 뻗어 나가는 기운에 비유됩니다. 목 기운이 두드러진 구성은 전통적으로 성장과 변화의 이미지와 연결해 설명합니다.`,
  화: `전통 오행 해석에서 화(火)는 여름과 밝음을 상징하며, 성품으로는 예(禮)와 밖으로 퍼져 나가는 기운에 비유됩니다. 화 기운이 두드러진 구성은 전통적으로 표현과 활기의 이미지와 연결해 설명합니다.`,
  토: `전통 오행 해석에서 토(土)는 계절의 전환과 중심을 상징하며, 성품으로는 믿음(信)과 포용하는 기운에 비유됩니다. 토 기운이 두드러진 구성은 전통적으로 안정과 조화의 이미지와 연결해 설명합니다.`,
  금: `전통 오행 해석에서 금(金)은 가을과 결실을 상징하며, 성품으로는 의로움(義)과 단단히 거두어들이는 기운에 비유됩니다. 금 기운이 두드러진 구성은 전통적으로 원칙과 정돈의 이미지와 연결해 설명합니다.`,
  수: `전통 오행 해석에서 수(水)는 겨울과 저장을 상징하며, 성품으로는 지혜(智)와 낮은 곳으로 흐르는 기운에 비유됩니다. 수 기운이 두드러진 구성은 전통적으로 사색과 유연함의 이미지와 연결해 설명합니다.`,
};

const STRENGTHS: Record<OhaengType, string> = {
  목: `전통 해석에서 목의 덕목으로는 새로움을 틔우는 생동감과 너그러움이 꼽힙니다.`,
  화: `전통 해석에서 화의 덕목으로는 밝게 드러내는 표현력과 예의가 꼽힙니다.`,
  토: `전통 해석에서 토의 덕목으로는 중심을 지키는 신뢰와 포용이 꼽힙니다.`,
  금: `전통 해석에서 금의 덕목으로는 옳고 그름을 가리는 결단과 절제가 꼽힙니다.`,
  수: `전통 해석에서 수의 덕목으로는 깊이 헤아리는 지혜와 유연함이 꼽힙니다.`,
};

const GROWTH: Record<OhaengType, string> = {
  목: `오행 상생 관계에서 목은 수(水)의 도움을 받아 자라고 화(火)를 살리는 기운으로 설명됩니다.`,
  화: `오행 상생 관계에서 화는 목(木)의 도움을 받아 타오르고 토(土)를 살리는 기운으로 설명됩니다.`,
  토: `오행 상생 관계에서 토는 화(火)의 도움을 받아 두터워지고 금(金)을 살리는 기운으로 설명됩니다.`,
  금: `오행 상생 관계에서 금은 토(土)의 도움을 받아 단단해지고 수(水)를 살리는 기운으로 설명됩니다.`,
  수: `오행 상생 관계에서 수는 금(金)의 도움을 받아 맑아지고 목(木)을 살리는 기운으로 설명됩니다.`,
};

const LEARNING: Record<OhaengType, string> = {
  목: `전통 해석에서는 목 기운을 직접 시도하며 넓혀 가는 배움의 이미지에 비유하기도 합니다.`,
  화: `전통 해석에서는 화 기운을 함께 나누고 드러내는 배움의 이미지에 비유하기도 합니다.`,
  토: `전통 해석에서는 토 기운을 차근차근 다져 가는 배움의 이미지에 비유하기도 합니다.`,
  금: `전통 해석에서는 금 기운을 정리하고 체계를 세우는 배움의 이미지에 비유하기도 합니다.`,
  수: `전통 해석에서는 수 기운을 깊이 탐구하고 연결하는 배움의 이미지에 비유하기도 합니다.`,
};

const RELATIONSHIPS: Record<OhaengType, string> = {
  목: `전통 해석에서 목은 서로의 성장을 북돋는 관계의 상징으로 쓰입니다.`,
  화: `전통 해석에서 화는 따뜻하게 마음을 나누는 관계의 상징으로 쓰입니다.`,
  토: `전통 해석에서 토는 믿음을 바탕으로 오래 이어지는 관계의 상징으로 쓰입니다.`,
  금: `전통 해석에서 금은 원칙과 신의를 지키는 관계의 상징으로 쓰입니다.`,
  수: `전통 해석에서 수는 서로를 깊이 이해하는 관계의 상징으로 쓰입니다.`,
};

const LEADERSHIP: Record<OhaengType, string> = {
  목: `전통 해석에서 목은 방향을 제시하며 앞으로 나아가는 이끎의 이미지에 비유됩니다.`,
  화: `전통 해석에서 화는 주변을 밝히고 북돋는 이끎의 이미지에 비유됩니다.`,
  토: `전통 해석에서 토는 가운데에서 조율하는 이끎의 이미지에 비유됩니다.`,
  금: `전통 해석에서 금은 기준을 세우고 공정하게 판단하는 이끎의 이미지에 비유됩니다.`,
  수: `전통 해석에서 수는 조용히 흐름을 읽는 조언자의 이미지에 비유됩니다.`,
};

const CREATIVITY: Record<OhaengType, string> = {
  목: `전통 해석에서 목은 새싹이 돋듯 새로운 것을 틔우는 창의의 상징입니다.`,
  화: `전통 해석에서 화는 생각을 밝게 드러내는 표현의 상징입니다.`,
  토: `전통 해석에서 토는 여러 요소를 아우르고 다듬는 조화의 상징입니다.`,
  금: `전통 해석에서 금은 군더더기를 덜어 내고 다듬는 정제의 상징입니다.`,
  수: `전통 해석에서 수는 서로 다른 것을 잇고 스며드는 연결의 상징입니다.`,
};

function getDominant(bal: OhaengBalance): OhaengType {
  return (Object.entries(bal).sort((a, b) => b[1] - a[1])[0][0]) as OhaengType;
}

export function generateFullInterpretation(result: AnalysisResult): FullInterpretation {
  const bal = result.sajuOhaengBalance;
  const dom = getDominant(bal);
  const { yang, yin } = getYinYangCounts(result.fourPillars);
  const yinYangNote = Math.abs(yang - yin) <= 2
    ? '전통 해석에서는 음양이 고르게 분포한 구성으로 봅니다.'
    : yang > yin
      ? '전통 해석에서는 양(陽)의 기운이 많은 구성으로 봅니다.'
      : '전통 해석에서는 음(陰)의 기운이 많은 구성으로 봅니다.';

  const presentCount = Object.values(bal).filter(v => v > 0).length;
  const balanceNote = presentCount === 5
    ? '다섯 오행이 모두 나타나며, 전통적 오행 해석에서는 이러한 분포를 균형 있는 구성으로 봅니다.'
    : `${5 - presentCount}개 오행이 나타나지 않는 구성이며, 전통 작명에서는 이름으로 부족한 오행을 보완하는 관례가 있습니다.`;

  const summary = `${result.name.full}(${result.nameAnalysis.hanja})은 전통 명리학 기준 점수에서 ${result.grade}등급(종합 ${result.scores.overall}점)으로 산출되었습니다. ${balanceNote} ${yinYangNote} 이름 발음오행과 사주의 조화 점수는 ${result.scores.nameHarmony}점입니다. 본 해석은 전통 명리학의 상징적 관례를 소개하는 참고 자료이며, 아이의 성격·능력·발달·건강이나 미래를 예측하지 않습니다.`;

  return {
    personality: PERSONALITY[dom],
    strengths: STRENGTHS[dom],
    growth: GROWTH[dom],
    learning: LEARNING[dom],
    relationships: RELATIONSHIPS[dom],
    leadership: LEADERSHIP[dom],
    creativity: CREATIVITY[dom],
    summary,
  };
}
