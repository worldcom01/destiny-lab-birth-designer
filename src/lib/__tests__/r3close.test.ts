// R3-CLOSE R36: Hanja selections confirmed under a pre-R3-FIX scope that kept
// duplicate nameStyles / images entries. Recovery is read-only and strict.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DesignerInput, ModeBInput } from '@/types';
import {
  HANJA_READ_LIMITS, HANJA_SELECTION_KEYS, HanjaSelections, analysisScope, hanjaRecoveryNotice, isDuplicateOnlyVariant,
  loadHanjaSelections, loadHanjaSelectionsWithLegacy, saveHanjaSelections, withSelection,
} from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput, validateDesignerInput } from '@/lib/inputValidation';
import { analyzeModeA, applyHanjaSelections, runModeBAnalysis } from '@/lib/analysis';

const KEY = HANJA_SELECTION_KEYS.modeB;
const RAW = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [] as string[], nameStyles: ['전통형', '전통형'],
};
const valid = (raw: object): ModeBInput => { const v = validateModeBInput(raw); if (!v.ok) throw new Error('invalid'); return v.value; };
/** The scope the pre-R3-FIX validator produced: same value, raw (duplicated) lists. */
const headScope = (raw: typeof RAW) => analysisScope({ ...valid(raw), nameStyles: [...raw.nameStyles], images: [...raw.images] });

function memory(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  const writes: string[] = [];
  return {
    m, writes,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); m.set(k, v); },
  };
}
const MIN = withSelection({}, '김민서', 0, '敏');
/**
 * Stored records written in order (later = newer), as the pre-R3-FIX app left them.
 * Written as raw store text: the save API now refuses noncanonical (legacy) scopes
 * (audit C1), so it can no longer be used to create these fixtures.
 */
const seeded = (entries: [string, HanjaSelections][]) => {
  const scopes: Record<string, { updatedAt: number; names: HanjaSelections }> = {};
  entries.forEach(([scope, names], i) => { delete scopes[scope]; scopes[scope] = { updatedAt: i + 1, names }; });
  return memory({ [KEY]: JSON.stringify({ version: 2, scopes }) });
};

describe('R36: reproduction of the audit finding', () => {
  it('the plain loader finds nothing under the normalized scope although the old entry exists', () => {
    const st = seeded([[headScope(RAW), MIN]]);
    const now = analysisScope(valid(RAW));
    expect(now).not.toBe(headScope(RAW));
    expect(loadHanjaSelections(KEY, headScope(RAW), st)).toEqual({ 김민서: ['敏'] });
    expect(loadHanjaSelections(KEY, now, st)).toEqual({}); // the confirmed 敏 was not restored
  });
});

