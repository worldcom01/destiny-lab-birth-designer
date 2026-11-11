// R3.2 multi-tab Hanja persistence: pure, synchronous transaction decisions.
//
// Everything here runs inside ONE IndexedDB readwrite transaction (or the
// in-memory test backend) between the `get` results and the `put`s, so it must
// stay synchronous and side-effect free. The contract is documented in
// docs/hanja-model.md ("R3.2 multi-tab persistence contract").
import {
  HANJA_READ_LIMITS, HanjaScopeRecovery, HanjaSelections, HanjaStoreFailure, MAX_SCOPES,
  givenLengthInScope, isHanjaChar, isStorableSelections, loadHanjaSelectionsWithLegacy, positionsFit,
  readHanjaStore, resolveAnalysisScope, withSelection,
} from './hanjaModel';

export const HANJA_DB_NAME = 'dlbd_hanja';
export const HANJA_DB_VERSION = 1;
export const HANJA_DOCUMENTS = 'documents';
export const HANJA_METADATA = 'metadata';
/** localStorage marker prefix: one marker per document key, written after its first completed import
 * (new keys; legacy keys are never touched). Per key, so initialising Mode C never makes a first
 * Mode B initialisation look like a lost database. */
export const HANJA_IDB_MARKER_PREFIX = 'dlbd_hanja_idb_v1:';
export const hanjaIdbMarkerKey = (key: string) => HANJA_IDB_MARKER_PREFIX + key;

const EMPTY_DOCUMENT = '{"version":2,"scopes":{}}';

export interface ScopeMeta {
  incarnation: number;
  order: number;
  /** Revision per changed position, keyed `${fullName}#${index}`. Absent = 0. */
  positions: Record<string, number>;
}

export interface HanjaMeta {
  protocol: 1;
  status: 'complete';
  generation: string;
  revision: number;
  epoch: number;
  seq: number;
  nextIncarnation: number;
  scopes: Record<string, ScopeMeta>;
  source: { kind: 'missing' | 'v2'; digest: string | null; length: number };
  /** Legacy snapshots the user dismissed, PER analysis scope (audit F3); newest last, at most MAX_EXTERNAL_ACKS. */
  externalAcks: { scope: string; digest: string }[];
}

/** Bound of the per-scope dismissal list (same as the scope retention size). */
export const MAX_EXTERNAL_ACKS = MAX_SCOPES;
/** Upper bound of a serialised metadata record (bounded metadata, audit F4). */
const MAX_META_CHARS = 200_000;
const FULL_NAME_RE = /^[가-힣]{2,5}$/;
const DIGEST_RE = /^(?:[0-9a-f]{1,14}:\d{1,7}|oversize:\d{1,12}:[0-9a-f]{1,14}:\d{1,7})$/;
const GENERATION_RE = /^[0-9a-z-]{8,64}$/;

type ScopedDoc = { version: 2; scopes: Record<string, { updatedAt: number; names: HanjaSelections }> };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positionKey = (fullName: string, index: number) => `${fullName}#${index}`;

/**
 * Deterministic 53-bit string hash (cyrb53) + length. Change detection only:
 * not a security hash and never a conflict authority.
 */
