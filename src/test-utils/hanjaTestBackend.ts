// Test helper (not a test file): installs the in-memory Hanja persistence backend
// for jsdom page tests (jsdom has no IndexedDB). It serialises transactions like
// IndexedDB but is NOT evidence of cross-tab safety (real Chrome runs are).
import { afterEach, beforeEach } from 'vitest';
import { HanjaSelections } from '@/lib/hanjaModel';
import { overrideHanjaBackend } from '@/lib/hanjaPersistence';
import { MemoryHanjaBackend } from '@/test-utils/memoryHanjaBackend';
import { parseDocument } from '@/lib/hanjaPersistenceCore';

/** Registers beforeEach/afterEach; returns a getter for the current backend. */
export function installMemoryHanjaBackend(): () => MemoryHanjaBackend {
  let backend = new MemoryHanjaBackend();
  beforeEach(() => { backend = new MemoryHanjaBackend(); overrideHanjaBackend(backend); });
  afterEach(() => { overrideHanjaBackend(null); });
  return () => backend;
}

/** Committed selections of one scope (undefined when the scope has no record). */
export function committedNames(backend: MemoryHanjaBackend, key: string, scope: string): HanjaSelections | undefined {
  return parseDocument(backend.documents.get(key))?.scopes[scope]?.names;
}
