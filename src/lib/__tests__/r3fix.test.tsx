// R3-FIX regression tests (F32–F35 and F31 normalization). Wording only:
// every numeric expectation below is the pre-existing behaviour.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModeBInput, ModeCInput, OhaengType } from '@/types';
import { analyzeModeCNames, runModeBAnalysis } from '@/lib/analysis';
import { validateModeBInput } from '@/lib/inputValidation';
import { loadModeBFormInit } from '@/lib/formRestore';
import {
  HANJA_DB, explainRecommendedHanja, getHanjaOptions, getRecommendedHanja, getSuriOhaeng, recommendationReasonText,
} from '@/data/hanjaDB';
import {
  INDEX_PROVENANCE_NOTE, OVERALL_SCORE_EXPLANATION, SCORE_COMPONENTS, STYLE_EFFECT_LIMITS, STYLE_EFFECT_TEXT,
  appliedPreferencesText, nameLengthScopeNote,
} from '@/lib/scoreComponents';
import HanjaPicker from '@/components/HanjaPicker';
import NameRankCard from '@/components/NameRankCard';
import ScoreBreakdown from '@/components/ScoreBreakdown';
import PdfNameDetail from '@/components/pdf/PdfNameDetail';
import PdfReport from '@/components/pdf/PdfReport';

const B = (over: Partial<ModeBInput> = {}): ModeBInput => ({
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], ...over,
});
const OHAENG: OhaengType[] = ['목', '화', '토', '금', '수'];
const SRC = path.join(__dirname, '..', '..');

// ─── F32 Hanja recommendation reasons ────────────────────────────────────────

