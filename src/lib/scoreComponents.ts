import { Grade, Scores } from '@/types';

// ─── Single source of truth for score wording ────────────────────────────────
//
// Every label, weight and explanation shown in the UI and the PDF comes from
// here. The wording describes what calcAllScores (scoring.ts) actually computes;
// it never changes a number. See docs/scoring.md.
//
// Effective weights of combineOverall (rounded only once, at the end):
//   overall = 0.40 × (0.40·B + 0.25·Y + 0.35·H) + 0.20 × (0.50·P + 0.50·Q)
//           + 0.10·B + 0.20·M + 0.10·N
//   → B 26 %, Y 10 %, H 14 %, P 10 %, Q 10 %, M 20 %, N 10 %, image 0 %.

export type ScoreKey = Exclude<keyof Scores, 'overall' | 'modernUsability'>;

export interface ScoreComponent {
  key: ScoreKey;
  label: string;        // full label (cards, PDF meters)
  short: string;        // table column header
  weight: number;       // effective % of the overall score
  /** What the number is computed from (user-facing, Korean). */
  basis: string;
  dependsOnBirthTime: boolean;
  dependsOnStyles: boolean;
  dependsOnImages: boolean;
  dependsOnHanja: false; // no component reads the selected Hanja
}

export const SCORE_COMPONENTS: readonly ScoreComponent[] = [
  {
    key: 'sajuOhaengBalance', label: '사주 오행 균형', short: '오행균형', weight: 26,
    basis: '출생 시각 사주 8글자의 오행 분포(이름과 무관). 사주 적합도와 오행 균형 두 곳에 반영됩니다',
    dependsOnBirthTime: true, dependsOnStyles: false, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'yinYangHarmony', label: '사주 음양 균형', short: '음양', weight: 10,
    basis: '사주 8글자의 양·음 개수 차이(이름과 무관)',
    dependsOnBirthTime: true, dependsOnStyles: false, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'nameHarmony', label: '이름 발음오행·사주 조화', short: '이름조화', weight: 14,
    basis: '이름 글자의 초성·받침 발음오행(오음)이 사주에서 적거나 많은 오행과 겹치는지. 한자 자원오행은 쓰지 않습니다',
    dependsOnBirthTime: true, dependsOnStyles: false, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'pronunciationStability', label: '발음 안정성(된소리·거센소리)', short: '발음안정', weight: 10,
    basis: '이름 초성의 된소리(글자당 −18)·거센소리(글자당 −7) 감점',
    dependsOnBirthTime: false, dependsOnStyles: false, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'hanjaQuality', label: '글자 수·음절 현대성', short: '글자·현대성', weight: 10,
    basis: '이름 글자 수(2글자 100·3글자 85·1글자 65점)와 이름 첫째·둘째 음절의 현대 선호 지수(내부 지수) 평균. 한자의 뜻·획수는 계산에 쓰지 않습니다',
    dependsOnBirthTime: false, dependsOnStyles: false, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'modernPreference', label: '현대 선호도(스타일 가산)', short: '현대선호', weight: 20,
    basis: '이름 첫째 음절 40%·둘째 음절 60%의 현대 선호 지수(내부 지수)에, 선택한 스타일로 분류된 글자가 있으면 이 항목에 최대 12점을 더합니다',
    dependsOnBirthTime: false, dependsOnStyles: true, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'pronunciationNaturalness', label: '발음 자연스러움', short: '발음자연', weight: 10,
    basis: '이름 첫째·둘째 음절의 초성 계열 차이, 둘째 음절의 모음·받침, ㅇ·ㅎ 포함 여부(고정 규칙)',
    dependsOnBirthTime: false, dependsOnStyles: false, dependsOnImages: false, dependsOnHanja: false,
  },
  {
    key: 'imageMatch', label: '이미지 분류 일치(종합 미반영)', short: '이미지', weight: 0,
    basis: '이름 첫째·둘째 음절 중 선택한 이미지로 분류된 글자 수. 종합 점수에는 반영되지 않습니다',
    dependsOnBirthTime: false, dependsOnStyles: false, dependsOnImages: true, dependsOnHanja: false,
  },
];

/** Components that make up the overall score, in display order. */
export const OVERALL_COMPONENTS = SCORE_COMPONENTS.filter(c => c.weight > 0);

export const componentByKey = (key: ScoreKey): ScoreComponent => SCORE_COMPONENTS.find(c => c.key === key)!;

export const weightText = (c: ScoreComponent) => (c.weight > 0 ? `${c.weight}%` : '미반영');

/** One-line explanation of the overall score (UI and PDF). */
export const OVERALL_SCORE_EXPLANATION =
  '종합 점수 = 사주 오행 균형 26% · 사주 음양 균형 10% · 이름 발음오행·사주 조화 14% · 발음 안정성 10% · ' +
  '글자 수·음절 현대성 10% · 현대 선호도 20% · 발음 자연스러움 10%. 선택한 한자의 뜻·획수와 이미지 선택은 점수에 들어가지 않습니다. ' +
  '음절 현대 선호 지수는 출처·산출 방법이 확인되지 않은 내부 모델 지수입니다. ' +
  '전통 명리학 모델 안에서 후보끼리 비교하는 상대 점수이며, 아이의 성격·건강·미래를 예측하지 않습니다.';

