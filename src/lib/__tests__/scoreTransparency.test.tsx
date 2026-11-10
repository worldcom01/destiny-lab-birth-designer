import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GRADE_CONFIG, Grade, ModeBInput, SIJIN_VERSION } from '@/types';
import { analyzeModeCNames, applyHanjaSelections, runModeBAnalysis } from '@/lib/analysis';
import { combineOverall, getGrade, stylesFittingName } from '@/lib/scoring';
import { generateCandidateNames } from '@/lib/nameGenerator';
import { getYinYangCounts } from '@/lib/saju';
import { getHanjaOptions } from '@/data/hanjaDB';
import {
  GRADE_BANDS, HANJA_SELECTION_NOTE, IMAGE_EFFECT_TEXT, OVERALL_COMPONENTS, OVERALL_SCORE_EXPLANATION,
  SCORE_COMPONENTS, STYLE_EFFECT_TEXT,
} from '@/lib/scoreComponents';
import ScoreBreakdown from '@/components/ScoreBreakdown';
import ResultCard from '@/components/ResultCard';
import NameRankCard from '@/components/NameRankCard';
import PdfReport from '@/components/pdf/PdfReport';

const B = (over: Partial<ModeBInput> = {}): ModeBInput => ({
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], ...over,
});
const SRC = path.join(__dirname, '..', '..');
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

// ─── Component weights ───────────────────────────────────────────────────────