export function digestText(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}:${text.length}`;
}

const OVERSIZE_PREFIX_CHARS = 4096;
/** Identity of an oversized text without reading beyond a fixed prefix. */
export function oversizeIdentity(text: string): string {
  return `oversize:${text.length}:${digestText(text.slice(0, OVERSIZE_PREFIX_CHARS))}`;
}

/** Strictly parsed v2 document, or null (same reader and limit as the legacy store). */
export function parseDocument(text: unknown): ScopedDoc | null {
  if (typeof text !== 'string') return null;
  const r = readHanjaStore('document', { getItem: () => text }, HANJA_READ_LIMITS.maxStoredChars);
  return r.ok && r.kind !== 'missing' ? (r.store as ScopedDoc) : null;
}

// ─── Legacy source classification (outside any transaction) ──────────────────

export type SourceClass =
  | { kind: 'missing' }
  | { kind: 'valid'; text: string; digest: string }
  | { kind: 'inaccessible' }
  | { kind: 'too-large' | 'malformed' | 'invalid' | 'over-retention'; digest: string };

/** Reads the legacy localStorage v2 text once, without modifying anything. */
export function classifySource(read: () => string | null): SourceClass {
  let text: string | null;
  try {
    text = read();
  } catch {
    return { kind: 'inaccessible' };
  }
  if (text === null) return { kind: 'missing' };
  if (typeof text !== 'string') return { kind: 'inaccessible' };
  // Bounded identity for an oversized source (audit F5): its length plus a hash of a
  // fixed-size prefix — never a scan of the whole text. Non-authoritative (display only).
  if (text.length > HANJA_READ_LIMITS.maxStoredChars) return { kind: 'too-large', digest: oversizeIdentity(text) };
  const r = readHanjaStore('source', { getItem: () => text }, HANJA_READ_LIMITS.maxStoredChars);
  if (!r.ok) return { kind: r.reason === 'malformed-json' ? 'malformed' : 'invalid', digest: digestText(text) };
  if (Object.keys(r.store.scopes).length > MAX_SCOPES) return { kind: 'over-retention', digest: digestText(text) };
  return { kind: 'valid', text, digest: digestText(text) };
}

// ─── Metadata invariants ─────────────────────────────────────────────────────

const hasExactKeys = (o: Record<string, unknown>, keys: readonly string[]) => {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every(x => Object.prototype.hasOwnProperty.call(o, x));
};
const META_KEYS = ['protocol', 'status', 'generation', 'revision', 'epoch', 'seq', 'nextIncarnation', 'scopes', 'source', 'externalAcks'] as const;

/** Canonical position key `${fullName}#${index}` (index 0..2, no leading zeros/signs). */
function parsePositionKey(k: string): { name: string; index: number } | null {
  const m = /^([가-힣]{2,5})#([0-2])$/.exec(k);
  return m ? { name: m[1], index: Number(m[2]) } : null;
}

/**
 * Strict, fail-closed metadata check (audit F4): exact keys at every level,
 * canonical position keys that exist in the document, counter relations
 * (unique incarnations/orders, position revisions within the document
 * revision, nextIncarnation above every incarnation, seq at least the scope
 * count), bounded dismissal list and total size. Anything else is corrupt.
 */
export function isValidMeta(meta: unknown, doc: ScopedDoc): meta is HanjaMeta {
  if (!isRecord(meta) || !hasExactKeys(meta, META_KEYS)) return false;
  if (meta.protocol !== 1 || meta.status !== 'complete') return false;
  if (typeof meta.generation !== 'string' || !GENERATION_RE.test(meta.generation)) return false;
  if (![meta.revision, meta.epoch, meta.seq, meta.nextIncarnation].every(isCount)) return false;
  const revision = meta.revision as number, seq = meta.seq as number, nextIncarnation = meta.nextIncarnation as number;
  const src = meta.source;
  if (!isRecord(src) || !hasExactKeys(src, ['kind', 'digest', 'length'])) return false;
  if (src.kind === 'missing') {
    if (src.digest !== null || src.length !== 0) return false;
  } else if (src.kind === 'v2') {
    if (typeof src.digest !== 'string' || !DIGEST_RE.test(src.digest) || !isCount(src.length) || src.length > HANJA_READ_LIMITS.maxStoredChars) return false;
  } else return false;
  const acks = meta.externalAcks;
  if (!Array.isArray(acks) || acks.length > MAX_EXTERNAL_ACKS) return false;
  const ackScopes = new Set<string>();
  for (const a of acks) {
    if (!isRecord(a) || !hasExactKeys(a, ['scope', 'digest'])) return false;
    if (typeof a.scope !== 'string' || !a.scope.startsWith('{') || a.scope.length > 4096 || ackScopes.has(a.scope)) return false;
    if (typeof a.digest !== 'string' || !DIGEST_RE.test(a.digest)) return false;
    ackScopes.add(a.scope);
  }
  if (!isRecord(meta.scopes)) return false;
  const metaScopes = Object.keys(meta.scopes).sort(), docScopes = Object.keys(doc.scopes).sort();
  if (metaScopes.join('\u0000') !== docScopes.join('\u0000')) return false;
  if (seq < metaScopes.length) return false;
  const orders = new Set<number>(), incarnations = new Set<number>();
  for (const s of metaScopes) {
    const sm = (meta.scopes as Record<string, unknown>)[s];
    if (!isRecord(sm) || !hasExactKeys(sm, ['incarnation', 'order', 'positions'])) return false;
    if (!isCount(sm.incarnation) || sm.incarnation === 0 || sm.incarnation >= nextIncarnation || incarnations.has(sm.incarnation)) return false;
    if (!isCount(sm.order) || sm.order === 0 || sm.order > seq || orders.has(sm.order)) return false;
    incarnations.add(sm.incarnation);
    orders.add(sm.order);
    if (!isRecord(sm.positions)) return false;
    for (const [k, rev] of Object.entries(sm.positions)) {
      const pk = parsePositionKey(k);
      if (!pk || !FULL_NAME_RE.test(pk.name) || !isCount(rev) || rev === 0 || rev > revision) return false;
      const sel = doc.scopes[s].names[pk.name];
      if (!sel || pk.index >= sel.length) return false;
    }
  }
  return JSON.stringify(meta).length <= MAX_META_CHARS;
}