describe('F32: the recommendation reason matches the returned DB record', () => {
  it('the recommendation itself is unchanged (explain returns exactly getRecommendedHanja)', () => {
    for (const h of Object.keys(HANJA_DB)) for (const o of [...OHAENG, null]) {
      expect(explainRecommendedHanja(h, o)?.option).toBe(getRecommendedHanja(h, o));
    }
  });

  it('珉 for 수: stroke-count fallback, never called a resource-element match', () => {
    const e = explainRecommendedHanja('민', '수')!;
    expect(e.option.hanja).toBe('珉');
    expect(e.option.jaWonOhaeng).toBe('금');
    expect(getSuriOhaeng(e.option.strokes)).toBe('수');
    expect(e.basis).toBe('suri');
    const t = recommendationReasonText(e);
    expect(t).toContain('자원오행 금');
    expect(t).toContain('10획 수리오행 수');
    expect(t).toContain('자원오행으로 수를 보완하는 것은 아닙니다');
    expect(recommendationReasonText(explainRecommendedHanja('민', '금')!)).toContain('가장 적은 금과 같아');
    expect(t).not.toContain('보완하는 글자로 봅니다');
  });

  it('each path has a pinned regression case', () => {
    const cases: [string, OhaengType | null, string, string][] = [
      ['민', '금', '珉', 'jawon'],
      ['민', '화', '旼', 'jawon'],
      ['민', '수', '珉', 'suri'],
      ['민', '목', '敏', 'suri'],
      ['준', '목', '俊', 'fallback'],
      ['우', '수', '宇', 'fallback'],
      ['민', null, '珉', 'preference'],
    ];
    for (const [h, o, hanja, basis] of cases) {
      const e = explainRecommendedHanja(h, o)!;
      expect([h, o, e.option.hanja, e.basis]).toEqual([h, o, hanja, basis]);
    }
  });

  it('the basis is correct for every syllable × element (resource match claimed only when the record has it)', () => {
    const counts: Record<string, number> = {};
    for (const h of Object.keys(HANJA_DB)) for (const o of OHAENG) {
      const e = explainRecommendedHanja(h, o)!;
      counts[e.basis] = (counts[e.basis] ?? 0) + 1;
      const t = recommendationReasonText(e);
      expect(t).toContain(`자원오행 ${e.option.jaWonOhaeng}`);
      if (e.basis === 'jawon') {
        expect(e.option.jaWonOhaeng).toBe(o);
        expect(t).toContain(`${o} 기운을 보완하는 글자로 봅니다`);
      } else {
        expect(e.option.jaWonOhaeng).not.toBe(o);
        expect(getHanjaOptions(h).some(x => x.jaWonOhaeng === o)).toBe(false); // a resource match really does not exist
        expect(t).not.toContain('보완하는 글자로 봅니다');
      }
      if (e.basis === 'suri') expect(getSuriOhaeng(e.option.strokes)).toBe(o);
      if (e.basis === 'fallback') {
        expect(e.option).toBe(getHanjaOptions(h)[0]);
        expect(getHanjaOptions(h).some(x => getSuriOhaeng(x.strokes) === o)).toBe(false);
        expect(t).toContain('근거는 없습니다');
      }
    }
    // The audit's count: 144 of 240 calls have no resource-element match.
    expect(counts.suri + counts.fallback).toBe(144);
    expect(counts.jawon + counts.suri + counts.fallback).toBe(240);
  });

  it('the picker shows the reason for the actual recommendation', () => {
    const html = renderToStaticMarkup(<HanjaPicker hangul="민" recommendedOhaeng="수" onSelect={() => {}} onClose={() => {}} />);
    expect(html).toContain('data-basis="suri"');
    expect(html).toContain(recommendationReasonText(explainRecommendedHanja('민', '수')!).replace(/\(/g, '(').slice(0, 20));
    expect(html).not.toContain('수 기운을 보완하는 자원오행');
    const jawon = renderToStaticMarkup(<HanjaPicker hangul="민" recommendedOhaeng="금" onSelect={() => {}} onClose={() => {}} />);
    expect(jawon).toContain('data-basis="jawon"');
  });
});

// ─── F33 Style rounding ─────────────────────────────────────────────────────

describe('F33: style effect limits, including final integer rounding', () => {
  const plain = runModeBAnalysis(B());
  const styled = runModeBAnalysis(B({ nameStyles: ['전통형', '리더형'] }));
  const base = new Map(plain.map(r => [r.name.full, r]));

  it('김승우: M 83 → 95 (+12), overall 77 → 80 (+3 displayed), rank 172 → 5', () => {
    const a = base.get('김승우')!, b = styled.find(r => r.name.full === '김승우')!;
    expect([a.scores.modernPreference, b.scores.modernPreference]).toEqual([83, 95]);
    expect([a.scores.overall, b.scores.overall]).toEqual([77, 80]);
    expect([a.rank, b.rank]).toEqual([172, 5]);
  });

  it('observed maxima equal the documented limits (12 / 2.4 before rounding / 3 displayed)', () => {
    let maxM = 0, maxOverall = 0, plus3 = 0;
    for (const r of styled) {
      const a = base.get(r.name.full)!;
      const dM = r.scores.modernPreference - a.scores.modernPreference;
      const dO = r.scores.overall - a.scores.overall;
      // raw contribution before rounding is 0.2 × ΔM
      expect(0.2 * dM).toBeLessThanOrEqual(STYLE_EFFECT_LIMITS.overallBeforeRoundingMax + 1e-9);
      expect(Math.abs(dO - 0.2 * dM)).toBeLessThan(1); // rounding moves by less than one point
      maxM = Math.max(maxM, dM); maxOverall = Math.max(maxOverall, dO);
      if (dO === 3) plus3++;
    }
    expect(maxM).toBe(STYLE_EFFECT_LIMITS.modernPreferenceMax);
    expect(maxOverall).toBe(STYLE_EFFECT_LIMITS.displayedOverallMax);
    expect(plus3).toBe(323);
  });

  it('rounding edge: 0.2 × 12 = 2.4 can become +3 after rounding (x.6 → x+1 boundary)', () => {
    // e.g. 76.6 + 2.4 = 79.0 → 77 vs 79: +2 ; 77.4 + 2.4 = 79.8 → 77 vs 80: +3
    expect(Math.round(77.4 + 2.4) - Math.round(77.4)).toBe(3);
    expect(Math.round(76.6 + 2.4) - Math.round(76.6)).toBe(2);
  });

  it('the text and docs state all three numbers', () => {
    expect(STYLE_EFFECT_TEXT).toContain('최대 12점');
    expect(STYLE_EFFECT_TEXT).toContain('반올림 전 최대 2.4점');
    expect(STYLE_EFFECT_TEXT).toContain('최대 3점');
    expect(STYLE_EFFECT_TEXT).not.toMatch(/최대 약 2\.4점/);
    const doc = fs.readFileSync(path.join(SRC, '..', 'docs', 'scoring.md'), 'utf8');
    expect(doc).toContain('2.4');
    expect(doc).toMatch(/at most 3 points/);
  });
});

// ─── F34 Name length ────────────────────────────────────────────────────────

describe('F34: one-, two- and three-syllable explanations match the calculation', () => {
  const C = (names: string[]): ModeCInput => ({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names });
  const byName = (names: string[]) => new Map(analyzeModeCNames(C(names)).results.map(r => [r.name.full, r]));

  it('two syllables: no note', () => {
    expect(nameLengthScopeNote('민서')).toBeNull();
    const r = byName(['김민서', '김가나']).get('김민서')!;
    expect(renderToStaticMarkup(<ScoreBreakdown scores={r.scores} given={r.name.given} />)).not.toContain('name-length-note');
  });

  it('three syllables: modernity, preference and naturalness ignore the third syllable; harmony uses all', () => {
    const m = byName(['김가나서', '김가나무']);
    const a = m.get('김가나서')!, b = m.get('김가나무')!;
    for (const k of ['hanjaQuality', 'modernPreference', 'pronunciationNaturalness', 'imageMatch'] as const) expect(a.scores[k]).toBe(b.scores[k]);
    expect(a.scores.nameHarmony).not.toBe(b.scores.nameHarmony); // the third syllable does count here
    const note = nameLengthScopeNote('가나서')!;
    expect(note).toContain('처음 두 글자(가나)만 계산');
    expect(note).toContain("'서'는 이 항목들에 반영되지 않습니다");
    expect(note).toContain("둘째 글자 '나'");
    expect(note).toContain('글자 수 85점');
    expect(note).toContain("'발음 안정성'과 '이름 발음오행·사주 조화'는 모든 글자로 계산");
  });

  it('one syllable: the syllable is used twice and naturalness is a fixed 75', () => {
    const r = byName(['김민', '김가나']).get('김민')!;
    expect(r.scores.pronunciationNaturalness).toBe(75);
    expect(r.scores.hanjaQuality).toBe(Math.round((65 + r.name.char1.modernity) / 2));
    expect(r.scores.modernPreference).toBe(Math.round(r.name.char1.modernity));
    const note = nameLengthScopeNote('민')!;
    expect(note).toContain('고정 75점');
    expect(note).toContain('글자 수 65점');
    expect(note).toContain("'민' 한 글자를 첫째·둘째 음절로 두 번");
  });

  it('the generic component texts name the syllables actually used', () => {
    const basis = Object.fromEntries(SCORE_COMPONENTS.map(c => [c.key, c.basis]));
    expect(basis.hanjaQuality).toContain('첫째·둘째 음절');
    expect(basis.modernPreference).toContain('첫째 음절 40%·둘째 음절 60%');
    expect(basis.pronunciationNaturalness).toContain('둘째 음절의 모음·받침');
    expect(basis.pronunciationNaturalness).not.toContain('끝 글자');
  });

  it('UI card and PDF page show the same note for a non-two-syllable name, nothing for Mode B names', () => {
    const r = byName(['김가나서', '김가나무']).get('김가나서')!;
    const note = nameLengthScopeNote(r.name.given)!;
    const card = renderToStaticMarkup(<NameRankCard result={r} rank={1} />);
    expect(card).not.toContain('name-length-note'); // breakdown is collapsed by default
    const breakdown = renderToStaticMarkup(<ScoreBreakdown scores={r.scores} given={r.name.given} />);
    const pdf = renderToStaticMarkup(<PdfNameDetail result={r} rank={1} pageNum={3} totalPages={8} />);
    const esc = (s: string) => renderToStaticMarkup(<>{s}</>);
    expect(breakdown).toContain(esc(note));
    const compact = nameLengthScopeNote(r.name.given, { compact: true })!;
    expect(pdf).toContain(esc(compact));
    // The compact PDF text states the same facts as the UI note.
    for (const fact of ['처음 두 글자(가나)만 계산', "'서'", '85점', '모든 글자로 계산']) {
      expect(note).toContain(fact); expect(compact).toContain(fact);
    }
    const one = nameLengthScopeNote('민', { compact: true })!;
    for (const fact of ['고정 75점', '65점', "'민'"]) { expect(nameLengthScopeNote('민')).toContain(fact); expect(one).toContain(fact); }
    expect(nameLengthScopeNote('민서', { compact: true })).toBeNull();
    const b = runModeBAnalysis(B()).slice(0, 20);
    expect(renderToStaticMarkup(<PdfReport results={b} surname="김" gender="남" />)).not.toContain('pdf-name-length-note');
  });
});

// ─── F35 Provenance ─────────────────────────────────────────────────────────

describe('F35: modernity / usage indices are labelled as internal, unvalidated indices', () => {
  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  }

  // Unsupported statistical claims: birth-registration sources, year-specific
  // rankings ("2024 TOP 5"), popularity/frequency ranks ("TOP 20 이내 빈도").
  const CLAIMS: RegExp[] = [
    /출생신고\s*(기반|빈도|통계\s*기반)/,
    /실제\s*출생/,
    /20\d\d\s*(년)?\s*(기준)?\s*(TOP|탑|최고\s*인기|인기|빈도|순위|랭킹)/i,
    /(TOP|탑)\s*\d+\s*(이내|밖|빈도|인기)/i,
    /인기\s*(있으나|글자)/,
    /based on [^.]*birth[- ]registration/i,
    /\b(most popular|top \d+) (names?|characters?|syllables?) (in|of) 20\d\d/i,
  ];
  // A paragraph that explicitly says the claim is unsupported/removed is allowed.
  const DISCLAIMER = /(확인되지 않|검증되지 않|removed|no primary source|must not be described|not empirically validated)/i;
  const findClaims = (text: string) =>
    text.split(/\n\s*\n/).filter(par => !DISCLAIMER.test(par)).flatMap(par => CLAIMS.filter(re => re.test(par)).map(re => `${re} :: ${par.trim().slice(0, 80)}`));

  it('the claim detector catches every statement the audits found', () => {
    for (const old of [
      '// 95+ : 2024년 기준 TOP 5 빈도 글자 (도윤·서준 등)', '// 85-94: TOP 20 이내 빈도 글자', '// 70-84: 인기 있으나 TOP 20 밖',
      '// ── 1그룹: 2024 최고 인기 글자 (modernity 90+)', '// ── 2그룹: TOP 20 인기 (modernity 80-89)',
      'modernity: number; // 0-100: 2020-2024 실제 출생신고 기반 현대 선호도', '// 2020-2024 한국 출생신고 기반 선호도 0-100',
    ]) expect(findClaims(old), old).not.toEqual([]);
    expect(findClaims('최적의 출생 설계 조합 TOP 20을 추천합니다.')).toEqual([]); // a result count, not a statistic
  });

  it('no source file or document makes an unsupported statistical claim', () => {
    const docs = fs.readdirSync(path.join(SRC, '..', 'docs')).filter(f => f.endsWith('.md')).map(f => path.join(SRC, '..', 'docs', f));
    for (const f of [...sourceFiles(SRC), ...docs]) {
      expect(findClaims(fs.readFileSync(f, 'utf8')), f).toEqual([]);
    }
  });

  it('the Hanja picker labels its bars as internal indices and shows the provenance note', () => {
    const html = renderToStaticMarkup(<HanjaPicker hangul="민" onSelect={() => {}} onClose={() => {}} />);
    expect(html).toContain('사용 빈도(내부 지수)');
    expect(html).toContain('현대 선호(내부 지수)');
    expect(html).toContain(INDEX_PROVENANCE_NOTE);
    expect(html).not.toMatch(/>사용 빈도</);
  });

  it('the overall explanation (UI + PDF) and the docs say the index is internal and unvalidated', () => {
    expect(OVERALL_SCORE_EXPLANATION).toContain('내부 모델 지수');
    expect(INDEX_PROVENANCE_NOTE).toContain('실측 검증도 되지 않았습니다');
    const pdf = renderToStaticMarkup(<PdfReport results={runModeBAnalysis(B()).slice(0, 20)} surname="김" gender="남" />);
    expect(pdf).toContain('내부 모델 지수');
    const doc = fs.readFileSync(path.join(SRC, '..', 'docs', 'scoring.md'), 'utf8');
    expect(doc).toMatch(/internal model ind/i);
    expect(doc).toMatch(/not\s+been\s+empirically\s+validated/i);
  });
});