describe('R36: strict read-only recovery', () => {
  it('recovers the confirmed Hanja for duplicate nameStyles; nothing is written or deleted', () => {
    const st = seeded([[headScope(RAW), MIN]]);
    const before = st.m.get(KEY);
    const r = loadHanjaSelectionsWithLegacy(KEY, analysisScope(valid(RAW)), st);
    expect(r.selections).toEqual({ 김민서: ['敏'] });
    expect(r.recovery).toEqual({ kind: 'recovered', fromScopes: [headScope(RAW)], names: 1 });
    expect(hanjaRecoveryNotice(r.recovery)).toContain('1명');
    expect(st.writes).toEqual([]);
    expect(st.m.get(KEY)).toBe(before);
    const top = applyHanjaSelections(runModeBAnalysis(valid(RAW)), r.selections).find(x => x.name.full === '김민서')!;
    expect(top.nameAnalysis.hanja.startsWith('敏')).toBe(true);
  });

  it('recovers for duplicate images, and for duplicates in both lists', () => {
    for (const raw of [
      { ...RAW, nameStyles: [], images: ['예술형', '예술형'] },
      { ...RAW, nameStyles: ['리더형', '전통형', '리더형'], images: ['학자형', '예술형', '학자형'] },
    ]) {
      const st = seeded([[headScope(raw), MIN]]);
      const r = loadHanjaSelectionsWithLegacy(KEY, analysisScope(valid(raw)), st);
      expect(r.recovery.kind, JSON.stringify(raw)).toBe('recovered');
      expect(r.selections).toEqual({ 김민서: ['敏'] });
    }
  });

  it('an entry under the current scope always takes precedence', () => {
    const now = analysisScope(valid(RAW));
    const st = seeded([[headScope(RAW), MIN], [now, withSelection({}, '김민서', 0, '珉')]]);
    const r = loadHanjaSelectionsWithLegacy(KEY, now, st);
    expect(r).toEqual({ selections: { 김민서: ['珉'] }, recovery: { kind: 'none' } });
    // even an existing empty selection under the current scope wins
    const st2 = seeded([[headScope(RAW), MIN], [now, {}]]);
    expect(loadHanjaSelectionsWithLegacy(KEY, now, st2)).toEqual({ selections: {}, recovery: { kind: 'none' } });
  });

  it('unrelated analyses never inherit a selection', () => {
    const now = analysisScope(valid(RAW));
    const variants: object[] = [
      { birthDate: '2027-07-05' }, { birthHour: 11 }, { surname: '이' }, { gender: '여' },
      { dolrimChar: '민', dolrimPosition: 'first' }, { dolrimPosition: 'first' },
      { nameStyles: ['전통형', '리더형', '리더형'] },   // different set, not only duplicates
      { nameStyles: ['리더형', '리더형'] },
      { images: ['예술형', '예술형'] },                 // the current input has no image
    ];
    for (const over of variants) {
      const other = { ...RAW, ...over } as typeof RAW;
      const scope = headScope(other);
      expect(isDuplicateOnlyVariant(scope, now), JSON.stringify(over)).toBe(false);
      const st = seeded([[scope, MIN]]);
      expect(loadHanjaSelectionsWithLegacy(KEY, now, st), JSON.stringify(over)).toEqual({ selections: {}, recovery: { kind: 'none' } });
    }
    // an extra or missing key (another schema/version) never matches
    const parsed = JSON.parse(headScope(RAW));
    expect(isDuplicateOnlyVariant(JSON.stringify({ ...parsed, extra: 1 }), now)).toBe(false);
    const { surname: _s, ...missing } = parsed; void _s;
    expect(isDuplicateOnlyVariant(JSON.stringify(missing), now)).toBe(false);
    // a scope without duplicates is not a "duplicate-only" variant (it would be the same scope)
    expect(isDuplicateOnlyVariant(now, now)).toBe(false);
  });

  it('differing legacy candidates are never guessed between; identical ones are recovered', () => {
    const now = analysisScope(valid(RAW));
    const triple = headScope({ ...RAW, nameStyles: ['전통형', '전통형', '전통형'] });
    const amb = seeded([[headScope(RAW), MIN], [triple, withSelection({}, '김민서', 0, '珉')]]);
    const r = loadHanjaSelectionsWithLegacy(KEY, now, amb);
    expect(r.selections).toEqual({});
    expect(r.recovery.kind).toBe('ambiguous');
    expect(hanjaRecoveryNotice(r.recovery)).toContain('다시 선택해주세요');
    const same = seeded([[headScope(RAW), MIN], [triple, MIN]]);
    expect(loadHanjaSelectionsWithLegacy(KEY, now, same).recovery.kind).toBe('recovered');
    // per-syllable positions matter: [敏, 瑞] and [瑞, 敏] are different selections
    const a = { 김민서: ['敏', '瑞'] }, b = { 김민서: ['瑞', '敏'] };
    expect(loadHanjaSelectionsWithLegacy(KEY, now, seeded([[headScope(RAW), a], [triple, b]])).recovery.kind).toBe('ambiguous');
  });

  it('legacy 자시 scopes (no sijinVersion) never match a re-selected 조자시/야자시 input', () => {
    const zi = { ...RAW, birthHour: 0 };
    const legacyZi = { ...RAW, birthHour: 0 } as Record<string, unknown>;
    delete legacyZi.sijinVersion;
    const oldScope = analysisScope({ ...legacyZi, nameStyles: ['전통형', '전통형'] });
    const now = analysisScope(valid(zi));
    expect(isDuplicateOnlyVariant(oldScope, now)).toBe(false);
    expect(loadHanjaSelectionsWithLegacy(KEY, now, seeded([[oldScope, MIN]])).recovery.kind).toBe('none');
    // and the legacy input itself is still rejected (time must be chosen again)
    const v = validateModeBInput(legacyZi);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.kind).toBe('legacy');
  });

  it('malformed storage never throws and never recovers', () => {
    const now = analysisScope(valid(RAW));
    // A well-formed store whose only scope key is not JSON: valid storage, nothing matches.
    const oddKey = memory({ [KEY]: JSON.stringify({ version: 2, scopes: { '{bad json': { updatedAt: 1, names: { 김민서: ['敏'] } } } }) });
    expect(loadHanjaSelectionsWithLegacy(KEY, now, oddKey)).toEqual({ selections: {}, recovery: { kind: 'none' } });
    expect(oddKey.writes).toEqual([]);
    for (const text of ['{not json', 'null', '[]',
      JSON.stringify({ version: 2, scopes: { [headScope(RAW)]: { updatedAt: 1, names: 'x' } } })]) {
      const st = memory({ [KEY]: text });
      // Data-safety hotfix: unusable storage is reported ('unreadable'), never shown as "no selection".
      const r = loadHanjaSelectionsWithLegacy(KEY, now, st);
      expect(r.recovery.kind, text).toBe('unreadable');
      expect(r.selections).toEqual({});
      expect(st.writes).toEqual([]);
    }
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(loadHanjaSelectionsWithLegacy(KEY, now, throwing)).toEqual({ selections: {}, recovery: { kind: 'unreadable', reason: 'read-error' } });
    expect(isDuplicateOnlyVariant('{', now)).toBe(false);
  });

  it('a later edit is saved under the current scope and the old entry is kept', () => {
    const st = seeded([[headScope(RAW), MIN]]);
    const now = analysisScope(valid(RAW));
    const r = loadHanjaSelectionsWithLegacy(KEY, now, st);
    saveHanjaSelections(KEY, now, withSelection(r.selections, '김민서', 1, '瑞'), st);
    expect(loadHanjaSelections(KEY, now, st)).toEqual({ 김민서: ['敏', '瑞'] });
    expect(loadHanjaSelections(KEY, headScope(RAW), st)).toEqual({ 김민서: ['敏'] });
    expect(loadHanjaSelectionsWithLegacy(KEY, now, st).recovery.kind).toBe('none');
  });
});