/** What the style and image preferences actually do (input pages). */
export const STYLE_EFFECT_TEXT =
  "선택한 스타일로 분류된 글자가 이름에 있으면 '현대 선호도' 항목에 최대 12점이 더해집니다. " +
  '종합 점수에는 반올림 전 최대 2.4점이 더해지며, 반올림한 표시 점수로는 최대 3점까지 차이 날 수 있습니다. ' +
  '후보를 걸러내지는 않으며, 종합 점수가 같을 때의 표시 순서에도 쓰입니다.';

/** Limits of the style effect (calcModernPreference + combineOverall); tested. */
export const STYLE_EFFECT_LIMITS = { modernPreferenceMax: 12, overallBeforeRoundingMax: 2.4, displayedOverallMax: 3 } as const;
export const IMAGE_EFFECT_TEXT =
  '이미지는 종합 점수에 반영되지 않습니다. 해당 이미지로 분류된 글자를 표시·필터하는 데 쓰이며, 스타일을 고르지 않았을 때에만 종합 점수가 같은 후보의 표시 순서에 쓰입니다.';

/** Shown where Hanja is chosen: the choice is descriptive only. */
export const HANJA_SELECTION_NOTE =
  '한자 선택은 이름의 뜻·획수 표시를 바꿀 뿐, 점수와 순위에는 영향을 주지 않습니다.';

/** Grade bands of the overall score (getGrade thresholds). */
export const GRADE_BANDS: Record<Grade, string> = {
  SS: '종합 87점 이상',
  S: '종합 75~86점',
  A: '종합 60~74점',
  B: '종합 45~59점',
  C: '종합 45점 미만',
};

/**
 * Which syllables the existing calculations read when the given name does not
 * have exactly two syllables (only possible in Mode C). Returns null for
 * two-syllable names. Describes the current calculation; changes no number.
 */
const objectParticle = (syllable: string) => {
  const code = syllable.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '을' : '를';
};

export function nameLengthScopeNote(given: string, options: { compact?: boolean } = {}): string | null {
  const syllables = Array.from(given);
  const n = syllables.length;
  if (n === 2 || n === 0) return null;
  if (options.compact) {
    // Same facts, shorter (PDF name page has a fixed height).
    if (n === 1) {
      return `외자 이름: 현대성·'현대 선호도'·이미지는 '${syllables[0]}'${objectParticle(syllables[0])} 두 번 계산, '발음 자연스러움'은 고정 75점, 글자 수 65점 기준. ` +
        '발음 안정성·발음오행 조화는 이 한 글자로 계산.';
    }
    return `${n}글자 이름: 현대성·'현대 선호도'·이미지·'발음 자연스러움'은 처음 두 글자(${syllables[0]}${syllables[1]})만 계산` +
      `(${syllables.slice(2).map(c => `'${c}'`).join('·')} 미반영), 글자 수 ${n === 3 ? 85 : 65}점 기준. 발음 안정성·발음오행 조화는 모든 글자로 계산.`;
  }
  if (n === 1) {
    return `외자 이름: '글자 수·음절 현대성'은 글자 수 65점 기준이고, 현대성·'현대 선호도'·이미지 분류는 ` +
      `'${syllables[0]}' 한 글자를 첫째·둘째 음절로 두 번 계산합니다. '발음 자연스러움'은 두 음절을 비교할 수 없어 고정 75점입니다. ` +
      "'발음 안정성'과 '이름 발음오행·사주 조화'는 이 한 글자로 계산합니다.";
  }
  const ignored = syllables.slice(2).map(c => `'${c}'`).join('·');
  return `${n}글자 이름: '글자 수·음절 현대성'은 글자 수 ${n === 3 ? 85 : 65}점 기준입니다. ` +
    `현대성·'현대 선호도'·이미지 분류와 '발음 자연스러움'은 처음 두 글자(${syllables[0]}${syllables[1]})만 계산하며, ` +
    `${ignored}는 이 항목들에 반영되지 않습니다('발음 자연스러움'의 끝 글자 규칙도 둘째 글자 '${syllables[1]}'에 적용). ` +
    "'발음 안정성'과 '이름 발음오행·사주 조화'는 모든 글자로 계산합니다.";
}

/** Provenance of the syllable modernity / Hanja usage indices (F35). */
export const INDEX_PROVENANCE_NOTE =
  '현대 선호 지수·사용 빈도 값은 이 서비스의 내부 모델 지수입니다. 출생신고 통계 등 원자료와 산출 방법이 확인되지 않았고, 실측 검증도 되지 않았습니다.';

/** The style/image preferences the analysis actually used (results pages). */
export function appliedPreferencesText(nameStyles: readonly string[], images: readonly string[]): string {
  return `적용한 이름 스타일: ${nameStyles.length ? nameStyles.join('·') : '없음'} · 이미지: ${images.length ? images.join('·') : '없음'}`;
}