// ─── F31 normalization (engine side) ────────────────────────────────────────

describe('F31: duplicate preferences are normalized before scoring', () => {
  it('validator removes duplicates, keeping order; scores equal the normalized input', () => {
    const v = validateModeBInput(B({ nameStyles: ['리더형', '전통형', '리더형'] as never, images: ['예술형', '예술형'] as never }));
    expect(v.ok && v.value.nameStyles).toEqual(['리더형', '전통형']);
    expect(v.ok && v.value.images).toEqual(['예술형']);
    const dup = runModeBAnalysis(B({ nameStyles: ['전통형', '전통형'] as never }));
    const norm = runModeBAnalysis(B({ nameStyles: ['전통형'] }));
    expect(dup.map(r => [r.name.full, r.scores])).toEqual(norm.map(r => [r.name.full, r.scores]));
  });

  it('identical normalized inputs keep the audit scores', () => {
    expect(`${runModeBAnalysis(B())[0].name.full} ${runModeBAnalysis(B())[0].scores.overall}`).toBe('김민서 80');
    const s = runModeBAnalysis(B({ nameStyles: ['전통형', '리더형'] }))[0];
    expect(`${s.name.full} ${s.scores.overall}`).toBe('김민준 81');
  });

  it('restore keeps valid styles and reports malformed / duplicate ones', () => {
    const now = new Date('2026-11-10T00:00:00+09:00');
    const st = (v: unknown) => ({ getItem: () => JSON.stringify(v) });
    const ok = loadModeBFormInit(now, st({ ...B(), nameStyles: ['전통형', '전통형', 'x'] }));
    expect(ok.nameStyles).toEqual(['전통형']);
    expect(ok.restoreNotice).toContain('"x"');
    expect(ok.restoreNotice).toContain('중복');
    const none = loadModeBFormInit(now, st({ ...B(), nameStyles: 7 }));
    expect(none).toMatchObject({ surname: '김', birthHour: 9, nameStyles: [] });
    expect(none.restoreNotice).toContain('스타일 선택 없이');
  });

  it('applied-preferences line', () => {
    expect(appliedPreferencesText([], [])).toBe('적용한 이름 스타일: 없음 · 이미지: 없음');
    expect(appliedPreferencesText(['전통형', '리더형'], ['예술형'])).toBe('적용한 이름 스타일: 전통형·리더형 · 이미지: 예술형');
  });
});