describe('R36: normalization properties and unchanged behaviour', () => {
  it('normalization is idempotent and keeps first-occurrence order', () => {
    const once = valid({ ...RAW, nameStyles: ['리더형', '전통형', '리더형'], images: ['예술형', '학자형', '예술형'] });
    expect(once.nameStyles).toEqual(['리더형', '전통형']);
    expect(once.images).toEqual(['예술형', '학자형']);
    expect(valid(once)).toEqual(once);
  });

  it('normal (duplicate-free) inputs: same scope as before, plain loader result unchanged', () => {
    const normal = { ...RAW, nameStyles: ['전통형', '리더형'], images: ['예술형'] };
    expect(analysisScope(valid(normal))).toBe(headScope(normal));
    const st = seeded([[analysisScope(valid(normal)), MIN]]);
    expect(loadHanjaSelectionsWithLegacy(KEY, analysisScope(valid(normal)), st))
      .toEqual({ selections: loadHanjaSelections(KEY, analysisScope(valid(normal)), st), recovery: { kind: 'none' } });
  });

  it('Hanja recovery never changes a score or rank', () => {
    const rs = runModeBAnalysis(valid(RAW));
    const withSel = applyHanjaSelections(rs, { 김민서: ['敏'] });
    expect(withSel.map(r => [r.name.full, r.rank, r.scores])).toEqual(rs.map(r => [r.name.full, r.rank, r.scores]));
  });

  it('Mode A has no stored Hanja selections; its duplicate lists normalize to the same analysis', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'mode-a', 'results', 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/HANJA_SELECTION_KEYS|loadHanjaSelections/);
    const a: DesignerInput = {
      startDate: '2027-07-04', endDate: '2027-07-04', surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto',
      images: ['예술형', '예술형'], nameStyles: ['전통형', '전통형'],
      schedule: { providerConfirmed: true, timeRanges: [], exactTimes: ['09:00'] },
    } as DesignerInput;
    const v = validateDesignerInput(a);
    expect(v.ok && v.value.nameStyles).toEqual(['전통형']);
    expect(v.ok && v.value.images).toEqual(['예술형']);
    const dup = analyzeModeA(a), norm = analyzeModeA({ ...a, images: ['예술형'], nameStyles: ['전통형'] });
    expect(dup.slice(0, 30).map(r => [r.name.full, r.scores.overall])).toEqual(norm.slice(0, 30).map(r => [r.name.full, r.scores.overall]));
  });

  it('Mode C carries no style/image lists, so its scopes are unaffected', () => {
    const v = validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: ['김민서'], nameStyles: ['전통형', '전통형'] });
    expect(v.ok && 'nameStyles' in v.value).toBe(false);
  });
});

describe('R37: PDF Top-20 table fits the page content box', () => {
  it('column tracks + gaps fit inside a row (page 794 − 2×56 margin − 24 padding − 3 accent border)', async () => {
    const { TOP20_COLUMNS } = await import('@/components/pdf/PdfTop20');
    const { PAGE_W, MARGIN } = await import('@/components/pdf/PdfPage');
    const tracks = TOP20_COLUMNS.split(' ').map(w => parseFloat(w));
    expect(tracks).toHaveLength(9);
    const used = tracks.reduce((a, b) => a + b, 0) + (tracks.length - 1) * 8;
    expect(used).toBeLessThanOrEqual(PAGE_W - 2 * MARGIN - 24 - 3);
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'pdf', 'PdfTop20.tsx'), 'utf8');
    expect(src.match(/gridTemplateColumns: TOP20_COLUMNS/g)).toHaveLength(2); // header and rows share the tracks
    expect(src).toContain("borderLeft: '3px solid transparent', // same box as the rows");
  });
});

