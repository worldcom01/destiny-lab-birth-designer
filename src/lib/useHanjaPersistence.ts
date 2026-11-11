'use client';

// R3.2: Hanja persistence state for one result page (Mode B / Mode C).
// Kept separate from useStoredAnalysis, which stays synchronous.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HanjaScopeRecovery, HanjaSelections, HanjaStoreFailure, hanjaReadFailureNotice, loadHanjaSelectionsChecked,
  loadHanjaSelectionsWithLegacy,
} from './hanjaModel';
import { ExternalCandidate, HanjaMeta, ScopeSnapshot } from './hanjaPersistenceCore';
import {
  Durability, InitResult, acknowledgeLegacySnapshot, buildSnapshot, checkLegacyChanges, getHanjaBackend,
  initializeHanjaStore, loadHanjaStore, saveHanjaPosition, tokenOf,
} from './hanjaPersistence';

export type PersistenceStatus =
  | 'initializing' | 'ready' | 'saving' | 'conflict'
  | 'read-only-error' | 'blocked-upgrade' | 'unknown-outcome' | 'reimport-confirm';

export type HanjaSaveAttempt =
  | { ok: true; idempotent: boolean }
  | { ok: false; reason: HanjaStoreFailure; current?: string | null };

export type ExternalState =
  | { kind: 'candidates'; digest: string; items: ExternalCandidate[] }
  | { kind: 'unreadable'; digest: string };

interface State {
  status: PersistenceStatus;
  snapshot: ScopeSnapshot | null;
  meta: HanjaMeta | null;
  /** Verified legacy selections shown read-only when IndexedDB cannot be used. */
  readOnly: { selections: HanjaSelections; recovery: HanjaScopeRecovery; readNotice: string | null } | null;
  notice: string | null;
  durability: Durability | null;
  external: ExternalState | null;
}

export interface HanjaPersistence extends State {
  /** Hanja controls are enabled only here (never before initialisation completes or while saving). */
  canSave: boolean;
  /** Selections to apply to the results (canonical snapshot, or the read-only legacy ones). */
  names: HanjaSelections | null;
  recovery: HanjaScopeRecovery;
  save: (fullName: string, index: number, hanja: string) => Promise<HanjaSaveAttempt>;
  retry: () => void;
  /** Resolves once the re-read outcome was applied (UI focus handling; R3.2 N1). */
  recheck: () => Promise<void>;
  confirmReimport: () => void;
  dismissExternal: () => void;
}

const EXTERNAL_CHECK_DEBOUNCE_MS = 250;

const INITIAL: State = { status: 'initializing', snapshot: null, meta: null, readOnly: null, notice: null, durability: null, external: null };

const NOTICE = {
  unavailable: '이 브라우저에서는 여러 탭 사이에서도 안전한 한자 저장소(IndexedDB)를 사용할 수 없어 새 한자 선택을 저장하지 않습니다. 이전에 저장된 선택은 읽기 전용으로만 표시합니다. 사생활 보호 모드·저장소 차단 설정을 확인한 뒤 다시 시도해 주세요.',
  blocked: '다른 탭에서 이 서비스의 다른 버전이 열려 있어 한자 저장소를 사용할 수 없습니다. 다른 탭을 모두 새로고침하거나 닫은 뒤 다시 시도해 주세요. 그동안 새 한자 선택은 저장하지 않습니다.',
  corrupt: '한자 저장소의 기록이 서로 맞지 않아 사용할 수 없습니다. 기록은 자동으로 고치거나 지우지 않았으며, 새 한자 선택도 저장하지 않습니다.',
  closed: '한자 저장소 연결이 끊어졌습니다. 다시 시도해 주세요. 그동안 새 한자 선택은 저장하지 않습니다.',
  unknownInit: '한자 저장소 준비가 끝났는지 확인하지 못했습니다. 다시 시도해 주세요.',
  unknownSave: '마지막 한자 선택이 저장됐는지 확인하지 못했습니다(저장됐을 수도, 되지 않았을 수도 있습니다). "저장 결과 다시 확인"을 눌러 실제 상태를 불러와 주세요.',
  reimport: '이 브라우저의 한자 저장소(IndexedDB)가 비어 있습니다. 브라우저가 저장 데이터를 정리했을 수 있습니다. 예전 브라우저 저장소에 남은 기록(최신이 아닐 수 있음)을 다시 불러오려면 아래 버튼을 눌러 주세요. 그 전에는 새 선택을 저장하지 않습니다.',
} as const;

