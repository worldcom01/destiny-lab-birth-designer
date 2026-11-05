import { describe, expect, it } from 'vitest';
import { AnalysisResult, DesignerInput, GeneratedName, ModeBInput } from '@/types';
import { analyzeModeCNames, applyHanjaSelections, runModeAAnalysis, runModeBAnalysis } from '@/lib/analysis';
import { generateCandidateNames } from '@/lib/nameGenerator';
import { parseKoreanName } from '@/lib/nameParser';
import { InputValidationError } from '@/lib/inputValidation';
import {
  HanjaSelections, UNASSIGNED_MARK, analysisScope, formatFullHanja, hanjaStatusLabel,
  loadHanjaSelections, parseHanjaSelections, saveHanjaSelections, withSelection,
} from '@/lib/hanjaModel';
import { HANJA_DB } from '@/data/hanjaDB';
import { NAME_CHARS } from '@/data/nameChars';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_B: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
};
const designer = (over: Partial<DesignerInput>): DesignerInput => ({
  startDate: '2027-07-04', endDate: '2027-07-04', surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], analysisLevel: '간단', ...over,
});
const modeC = (names: string[]) => analyzeModeCNames({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names });

/** Every derived representation of a name's Hanja must agree with the canonical model. */
function expectConsistent(name: GeneratedName, r?: AnalysisResult) {
  const { given } = name.hanja;
  expect(given.map(c => c.hangul).join('')).toBe(name.given);
  expect(name.char1.hanja).toBe(given[0].hanja ?? '?');
  expect(name.char2.hanja).toBe((given[1] ?? given[0]).hanja ?? '?');
  for (const c of given) {
    const rec = c.hanja ? HANJA_DB[c.hangul]?.find(o => o.hanja === c.hanja) : undefined;
    expect(c.inDatabase).toBe(rec !== undefined);
    if (rec) {
      // meaning/strokes/jaWon come from the record of exactly this character
      expect([c.meaning, c.strokes, c.jaWonOhaeng]).toEqual([rec.meaning, rec.strokes, rec.jaWonOhaeng]);
    } else {
      expect([c.strokes, c.jaWonOhaeng]).toEqual([null, null]);
    }
    if (!c.hanja) expect([c.status, c.meaning]).toEqual(['unassigned', null]);
  }
  if (r) {
    expect(r.nameAnalysis.hanja).toBe(given.map(c => c.hanja ?? UNASSIGNED_MARK).join(''));
    expect(r.nameAnalysis.meanings).toHaveLength(given.length);
  }
}

// ─── Previously reproduced mismatches ────────────────────────────────────────

describe('suggested Hanja never falls back to HANJA_DB[0]', () => {
  // nameChars hanja vs first HANJA_DB option (the old PDF fallback)
  const CASES = [
    { hangul: '현', expected: '炫', oldPdf: '賢' },
    { hangul: '예', expected: '睿', oldPdf: '藝' },
    { hangul: '유', expected: '柔', oldPdf: '侑' },
    { hangul: '원', expected: '媛', oldPdf: '源' },
  ];

  it.each(CASES)('$hangul keeps $expected (not $oldPdf)', ({ hangul, expected, oldPdf }) => {
    expect(NAME_CHARS.find(c => c.hangul === hangul)?.hanja).toBe(expected);
    expect(HANJA_DB[hangul][0].hanja).toBe(oldPdf);
    const names = generateCandidateNames(designer({ dolrimChar: hangul, dolrimPosition: 'first' }));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const c = n.hanja.given[0];
      expect(c).toMatchObject({ hangul, hanja: expected, status: 'suggested' });
      expectConsistent(n);
    }
  });

  it('meaning and strokes belong to the exact character, or are explicitly unknown', () => {
    const [hyeon] = generateCandidateNames(designer({ dolrimChar: '현', dolrimPosition: 'first' }));
    expect(hyeon.hanja.given[0]).toMatchObject({ hanja: '炫', meaning: '빛날 현', strokes: 9, jaWonOhaeng: '화', inDatabase: true });
    // 媛 has no HANJA_DB record: strokes are unknown, not borrowed from 源
    const [won] = generateCandidateNames(designer({ dolrimChar: '원', dolrimPosition: 'first' }));
    expect(won.hanja.given[0]).toMatchObject({ hanja: '媛', strokes: null, jaWonOhaeng: null, inDatabase: false });
    // 睿/柔 have their own records, distinct from the first options 藝/侑
    for (const [hangul, hanja] of [['예', '睿'], ['유', '柔']]) {
      const [n] = generateCandidateNames(designer({ dolrimChar: hangul, dolrimPosition: 'first' }));
      const rec = HANJA_DB[hangul].find(o => o.hanja === hanja)!;
      expect(n.hanja.given[0]).toMatchObject({ hanja, strokes: rec.strokes, meaning: rec.meaning, inDatabase: true });
      expect(rec.strokes === HANJA_DB[hangul][0].strokes && rec.meaning === HANJA_DB[hangul][0].meaning).toBe(false);
    }
  });
});

