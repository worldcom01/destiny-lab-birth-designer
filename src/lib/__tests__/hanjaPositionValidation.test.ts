// R3 H2-P / H2-T: a Hanja position must exist in the actual given name, and the
// full name must be a real string. The given-name length comes from the
// canonical analysis scope being saved to (never from the caller, never by
// guessing the surname boundary from the full name).
import { describe, expect, it } from 'vitest';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, HanjaSelections, analysisScope, readHanjaStore, saveHanjaSelectionPatch, saveHanjaSelections } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { COMPOUND_SURNAMES } from '@/lib/nameParser';

const KEY = HANJA_SELECTION_KEYS.modeB;
const B = (over: Partial<ModeBInput> = {}) => {
  const v = validateModeBInput({ birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], ...over });
  if (!v.ok) throw new Error('invalid B'); return analysisScope(v.value);
};
const C = (names: string[]) => {
  const v = validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names } as ModeCInput);
  if (!v.ok) throw new Error('invalid C'); return analysisScope(v.value);
};
const OTHER = B({ birthDate: '2027-07-05' });

function storage() {
  const raw = JSON.stringify({ version: 2, scopes: { [OTHER]: { updatedAt: 1, names: { 김민서: ['珉', '瑞'] } } } });
  const m = new Map<string, string>([[KEY, raw]]);
  const calls = { set: 0 };
  return { raw, m, calls, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { calls.set++; m.set(k, v); } };
}
const save = (scope: string, fullName: unknown, index: number, st = storage()) =>
  ({ st, r: saveHanjaSelectionPatch(KEY, scope, fullName as string, index, '敏', {}, st) });
const expectRejected = (scope: string, fullName: unknown, index: number) => {
  const { st, r } = save(scope, fullName, index);
  expect(r, `${JSON.stringify(fullName)} @${index}`).toEqual({ ok: false, reason: 'invalid-selection' });
  expect(st.calls.set).toBe(0);
  expect(st.m.get(KEY)).toBe(st.raw);
};
const expectSaved = (scope: string, fullName: string, index: number) => {
  const { st, r } = save(scope, fullName, index);
  const want: (string | null)[] = Array.from({ length: index + 1 }, (_, i) => (i === index ? '敏' : null));
  expect(r, `${fullName} @${index}`).toEqual({ ok: true, selections: { [fullName]: want } });
  const back = readHanjaStore(KEY, st);
  expect(back.ok && back.store.scopes[scope].names[fullName]).toEqual(want);
  expect(back.ok && back.store.scopes[OTHER].names).toEqual({ 김민서: ['珉', '瑞'] }); // unrelated scope kept
};