function sourceNotice(source: string): string {
  const cause: Record<string, string> = {
    inaccessible: '브라우저 저장소를 읽을 수 없습니다',
    'too-large': '기록이 안전 한도보다 큽니다',
    malformed: '기록 형식이 손상돼 있습니다',
    invalid: '기록에 알 수 없는 형식이 섞여 있습니다',
    'over-retention': '보관 한도(분석 20개)를 넘는 기록이 있습니다',
  };
  return `이전 한자 선택 기록을 새 저장소로 옮기지 못했습니다(${cause[source] ?? '원인을 확인할 수 없습니다'}). 기록은 바꾸거나 지우지 않았으며, 문제를 해결하기 전까지 새 한자 선택은 저장하지 않습니다.`;
}

function legacyReadOnly(key: string, scope: string, legacyRecovery: boolean): State['readOnly'] {
  if (legacyRecovery) {
    const r = loadHanjaSelectionsWithLegacy(key, scope);
    return { selections: r.selections, recovery: r.recovery, readNotice: null };
  }
  const r = loadHanjaSelectionsChecked(key, scope);
  return { selections: r.selections, recovery: { kind: 'none' }, readNotice: r.failure && r.failure !== 'no-storage' ? hanjaReadFailureNotice(r.failure) : null };
}

function externalOf(key: string, meta: HanjaMeta, snapshot: ScopeSnapshot): ExternalState | null {
  const c = checkLegacyChanges(key, meta, snapshot);
  return c.kind === 'none' ? null : c;
}

function stateFromInit(r: InitResult, key: string, scope: string, legacyRecovery: boolean): State {
  if (r.kind === 'ready') {
    const snapshot = buildSnapshot(r.docText, r.meta, scope, legacyRecovery);
    return { ...INITIAL, status: 'ready', snapshot, meta: r.meta, durability: r.durability, external: externalOf(key, r.meta, snapshot) };
  }
  const readOnly = legacyReadOnly(key, scope, legacyRecovery);
  if (r.kind === 'reimport-confirm') return { ...INITIAL, status: 'reimport-confirm', readOnly, notice: NOTICE.reimport };
  if (r.kind === 'corrupt') return { ...INITIAL, status: 'read-only-error', readOnly, notice: NOTICE.corrupt };
  if (r.kind === 'source-error') return { ...INITIAL, status: 'read-only-error', readOnly, notice: sourceNotice(r.source) };
  if (r.reason === 'blocked-upgrade') return { ...INITIAL, status: 'blocked-upgrade', readOnly, notice: NOTICE.blocked };
  if (r.reason === 'unknown-outcome') return { ...INITIAL, status: 'read-only-error', readOnly, notice: NOTICE.unknownInit };
  if (r.reason === 'unavailable') return { ...INITIAL, status: 'read-only-error', readOnly, notice: NOTICE.unavailable };
  return { ...INITIAL, status: 'read-only-error', readOnly, notice: NOTICE.closed };
}

