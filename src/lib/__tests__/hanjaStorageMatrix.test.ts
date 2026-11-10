// R3 data-safety hotfix: storage failure matrix for the strict read/write contract.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModeBInput } from '@/types';
import {
  HANJA_READ_LIMITS, HANJA_SELECTION_KEYS, HanjaSelections, HanjaStoreFailure, analysisScope, hanjaSaveFailureMessage,
  loadHanjaSelections, loadHanjaSelectionsWithLegacy, readHanjaStore, saveHanjaSelectionPatch, saveHanjaSelections,
} from '@/lib/hanjaModel';
import { validateModeBInput } from '@/lib/inputValidation';

const KEY = HANJA_SELECTION_KEYS.modeB;
const BASE: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const scope = (over: Partial<ModeBInput> = {}) => { const v = validateModeBInput({ ...BASE, ...over }); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const NOW = scope();
const OTHER = scope({ birthDate: '2027-07-05' });
const storeText = (scopes: Record<string, HanjaSelections>) =>
  JSON.stringify({ version: 2, scopes: Object.fromEntries(Object.entries(scopes).map(([s, n], i) => [s, { updatedAt: i + 1, names: n }])) });

type Mode = { getThrows?: boolean; setThrows?: 'quota' | 'error' };
function storage(seed: Record<string, string> = {}, mode: Mode = {}) {
  const m = new Map(Object.entries(seed));
  const calls = { get: 0, set: 0 };
  return {
    m, calls, mode,
    getItem(k: string) { calls.get++; if (mode.getThrows) throw new DOMException('blocked', 'SecurityError'); return m.get(k) ?? null; },
    setItem(k: string, v: string) {
      calls.set++;
      if (mode.setThrows === 'quota') throw new DOMException('full', 'QuotaExceededError');
      if (mode.setThrows === 'error') throw new Error('write failed');
      m.set(k, v);
    },
  };
}
const patch = (st: ReturnType<typeof storage>, seed: HanjaSelections = {}, s = NOW, max?: number) =>
  saveHanjaSelectionPatch(KEY, s, '김민서', 0, '敏', seed, st, max);
const namesOf = (st: ReturnType<typeof storage>, s: string) => loadHanjaSelections(KEY, s, st);

afterEach(() => vi.restoreAllMocks());

describe('successful saves (verified writes)', () => {
  it('missing key: safe first save', () => {
    const st = storage();
    expect(readHanjaStore(KEY, st)).toMatchObject({ ok: true, kind: 'missing' });
    expect(patch(st)).toEqual({ ok: true, selections: { 김민서: ['敏'] } });
    expect(namesOf(st, NOW)).toEqual({ 김민서: ['敏'] });
  });

  it('valid empty database: safe save', () => {
    const st = storage({ [KEY]: JSON.stringify({ version: 2, scopes: {} }) });
    expect(readHanjaStore(KEY, st)).toMatchObject({ ok: true, kind: 'empty' });
    expect(patch(st).ok).toBe(true);
    expect(namesOf(st, NOW)).toEqual({ 김민서: ['敏'] });
  });

  it("existing [null, '書']: position 1 updated, position 2 kept", () => {
    // another name of this Mode B analysis (김 + 2 syllables); a foreign name is refused since audit C2
    const st = storage({ [KEY]: storeText({ [NOW]: { 김민서: [null, '書'], 김서윤: [null, '潤'] } }) });
    expect(readHanjaStore(KEY, st)).toMatchObject({ ok: true, kind: 'nonempty' });
    expect(patch(st)).toEqual({ ok: true, selections: { 김민서: ['敏', '書'], 김서윤: [null, '潤'] } });
    expect(namesOf(st, NOW)).toEqual({ 김민서: ['敏', '書'], 김서윤: [null, '潤'] });
  });

  it('multiple analysis scopes: unrelated scopes are kept exactly', () => {
    const st = storage({ [KEY]: storeText({ [OTHER]: { 김민서: ['珉', '瑞'] }, [NOW]: { 김민서: [null, '書'] } }) });
    expect(patch(st).ok).toBe(true);
    expect(namesOf(st, OTHER)).toEqual({ 김민서: ['珉', '瑞'] });
    expect(namesOf(st, NOW)).toEqual({ 김민서: ['敏', '書'] });
  });

  it('an existing explicitly empty canonical record wins over the shown (seed) selections', () => {
    const st = storage({ [KEY]: storeText({ [NOW]: {} }) });
    // seed must belong to this analysis (H2-P); a stored {} still wins over it
    expect(patch(st, { 김서윤: [null, '潤'] })).toEqual({ ok: true, selections: { 김민서: ['敏'] } });
  });

  it('no canonical record yet: the shown (e.g. recovered) selections seed the record; legacy scopes stay', () => {
    const v = validateModeBInput(BASE); if (!v.ok) throw new Error();
    const legacy = analysisScope({ ...v.value, nameStyles: ['전통형', '전통형'] });
    const st = storage({ [KEY]: storeText({ [legacy]: { 김민서: [null, '書'] } }) });
    const r = loadHanjaSelectionsWithLegacy(KEY, NOW, st);
    expect(r.recovery.kind).toBe('recovered');
    expect(patch(st, r.selections)).toEqual({ ok: true, selections: { 김민서: ['敏', '書'] } });
    expect(namesOf(st, legacy)).toEqual({ 김민서: [null, '書'] });
  });

  it('conflicting legacy selections (ambiguous): only the new choice is saved, legacy records stay', () => {
    const v = validateModeBInput(BASE); if (!v.ok) throw new Error();
    const a = analysisScope({ ...v.value, nameStyles: ['전통형', '전통형'] });
    const b = analysisScope({ ...v.value, nameStyles: ['전통형', '전통형', '전통형'] });
    const st = storage({ [KEY]: storeText({ [a]: { 김민서: ['珉', null] }, [b]: {} }) });
    const r = loadHanjaSelectionsWithLegacy(KEY, NOW, st);
    expect(r.recovery.kind).toBe('ambiguous');
    expect(patch(st, r.selections)).toEqual({ ok: true, selections: { 김민서: ['敏'] } });
    expect(namesOf(st, a)).toEqual({ 김민서: ['珉', null] });
    expect(namesOf(st, b)).toEqual({});
  });

  it('more than 50 stored scopes: the save applies the existing, unchanged 20-scope retention policy', () => {
    const many = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [scope({ dolrimChar: '', surname: '김' }).replace('"surname":"김"', `"surname":"김","x":${i}`), { 김민서: ['珉', null] }]));
    const st = storage({ [KEY]: storeText(many) });
    expect(loadHanjaSelectionsWithLegacy(KEY, NOW, st).recovery).toEqual({ kind: 'skipped', reason: 'scopes' });
    expect(patch(st).ok).toBe(true);
    const kept = Object.keys(JSON.parse(st.m.get(KEY)!).scopes);
    expect(kept).toHaveLength(20); // documented MAX_SCOPES policy on an explicit save (unchanged)
    expect(kept).toContain(NOW);
  });

  it('retry after the storage problem is resolved succeeds and keeps the other position', () => {
    const st = storage({ [KEY]: storeText({ [NOW]: { 김민서: [null, '書'] } }) }, { setThrows: 'quota' });
    const raw = st.m.get(KEY);
    expect(patch(st)).toEqual({ ok: false, reason: 'quota-exceeded' });
    expect(st.m.get(KEY)).toBe(raw);
    expect(namesOf(st, NOW)).toEqual({ 김민서: [null, '書'] }); // "reload" after the failure
    st.mode.setThrows = undefined;
    expect(patch(st)).toEqual({ ok: true, selections: { 김민서: ['敏', '書'] } });
    expect(namesOf(st, NOW)).toEqual({ 김민서: ['敏', '書'] });
  });
});