// ─── Initialisation ──────────────────────────────────────────────────────────

export type InitDecision =
  | { kind: 'ready'; docText: string; meta: HanjaMeta }
  | { kind: 'write'; docText: string; meta: HanjaMeta }
  | { kind: 'corrupt' }
  | { kind: 'source-error'; source: Exclude<SourceClass['kind'], 'missing' | 'valid'> }
  | { kind: 'reimport-confirm' };

function importedMeta(doc: ScopedDoc, source: { kind: 'missing' | 'v2'; digest: string | null; length: number }, generation: string): HanjaMeta {
  // Newest first by updatedAt, then scope string ascending; the newest gets the highest order.
  const ordered = Object.entries(doc.scopes)
    .sort((a, b) => (b[1].updatedAt - a[1].updatedAt) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const n = ordered.length;
  const scopes: Record<string, ScopeMeta> = {};
  ordered.forEach(([s], i) => { scopes[s] = { incarnation: i + 1, order: n - i, positions: {} }; });
  return { protocol: 1, status: 'complete', generation, revision: 0, epoch: 0, seq: n, nextIncarnation: n + 1, scopes, source, externalAcks: [] };
}

/**
 * Decides an initialisation from the records read in the transaction. A valid
 * existing pair is never overwritten; an inconsistent pair is never repaired;
 * only a verified source (or a provably missing one) is imported.
 */
export function decideInit(
  docText: unknown, meta: unknown, source: SourceClass, generation: string,
  options: { markerSeen: boolean; allowReimport: boolean },
): InitDecision {
  const hasDoc = docText !== undefined, hasMeta = meta !== undefined;
  if (hasDoc && hasMeta) {
    const doc = parseDocument(docText);
    return doc && isValidMeta(meta, doc) ? { kind: 'ready', docText: docText as string, meta } : { kind: 'corrupt' };
  }
  if (hasDoc || hasMeta) return { kind: 'corrupt' };
  if (options.markerSeen && !options.allowReimport) return { kind: 'reimport-confirm' };
  if (source.kind === 'missing') {
    const doc = parseDocument(EMPTY_DOCUMENT)!;
    return { kind: 'write', docText: EMPTY_DOCUMENT, meta: importedMeta(doc, { kind: 'missing', digest: null, length: 0 }, generation) };
  }
  if (source.kind !== 'valid') return { kind: 'source-error', source: source.kind };
  const doc = parseDocument(source.text);
  if (!doc || Object.keys(doc.scopes).length > MAX_SCOPES) return { kind: 'source-error', source: 'invalid' };
  const m = importedMeta(doc, { kind: 'v2', digest: source.digest, length: source.text.length }, generation);
  return isValidMeta(m, doc) ? { kind: 'write', docText: source.text, meta: m } : { kind: 'source-error', source: 'invalid' };
}

// ─── Snapshots and tokens ────────────────────────────────────────────────────

export interface ScopeSnapshot {
  scope: string;
  generation: string;
  epoch: number;
  /** 0 when the scope has no own record (selections then come from R36 recovery or are empty). */
  incarnation: number;
  /** Effective confirmed selections (own record, or the R36-recovered one). */
  names: HanjaSelections;
  revisions: Record<string, number>;
  recovery: HanjaScopeRecovery;
}

export interface PositionToken {
  generation: string;
  epoch: number;
  incarnation: number;
  revision: number;
  /** The confirmed value the user saw (null = none; system suggestions are never confirmed). */
  value: string | null;
}

function effectiveBase(docText: string, doc: ScopedDoc, scope: string, legacyRecovery: boolean): { names: HanjaSelections; recovery: HanjaScopeRecovery } {
  const own = doc.scopes[scope];
  if (own) return { names: own.names, recovery: { kind: 'none' } };
  if (!legacyRecovery) return { names: {}, recovery: { kind: 'none' } };
  // R36 recovery recomputed from the latest committed document (never from a screen copy).
  const r = loadHanjaSelectionsWithLegacy('document', scope, { getItem: () => docText, setItem: () => {} });
  return { names: r.recovery.kind === 'recovered' ? r.selections : {}, recovery: r.recovery };
}

export function buildSnapshot(docText: string, meta: HanjaMeta, scope: string, legacyRecovery: boolean): ScopeSnapshot {
  const doc = parseDocument(docText);
  if (!doc) throw new Error('invalid document');
  const base = effectiveBase(docText, doc, scope, legacyRecovery);
  const sm = meta.scopes[scope];
  return {
    scope, generation: meta.generation, epoch: meta.epoch, incarnation: sm ? sm.incarnation : 0,
    names: base.names, revisions: sm ? { ...sm.positions } : {}, recovery: base.recovery,
  };
}

export function tokenOf(snapshot: ScopeSnapshot, fullName: string, index: number): PositionToken {
  return {
    generation: snapshot.generation, epoch: snapshot.epoch, incarnation: snapshot.incarnation,
    revision: snapshot.revisions[positionKey(fullName, index)] ?? 0,
    value: snapshot.names[fullName]?.[index] ?? null,
  };
}

// ─── Conditional save ────────────────────────────────────────────────────────

export interface SaveRequest {
  scope: string;
  fullName: string;
  index: number;
  hanja: string;
  legacyRecovery: boolean;
  expected: PositionToken;
  now: number;
}

export type SaveDecision =
  | { kind: 'write'; docText: string; meta: HanjaMeta; snapshot: ScopeSnapshot }
  | { kind: 'idempotent'; snapshot: ScopeSnapshot }
  | { kind: 'conflict'; reason: 'conflict' | 'reload-required'; current: string | null; snapshot: ScopeSnapshot }
  | { kind: 'invalid'; reason: HanjaStoreFailure }
  | { kind: 'corrupt' };

/**
 * Applies exactly one position patch to the LATEST document when the request's
 * token still matches (see the contract, section 4). Pure and synchronous.
 */
export function decideSave(docText: unknown, meta: unknown, req: SaveRequest): SaveDecision {
  const doc = parseDocument(docText);
  if (!doc || !isValidMeta(meta, doc)) return { kind: 'corrupt' };
  const text = docText as string;
  const { scope, fullName, index, hanja } = req;
  // Same request validation as the R3 patch API (H2-T, H2-P, C1).
  if (typeof fullName !== 'string' || !isHanjaChar(hanja)) return { kind: 'invalid', reason: 'invalid-selection' };
  const ctx = resolveAnalysisScope(scope);
  if (!ctx) return { kind: 'invalid', reason: 'invalid-scope' };
  const givenLength = givenLengthInScope(scope, fullName);
  if (givenLength === null || !Number.isInteger(index) || index < 0 || index >= givenLength) return { kind: 'invalid', reason: 'invalid-selection' };

  const fresh = () => buildSnapshot(text, meta, scope, req.legacyRecovery);
  const e = req.expected;
  const sm = meta.scopes[scope];
  if (e.generation !== meta.generation || e.epoch !== meta.epoch || (e.incarnation !== 0 && (!sm || sm.incarnation !== e.incarnation))) {
    const snap = fresh();
    return { kind: 'conflict', reason: 'reload-required', current: snap.names[fullName]?.[index] ?? null, snapshot: snap };
  }
  const base = effectiveBase(text, doc, scope, req.legacyRecovery);
  if (sm && !positionsFit(ctx, base.names)) return { kind: 'invalid', reason: 'invalid-stored-selection' };
  if (!sm && !positionsFit(ctx, base.names)) return { kind: 'invalid', reason: 'invalid-selection' };
  const current = base.names[fullName]?.[index] ?? null;
  const k = positionKey(fullName, index);
  const currentRev = sm ? (sm.positions[k] ?? 0) : 0;
  if (current === hanja) return { kind: 'idempotent', snapshot: fresh() };
  if (currentRev !== e.revision || current !== e.value) return { kind: 'conflict', reason: 'conflict', current, snapshot: fresh() };

  const next = withSelection(base.names, fullName, index, hanja);
  if (!isStorableSelections(next) || !positionsFit(ctx, next)) return { kind: 'invalid', reason: 'invalid-selection' };
  if (!Number.isFinite(req.now)) return { kind: 'invalid', reason: 'invalid-output' };

  const seq = meta.seq + 1;
  const scopes: Record<string, ScopeMeta> = {};
  for (const [s, v] of Object.entries(meta.scopes)) scopes[s] = { ...v, positions: { ...v.positions } };
  let nextIncarnation = meta.nextIncarnation;
  const target: ScopeMeta = sm
    ? { ...scopes[scope], order: seq }
    : { incarnation: nextIncarnation++, order: seq, positions: {} };
  target.positions = { ...target.positions, [k]: currentRev + 1 };
  scopes[scope] = target;
  const docScopes: ScopedDoc['scopes'] = {};
  for (const [s, v] of Object.entries(doc.scopes)) docScopes[s] = v;
  docScopes[scope] = { updatedAt: req.now, names: next };
  let epoch = meta.epoch;
  // Retention (unchanged size): the saved scope + the 19 highest-order others.
  while (Object.keys(docScopes).length > MAX_SCOPES) {
    const victim = Object.entries(scopes).filter(([s]) => s !== scope).sort((a, b) => a[1].order - b[1].order)[0][0];
    delete docScopes[victim];
    delete scopes[victim];
    epoch++; // every older token must reload: an evicted scope can never be resurrected by a stale tab
  }
  const out = JSON.stringify({ version: 2, scopes: docScopes });
  const nextMeta: HanjaMeta = { ...meta, revision: meta.revision + 1, seq, epoch, nextIncarnation, scopes };
  const back = parseDocument(out);
  if (!back || out.length > HANJA_READ_LIMITS.maxStoredChars || !isValidMeta(nextMeta, back)
    || JSON.stringify(back.scopes[scope]?.names) !== JSON.stringify(next)) {
    return { kind: 'invalid', reason: out.length > HANJA_READ_LIMITS.maxStoredChars ? 'too-large' : 'invalid-output' };
  }
  return { kind: 'write', docText: out, meta: nextMeta, snapshot: buildSnapshot(out, nextMeta, scope, req.legacyRecovery) };
}

/**
 * Records that the user reviewed (dismissed) the legacy snapshot `digest` for ONE
 * analysis scope (audit F3). Other scopes' candidates stay visible. Bounded:
 * the oldest entries are dropped beyond MAX_EXTERNAL_ACKS. Document unchanged.
 */
export function decideAck(docText: unknown, meta: unknown, scope: string, digest: string): { kind: 'write'; meta: HanjaMeta } | { kind: 'corrupt' } {
  const doc = parseDocument(docText);
  if (!doc || !isValidMeta(meta, doc)) return { kind: 'corrupt' };
  const acks = meta.externalAcks.filter(a => a.scope !== scope);
  acks.push({ scope, digest });
  const next: HanjaMeta = { ...meta, externalAcks: acks.slice(-MAX_EXTERNAL_ACKS) };
  return isValidMeta(next, doc) ? { kind: 'write', meta: next } : { kind: 'corrupt' };
}

// ─── Old-version tabs: legacy changes after the import ──────────────────────

export interface ExternalCandidate { fullName: string; index: number; current: string | null; legacy: string }
export type ExternalCheck =
  | { kind: 'none' }
  | { kind: 'unreadable'; digest: string }
  | { kind: 'candidates'; digest: string; items: ExternalCandidate[] };

/**
 * Compares the legacy localStorage snapshot with the IndexedDB snapshot for the
 * current scope only. Never merges; missing/empty/null legacy values are not
 * deletions; updatedAt is not used.
 */
export function checkExternal(source: SourceClass, meta: HanjaMeta, snapshot: ScopeSnapshot): ExternalCheck {
  if (source.kind === 'missing' || source.kind === 'inaccessible') return { kind: 'none' };
  if (source.digest === meta.source.digest) return { kind: 'none' };
  if (meta.externalAcks.some(a => a.scope === snapshot.scope && a.digest === source.digest)) return { kind: 'none' };
  if (source.kind !== 'valid') return { kind: 'unreadable', digest: source.digest };
  const legacy = parseDocument(source.text)?.scopes[snapshot.scope];
  const ctx = resolveAnalysisScope(snapshot.scope);
  if (!legacy || !ctx) return { kind: 'none' };
  const items: ExternalCandidate[] = [];
  for (const [fullName, positions] of Object.entries(legacy.names)) {
    if (!positionsFit(ctx, { [fullName]: positions })) continue;
    positions.forEach((v, index) => {
      if (!v || !isHanjaChar(v)) return;
      const current = snapshot.names[fullName]?.[index] ?? null;
      if (v !== current) items.push({ fullName, index, current, legacy: v });
    });
  }
  return items.length ? { kind: 'candidates', digest: source.digest, items } : { kind: 'none' };
}
