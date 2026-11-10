// R3 storage boundary fixes (independent audit H1, H2, H3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModeBInput } from '@/types';
import {
  HANJA_SELECTION_KEYS, analysisScope, loadHanjaSelections, readHanjaStore, saveHanjaSelectionPatch, saveHanjaSelections,
} from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';

const KEY = HANJA_SELECTION_KEYS.modeB;
const BASE: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const scope = (over: Partial<ModeBInput> = {}) => { const v = validateModeBInput({ ...BASE, ...over }); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const NOW = scope();
const OTHER = scope({ birthDate: '2027-07-05' });
const augustScopes = () => Array.from({ length: 20 }, (_, i) => scope({ birthDate: `2027-08-${String(i + 1).padStart(2, '0')}` }));

function storage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  const calls = { set: 0 };
  return { m, calls, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { calls.set++; m.set(k, v); } };
}

afterEach(() => vi.restoreAllMocks());

describe('H1: the scope being saved is always retained (no false success)', () => {
  it('20 valid scopes with future timestamps: the new selection is stored, 19 newest others kept', () => {
    const future = Date.now() + 86_400_000;
    const scopes = augustScopes();
    const raw = JSON.stringify({ version: 2, scopes: Object.fromEntries(scopes.map((s, i) => [s, { updatedAt: future + i, names: { 김민서: ['珉', null] } }])) });
    const st = storage({ [raw ? KEY : '']: raw });
    const r = saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, st);
    expect(r).toEqual({ ok: true, selections: { 김민서: ['敏'] } });
    const stored = JSON.parse(st.m.get(KEY)!).scopes;
    expect(Object.keys(stored)).toHaveLength(20); // retention size unchanged
    expect(stored[NOW].names).toEqual({ 김민서: ['敏'] });
    expect(loadHanjaSelections(KEY, NOW, st)).toEqual({ 김민서: ['敏'] }); // "reload"
    expect(stored[scopes[0]]).toBeUndefined(); // the oldest of the others is the one dropped
    for (const s of scopes.slice(1)) expect(stored[s]).toBeDefined();
  });

  it('normal timestamps: retention behaves exactly as before (19 → 20, 20 → 20 dropping the oldest, 21 → 20)', () => {
    for (const [existing, dropped] of [[19, 0], [20, 1], [21, 2]] as const) {
      const scopes = Array.from({ length: existing }, (_, i) => scope({ birthDate: `2027-09-${String(i + 1).padStart(2, '0')}` }));
      const raw = JSON.stringify({ version: 2, scopes: Object.fromEntries(scopes.map((s, i) => [s, { updatedAt: 1000 + i, names: {} }])) });
      const st = storage({ [KEY]: raw });
      expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, st).ok).toBe(true);
      const stored = JSON.parse(st.m.get(KEY)!).scopes;
      expect(Object.keys(stored)).toHaveLength(Math.min(existing + 1, 20));
      for (const s of scopes.slice(0, dropped)) expect(stored[s]).toBeUndefined();
      for (const s of scopes.slice(dropped)) expect(stored[s]).toBeDefined();
    }
  });
});