// ─── R3 final patch ─────────────────────────────────────────────────────────

describe('R36-E1: empty legacy records take part in conflict detection', () => {
  const now = analysisScope(valid({ ...RAW, nameStyles: ['전통형'] }));
  const dup2 = headScope(RAW);
  const dup3 = headScope({ ...RAW, nameStyles: ['전통형', '전통형', '전통형'] });
  const MIN_NULL: HanjaSelections = { 김민서: ['敏', null] };

  it('audit counterexample {敏,null} vs {} is ambiguous in both storage orders; nothing is applied or written', () => {
    for (const entries of [[[dup2, MIN_NULL], [dup3, {}]], [[dup3, {}], [dup2, MIN_NULL]]] as [string, HanjaSelections][][]) {
      const st = seeded(entries);
      const before = st.m.get(KEY);
      const r = loadHanjaSelectionsWithLegacy(KEY, now, st);
      expect(r.selections).toEqual({});
      expect(r.recovery).toEqual({ kind: 'ambiguous', fromScopes: [dup2, dup3].sort() });
      expect(hanjaRecoveryNotice(r.recovery)).toContain('선택을 비운 기록 포함');
      expect(st.writes).toEqual([]);
      expect(st.m.get(KEY)).toBe(before);
    }
  });

  it('identical non-empty records are recovered deterministically, independent of order', () => {
    const a = loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup2, MIN_NULL], [dup3, MIN_NULL]]));
    const b = loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup3, MIN_NULL], [dup2, MIN_NULL]]));
    expect(a).toEqual(b);
    expect(a.recovery).toEqual({ kind: 'recovered', fromScopes: [dup2, dup3].sort(), names: 1 });
    expect(a.selections).toEqual(MIN_NULL);
  });

  it('an empty record conflicts even with two identical non-empty ones', () => {
    const dup4 = headScope({ ...RAW, nameStyles: ['전통형', '전통형', '전통형', '전통형'] });
    expect(loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup2, MIN_NULL], [dup3, MIN_NULL], [dup4, {}]])).recovery.kind).toBe('ambiguous');
  });

  it('only empty records: nothing to recover, no notice', () => {
    const r = loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup2, {}], [dup3, {}]]));
    expect(r).toEqual({ selections: {}, recovery: { kind: 'none' } });
    expect(hanjaRecoveryNotice(r.recovery)).toBeNull();
  });

  it('the canonical entry stays authoritative, including an explicit empty one', () => {
    expect(loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup2, MIN_NULL], [dup3, {}], [now, {}]])))
      .toEqual({ selections: {}, recovery: { kind: 'none' } });
    expect(loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup2, {}], [now, { 김민서: ['珉', null] }]])))
      .toEqual({ selections: { 김민서: ['珉', null] }, recovery: { kind: 'none' } });
  });

  it('an empty record of an unrelated analysis does not block or create a recovery', () => {
    const other = headScope({ ...RAW, birthDate: '2027-07-05' });
    const r = loadHanjaSelectionsWithLegacy(KEY, now, seeded([[dup2, MIN_NULL], [other, {}]]));
    expect(r.recovery.kind).toBe('recovered');
    expect(loadHanjaSelectionsWithLegacy(KEY, now, seeded([[other, MIN_NULL]])).recovery.kind).toBe('none');
  });

  it('legacy 자시 scopes (empty or not) never take part', () => {
    const legacyZi = { ...RAW, birthHour: 0 } as Record<string, unknown>;
    delete legacyZi.sijinVersion;
    const zNow = analysisScope(valid({ ...RAW, birthHour: 0, nameStyles: ['전통형'] }));
    const a = analysisScope({ ...legacyZi, nameStyles: ['전통형', '전통형'] });
    const b = analysisScope({ ...legacyZi, nameStyles: ['전통형', '전통형', '전통형'] });
    expect(loadHanjaSelectionsWithLegacy(KEY, zNow, seeded([[a, MIN_NULL], [b, {}]]))).toEqual({ selections: {}, recovery: { kind: 'none' } });
  });
});