// ─── Generational Hanja ──────────────────────────────────────────────────────

describe('generational (돌림자) Hanja propagation', () => {
  it('keeps the user-confirmed 敏 for 민 in every generated name (not the default 珉)', () => {
    const results = runModeBAnalysis({ ...BASE_B, dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'auto' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const idx = r.name.given.indexOf('민');
      expect(r.name.hanja.given[idx]).toMatchObject({ hanja: '敏', status: 'confirmed', meaning: '민첩할 민', strokes: 11 });
      expect(r.nameAnalysis.hanja).toContain('敏');
      expect(r.description).toContain('敏');
      expectConsistent(r.name, r);
    }
  });

  it('Mode A propagates the confirmed generational Hanja too', () => {
    // P0-C: Mode A requires a medically permitted schedule (legacy inputs are rejected).
    const results = runModeAAnalysis(designer({
      dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'second',
      schedule: { providerConfirmed: true, timeRanges: [{ start: '09:00', end: '11:00' }], exactTimes: [] },
    }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.name.hanja.given[1].hanja === '敏' && r.name.hanja.given[1].status === 'confirmed')).toBe(true);
  });

  it('rejects a generational Hanja that is not an option for the syllable (P0-D1 H03: no silent fallback)', () => {
    expect(() => runModeBAnalysis({ ...BASE_B, dolrimChar: '민', dolrimHanja: '俊', dolrimPosition: 'first' }))
      .toThrow(InputValidationError);
  });

  it('does not invent a Hanja for a generational character without data', () => {
    const results = generateCandidateNames(designer({ dolrimChar: '힣', dolrimPosition: 'first' }));
    expect(results.length).toBeGreaterThan(0);
    for (const n of results) {
      expect(n.hanja.given[0]).toMatchObject({ hangul: '힣', hanja: null, status: 'unassigned' });
      expectConsistent(n);
    }
  });

  it('accepts legacy stored input without dolrimHanja', () => {
    const legacy = JSON.parse(JSON.stringify({ ...BASE_B, dolrimChar: '민' }));
    delete legacy.dolrimHanja;
    const results = runModeBAnalysis(legacy);
    expect(results[0].name.hanja.given.some(c => c.hanja === '珉')).toBe(true);
  });
});

// ─── User selection ──────────────────────────────────────────────────────────

describe('user Hanja selection', () => {
  const fresh = () => runModeBAnalysis({ ...BASE_B, dolrimChar: '현', dolrimPosition: 'first' });

  it('confirms the chosen Hanja and re-derives text without changing scores or rank', () => {
    const before = fresh();
    const i = before.findIndex(x => (HANJA_DB[x.name.given[1]]?.length ?? 0) >= 2);
    expect(i).toBeGreaterThanOrEqual(0);
    const target = before[i];
    const sel = withSelection({}, target.name.full, 0, '賢');
    const after = applyHanjaSelections(before, sel);
    const r = after[i];
    expect(r.name.full).toBe(target.name.full);
    expect(r.name.hanja.given[0]).toMatchObject({ hanja: '賢', status: 'confirmed', meaning: '어질 현', strokes: 15, jaWonOhaeng: '수' });
    expect(r.nameAnalysis.hanja.startsWith('賢')).toBe(true);
    expect(r.description).toContain('賢');
    expect(r.description).not.toContain('炫');
    expect(r.scores).toEqual(target.scores);
    expect(r.rank).toBe(target.rank);
    expectConsistent(r.name, r);
    // Other results are untouched (same object)
    const other = i === 0 ? 1 : 0;
    expect(after[other]).toBe(before[other]);
    expect(hanjaStatusLabel(r.name.hanja)).toBe('추천 한자'); // second char still suggested
    const alt = HANJA_DB[target.name.given[1]].find(o => o.hanja !== target.name.hanja.given[1].hanja)!;
    const both = applyHanjaSelections(before, withSelection(sel, target.name.full, 1, alt.hanja));
    expect(both[i].name.hanja.given[1]).toMatchObject({ hanja: alt.hanja, status: 'confirmed', strokes: alt.strokes });
    expect(hanjaStatusLabel(both[i].name.hanja)).toBe('확정 한자');
  });

  it('survives a reload through the storage layer (legacy and malformed data are dropped)', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    const target = fresh()[0];
    const scope = analysisScope({ ...BASE_B, dolrimChar: '현', dolrimPosition: 'first' }); // P0-D1: selections are scoped
    const sel = withSelection({}, target.name.full, 0, '玄');
    expect(saveHanjaSelections('test-key', scope, sel, storage)).toBe(true);

    const reloaded = loadHanjaSelections('test-key', scope, storage);
    expect(reloaded).toEqual(sel);
    const after = applyHanjaSelections(fresh(), reloaded); // a new analysis run, as after a page reload
    expect(after[0].name.hanja.given[0]).toMatchObject({ hanja: '玄', status: 'confirmed', strokes: 5 });

    mem.set('test-key', '{not json');
    expect(loadHanjaSelections('test-key', scope, storage)).toEqual({});
    expect(parseHanjaSelections({ names: { 김현준: ['賢'] } })).toEqual({}); // no version
    expect(parseHanjaSelections({ version: 1, names: { 김현준: ['AB', null], 김현서: ['賢', null] } }))
      .toEqual({ 김현서: ['賢', null] });
    expect(parseHanjaSelections('garbage')).toEqual({});
  });

  it('ignores a stored selection that is not an option for that syllable', () => {
    const before = fresh();
    const bad: HanjaSelections = { [before[0].name.full]: ['俊'] };
    expect(applyHanjaSelections(before, bad)[0]).toBe(before[0]);
  });
});