describe('H2-P: positions outside the actual given name are rejected before any write', () => {
  it('audit counterexamples', () => {
    expectRejected(C(['김민']), '김민', 1);
    expectRejected(C(['김민']), '김민', 2);
    expectRejected(C(['김민서']), '김민서', 2);
    expectRejected(B(), '김민서', 2); // Mode B names are surname + 2 syllables
    expectRejected(C(['남궁 민']), '남궁민', 1);
    expectRejected(C(['남궁 민']), '남궁민', 2);
  });

  it('valid positions', () => {
    expectSaved(C(['김민']), '김민', 0);
    for (const i of [0, 1]) { expectSaved(C(['김민서']), '김민서', i); expectSaved(B(), '김민서', i); }
    for (const i of [0, 1, 2]) expectSaved(C(['김가나서']), '김가나서', i);
    expectSaved(C(['남궁 민']), '남궁민', 0);
    for (const i of [0, 1, 2]) expectSaved(C(['남궁가나서']), '남궁가나서', i);
  });

  it('every supported compound surname, with 1-, 2- and 3-syllable given names (Mode C) and Mode B', () => {
    for (const s of COMPOUND_SURNAMES) {
      const one = `${s}민`, two = `${s}민서`, three = `${s}가나서`;
      const scope = C([`${s} 민`, two, three]);
      expectSaved(scope, one, 0); expectRejected(scope, one, 1);
      expectSaved(scope, two, 1); expectRejected(scope, two, 2);
      expectSaved(scope, three, 2);
      const b = B({ surname: s });
      expectSaved(b, two, 0); expectSaved(b, two, 1); expectRejected(b, two, 2);
    }
  });

  it('a full name that is not part of the scope (or does not carry its surname) is rejected', () => {
    expectRejected(C(['김민서']), '이민서', 0);
    expectRejected(B(), '이민서', 0);
    expectRejected(B({ surname: '남궁' }), '남궁', 0); // no given name at all
    expectRejected(B(), '김민서준아', 0); // given name longer than 3 syllables
  });

  it('an ambiguous surname boundary inside one scope is never guessed', () => {
    // '남궁 민' (given 민) and '남 궁민' (given 궁민) both produce the full name 남궁민.
    const scope = C(['남궁 민', '남 궁민']);
    expectRejected(scope, '남궁민', 0);
    expectRejected(scope, '남궁민', 1);
  });

  it('scopes that carry no verifiable name context are rejected (explicit invalid-scope since audit C1)', () => {
    for (const scope of ['{"x":1}', 'not json']) {
      const { st, r } = save(scope, '김민서', 0);
      expect(r).toEqual({ ok: false, reason: 'invalid-scope' });
      expect(st.calls.set).toBe(0);
      expect(st.m.get(KEY)).toBe(st.raw);
    }
  });

  it('the whole-scope saveHanjaSelections API applies the same position rule', () => {
    const st = storage();
    expect(saveHanjaSelections(KEY, C(['김민']), { 김민: [null, '敏'] }, st)).toBe(false);
    expect(saveHanjaSelections(KEY, B(), { 김민서: [null, null, '敏'] }, st)).toBe(false);
    expect(saveHanjaSelections(KEY, B(), { 이민서: ['敏'] }, st)).toBe(false);
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(st.raw);
    expect(saveHanjaSelections(KEY, B(), { 김민서: ['敏', null], 김서윤: [null, '潤'] }, st)).toBe(true);
  });
});

describe('H2-P: the seed cannot bypass the rule; stored records are never migrated', () => {
  it('a seed with an out-of-range position or a foreign name is refused when it would be written', () => {
    const scope = C(['김민']);
    for (const seed of [{ 김민: [null, '敏'] }, { 이민서: ['敏'] }] as HanjaSelections[]) {
      const st = storage();
      expect(saveHanjaSelectionPatch(KEY, scope, '김민', 0, '敏', seed, st)).toEqual({ ok: false, reason: 'invalid-selection' });
      expect(st.calls.set).toBe(0);
      expect(st.m.get(KEY)).toBe(st.raw);
    }
  });

  it('an existing stored record with entries outside the rule is refused as a whole and kept as stored (audit C2)', () => {
    const st = storage();
    const legacy = JSON.stringify({ version: 2, scopes: { [B()]: { updatedAt: 1, names: { 김민서: [null, '書'], 이준: ['俊'] } } } });
    st.m.set(KEY, legacy);
    // previously re-saved with ok:true; now neither re-saved nor truncated/migrated
    expect(saveHanjaSelectionPatch(KEY, B(), '김민서', 0, '敏', { 김민서: [null, '書'], 이준: ['俊'] }, st))
      .toEqual({ ok: false, reason: 'invalid-stored-selection' });
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(legacy);
  });

  it('an existing valid record is patched as stored; the shown seed is not written', () => {
    const st = storage();
    st.m.set(KEY, JSON.stringify({ version: 2, scopes: { [B()]: { updatedAt: 1, names: { 김민서: [null, '書'] } } } }));
    expect(saveHanjaSelectionPatch(KEY, B(), '김민서', 0, '敏', { 김민서: [null, '書'], 이준: ['俊'] }, st))
      .toEqual({ ok: true, selections: { 김민서: ['敏', '書'] } });
  });
});

describe('H2-T: non-string full names are rejected before any write', () => {
  it.each([[['김민서']], [{ toString: () => '김민서' }], [null], [undefined], [123], [true]])('%j', value => {
    expectRejected(B(), value, 0);
    expectRejected(C(['김민서']), value, 0);
  });
});