describe('refused saves: nothing written, raw payload unchanged, explicit reason', () => {
  const cases: [string, () => ReturnType<typeof storage>, HanjaStoreFailure][] = [
    ['malformed JSON', () => storage({ [KEY]: '{"version":2,"scopes":{' }), 'malformed-json'],
    ['top-level array', () => storage({ [KEY]: '[]' }), 'invalid-schema'],
    ['wrong version', () => storage({ [KEY]: JSON.stringify({ version: 1, names: { 김민서: ['珉'] } }) }), 'invalid-schema'],
    ['unknown top-level key', () => storage({ [KEY]: JSON.stringify({ version: 2, scopes: {}, extra: 1 }) }), 'invalid-schema'],
    ['unknown entry key', () => storage({ [KEY]: JSON.stringify({ version: 2, scopes: { [NOW]: { updatedAt: 1, names: {}, note: 'x' } } }) }), 'invalid-schema'],
    ['non-number updatedAt', () => storage({ [KEY]: JSON.stringify({ version: 2, scopes: { [NOW]: { updatedAt: 'x', names: {} } } }) }), 'invalid-schema'],
    ['invalid Hanja value (would be dropped)', () => storage({ [KEY]: JSON.stringify({ version: 2, scopes: { [OTHER]: { updatedAt: 1, names: { 김민서: ['x', '瑞'] } } } }) }), 'invalid-schema'],
    ['invalid scope key (would be dropped)', () => storage({ [KEY]: JSON.stringify({ version: 2, scopes: { other: { updatedAt: 1, names: {} } } }) }), 'invalid-schema'],
    ['getItem throws', () => storage({ [KEY]: storeText({ [OTHER]: { 김민서: ['珉', '瑞'] } }) }, { getThrows: true }), 'read-error'],
    ['setItem throws', () => storage({ [KEY]: storeText({ [OTHER]: { 김민서: ['珉', '瑞'] } }) }, { setThrows: 'error' }), 'write-error'],
    ['quota exceeded', () => storage({ [KEY]: storeText({ [OTHER]: { 김민서: ['珉', '瑞'] } }) }, { setThrows: 'quota' }), 'quota-exceeded'],
  ];
  it.each(cases)('%s', (_label, make, reason) => {
    const st = make();
    const raw = st.m.get(KEY);
    const r = patch(st, { 김서윤: [null, '潤'] }); // a seed valid for this analysis, so the storage failure is what is tested
    expect(r).toEqual({ ok: false, reason });
    expect(st.m.get(KEY)).toBe(raw);
    if (reason !== 'write-error' && reason !== 'quota-exceeded') expect(st.calls.set).toBe(0);
    const msg = hanjaSaveFailureMessage('김민서', reason);
    expect(msg).toContain('김민서의 한자 선택을 저장하지 못했습니다');
    expect(msg).toContain('기존에 저장된 한자는 그대로');
    expect(msg).toContain('다시 선택해주세요');
  });

  it('oversized stored payload: refused before JSON.parse (no unbounded parse), raw unchanged', () => {
    const big = storeText({ [NOW]: { 김민서: [null, '書'] }, ['{' + 'x'.repeat(HANJA_READ_LIMITS.maxStoredChars)]: {} });
    const st = storage({ [KEY]: big });
    const parse = vi.spyOn(JSON, 'parse');
    expect(patch(st)).toEqual({ ok: false, reason: 'too-large' });
    // The stored payload is never parsed; the only parse is the short analysis scope (H2-P name context).
    expect(parse.mock.calls.some(([t]) => t === big)).toBe(false);
    expect(parse.mock.calls.every(([t]) => t === NOW)).toBe(true);
    expect(st.calls.set).toBe(0);
    expect(st.m.get(KEY)).toBe(big);
  });

  it('a save whose result would exceed the read limit is refused (no silent truncation)', () => {
    const st = storage({ [KEY]: storeText({ [OTHER]: { 김민서: ['珉', '瑞'] } }) });
    const raw = st.m.get(KEY);
    expect(patch(st, {}, NOW, raw!.length + 5)).toEqual({ ok: false, reason: 'too-large' });
    expect(st.m.get(KEY)).toBe(raw);
  });

  it('missing localStorage', () => {
    expect(saveHanjaSelectionPatch(KEY, NOW, '김민서', 0, '敏', {}, undefined)).toEqual({ ok: false, reason: 'no-storage' });
  });

  it('the boolean saveHanjaSelections API is fail-closed too (audit S1)', () => {
    const st = storage({ [KEY]: storeText({ [OTHER]: { 김민서: ['珉', '瑞'] } }) }, { getThrows: true });
    const raw = st.m.get(KEY);
    expect(saveHanjaSelections(KEY, NOW, { 김민서: ['敏'] }, st)).toBe(false);
    expect(st.m.get(KEY)).toBe(raw);
    expect(st.calls.set).toBe(0);
  });

  it('a skipped (size) recovery never authorizes a write', () => {
    const big = storeText({ [NOW]: { 김민서: [null, '書'] }, ['{' + 'x'.repeat(HANJA_READ_LIMITS.maxStoredChars)]: {} });
    const st = storage({ [KEY]: big });
    const r = loadHanjaSelectionsWithLegacy(KEY, NOW, st);
    expect(r.recovery).toEqual({ kind: 'skipped', reason: 'size' });
    expect(patch(st, r.selections).ok).toBe(false);
    expect(st.m.get(KEY)).toBe(big);
  });
});