// ─── Mode C name handling ────────────────────────────────────────────────────

describe('Mode C name parsing', () => {
  it.each([
    ['김민준', '김', '민준'],
    ['남궁민준', '남궁', '민준'],
    ['김준', '김', '준'],
    ['김가나다', '김', '가나다'],
    ['남궁 민', '남궁', '민'],
    ['남 궁민', '남', '궁민'],
    ['  이 서아 ', '이', '서아'],
    ['남궁가나다', '남궁', '가나다'],
  ])('%s → %s / %s', (raw, surname, given) => {
    expect(parseKoreanName(raw)).toEqual({ ok: true, surname, given });
  });

  it.each([
    ['남궁민', 'ambiguous'],
    ['선우진', 'ambiguous'],
    ['AB', 'not-hangul'],
    ['金민준', 'not-hangul'],
    ['ㄱㄴ', 'not-hangul'],
    ['김', 'length'],
    ['김가나다라', 'length'],
    ['김 민 준', 'length'],
    ['', 'empty'],
  ])('%s is rejected (%s)', (raw, reason) => {
    expect(parseKoreanName(raw)).toMatchObject({ ok: false, reason });
  });

  it('preserves full surname and every given syllable without assigning Hanja', () => {
    const { results } = modeC(['김민준', '남궁민준', '김준', '김가나다']);
    const by = Object.fromEntries(results.map(r => [r.name.full, r]));
    expect(Object.keys(by).sort()).toEqual(['김가나다', '김민준', '김준', '남궁민준'].sort());

    expect(by['남궁민준'].name).toMatchObject({ surname: '남궁', given: '민준' });
    expect(by['남궁민준'].name.hanja.surname.map(c => [c.hangul, c.hanja])).toEqual([['남', null], ['궁', null]]);
    expect(by['김준'].name.hanja.given).toHaveLength(1);
    expect(by['김준'].nameAnalysis.hanja).toBe(UNASSIGNED_MARK);
    expect(by['김가나다'].name.hanja.given.map(c => c.hangul)).toEqual(['가', '나', '다']);
    expect(by['김가나다'].nameAnalysis.meanings).toHaveLength(3);

    for (const r of results) {
      expect(r.name.hanja.given.every(c => c.status === 'unassigned' && c.hanja === null)).toBe(true);
      expect(r.description).not.toMatch(/이름 .*의 의미를 담고 있습니다/);
      expectConsistent(r.name, r);
    }
    expect(formatFullHanja(by['김민준'].name.hanja)).toBe('金□□');
  });

  it('handles unsupported characters explicitly and keeps them in the name', () => {
    const { results } = modeC(['김똥개']);
    expect(results[0].name.given).toBe('똥개');
    expect(results[0].name.hanja.given.map(c => c.status)).toEqual(['unassigned', 'unassigned']);
    expect(HANJA_DB['똥']).toBeUndefined();
  });

  it('reports invalid, ambiguous and duplicate legacy entries instead of guessing', () => {
    const { results, rejected } = modeC(['남궁민', 'AB', '김민준', '김민준', '남궁 민']);
    expect(results.map(r => r.name.full).sort()).toEqual(['김민준', '남궁민']);
    expect(results.find(r => r.name.full === '남궁민')!.name.surname).toBe('남궁');
    expect(rejected.map(r => r.input)).toEqual(['남궁민', 'AB', '김민준']);
  });

  it('selections in Mode C confirm only the chosen syllable', () => {
    const { results } = modeC(['김가나다']);
    const after = applyHanjaSelections(results, { 김가나다: [null, '娜', null] });
    expect(after[0].name.hanja.given.map(c => [c.hanja, c.status])).toEqual([
      [null, 'unassigned'], ['娜', 'confirmed'], [null, 'unassigned'],
    ]);
    expect(after[0].nameAnalysis.hanja).toBe('□娜□');
    expect(after[0].scores).toEqual(results[0].scores);
    expectConsistent(after[0].name, after[0]);
  });

  it('result ids include the surname (no collisions between surnames)', () => {
    const { results } = modeC(['김민준', '이민준']);
    expect(new Set(results.map(r => r.id)).size).toBe(2);
  });
});
