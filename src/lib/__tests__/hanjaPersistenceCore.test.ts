// @vitest-environment jsdom
// R3.2: pure transaction decisions (init / conditional save / ack / legacy check)
// and the in-memory backend. These are logic tests; cross-tab safety is only
// claimed from real Chrome runs (see docs/hanja-model.md, R3.2 section 7).
import { afterEach, describe, expect, it } from 'vitest';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import {
  HanjaMeta, ScopeSnapshot, buildSnapshot, checkExternal, classifySource, decideAck, decideInit, decideSave,
  digestText, isValidMeta, oversizeIdentity, parseDocument, positionKey, tokenOf,
} from '@/lib/hanjaPersistenceCore';
import { initializeHanjaStore, loadHanjaStore, saveHanjaPosition, overrideHanjaBackend } from '@/lib/hanjaPersistence';
import { MemoryHanjaBackend } from '@/test-utils/memoryHanjaBackend';

const KEY = HANJA_SELECTION_KEYS.modeC;
const C = (names: string[], over: Partial<ModeCInput> = {}) => {
  const v = validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names, ...over });
  if (!v.ok) throw new Error('invalid'); return analysisScope(v.value);
};
const B = (over: Partial<ModeBInput> = {}) => {
  const v = validateModeBInput({ birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'], ...over });
  if (!v.ok) throw new Error('invalid'); return analysisScope(v.value);
};
const S = C(['김민서', '이준', '김가나서']);
const doc = (scopes: Record<string, object>) =>
  JSON.stringify({ version: 2, scopes: Object.fromEntries(Object.entries(scopes).map(([s, names], i) => [s, { updatedAt: i + 1, names }])) });
const valid = (text: string) => classifySource(() => text);
const init = (text: string | null) => {
  const d = decideInit(undefined, undefined, text === null ? { kind: 'missing' } : valid(text), '0123456789abcdef0123456789abcdef', { markerSeen: false, allowReimport: false });
  if (d.kind !== 'write') throw new Error('init failed: ' + d.kind);
  return { docText: d.docText, meta: d.meta };
};
type State = { docText: string; meta: HanjaMeta };
const snap = (st: State, scope = S, legacy = false) => buildSnapshot(st.docText, st.meta, scope, legacy);
const save = (st: State, s: ScopeSnapshot, fullName: string, index: number, hanja: string, scope = S, legacy = false) =>
  decideSave(st.docText, st.meta, { scope, fullName, index, hanja, legacyRecovery: legacy, expected: tokenOf(s, fullName, index), now: 1000 });
const apply = (st: State, d: ReturnType<typeof save>): State => {
  if (d.kind !== 'write') throw new Error('expected write, got ' + JSON.stringify(d));
  return { docText: d.docText, meta: d.meta };
};

describe('initialisation', () => {
  it('missing source → explicit empty document; valid source imported verbatim; ordering newest first', () => {
    const empty = init(null);
    expect(empty.docText).toBe('{"version":2,"scopes":{}}');
    expect(empty.meta.source).toEqual({ kind: 'missing', digest: null, length: 0 });
    const text = JSON.stringify({ version: 2, scopes: { [S]: { updatedAt: 5, names: { 김민서: [null, '書'] } }, [B()]: { updatedAt: 9, names: {} } } });
    const st = init(text);
    expect(st.docText).toBe(text); // verbatim, nothing normalised
    expect(st.meta.scopes[B()].order).toBeGreaterThan(st.meta.scopes[S].order);
    expect(st.meta.source.digest).toBe(digestText(text));
    expect(isValidMeta(st.meta, parseDocument(st.docText)!)).toBe(true);
  });

  it('an existing valid pair is used, never overwritten; inconsistent pairs are corrupt (never repaired)', () => {
    const st = init(null);
    const other = valid(doc({ [S]: { 김민서: ['敏'] } }));
    expect(decideInit(st.docText, st.meta, other, 'fedcba9876543210fedcba9876543210', { markerSeen: true, allowReimport: true })).toEqual({ kind: 'ready', docText: st.docText, meta: st.meta });
    expect(decideInit(st.docText, undefined, other, '11111111111111111111111111111111', { markerSeen: false, allowReimport: false }).kind).toBe('corrupt');
    expect(decideInit(undefined, st.meta, other, '11111111111111111111111111111111', { markerSeen: false, allowReimport: false }).kind).toBe('corrupt');
    expect(decideInit('{"version":2,"scopes":{', st.meta, other, '11111111111111111111111111111111', { markerSeen: false, allowReimport: false }).kind).toBe('corrupt');
    expect(decideInit(st.docText, { ...st.meta, seq: -1 }, other, '11111111111111111111111111111111', { markerSeen: false, allowReimport: false }).kind).toBe('corrupt');
  });

  it('a failed or unsafe source never becomes an empty store', () => {
    const opts = { markerSeen: false, allowReimport: false };
    expect(decideInit(undefined, undefined, { kind: 'inaccessible' }, '11111111111111111111111111111111', opts)).toEqual({ kind: 'source-error', source: 'inaccessible' });
    expect(decideInit(undefined, undefined, valid('{"version":2,"scopes":{'), '11111111111111111111111111111111', opts)).toMatchObject({ kind: 'source-error', source: 'malformed' });
    expect(decideInit(undefined, undefined, valid('{"version":2,"scopes":{},"x":1}'), '11111111111111111111111111111111', opts)).toMatchObject({ kind: 'source-error', source: 'invalid' });
    expect(decideInit(undefined, undefined, valid(' '.repeat(1_000_001)), '11111111111111111111111111111111', opts)).toMatchObject({ kind: 'source-error', source: 'too-large' });
    const many = doc(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [C(['김민서'], { birthDate: `2027-08-${String(i + 1).padStart(2, '0')}` }), {}])));
    expect(decideInit(undefined, undefined, valid(many), '11111111111111111111111111111111', opts)).toMatchObject({ kind: 'source-error', source: 'over-retention' });
  });

  it('a missing database with a marker requires explicit confirmation before re-import', () => {
    expect(decideInit(undefined, undefined, { kind: 'missing' }, '11111111111111111111111111111111', { markerSeen: true, allowReimport: false })).toEqual({ kind: 'reimport-confirm' });
    expect(decideInit(undefined, undefined, { kind: 'missing' }, '11111111111111111111111111111111', { markerSeen: true, allowReimport: true }).kind).toBe('write');
  });
});