export function useHanjaPersistence(key: string, scope: string | null, legacyRecovery: boolean): HanjaPersistence {
  const [st, setSt] = useState<State>(INITIAL);
  const [reload, setReload] = useState(0);
  const [allowReimport, setAllowReimport] = useState(false);
  const latest = useRef<State>(INITIAL);
  const loadGen = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { latest.current = st; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Initialisation (StrictMode / remount safe: a stale run never updates state).
  useEffect(() => {
    if (!scope) return;
    let active = true;
    const gen = ++loadGen.current;
    (async () => {
      const r = await initializeHanjaStore(key, { allowReimport });
      if (!active || gen !== loadGen.current) return;
      setSt(stateFromInit(r, key, scope, legacyRecovery));
    })();
    return () => { active = false; };
  }, [key, scope, legacyRecovery, reload, allowReimport]);

  // Connection lost / version change: stop saving.
  useEffect(() => getHanjaBackend().subscribe(reason => {
    if (!alive.current) return;
    setSt(s => (s.status === 'initializing' ? s : {
      ...s, status: reason === 'blocked-upgrade' ? 'blocked-upgrade' : 'read-only-error',
      notice: reason === 'blocked-upgrade' ? NOTICE.blocked : NOTICE.closed,
    }));
  }), []);

  // Old-version tabs: bounded legacy checks on storage events, visibility and focus.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => {
      const s = latest.current;
      if (!s.meta || !s.snapshot || !(s.status === 'ready' || s.status === 'conflict')) return;
      const ext = externalOf(key, s.meta, s.snapshot);
      if (JSON.stringify(ext) !== JSON.stringify(s.external)) setSt(x => (x === s ? { ...x, external: ext } : x));
    };
    // Debounced (audit F5): a burst of storage/focus/visibility events reads the
    // legacy source once, not once per event.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(check, EXTERNAL_CHECK_DEBOUNCE_MS); };
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) schedule(); };
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key]);

  const save = useCallback(async (fullName: string, index: number, hanja: string): Promise<HanjaSaveAttempt> => {
    const s = latest.current;
    if (busy.current || !scope || !s.snapshot || !(s.status === 'ready' || s.status === 'conflict')) return { ok: false, reason: 'not-ready' };
    busy.current = true;
    const gen = loadGen.current;
    const expected = tokenOf(s.snapshot, fullName, index);
    setSt(x => ({ ...x, status: 'saving' }));
    latest.current = { ...s, status: 'saving' };
    try {
      const out = await saveHanjaPosition(key, { scope, fullName, index, hanja, legacyRecovery, expected });
      const current = alive.current && gen === loadGen.current;
      const update = (f: (x: State) => State) => { if (current) setSt(f); };
      switch (out.kind) {
        case 'saved':
          update(x => ({ ...x, status: 'ready', snapshot: out.snapshot, meta: out.meta, durability: out.durability, notice: null, external: externalOf(key, out.meta, out.snapshot) }));
          return { ok: true, idempotent: out.idempotent };
        case 'conflict':
          update(x => ({ ...x, status: 'conflict', snapshot: out.snapshot, meta: out.meta, external: externalOf(key, out.meta, out.snapshot) }));
          return { ok: false, reason: out.reason, current: out.current };
        case 'invalid':
          update(x => ({ ...x, status: x.snapshot ? 'ready' : x.status }));
          return { ok: false, reason: out.reason };
        case 'corrupt':
          update(x => ({ ...x, status: 'read-only-error', notice: NOTICE.corrupt }));
          return { ok: false, reason: 'corrupt-db' };
        default:
          if (out.reason === 'quota' || out.reason === 'aborted') {
            update(x => ({ ...x, status: 'ready' }));
            return { ok: false, reason: out.reason === 'quota' ? 'quota-exceeded' : 'aborted' };
          }
          if (out.reason === 'unknown-outcome') {
            update(x => ({ ...x, status: 'unknown-outcome', notice: NOTICE.unknownSave }));
            return { ok: false, reason: 'unknown-outcome' };
          }
          if (out.reason === 'blocked-upgrade') {
            update(x => ({ ...x, status: 'blocked-upgrade', notice: NOTICE.blocked }));
            return { ok: false, reason: 'blocked-upgrade' };
          }
          update(x => ({ ...x, status: 'read-only-error', notice: NOTICE.unavailable }));
          return { ok: false, reason: 'unavailable' };
      }
    } finally {
      busy.current = false;
    }
  }, [key, scope, legacyRecovery]);

  const retry = useCallback(() => { setSt(INITIAL); setReload(n => n + 1); }, []);
  const confirmReimport = useCallback(() => { setSt(INITIAL); setAllowReimport(true); }, []);
  const recheck = useCallback(() => {
    const gen = loadGen.current;
    return (async () => {
      const r = await loadHanjaStore(key);
      if (!alive.current || gen !== loadGen.current || !scope) return;
      if (r.kind === 'ready') {
        const snapshot = buildSnapshot(r.docText, r.meta, scope, legacyRecovery);
        setSt(x => ({ ...x, status: 'ready', snapshot, meta: r.meta, durability: r.durability, notice: null, external: externalOf(key, r.meta, snapshot) }));
      } else {
        setSt(INITIAL);
        setReload(n => n + 1);
      }
    })();
  }, [key, scope, legacyRecovery]);
  // Adoption of a legacy value is NOT done here: the page routes it through its normal
  // save handler so every outcome gets the same named feedback (audit F2).
  const dismissExternal = useCallback(() => {
    const ext = latest.current.external;
    if (!ext || !scope) return;
    (async () => {
      const r = await acknowledgeLegacySnapshot(key, scope, ext.digest);
      if (!alive.current) return;
      if (r.ok) setSt(x => ({ ...x, meta: r.meta, external: null }));
    })();
  }, [key, scope]);

  const names = st.snapshot && (st.status === 'ready' || st.status === 'saving' || st.status === 'conflict' || st.status === 'unknown-outcome' || st.status === 'blocked-upgrade' || st.status === 'read-only-error')
    ? st.snapshot.names
    : st.readOnly?.selections ?? null;
  const recovery = st.snapshot ? st.snapshot.recovery : st.readOnly?.recovery ?? { kind: 'none' };
  return {
    ...st, canSave: st.status === 'ready' || st.status === 'conflict', names, recovery,
    save, retry, recheck, confirmReimport, dismissExternal,
  };
}
