// R3.2 multi-tab Hanja persistence: IndexedDB adapter and the operations used
// by the result pages. Decisions are made by the pure functions in
// hanjaPersistenceCore; this file only runs them inside ONE transaction over
// both object stores and reports the observed outcome.
//
// Production code contains no test instrumentation (audit F1): no global
// callbacks, no fault injection, no harness. Tests inject a backend through
// overrideHanjaBackend (module scope, not reachable from the page), and the
// real-browser concurrency tests instrument IndexedDB itself inside the test
// browser only.
import {
  HANJA_DB_NAME, HANJA_DB_VERSION, HANJA_DOCUMENTS, HANJA_METADATA, HanjaMeta, hanjaIdbMarkerKey,
  ExternalCheck, InitDecision, PositionToken, SaveDecision, ScopeSnapshot, SourceClass, buildSnapshot, checkExternal,
  classifySource, decideAck, decideInit, decideSave, parseDocument, isValidMeta, tokenOf,
} from './hanjaPersistenceCore';

export type Durability = 'strict' | 'relaxed' | 'default' | 'unknown';
export type BackendFailure = 'unavailable' | 'blocked-upgrade' | 'aborted' | 'quota' | 'unknown-outcome';

export type TxOutcome<T> =
  | { ok: true; value: T; durability: Durability }
  | { ok: false; reason: BackendFailure; detail?: string };

/** Pure body run between the reads and the writes of one transaction. */
export type TxBody<T> = (docText: unknown, meta: unknown) => { value: T; write?: { docText?: string; meta: HanjaMeta } };

export interface HanjaBackend {
  transact<T>(key: string, mode: 'readonly' | 'readwrite', body: TxBody<T>): Promise<TxOutcome<T>>;
  /** Called when the connection becomes unusable (versionchange / unexpected close). */
  subscribe(listener: (reason: 'blocked-upgrade' | 'closed') => void): () => void;
}

const OPEN_TIMEOUT_MS = 10_000;
const TX_TIMEOUT_MS = 20_000;

class IdbBackend implements HanjaBackend {
  private db: Promise<IDBDatabase> | null = null;
  private listeners = new Set<(r: 'blocked-upgrade' | 'closed') => void>();
  private versionChanged = false;

  subscribe(listener: (r: 'blocked-upgrade' | 'closed') => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(r: 'blocked-upgrade' | 'closed') { for (const l of this.listeners) l(r); }

  private open(): Promise<IDBDatabase> {
    if (this.versionChanged) return Promise.reject(new Error('blocked-upgrade'));
    if (this.db) return this.db;
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error('unavailable:timeout')); }, OPEN_TIMEOUT_MS);
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(HANJA_DB_NAME, HANJA_DB_VERSION);
      } catch (e) {
        clearTimeout(timer);
        reject(new Error('unavailable:' + String((e as Error)?.name ?? e)));
        return;
      }
      req.onupgradeneeded = () => {
        // Schema only. Migration is a separate, explicit transaction.
        const db = req.result;
        if (!db.objectStoreNames.contains(HANJA_DOCUMENTS)) db.createObjectStore(HANJA_DOCUMENTS);
        if (!db.objectStoreNames.contains(HANJA_METADATA)) db.createObjectStore(HANJA_METADATA);
      };
      req.onblocked = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('blocked-upgrade'));
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('unavailable:' + String(req.error?.name ?? 'open-error')));
      };
      req.onsuccess = () => {
        const db = req.result;
        if (settled) { db.close(); return; } // late connection after timeout/blocked: never used
        settled = true;
        clearTimeout(timer);
        db.onversionchange = () => {
          db.close();
          this.db = null;
          this.versionChanged = true;
          this.emit('blocked-upgrade');
        };
        db.onclose = () => { this.db = null; this.emit('closed'); };
        resolve(db);
      };
    });
    this.db = p;
    p.catch(() => { if (this.db === p) this.db = null; }); // a rejected open can be retried
    return p;
  }

  async transact<T>(key: string, mode: 'readonly' | 'readwrite', body: TxBody<T>): Promise<TxOutcome<T>> {
    let db: IDBDatabase;
    try {
      db = await this.open();
    } catch (e) {
      const msg = String((e as Error).message);
      return { ok: false, reason: msg === 'blocked-upgrade' ? 'blocked-upgrade' : 'unavailable', detail: msg };
    }
    return new Promise<TxOutcome<T>>(resolve => {
      let settled = false;
      const finish = (o: TxOutcome<T>) => { if (!settled) { settled = true; clearTimeout(timer); resolve(o); } };
      const timer = setTimeout(() => finish({ ok: false, reason: 'unknown-outcome', detail: 'no complete/abort observed' }), TX_TIMEOUT_MS);
      let tx: IDBTransaction;
      try {
        tx = db.transaction([HANJA_DOCUMENTS, HANJA_METADATA], mode, { durability: 'strict' });
      } catch (e) {
        finish({ ok: false, reason: this.versionChanged ? 'blocked-upgrade' : 'unavailable', detail: String((e as Error)?.name ?? e) });
        return;
      }
      let value: T;
      let bodyError: string | null = null;
      tx.oncomplete = () => {
        const d = (tx as IDBTransaction & { durability?: string }).durability;
        finish({ ok: true, value, durability: d === 'strict' || d === 'relaxed' || d === 'default' ? d : 'unknown' });
      };
      tx.onabort = () => {
        const name = tx.error?.name;
        if (name === 'QuotaExceededError') finish({ ok: false, reason: 'quota', detail: name });
        else finish({ ok: false, reason: this.versionChanged ? 'blocked-upgrade' : 'aborted', detail: bodyError ?? String(name ?? 'abort') });
      };
      const docs = tx.objectStore(HANJA_DOCUMENTS), metas = tx.objectStore(HANJA_METADATA);
      const gd = docs.get(key), gm = metas.get(key);
      let pending = 2;
      const onRead = () => {
        if (--pending > 0) return;
        try {
          const out = body(gd.result, gm.result);
          value = out.value;
          if (out.write && mode === 'readwrite') {
            if (out.write.docText !== undefined) docs.put(out.write.docText, key);
            metas.put(out.write.meta, key);
          }
        } catch (e) {
          bodyError = String((e as Error)?.message ?? e);
          try { tx.abort(); } catch { /* already finished */ }
        }
      };
      gd.onsuccess = onRead;
      gm.onsuccess = onRead;
    });
  }
}