describe('conditional save (two stale snapshots of the same state = two tabs)', () => {
  it('different positions of one name: both kept', () => {
    let st = init(doc({ [S]: { 김민서: [null, null] } }));
    const a = snap(st), b = snap(st);
    st = apply(st, save(st, a, '김민서', 0, '敏'));
    st = apply(st, save(st, b, '김민서', 1, '書'));
    expect(parseDocument(st.docText)!.scopes[S].names).toEqual({ 김민서: ['敏', '書'] });
  });

  it('different names and different scopes: all kept (scopes never overwrite each other)', () => {
    const S2 = C(['김민서'], { birthDate: '2027-07-05' });
    let st = init(null);
    const a = snap(st), b = snap(st), c = snap(st, S2);
    st = apply(st, save(st, a, '김민서', 0, '敏'));
    st = apply(st, save(st, b, '이준', 0, '俊'));
    st = apply(st, save(st, c, '김민서', 1, '書', S2));
    const d = parseDocument(st.docText)!;
    expect(d.scopes[S].names).toEqual({ 김민서: ['敏'], 이준: ['俊'] });
    expect(d.scopes[S2].names).toEqual({ 김민서: [null, '書'] });
  });

  it('same position, different value: the second is a typed conflict with the current value; nothing written', () => {
    let st = init(null);
    const a = snap(st), b = snap(st);
    st = apply(st, save(st, a, '김민서', 1, '書'));
    const r = save(st, b, '김민서', 1, '瑞');
    expect(r).toMatchObject({ kind: 'conflict', reason: 'conflict', current: '書' });
    if (r.kind === 'conflict') expect(r.snapshot.names).toEqual({ 김민서: [null, '書'] });
  });

  it('same position, same value: idempotent success without a write', () => {
    let st = init(null);
    const a = snap(st), b = snap(st);
    st = apply(st, save(st, a, '김민서', 1, '書'));
    expect(save(st, b, '김민서', 1, '書').kind).toBe('idempotent');
  });

  it('ABA (書 → 瑞 → 書) is detected by the position revision', () => {
    let st = init(null);
    st = apply(st, save(st, snap(st), '김민서', 1, '書'));
    const stale = snap(st); // sees 書 at revision 1
    st = apply(st, save(st, snap(st), '김민서', 1, '瑞'));
    st = apply(st, save(st, snap(st), '김민서', 1, '書')); // value is 書 again, revision 3
    expect(st.meta.scopes[S].positions[positionKey('김민서', 1)]).toBe(3);
    expect(save(st, stale, '김민서', 1, '敏')).toMatchObject({ kind: 'conflict', reason: 'conflict', current: '書' });
  });

  it('a different generation (new database) or epoch requires a reload', () => {
    let st = init(null);
    const s = snap(st);
    const other = { ...st, meta: { ...st.meta, generation: 'fedcba9876543210fedcba9876543210' } };
    expect(save(other, s, '김민서', 0, '敏')).toMatchObject({ kind: 'conflict', reason: 'reload-required' });
    st = apply(st, save(st, s, '김민서', 0, '敏'));
    expect(save({ ...st, meta: { ...st.meta, epoch: 1 } }, snap(st), '김민서', 1, '書')).toMatchObject({ kind: 'conflict', reason: 'reload-required' });
  });

  it('retention: 21st scope evicts the lowest order, bumps the epoch; a stale token of the evicted scope cannot resurrect it', () => {
    const scopes = Array.from({ length: 20 }, (_, i) => C(['김민서'], { birthDate: `2027-08-${String(i + 1).padStart(2, '0')}` }));
    let st = init(doc(Object.fromEntries(scopes.map(s => [s, { 김민서: ['珉'] }]))));
    const oldest = scopes.find(s => st.meta.scopes[s].order === 1)!;
    const staleOld = snap(st, oldest);
    st = apply(st, save(st, snap(st), '김민서', 0, '敏')); // S is the 21st scope
    const d = parseDocument(st.docText)!;
    expect(Object.keys(d.scopes)).toHaveLength(20);
    expect(d.scopes[oldest]).toBeUndefined();
    expect(d.scopes[S].names).toEqual({ 김민서: ['敏'] });
    expect(st.meta.epoch).toBe(1);
    expect(save(st, staleOld, '김민서', 0, '敏', oldest)).toMatchObject({ kind: 'conflict', reason: 'reload-required' });
    expect(parseDocument(st.docText)!.scopes[oldest]).toBeUndefined();
  });

  it('R36 recovery is recomputed from the latest document; recovered values are the expected confirmed values', () => {
    const now = B();
    const v = validateModeBInput({ birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'] });
    if (!v.ok) throw new Error('invalid');
    const old = analysisScope({ ...v.value, nameStyles: ['전통형', '전통형'] });
    let st = init(doc({ [old]: { 김민서: ['敏', null] } }));
    const a = snap(st, now, true), b = snap(st, now, true);
    expect(a.names).toEqual({ 김민서: ['敏', null] });
    expect(a.recovery.kind).toBe('recovered');
    st = apply(st, save(st, a, '김민서', 1, '書', now, true));
    st = apply(st, save(st, b, '김서윤', 1, '潤', now, true));
    const d = parseDocument(st.docText)!;
    expect(d.scopes[now].names).toEqual({ 김민서: ['敏', '書'], 김서윤: [null, '潤'] });
    expect(d.scopes[old].names).toEqual({ 김민서: ['敏', null] }); // legacy entry kept
    expect(snap(st, now, true).recovery).toEqual({ kind: 'none' });
  });

  it('existing validation is unchanged: invalid scope, position, name type; stored record outside the rule is refused', () => {
    const st = init(doc({ [S]: { 김민서: [null, '書', '敏'] } }));
    const s = snap(st);
    expect(decideSave(st.docText, st.meta, { scope: '{"x":1}', fullName: '김민서', index: 0, hanja: '敏', legacyRecovery: false, expected: tokenOf(s, '김민서', 0), now: 1 })).toEqual({ kind: 'invalid', reason: 'invalid-scope' });
    expect(save(st, s, '김민서', 2, '敏')).toEqual({ kind: 'invalid', reason: 'invalid-selection' });
    expect(decideSave(st.docText, st.meta, { scope: S, fullName: ['김민서'] as unknown as string, index: 0, hanja: '敏', legacyRecovery: false, expected: tokenOf(s, '김민서', 0), now: 1 })).toEqual({ kind: 'invalid', reason: 'invalid-selection' });
    expect(save(st, s, '김민서', 0, '敏')).toEqual({ kind: 'invalid', reason: 'invalid-stored-selection' });
    expect(decideSave(st.docText, st.meta, { scope: S, fullName: '김민서', index: 0, hanja: '敏', legacyRecovery: false, expected: tokenOf(s, '김민서', 0), now: Infinity }))
      .toEqual({ kind: 'invalid', reason: 'invalid-stored-selection' });
  });

  it('a non-finite clock is refused before any write', () => {
    const st = init(null);
    expect(decideSave(st.docText, st.meta, { scope: S, fullName: '김민서', index: 0, hanja: '敏', legacyRecovery: false, expected: tokenOf(snap(st), '김민서', 0), now: Infinity }))
      .toEqual({ kind: 'invalid', reason: 'invalid-output' });
  });

  it('corrupt records are never patched', () => {
    const st = init(null);
    expect(save({ ...st, docText: '{' }, snap(st), '김민서', 0, '敏').kind).toBe('corrupt');
    expect(save({ ...st, meta: { ...st.meta, scopes: { [S]: { incarnation: 1, order: 1, positions: {} } } } }, snap(st), '김민서', 0, '敏').kind).toBe('corrupt');
  });
});

describe('legacy changes after migration (old-version tabs)', () => {
  it('lists only differing valid values of the current scope; never deletions; dismissed digests are quiet', () => {
    const imported = doc({ [S]: { 김민서: ['敏', null] } });
    let st = init(imported);
    st = apply(st, save(st, snap(st), '김민서', 1, '書'));
    const s = snap(st);
    expect(checkExternal(valid(imported), st.meta, s)).toEqual({ kind: 'none' }); // unchanged since import
    expect(checkExternal({ kind: 'missing' }, st.meta, s)).toEqual({ kind: 'none' }); // deletion is not a command
    expect(checkExternal(valid(doc({ [S]: {} })), st.meta, s)).toEqual({ kind: 'none' }); // {} is not a deletion
    const changed = doc({ [S]: { 김민서: ['珉', null], 이준: ['俊'] } });
    const r = checkExternal(valid(changed), st.meta, s);
    expect(r).toEqual({ kind: 'candidates', digest: digestText(changed), items: [
      { fullName: '김민서', index: 0, current: '敏', legacy: '珉' },
      { fullName: '이준', index: 0, current: null, legacy: '俊' },
    ] });
    const acked = decideAck(st.docText, st.meta, S, digestText(changed));
    if (acked.kind !== 'write') throw new Error('ack');
    expect(checkExternal(valid(changed), acked.meta, s)).toEqual({ kind: 'none' });
    expect(checkExternal(valid('{"version":2,"scopes":{'), st.meta, s)).toMatchObject({ kind: 'unreadable' });
  });
});

describe('memory backend + operations (serialised, all-or-nothing)', () => {
  afterEach(() => { overrideHanjaBackend(null); localStorage.clear(); });

  it('concurrent initialisers: the first import wins, the second imports nothing', async () => {
    const be = new MemoryHanjaBackend();
    overrideHanjaBackend(be);
    localStorage.setItem(KEY, doc({ [S]: { 김민서: ['敏'] } }));
    const first = initializeHanjaStore(KEY);
    localStorage.setItem(KEY, doc({ [S]: { 김민서: ['珉'] } })); // a different snapshot for the second
    const second = initializeHanjaStore(KEY);
    const [a, b] = await Promise.all([first, second]);
    expect(a.kind).toBe('ready');
    expect(b.kind).toBe('ready');
    if (a.kind === 'ready' && b.kind === 'ready') {
      expect(a.imported).toBe(true);
      expect(b.imported).toBe(false);
      expect(b.docText).toBe(a.docText);
      expect(b.meta.generation).toBe(a.meta.generation);
    }
    expect(be.commits).toBe(1);
  });

  it('faults: quota/abort/unknown-rollback write nothing; unknown-commit is reported unknown (never success)', async () => {
    const be = new MemoryHanjaBackend();
    overrideHanjaBackend(be);
    const r = await initializeHanjaStore(KEY);
    if (r.kind !== 'ready') throw new Error('init');
    const s = buildSnapshot(r.docText, r.meta, S, false);
    const req = { scope: S, fullName: '김민서', index: 0, hanja: '敏', legacyRecovery: false, expected: tokenOf(s, '김민서', 0) };
    for (const f of ['quota', 'aborted', 'unknown-rollback'] as const) {
      be.failNext = f;
      const before = be.documents.get(KEY);
      const out = await saveHanjaPosition(KEY, req);
      expect(out).toMatchObject({ kind: 'failed', reason: f === 'unknown-rollback' ? 'unknown-outcome' : f });
      expect(be.documents.get(KEY)).toBe(before);
    }
    be.failNext = 'unknown-commit';
    expect(await saveHanjaPosition(KEY, req)).toMatchObject({ kind: 'failed', reason: 'unknown-outcome' });
    const reread = await loadHanjaStore(KEY);
    expect(reread.kind === 'ready' && parseDocument(reread.docText)!.scopes[S].names).toEqual({ 김민서: ['敏'] });
    // the re-check then shows the committed value; a retry with the old token is idempotent
    expect(await saveHanjaPosition(KEY, req)).toMatchObject({ kind: 'saved', idempotent: true });
  });

  it('legacy localStorage is never written; the marker is a separate new key', async () => {
    overrideHanjaBackend(new MemoryHanjaBackend());
    const legacy = doc({ [S]: { 김민서: ['敏'] } });
    localStorage.setItem(KEY, legacy);
    localStorage.setItem('dlbd_mode_c_hanja', '{"version":1,"names":{}}');
    const r = await initializeHanjaStore(KEY);
    if (r.kind !== 'ready') throw new Error('init');
    await saveHanjaPosition(KEY, { scope: S, fullName: '김민서', index: 1, hanja: '書', legacyRecovery: false, expected: tokenOf(buildSnapshot(r.docText, r.meta, S, false), '김민서', 1) });
    expect(localStorage.getItem(KEY)).toBe(legacy);
    expect(localStorage.getItem('dlbd_mode_c_hanja')).toBe('{"version":1,"names":{}}');
    expect(localStorage.getItem('dlbd_hanja_idb_v1:' + KEY)).toBe(r.meta.generation);
    // the marker is per key: a first initialisation of the other mode is a normal import
    const other = await initializeHanjaStore(HANJA_SELECTION_KEYS.modeB);
    expect(other.kind === 'ready' && other.imported).toBe(true);
  });
});

describe('audit F4: corrupt metadata is rejected (fail closed)', () => {
  const base = () => {
    let st = init(doc({ [S]: { 김민서: [null, '書'] } }));
    st = apply(st, save(st, snap(st), '김민서', 0, '敏'));
    return st;
  };
  type M = Record<string, unknown> & { scopes: Record<string, Record<string, unknown> & { positions: Record<string, number> }> };
  const variants: [string, (m: M) => void][] = [
    ['audit repro: 김민서#-1 revision 999', m => { m.scopes[S].positions['김민서#-1'] = 999; }],
    ['audit repro: unknown top-level field', m => { m.extra = 1; }],
    ['non-canonical index 01', m => { m.scopes[S].positions['김민서#01'] = 1; }],
    ['index beyond the stored array', m => { m.scopes[S].positions['김민서#2'] = 1; }],
    ['position revision above the document revision', m => { m.scopes[S].positions['김민서#0'] = (m.revision as number) + 1; }],
    ['name not in the document', m => { m.scopes[S].positions['이준#0'] = 1; }],
    ['unknown scope-level field', m => { m.scopes[S].extra = 1; }],
    ['order 0', m => { m.scopes[S].order = 0; }],
    ['seq below the scope count', m => { m.seq = 0; }],
    ['incarnation not below nextIncarnation', m => { m.nextIncarnation = m.scopes[S].incarnation as number; }],
    ['bad generation', m => { m.generation = 'x'; }],
    ['source with extra field', m => { (m.source as Record<string, unknown>).x = 1; }],
    ['missing source with a digest', m => { m.source = { kind: 'missing', digest: 'abc:1', length: 0 }; }],
    ['acks not an array', m => { m.externalAcks = {}; }],
    ['ack with bad digest', m => { m.externalAcks = [{ scope: S, digest: 'zzz' }]; }],
    ['too many acks', m => { m.externalAcks = Array.from({ length: 21 }, (_, i) => ({ scope: `{"s":${i}}`, digest: 'a:1' })); }],
    ['oversized metadata', m => { m.externalAcks = [{ scope: '{' + 'x'.repeat(5000), digest: 'a:1' }]; }],
  ];
  it.each(variants)('%s', (_label, mutate) => {
    const st = base();
    expect(isValidMeta(st.meta, parseDocument(st.docText)!)).toBe(true);
    const m = structuredClone(st.meta) as unknown as M;
    mutate(m);
    expect(isValidMeta(m, parseDocument(st.docText)!)).toBe(false);
    expect(decideInit(st.docText, m, { kind: 'missing' }, 'fedcba9876543210fedcba9876543210', { markerSeen: false, allowReimport: false })).toEqual({ kind: 'corrupt' });
    expect(save({ docText: st.docText, meta: m as unknown as HanjaMeta }, snap(st), '김민서', 1, '瑞').kind).toBe('corrupt');
  });
});

describe('audit F3: dismissing legacy candidates is per analysis scope', () => {
  it('dismissing scope S keeps the candidates of scope T; the list is bounded', () => {
    const T = C(['김민서'], { birthDate: '2027-07-05' });
    const st = init(doc({}));
    const legacy = doc({ [S]: { 김민서: ['珉'] }, [T]: { 김민서: ['敏'] } });
    const sS = snap(st, S), sT = snap(st, T);
    expect(checkExternal(valid(legacy), st.meta, sS).kind).toBe('candidates');
    const acked = decideAck(st.docText, st.meta, S, digestText(legacy));
    if (acked.kind !== 'write') throw new Error('ack');
    expect(checkExternal(valid(legacy), acked.meta, sS)).toEqual({ kind: 'none' });
    expect(checkExternal(valid(legacy), acked.meta, sT)).toMatchObject({ kind: 'candidates', items: [{ fullName: '김민서', index: 0, legacy: '敏' }] });
    let m = acked.meta;
    for (let i = 0; i < 25; i++) {
      const r = decideAck(st.docText, m, `{"s":${i}}`, 'abc:1');
      if (r.kind !== 'write') throw new Error('ack');
      m = r.meta;
    }
    expect(m.externalAcks).toHaveLength(20);
    expect(m.externalAcks[19]).toEqual({ scope: '{"s":24}', digest: 'abc:1' });
    expect(isValidMeta(m, parseDocument(st.docText)!)).toBe(true);
  });
});

describe('audit F5: an oversized source is identified without scanning it', () => {
  it('only the length and a fixed-size prefix contribute to the identity', () => {
    const head = 'x'.repeat(5000);
    const a = head + 'A'.repeat(1_200_000), b = head + 'B'.repeat(1_200_000);
    const ca = classifySource(() => a), cb = classifySource(() => b);
    expect(ca.kind).toBe('too-large');
    if (ca.kind === 'too-large' && cb.kind === 'too-large') {
      expect(ca.digest).toBe(cb.digest); // the tail is never read
      expect(ca.digest).toBe(oversizeIdentity(a));
      expect(ca.digest.startsWith('oversize:1205000:')).toBe(true);
    }
    const c = classifySource(() => head + 'A'.repeat(1_200_001));
    expect(c.kind === 'too-large' && c.digest).not.toBe(ca.kind === 'too-large' && ca.digest); // a length change is visible
  });
});