describe('component weights shown to users equal the formula', () => {
  // combineOverall argument order: B, Y, H, P, Q, B(again), M, N
  const ARGS = ['sajuOhaengBalance', 'yinYangHarmony', 'nameHarmony', 'pronunciationStability', 'hanjaQuality', 'sajuOhaengBalance', 'modernPreference', 'pronunciationNaturalness'];

  it.each(OVERALL_COMPONENTS.map(c => [c.key, c.weight] as const))('%s carries %i %%', (key, weight) => {
    const args = ARGS.map(k => (k === key ? 100 : 0)) as Parameters<typeof combineOverall>;
    expect(combineOverall(...args)).toBe(weight);
  });

  it('weights add up to 100 and the image score is not part of the overall score', () => {
    expect(OVERALL_COMPONENTS.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(SCORE_COMPONENTS.find(c => c.key === 'imageMatch')!.weight).toBe(0);
    for (const c of OVERALL_COMPONENTS) expect(OVERALL_SCORE_EXPLANATION).toContain(`${c.label.split('(')[0]} ${c.weight}%`);
  });

  it('grade bands match getGrade for every overall score', () => {
    const bands: Record<Grade, [number, number]> = { SS: [87, 100], S: [75, 86], A: [60, 74], B: [45, 59], C: [0, 44] };
    for (let v = 0; v <= 100; v++) {
      const g = getGrade(v);
      expect(v).toBeGreaterThanOrEqual(bands[g][0]);
      expect(v).toBeLessThanOrEqual(bands[g][1]);
    }
    for (const g of Object.keys(bands) as Grade[]) {
      const [lo, hi] = bands[g];
      expect(GRADE_BANDS[g]).toContain(g === 'C' ? '45점 미만' : g === 'SS' ? '87점 이상' : `${lo}~${hi}점`);
      expect(GRADE_BANDS[g]).toContain(GRADE_CONFIG[g].description);
    }
  });
});

// ─── Preference effects ──────────────────────────────────────────────────────

describe('preference effects match the explanations', () => {
  const plain = runModeBAnalysis(B());
  const byName = new Map(plain.map(r => [r.name.full, r]));

  it('images change only the (unweighted) image score: every other score is identical', () => {
    const withImages = runModeBAnalysis(B({ images: ['예술형', '리더형'] }));
    expect(withImages).toHaveLength(plain.length);
    let imageScoreChanged = 0;
    for (const r of withImages) {
      const base = byName.get(r.name.full)!;
      const { imageMatch: a, ...rest } = r.scores;
      const { imageMatch: b, ...baseRest } = base.scores;
      expect(rest).toEqual(baseRest);
      if (a !== b) imageScoreChanged++;
    }
    expect(imageScoreChanged).toBeGreaterThan(0);
    expect(IMAGE_EFFECT_TEXT).toContain('종합 점수에 반영되지 않습니다');
  });

  it('styles change only the modern-preference score, by at most +12 points', () => {
    const styled = runModeBAnalysis(B({ nameStyles: ['전통형', '리더형'] }));
    let maxDiff = 0;
    for (const r of styled) {
      const base = byName.get(r.name.full)!;
      const diff = r.scores.modernPreference - base.scores.modernPreference;
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThanOrEqual(12);
      maxDiff = Math.max(maxDiff, diff);
      const SKIP = new Set(['modernPreference', 'modernUsability', 'overall']);
      const others = (s: typeof r.scores) => Object.entries(s).filter(([k]) => !SKIP.has(k));
      expect(others(r.scores)).toEqual(others(base.scores));
      // Overall moves by at most 0.2 × 12 = 2.4 before rounding, i.e. ≤ 3 after it.
      expect(r.scores.overall - base.scores.overall).toBeLessThanOrEqual(3);
      if (stylesFittingName(r.name, ['전통형', '리더형']).length === 0) expect(diff).toBe(0);
    }
    expect(maxDiff).toBe(12);
    expect(STYLE_EFFECT_TEXT).toContain('최대 12점');
    expect(STYLE_EFFECT_TEXT).toContain('반올림 전 최대 2.4점');
    expect(STYLE_EFFECT_TEXT).toContain('최대 3점');
  });

  it('styles and images never filter candidates', () => {
    const base = generateCandidateNames({ ...B(), startDate: '2027-07-04', endDate: '2027-07-04' }).map(n => n.given).sort();
    const pref = generateCandidateNames({ ...B({ images: ['학자형'], nameStyles: ['고급형'] }), startDate: '2027-07-04', endDate: '2027-07-04' }).map(n => n.given).sort();
    expect(pref).toEqual(base);
  });

  it('dependency flags agree with the observed behaviour', () => {
    expect(SCORE_COMPONENTS.filter(c => c.dependsOnStyles).map(c => c.key)).toEqual(['modernPreference']);
    expect(SCORE_COMPONENTS.filter(c => c.dependsOnImages).map(c => c.key)).toEqual(['imageMatch']);
    expect(SCORE_COMPONENTS.every(c => c.dependsOnHanja === false)).toBe(true);
    const other = runModeBAnalysis(B({ birthDate: '2027-07-05', birthHour: 15 }));
    const r1 = byName.get('김민준')!, r2 = other.find(r => r.name.full === '김민준')!;
    for (const c of SCORE_COMPONENTS) {
      if (!c.dependsOnBirthTime) expect(r2.scores[c.key], c.key).toBe(r1.scores[c.key]);
    }
  });
});

// ─── Hanja selection ─────────────────────────────────────────────────────────

describe('Hanja selection is descriptive only', () => {
  it('Mode B and C: another registered Hanja changes the Hanja text but no score or rank', () => {
    const b = runModeBAnalysis(B()).slice(0, 30);
    const c = analyzeModeCNames({ birthDate: '2028-11-07', birthHour: 23, sijinVersion: SIJIN_VERSION, gender: '여', names: ['김민서', '이서윤', '박지우'] }).results;
    for (const list of [b, c]) {
      const sel = Object.fromEntries(list.map(r => [r.name.full, r.name.hanja.given.map(ch =>
        getHanjaOptions(ch.hangul).map(o => o.hanja).find(h => h !== ch.hanja) ?? null)]));
      const after = applyHanjaSelections(list, sel);
      expect(after.some((r, i) => r.nameAnalysis.hanja !== list[i].nameAnalysis.hanja)).toBe(true);
      after.forEach((r, i) => { expect(r.scores).toEqual(list[i].scores); expect(r.rank).toBe(list[i].rank); });
    }
    expect(HANJA_SELECTION_NOTE).toContain('점수와 순위에는 영향을 주지 않습니다');
  });
});

// ─── Tags and description ────────────────────────────────────────────────────

describe('interpretation tags state facts', () => {
  const results = runModeBAnalysis(B({ nameStyles: ['리더형'], images: ['예술형'] })).slice(0, 300);

  it('every tag matches a factual pattern and agrees with the result', () => {
    for (const r of results) {
      const { yang, yin } = getYinYangCounts(r.fourPillars);
      const present = Object.values(r.sajuOhaengBalance).filter(v => v > 0).length;
      for (const t of r.characteristics) {
        if (t === '사주 오행 5종 모두 있음') expect(present).toBe(5);
        else if (t === '사주 오행 4종') expect(present).toBe(4);
        else if (t.startsWith('사주 음양 ')) expect(t).toBe(`사주 음양 ${yang}:${yin}`);
        else if (t.endsWith(' 분류 글자 포함')) {
          const s = t.replace(' 분류 글자 포함', '');
          expect([r.name.char1, r.name.char2].some(c => (c.nameStyleFit as string[]).includes(s) || (c.images as string[]).includes(s))).toBe(true);
        } else if (t.startsWith('첫 소리 발음오행 ')) expect(t).toBe(`첫 소리 발음오행 ${r.nameAnalysis.pronunciationOhaeng[0]}`);
        else expect(t).toMatch(/^[목화토금수] 기운 중심\(.+ 상징\)$/);
        expect(t).not.toMatch(/적합|우수|양호|성장 기운 이름|지혜 기운 이름/);
      }
      expect(r.description).not.toMatch(/어울리는 이름|의미를 담고 있습니다/);
    }
  });
});

// ─── UI / PDF wording ────────────────────────────────────────────────────────

const RETIRED = [
  '한자 의미 품질', '현대적 사용성', '이미지 부합도', '조화도 높은 순', '20% 가산', '균형잡힌 조합을 우선',
  '최고 조화도', '우수 조화도', '양호 조화도', '보통 조화도', '기본 조화도',
  '성격 및 기질', '리더십 성향', '학습 성향', '가능성·성향·기질',
];

describe('UI and PDF wording is consistent', () => {
  it('no source file uses a retired, misleading label', () => {
    for (const f of sourceFiles(SRC)) {
      const text = fs.readFileSync(f, 'utf8');
      for (const w of RETIRED) expect(text.includes(w), `${path.relative(SRC, f)}: ${w}`).toBe(false);
    }
  });

  it('score lists in cards and PDF pages take their labels from scoreComponents', () => {
    for (const f of ['components/ResultCard.tsx', 'components/NameRankCard.tsx', 'components/pdf/PdfNameDetail.tsx', 'components/pdf/PdfExecutiveSummary.tsx']) {
      const text = fs.readFileSync(path.join(SRC, f), 'utf8');
      expect(text, f).toMatch(/ScoreBreakdown|OVERALL_COMPONENTS/);
      expect(text, f).not.toMatch(/ScoreMeter label="/);
    }
  });

  const r = runModeBAnalysis(B({ images: ['예술형'] }))[0];

  it('cards render every component label, its weight and the same numbers', () => {
    const html = renderToStaticMarkup(<ScoreBreakdown scores={r.scores} />);
    for (const c of SCORE_COMPONENTS) {
      expect(html).toContain(c.label);
      expect(html).toContain(`${r.scores[c.key]}점`);
    }
    expect(html).toContain('이미지 분류 일치(종합 미반영)');
    for (const el of [<ResultCard key="a" result={r} />, <NameRankCard key="b" result={r} />]) {
      const card = renderToStaticMarkup(el);
      for (const w of RETIRED) expect(card).not.toContain(w);
    }
  });

  it('the PDF shows the overall components with their weights and the same numbers', () => {
    const all = runModeBAnalysis(B());
    const html = renderToStaticMarkup(<PdfReport results={all.slice(0, 20)} surname="김" gender="남" />);
    for (const c of OVERALL_COMPONENTS) expect(html).toContain(`${c.label} ${c.weight}%`);
    expect(html).toContain(OVERALL_SCORE_EXPLANATION);
    for (const w of RETIRED) expect(html).not.toContain(w);
    expect(html).toContain('아이의 성격·능력·미래를 예측하지 않습니다');
  });
});