describe('R36-L1: read limits fail closed and never delete', () => {
  const now = analysisScope(valid({ ...RAW, nameStyles: ['전통형'] }));

  it('oversized stored JSON is not parsed: skipped (size), no throw, storage untouched', () => {
    const big = JSON.stringify({ version: 2, scopes: { [now]: { updatedAt: 1, names: { 김민서: ['敏', null] } }, ['{' + 'x'.repeat(1_000_000)]: { updatedAt: 0, names: {} } } });
    expect(big.length).toBeGreaterThan(HANJA_READ_LIMITS.maxStoredChars);
    const st = memory({ [KEY]: big });
    const r = loadHanjaSelectionsWithLegacy(KEY, now, st);
    expect(r).toEqual({ selections: {}, recovery: { kind: 'skipped', reason: 'size' } });
    expect(hanjaRecoveryNotice(r.recovery)).toContain('삭제하거나 바꾸지 않았으며');
    expect(st.writes).toEqual([]);
    expect(st.m.get(KEY)).toBe(big);
    // the record itself is intact and readable on an explicit action
    expect(loadHanjaSelections(KEY, now, st)).toEqual({ 김민서: ['敏', null] });
  });

  it('a store with too many scopes skips only the legacy scan; the current scope still loads', () => {
    const many = Array.from({ length: 60 }, (_, i) => [analysisScope({ ...valid(RAW), dolrimChar: `x${i}` }), {}] as [string, HanjaSelections]); // 60 unrelated scopes
    const store = JSON.stringify({ version: 2, scopes: Object.fromEntries([...many, [headScope(RAW), { 김민서: ['敏', null] }]].map(([s, n]) => [s, { updatedAt: 1, names: n }])) });
    const st = memory({ [KEY]: store });
    const r = loadHanjaSelectionsWithLegacy(KEY, now, st);
    expect(r).toEqual({ selections: {}, recovery: { kind: 'skipped', reason: 'scopes' } });
    expect(hanjaRecoveryNotice(r.recovery)).toContain('복구 확인을 건너뛰었습니다');
    const withOwn = JSON.stringify({ ...JSON.parse(store), scopes: { ...JSON.parse(store).scopes, [now]: { updatedAt: 2, names: { 김민서: ['珉', null] } } } });
    expect(loadHanjaSelectionsWithLegacy(KEY, now, memory({ [KEY]: withOwn }))).toEqual({ selections: { 김민서: ['珉', null] }, recovery: { kind: 'none' } });
    expect(st.writes).toEqual([]);
  });

  it('limits are configurable for tests and normal-size stores behave as before', () => {
    const st = seeded([[headScope(RAW), { 김민서: ['敏', null] }]]);
    expect(loadHanjaSelectionsWithLegacy(KEY, now, st).recovery.kind).toBe('recovered');
    expect(loadHanjaSelectionsWithLegacy(KEY, now, st, { maxStoredChars: 10, maxLegacyScopes: 50 }).recovery).toEqual({ kind: 'skipped', reason: 'size' });
    expect(loadHanjaSelectionsWithLegacy(KEY, now, st, { maxStoredChars: 1e6, maxLegacyScopes: 0 }).recovery).toEqual({ kind: 'skipped', reason: 'scopes' });
  });

  it('malformed storage is reported as unreadable, distinct from a limit skip and from "no prior selection"', () => {
    expect(loadHanjaSelectionsWithLegacy(KEY, now, memory({ [KEY]: '{not json' })).recovery).toEqual({ kind: 'unreadable', reason: 'malformed-json' });
    for (const text of ['"str"', '42', JSON.stringify({ version: 9 })]) {
      expect(loadHanjaSelectionsWithLegacy(KEY, now, memory({ [KEY]: text })).recovery).toEqual({ kind: 'unreadable', reason: 'invalid-schema' });
    }
    expect(loadHanjaSelectionsWithLegacy(KEY, now, memory({})).recovery).toEqual({ kind: 'none' }); // missing key
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(loadHanjaSelectionsWithLegacy(KEY, now, throwing).recovery).toEqual({ kind: 'unreadable', reason: 'read-error' });
  });
});

describe('R36-E2: no result-reading path deletes stored records', () => {
  it('no page calls the v1 purge; the only removeItem in src is inside the explicit purge helper', () => {
    const root = path.join(__dirname, '..', '..');
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : files(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
    for (const f of files(root)) {
      const t = fs.readFileSync(f, 'utf8');
      if (!f.endsWith(path.join('lib', 'hanjaModel.ts'))) {
        expect(t, f).not.toMatch(/purgeLegacyHanjaSelections\s*\(/);
        expect(t, f).not.toMatch(/removeItem|localStorage\.clear/);
      }
    }
  });
});
