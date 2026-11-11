// Test-only (never imported by application code): in-memory Hanja backend with
// the same serialised, all-or-nothing transaction semantics as IndexedDB, plus
// fault injection, for jsdom tests (jsdom has no IndexedDB). It is NOT evidence
// of cross-tab safety; that is only claimed from real-browser runs.
import { Durability, HanjaBackend, TxBody, TxOutcome } from '@/lib/hanjaPersistence';
import { HanjaMeta } from '@/lib/hanjaPersistenceCore';

export class MemoryHanjaBackend implements HanjaBackend {
  readonly documents = new Map<string, string>();
  readonly metadata = new Map<string, HanjaMeta>();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(r: 'blocked-upgrade' | 'closed') => void>();
  /** Next transaction fails like this (once). 'unknown-commit' commits but reports unknown. */
  failNext: null | 'quota' | 'aborted' | 'unavailable' | 'blocked-upgrade' | 'unknown-commit' | 'unknown-rollback' = null;
  durability: Durability = 'strict';
  commits = 0;

  subscribe(listener: (r: 'blocked-upgrade' | 'closed') => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit(r: 'blocked-upgrade' | 'closed') { for (const l of this.listeners) l(r); }

  transact<T>(key: string, mode: 'readonly' | 'readwrite', body: TxBody<T>): Promise<TxOutcome<T>> {
    const run = async (): Promise<TxOutcome<T>> => {
      await Promise.resolve();
      const fault = this.failNext;
      this.failNext = null;
      if (fault === 'unavailable' || fault === 'blocked-upgrade') return { ok: false, reason: fault };
      const meta = this.metadata.get(key);
      let out: ReturnType<TxBody<T>>;
      try {
        out = body(this.documents.get(key), meta === undefined ? undefined : structuredClone(meta));
      } catch (e) {
        return { ok: false, reason: 'aborted', detail: String((e as Error)?.message ?? e) };
      }
      if (fault === 'quota' || fault === 'aborted' || fault === 'unknown-rollback') {
        return fault === 'unknown-rollback' ? { ok: false, reason: 'unknown-outcome' } : { ok: false, reason: fault };
      }
      if (out.write && mode === 'readwrite') {
        if (out.write.docText !== undefined) this.documents.set(key, out.write.docText);
        this.metadata.set(key, structuredClone(out.write.meta));
        this.commits++;
      }
      if (fault === 'unknown-commit') return { ok: false, reason: 'unknown-outcome' };
      return { ok: true, value: out.value, durability: this.durability };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}