class UnavailableBackend implements HanjaBackend {
  async transact<T>(): Promise<TxOutcome<T>> { return { ok: false, reason: 'unavailable', detail: 'indexedDB is not available' }; }
  subscribe() { return () => {}; }
}

let override: HanjaBackend | null = null;
let shared: HanjaBackend | null = null;

/**
 * Dependency injection (used by tests): replace the backend; null restores the
 * default. Module scope only — nothing on window/globalThis can reach it.
 */
export function overrideHanjaBackend(backend: HanjaBackend | null) { override = backend; shared = null; }

export function getHanjaBackend(): HanjaBackend {
  if (override) return override;
  if (!shared) shared = typeof indexedDB === 'undefined' || !indexedDB ? new UnavailableBackend() : new IdbBackend();
  return shared;
}

// ─── Operations ──────────────────────────────────────────────────────────────

function legacyStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function randomId(): string {
  try {
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return Array.from(a, x => x.toString(16).padStart(8, '0')).join('');
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

/** Reads the legacy localStorage v2 text once (never writes). */
export function readLegacySource(key: string): SourceClass {
  const st = legacyStorage();
  return classifySource(() => { if (!st) throw new Error('no-storage'); return st.getItem(key); });
}

export type InitResult =
  | { kind: 'ready'; docText: string; meta: HanjaMeta; durability: Durability; imported: boolean }
  | { kind: 'reimport-confirm' }
  | { kind: 'corrupt' }
  | { kind: 'source-error'; source: string }
  | { kind: 'failed'; reason: BackendFailure; detail?: string };

/** Atomic, idempotent initialisation of one key (contract section 2). */
export async function initializeHanjaStore(key: string, options: { allowReimport?: boolean } = {}): Promise<InitResult> {
  const source = readLegacySource(key);
  const generation = randomId();
  let markerSeen = false;
  try { markerSeen = legacyStorage()?.getItem(hanjaIdbMarkerKey(key)) != null; } catch { markerSeen = false; }
  const out = await getHanjaBackend().transact<InitDecision>(key, 'readwrite', (doc, meta) => {
    const d = decideInit(doc, meta, source, generation, { markerSeen, allowReimport: options.allowReimport === true });
    return d.kind === 'write' ? { value: d, write: { docText: d.docText, meta: d.meta } } : { value: d };
  });
  if (!out.ok) return { kind: 'failed', reason: out.reason, detail: out.detail };
  const d = out.value;
  if (d.kind === 'ready' || d.kind === 'write') {
    if (d.kind === 'write') {
      try { legacyStorage()?.setItem(hanjaIdbMarkerKey(key), d.meta.generation); } catch { /* marker is best effort */ }
    }
    return { kind: 'ready', docText: d.docText, meta: d.meta, durability: out.durability, imported: d.kind === 'write' };
  }
  if (d.kind === 'source-error') return { kind: 'source-error', source: d.source };
  return { kind: d.kind };
}

export type LoadResult =
  | { kind: 'ready'; docText: string; meta: HanjaMeta; durability: Durability }
  | { kind: 'corrupt' }
  | { kind: 'missing' }
  | { kind: 'failed'; reason: BackendFailure; detail?: string };

/** Read-only reload of the committed records (e.g. after an unknown outcome). */
export async function loadHanjaStore(key: string): Promise<LoadResult> {
  type Read = { kind: 'missing' } | { kind: 'corrupt' } | { kind: 'ready'; docText: string; meta: HanjaMeta };
  const out = await getHanjaBackend().transact<Read>(key, 'readonly', (doc, meta) => {
    if (doc === undefined && meta === undefined) return { value: { kind: 'missing' } };
    const parsed = parseDocument(doc);
    return { value: parsed && isValidMeta(meta, parsed) ? { kind: 'ready', docText: doc as string, meta: meta as HanjaMeta } : { kind: 'corrupt' } };
  });
  if (!out.ok) return { kind: 'failed', reason: out.reason, detail: out.detail };
  return out.value.kind === 'ready' ? { ...out.value, durability: out.durability } : out.value;
}

export type SaveOutcome =
  | { kind: 'saved'; snapshot: ScopeSnapshot; meta: HanjaMeta; idempotent: boolean; durability: Durability }
  | { kind: 'conflict'; reason: 'conflict' | 'reload-required'; current: string | null; snapshot: ScopeSnapshot; meta: HanjaMeta }
  | { kind: 'invalid'; reason: Extract<SaveDecision, { kind: 'invalid' }>['reason'] }
  | { kind: 'corrupt' }
  | { kind: 'failed'; reason: BackendFailure; detail?: string };

/** One conditional position patch in one readwrite transaction (contract section 4). */
export async function saveHanjaPosition(
  key: string, req: { scope: string; fullName: string; index: number; hanja: string; legacyRecovery: boolean; expected: PositionToken },
): Promise<SaveOutcome> {
  const now = Date.now();
  const out = await getHanjaBackend().transact<{ d: SaveDecision; meta: HanjaMeta }>(key, 'readwrite', (doc, meta) => {
    const d = decideSave(doc, meta, { ...req, now });
    if (d.kind === 'write') return { value: { d, meta: d.meta }, write: { docText: d.docText, meta: d.meta } };
    return { value: { d, meta: meta as HanjaMeta } };
  });
  if (!out.ok) return { kind: 'failed', reason: out.reason, detail: out.detail };
  const { d, meta } = out.value;
  if (d.kind === 'write') return { kind: 'saved', snapshot: d.snapshot, meta, idempotent: false, durability: out.durability };
  if (d.kind === 'idempotent') return { kind: 'saved', snapshot: d.snapshot, meta, idempotent: true, durability: out.durability };
  if (d.kind === 'conflict') return { kind: 'conflict', reason: d.reason, current: d.current, snapshot: d.snapshot, meta };
  if (d.kind === 'invalid') return { kind: 'invalid', reason: d.reason };
  return { kind: 'corrupt' };
}

/** Stores, for one analysis scope, the digest of a legacy snapshot the user dismissed (audit F3). */
export async function acknowledgeLegacySnapshot(key: string, scope: string, digest: string): Promise<{ ok: true; meta: HanjaMeta } | { ok: false }> {
  const out = await getHanjaBackend().transact<HanjaMeta | null>(key, 'readwrite', (doc, meta) => {
    const d = decideAck(doc, meta, scope, digest);
    return d.kind === 'write' ? { value: d.meta, write: { meta: d.meta } } : { value: null };
  });
  return out.ok && out.value ? { ok: true, meta: out.value } : { ok: false };
}

/** Legacy changes made after the import, for the current scope (bounded, read-only). */
export function checkLegacyChanges(key: string, meta: HanjaMeta, snapshot: ScopeSnapshot): ExternalCheck {
  return checkExternal(readLegacySource(key), meta, snapshot);
}

export { buildSnapshot, tokenOf };