describe('H2: invalid patch arguments, seeds and selections are refused before any write', () => {
  const raw = JSON.stringify({ version: 2, scopes: { [NOW]: { updatedAt: 1, names: { 김민서: [null, '書'] } } } });
  const cases: [string, string, number, string][] = [
    ['index -1', '김민서', -1, '敏'],
    ['index 0.5', '김민서', 0.5, '敏'],
    ['index NaN', '김민서', Number.NaN, '敏'],
    ['index 3 (array would exceed 3 positions)', '김민서', 3, '敏'],
    ['index Infinity (would never finish growing the array before the fix)', '김민서', Infinity, '敏'],
    ['index 1e9', '김민서', 1e9, '敏'],
    ['hanja not a single Hanja', '김민서', 0, 'invalid'],
    ['hanja empty', '김민서', 0, ''],
    ['full name not 2-5 Hangul', 'abc', 0, '敏'],
  ];
  it.each(cases)('%s', (_label, name, index, hanja) => {
    const st = storage({ [KEY]: raw });
    expect(saveHanjaSelectionPatch(KEY, NOW, name, index, hanja, {}, st)).toEqual({ ok: false, reason: 'invalid-selection' });
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(raw);
    expect(readHanjaStore(KEY, st).ok).toBe(true); // storage still readable
  });

  it('an invalid seed (used only when the scope has no record) is refused', () => {
    const st = storage();
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', { 김민서: ['x', null] }, st)).toEqual({ ok: false, reason: 'invalid-selection' });
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', { bad: ['敏'] }, st)).toEqual({ ok: false, reason: 'invalid-selection' });
    expect(st.calls.set).toBe(0);
  });

  it('saveHanjaSelections refuses selections the strict reader would reject', () => {
    const st = storage({ [KEY]: raw });
    for (const sel of [{ 김민서: ['x'] }, { 김민서: [] }, { 김민서: ['敏', null, null, '瑞'] }, { abc: ['敏'] }] as never[]) {
      expect(saveHanjaSelections(KEY, NOW, sel, st)).toBe(false);
    }
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(raw);
  });

  it('김민서 has only two given syllables: index 2 is rejected (corrected per audit H2-P)', () => {
    const st = storage({ [KEY]: raw });
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 2, '敏', {}, st)).toEqual({ ok: false, reason: 'invalid-selection' });
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(raw);
  });

  it('a genuine three-syllable given name accepts index 2 (Mode C scope)', () => {
    const v = validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: ['김가나서'] });
    if (!v.ok) throw new Error('invalid');
    const c = analysisScope(v.value);
    const st = storage({ [KEY]: raw });
    expect(saveHanjaSelectionPatch(KEY, c, '김가나서', 2, '敏', {}, st)).toEqual({ ok: true, selections: { 김가나서: [null, null, '敏'] } });
    expect(readHanjaStore(KEY, st).ok).toBe(true);
    expect(loadHanjaSelections(KEY, NOW, st)).toEqual({ 김민서: [null, '書'] }); // other scope kept
  });
});

describe('H3: non-finite timestamps are rejected; a write can never produce unreadable data', () => {
  const withOther = (ts: string) =>
    `{"version":2,"scopes":{${JSON.stringify(OTHER)}:{"updatedAt":${ts},"names":{"김민서":["珉","瑞"]}},${JSON.stringify(NOW)}:{"updatedAt":1,"names":{"김민서":[null,"書"]}}}}`;

  it.each([['1e309 (JSON overflow → Infinity)', '1e309'], ['-1e309 (→ -Infinity)', '-1e309']])('existing %s is invalid and is never rewritten', (_l, ts) => {
    const raw = withOther(ts);
    expect(Number.isFinite(JSON.parse(raw).scopes[OTHER].updatedAt)).toBe(false);
    const st = storage({ [KEY]: raw });
    expect(readHanjaStore(KEY, st)).toEqual({ ok: false, reason: 'invalid-schema' });
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, st)).toEqual({ ok: false, reason: 'invalid-schema' });
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(raw);
  });

  it('NaN is not valid JSON at all: malformed-json, raw unchanged', () => {
    const raw = withOther('NaN');
    const st = storage({ [KEY]: raw });
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, st)).toEqual({ ok: false, reason: 'malformed-json' });
    expect(st.m.get(KEY)).toBe(raw);
  });

  it.each([['Infinity', Infinity], ['-Infinity', -Infinity], ['NaN', Number.NaN]])('a non-finite clock (%s) is refused before setItem', (_l, value) => {
    vi.spyOn(Date, 'now').mockReturnValue(value);
    const raw = withOther('5');
    const st = storage({ [KEY]: raw });
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, st)).toEqual({ ok: false, reason: 'invalid-output' });
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(raw);
  });

  it('every successful write round-trips through the strict reader with the intended record', () => {
    const st = storage({ [KEY]: withOther('5') });
    const r = saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, st);
    expect(r).toEqual({ ok: true, selections: { 김민서: ['敏', '書'] } });
    const back = readHanjaStore(KEY, st);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.store.scopes[NOW].names).toEqual({ 김민서: ['敏', '書'] });
      expect(back.store.scopes[OTHER]).toEqual({ updatedAt: 5, names: { 김민서: ['珉', '瑞'] } });
    }
  });
});
