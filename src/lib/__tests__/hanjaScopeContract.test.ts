// R3 C1 / C2 (independent H2 audit): the analysis scope must be the exact
// canonical serialization of a validated Mode B or Mode C input, and the
// COMPLETE final selection map (stored positions included) must fit that
// analysis in both save APIs. Failures never touch the stored text.
import { describe, expect, it } from 'vitest';
import { ModeBInput, ModeCInput } from '@/types';
import {
  HANJA_SELECTION_KEYS, HanjaSelections, analysisScope, loadHanjaSelections, readHanjaStore,
  saveHanjaSelectionPatch, saveHanjaSelections,
} from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { COMPOUND_SURNAMES } from '@/lib/nameParser';

const KEY = HANJA_SELECTION_KEYS.modeC;
const B_RAW: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const B = (over: Partial<ModeBInput> = {}) => {
  const v = validateModeBInput({ ...B_RAW, ...over });
  if (!v.ok) throw new Error('invalid B'); return analysisScope(v.value);
};
const C = (names: string[], over: Partial<ModeCInput> = {}) => {
  const v = validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names, ...over });
  if (!v.ok) throw new Error('invalid C'); return analysisScope(v.value);
};
const OTHER = C(['김민서'], { birthDate: '2027-07-05' });

function storage(extra: Record<string, { updatedAt: number; names: HanjaSelections }> = {}) {
  const raw = JSON.stringify({ version: 2, scopes: { [OTHER]: { updatedAt: 1, names: { 김민서: ['珉', '瑞'] } }, ...extra } });
  const m = new Map<string, string>([[KEY, raw]]);
  const calls = { get: 0, set: 0 };
  return {
    raw, m, calls,
    getItem: (k: string) => { calls.get++; return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { calls.set++; m.set(k, v); },
  };
}

/** Both APIs refuse `scope` for `fullName` without reading or writing storage. */
function expectScopeRefused(scope: string, fullName: string, index: number) {
  const st = storage();
  expect(saveHanjaSelectionPatch(KEY, scope, fullName, index, '敏', {}, st), scope).toEqual({ ok: false, reason: 'invalid-scope' });
  const sel: HanjaSelections = { [fullName]: Array.from({ length: index + 1 }, (_, i) => (i === index ? '敏' : null)) };
  expect(saveHanjaSelections(KEY, scope, sel, st), scope).toBe(false);
  expect(st.calls).toEqual({ get: 0, set: 0 });
  expect(st.m.get(KEY)).toBe(st.raw);
}

describe('C1: fabricated, mixed, incomplete or noncanonical scopes are refused before storage access', () => {
  it('audit reproductions', () => {
    expectScopeRefused('{"surname":"남"}', '남궁민', 1); // Mode B-like fragment
    expectScopeRefused('{"names":["김민서"]}', '김민서', 1); // Mode C-like fragment
    // a valid Mode B scope plus an unexpected names field (mixed B/C)
    const mixed = JSON.parse(B({ surname: '남궁' }));
    mixed.names = ['남 궁민'];
    expectScopeRefused(analysisScope(mixed), '남궁민', 1);
  });

  it('mixed fields in the other direction (valid Mode C scope plus a surname)', () => {
    const mixed = JSON.parse(C(['김민서']));
    mixed.surname = '김';
    expectScopeRefused(analysisScope(mixed), '김민서', 0);
  });

  it('missing required fields (as defined by the validators) and malformed scopes', () => {
    for (const drop of ['birthDate', 'birthHour', 'gender', 'surname']) {
      const s = JSON.parse(B()); delete s[drop];
      expectScopeRefused(analysisScope(s), '김민서', 0);
    }
    for (const drop of ['birthDate', 'birthHour', 'gender', 'names']) {
      const s = JSON.parse(C(['김민서'])); delete s[drop];
      expectScopeRefused(analysisScope(s), '김민서', 0);
    }
    for (const bad of ['', 'not json', 'null', '[]', '"x"', '42', '{}', '{"x":1}']) expectScopeRefused(bad, '김민서', 0);
    // invalid values of otherwise complete scopes
    expectScopeRefused(analysisScope({ ...JSON.parse(B()), birthDate: '2027-02-30' }), '김민서', 0);
    expectScopeRefused(analysisScope({ ...JSON.parse(B()), birthHour: 24 }), '김민서', 0);
    expectScopeRefused(analysisScope({ ...JSON.parse(B()), gender: 'x' }), '김민서', 0);
    expectScopeRefused(analysisScope({ ...JSON.parse(C(['김민서'])), names: [] }), '김민서', 0);
  });

  it('noncanonical serializations of a valid scope are refused (no silent repair)', () => {
    const valid = B();
    const obj = JSON.parse(valid);
    const reordered = JSON.stringify(Object.fromEntries(Object.keys(obj).reverse().map(k => [k, obj[k]])));
    expect(reordered).not.toBe(valid);
    expectScopeRefused(reordered, '김민서', 0); // key order
    expectScopeRefused(JSON.stringify(obj, null, 1), '김민서', 0); // whitespace
    expectScopeRefused(analysisScope({ ...obj, surname: ' 김' }), '김민서', 0); // untrimmed value
    expectScopeRefused(analysisScope({ ...obj, nameStyles: ['전통형', '전통형'] }), '김민서', 0); // duplicate list entries
    expectScopeRefused(analysisScope({ ...obj, sijinVersion: 2 }), '김민서', 0); // 자시 marker on a non-자시 hour
    expectScopeRefused(analysisScope({ ...obj, dolrimPosition: undefined, extra: 1 }), '김민서', 0); // unknown field
    const c = JSON.parse(C(['김민서', '이준']));
    expectScopeRefused(JSON.stringify({ ...c, names: ['이준', '김민서'] }), '김민서', 0); // unsorted string list
  });

  it('legacy 자시 scopes (no sijinVersion) are refused; early/late 자시 canonical scopes are accepted', () => {
    const legacy = JSON.parse(B({ birthHour: 0, sijinVersion: 2 }));
    delete legacy.sijinVersion;
    expectScopeRefused(analysisScope(legacy), '김민서', 0);
    for (const birthHour of [0, 23]) {
      for (const scope of [B({ birthHour, sijinVersion: 2 }), C(['김민서'], { birthHour, sijinVersion: 2 })]) {
        expect(JSON.parse(scope).sijinVersion).toBe(2);
        const st = storage();
        expect(saveHanjaSelectionPatch(KEY, scope, '김민서', 1, '敏', {}, st)).toEqual({ ok: true, selections: { 김민서: [null, '敏'] } });
        expect(saveHanjaSelections(KEY, scope, { 김민서: ['珉', '敏'] }, st)).toBe(true);
        expect(loadHanjaSelections(KEY, scope, st)).toEqual({ 김민서: ['珉', '敏'] });
        expect(loadHanjaSelections(KEY, OTHER, st)).toEqual({ 김민서: ['珉', '瑞'] });
      }
    }
  });

  it('valid canonical Mode B and Mode C scopes (incl. dolrim, images, styles) keep working', () => {
    for (const scope of [
      B(), B({ surname: '남궁' }), B({ images: ['학자형', '리더형'], nameStyles: [] }),
      B({ dolrimChar: '서', dolrimPosition: 'second' }), B({ gender: '여' }),
      C(['김민서']), C(['남궁 민', '이준', '김민서']), C(['김민서'], { gender: '여' }),
    ]) {
      const name = JSON.parse(scope).surname === '남궁' ? '남궁민서' : '김민서';
      const st = storage();
      expect(saveHanjaSelectionPatch(KEY, scope, name, 0, '敏', {}, st), scope).toEqual({ ok: true, selections: { [name]: ['敏'] } });
      expect(saveHanjaSelections(KEY, scope, { [name]: ['敏', '瑞'] }, st), scope).toBe(true);
      const back = readHanjaStore(KEY, st);
      expect(back.ok && back.store.scopes[scope].names).toEqual({ [name]: ['敏', '瑞'] });
    }
  });
});

describe('C2: the complete final selection map must fit the analysis in both APIs', () => {
  const SCOPE = C(['김민서']);

  it('audit reproduction: a stored position beyond the given name is never re-saved', () => {
    const st = storage({ [SCOPE]: { updatedAt: 2, names: { 김민서: [null, '書', '敏'] } } });
    expect(readHanjaStore(KEY, st).ok).toBe(true); // structurally readable (pre-H2 data shape)
    st.calls.get = 0;
    expect(saveHanjaSelectionPatch(KEY, SCOPE, '김민서', 0, '敏', {}, st)).toEqual({ ok: false, reason: 'invalid-stored-selection' });
    expect(saveHanjaSelections(KEY, SCOPE, { 김민서: ['敏', '書', '敏'] }, st)).toBe(false);
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(st.raw); // no truncation, no migration
  });

  it('a stored name that is not part of the analysis is not re-saved either', () => {
    const st = storage({ [SCOPE]: { updatedAt: 2, names: { 김민서: [null, '書'], 이준: ['俊'] } } });
    expect(saveHanjaSelectionPatch(KEY, SCOPE, '김민서', 0, '敏', {}, st)).toEqual({ ok: false, reason: 'invalid-stored-selection' });
    expect(saveHanjaSelections(KEY, SCOPE, { 김민서: ['敏', '書'], 이준: ['俊'] }, st)).toBe(false);
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(st.raw);
  });

  it('one-syllable and compound-surname stored records beyond the given name are refused', () => {
    for (const s of ['김', ...COMPOUND_SURNAMES]) {
      const scope = C([`${s} 민`, `${s}가나서`]);
      const bad = storage({ [scope]: { updatedAt: 2, names: { [`${s}민`]: [null, '書'] } } });
      expect(saveHanjaSelectionPatch(KEY, scope, `${s}민`, 0, '敏', {}, bad)).toEqual({ ok: false, reason: 'invalid-stored-selection' });
      expect(bad.m.get(KEY)).toBe(bad.raw);
      const good = storage({ [scope]: { updatedAt: 2, names: { [`${s}민`]: ['書'], [`${s}가나서`]: [null, '書'] } } });
      expect(saveHanjaSelectionPatch(KEY, scope, `${s}가나서`, 2, '敏', {}, good))
        .toEqual({ ok: true, selections: { [`${s}민`]: ['書'], [`${s}가나서`]: [null, '書', '敏'] } });
      expect(loadHanjaSelections(KEY, scope, good)).toEqual({ [`${s}민`]: ['書'], [`${s}가나서`]: [null, '書', '敏'] });
      expect(loadHanjaSelections(KEY, OTHER, good)).toEqual({ 김민서: ['珉', '瑞'] });
    }
  });

  it('valid stored records keep every position, name and unrelated scope', () => {
    const scope = C(['김민서', '이준', '김가나서']);
    const st = storage({ [scope]: { updatedAt: 2, names: { 김민서: [null, '書'], 이준: ['俊'], 김가나서: ['家', null, '瑞'] } } });
    expect(saveHanjaSelectionPatch(KEY, scope, '김민서', 0, '敏', {}, st))
      .toEqual({ ok: true, selections: { 김민서: ['敏', '書'], 이준: ['俊'], 김가나서: ['家', null, '瑞'] } });
    expect(loadHanjaSelections(KEY, scope, st)).toEqual({ 김민서: ['敏', '書'], 이준: ['俊'], 김가나서: ['家', null, '瑞'] }); // reload
    expect(loadHanjaSelections(KEY, OTHER, st)).toEqual({ 김민서: ['珉', '瑞'] });
  });

  it('a valid canonical record wins over an invalid UI seed (the seed is not written)', () => {
    const st = storage({ [SCOPE]: { updatedAt: 2, names: { 김민서: [null, '書'] } } });
    expect(saveHanjaSelectionPatch(KEY, SCOPE, '김민서', 0, '敏', { 김민서: [null, '書', '敏'], 이준: ['俊'] }, st))
      .toEqual({ ok: true, selections: { 김민서: ['敏', '書'] } });
  });

  it('without a record, an invalid seed is refused with no write', () => {
    const st = storage();
    expect(saveHanjaSelectionPatch(KEY, SCOPE, '김민서', 0, '敏', { 김민서: [null, '書', '敏'] }, st)).toEqual({ ok: false, reason: 'invalid-selection' });
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(st.raw);
  });

  it('failed writes preserve raw storage; successful writes survive reload (both APIs)', () => {
    const st = storage({ [SCOPE]: { updatedAt: 2, names: { 김민서: [null, '書'] } } });
    const failing = { ...st, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    expect(saveHanjaSelectionPatch(KEY, SCOPE, '김민서', 0, '敏', {}, failing)).toEqual({ ok: false, reason: 'quota-exceeded' });
    expect(saveHanjaSelections(KEY, SCOPE, { 김민서: ['敏', '書'] }, failing)).toBe(false);
    expect(st.m.get(KEY)).toBe(st.raw);
    expect(saveHanjaSelections(KEY, SCOPE, { 김민서: ['敏', null] }, st)).toBe(true);
    expect(loadHanjaSelections(KEY, SCOPE, st)).toEqual({ 김민서: ['敏', null] });
    expect(saveHanjaSelectionPatch(KEY, SCOPE, '김민서', 1, '書', {}, st)).toEqual({ ok: true, selections: { 김민서: ['敏', '書'] } });
    expect(loadHanjaSelections(KEY, SCOPE, st)).toEqual({ 김민서: ['敏', '書'] });
  });
});
