'use client';

// R3.2: persistence state of the result page's Hanja selections, plus the
// review of changes written by older application tabs (never merged automatically).
import { useEffect, useRef, useState } from 'react';
import { HanjaStoreFailure, hanjaSaveFailureMessage } from '@/lib/hanjaModel';
import type { HanjaPersistence, HanjaSaveAttempt } from '@/lib/useHanjaPersistence';
import type { ExternalCandidate } from '@/lib/hanjaPersistenceCore';

const OLD_TAB_GUIDANCE = '이전 버전 화면이 열린 다른 탭이 있다면 새로고침해 주세요. 이전 버전 탭에서 고른 한자는 이 화면의 저장 기록에 자동으로 합치지 않습니다.';

/** User text for a save attempt that did not succeed (R3.2 reasons are explicit). */
export function hanjaAttemptMessage(
  fullName: string, index: number, syllable: string | undefined, requested: string,
  attempt: Extract<HanjaSaveAttempt, { ok: false }>,
): string {
  // the particle attaches to '글자' (no final consonant), never to the quoted syllable
  const where = `${fullName}의 ${index + 1}번째 이름 글자${syllable ? `('${syllable}')` : ''}`;
  const reason: HanjaStoreFailure = attempt.reason;
  if (reason === 'conflict') {
    return `${where}는 다른 탭에서 이미 ${attempt.current ?? '선택 없음'}(으)로 저장돼 있어, 이번에 고른 ${requested}을(를) 저장하지 않았습니다. 최신 저장 상태를 다시 불러왔으니 확인한 뒤 다시 선택해 주세요.`;
  }
  if (reason === 'reload-required') {
    return `다른 탭에서 한자 저장 기록이 바뀌어(오래된 분석 기록 정리 등) ${where}에 고른 ${requested}을(를) 저장하지 않았습니다. 최신 저장 상태를 다시 불러왔으니 다시 선택해 주세요.`;
  }
  if (reason === 'unknown-outcome') {
    return `${where}에 고른 ${requested}이(가) 저장됐는지 확인하지 못했습니다. 화면에는 확정으로 표시하지 않았습니다. "저장 결과 다시 확인"을 눌러 실제 상태를 확인해 주세요.`;
  }
  if (reason === 'not-ready') {
    return `${fullName}의 한자 선택을 저장하지 않았습니다. 저장된 선택을 아직 불러오는 중이거나 저장을 사용할 수 없는 상태입니다.`;
  }
  return hanjaSaveFailureMessage(fullName, reason);
}

const positionKey = (it: ExternalCandidate) => `${it.fullName}#${it.index}`;

/** A focus destination must be attached and operable (never hidden, disabled or aria-disabled). */
function focusable(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && !el.closest('[hidden],[inert],[aria-hidden="true"]')
    && el.getAttribute('aria-disabled') !== 'true' && !(el as HTMLButtonElement).disabled;
}

export default function HanjaPersistenceStatus({ persistence, syllableOf, onAdopt, focusFallback }: {
  persistence: HanjaPersistence;
  syllableOf: (fullName: string, index: number) => string | undefined;
  /**
   * Adopts a legacy value through the page's normal save handler, so success,
   * conflict, quota and unknown outcomes get the same named feedback (audit F2).
   * Resolves once the page has applied the outcome.
   */
  onAdopt: (item: ExternalCandidate) => Promise<unknown>;
  /**
   * Focus destination outside this region when the adoption control is gone and
   * no control here is left (the result card's control for that syllable, else
   * the page's save message).
   */
  focusFallback?: (item: ExternalCandidate | null) => HTMLElement | null;
}) {
  const p = persistence;
  const box = 'text-[11px] rounded-xl px-3 py-2 border';
  // Adoption focus (R3.2 F2 focus): the adoption button can unmount once the outcome is
  // applied (the candidate disappears on success; the list is hidden on unknown outcome),
  // which would drop keyboard focus to <body>. The pending adoption is remembered here and
  // focus is resolved after React committed the outcome, from refs only.
  const adoptButtons = useRef(new Map<string, HTMLButtonElement>());
  const recheckRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const reimportRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  // One focus request at a time: an adoption, or a status action (re-check / retry /
  // re-import) that follows it. `done` is set when the action settled; focus is resolved
  // after that commit, once no transient state (initializing / saving) is shown (R3.2 N1).
  const pending = useRef<{ item: ExternalCandidate | null; origin: HTMLElement; order: string[]; done: boolean } | null>(null);
  // The adoption whose outcome ended on a status control (unknown / read-only / ...), so the
  // follow-up action can return focus to that position (the card control or the re-listed item).
  const carried = useRef<{ item: ExternalCandidate | null; order: string[] }>({ item: null, order: [] });
  const [settled, setSettled] = useState(0);
  const items = p.external && p.external.kind !== 'unreadable' ? p.external.items : null;

  const track = (req: NonNullable<typeof pending.current>, action: Promise<unknown>) => {
    pending.current = req;
    void action.finally(() => { req.done = true; setSettled(n => n + 1); });
  };
  const adopt = (it: ExternalCandidate, origin: HTMLElement) => {
    // aria-disabled gating; one adoption at a time (the hook also refuses a second save)
    if (!p.canSave || pending.current) return;
    track({ item: it, origin, order: (items ?? []).map(positionKey), done: false }, onAdopt(it));
  };
  /** Status buttons unmount when their action completes; a repeated activation while pending is ignored. */
  const statusAction = (origin: HTMLElement, action: () => Promise<void> | void) => {
    if (pending.current) return;
    // the action runs synchronously inside the click, exactly as before; only its completion is awaited
    const req = { ...carried.current, origin, done: false };
    pending.current = req;
    let result: Promise<void> | void;
    try { result = action(); } catch (e) { pending.current = null; throw e; }
    track(req, Promise.resolve(result));
  };

  useEffect(() => {
    const req = pending.current;
    if (!req || !req.done || p.status === 'initializing' || p.status === 'saving') return;
    pending.current = null;
    const onStatusControl = p.status === 'unknown-outcome' || p.status === 'read-only-error' || p.status === 'blocked-upgrade' || p.status === 'reimport-confirm';
    carried.current = onStatusControl ? { item: req.item, order: req.order } : { item: null, order: [] };
    const active = document.activeElement;
    // Focus was moved on purpose while the save was pending (still attached, not the
    // original control): never take it back.
    const lost = !active || active === document.body || !active.isConnected;
    if (!lost && active !== req.origin) return;
    const key = req.item ? positionKey(req.item) : '';
    const same = req.item ? adoptButtons.current.get(key) : undefined;
    if (active === req.origin && same === req.origin && focusable(same)) return; // still there and focused
    const statusControl = p.status === 'unknown-outcome' ? recheckRef.current
      : p.status === 'read-only-error' || p.status === 'blocked-upgrade' ? retryRef.current
        : p.status === 'reimport-confirm' ? reimportRef.current : null;
    // nearest remaining candidate in the list order seen at the click (next, then previous)
    const at = req.item ? req.order.indexOf(key) : -1;
    const neighbours = [...req.order.slice(at + 1), ...req.order.slice(0, Math.max(at, 0)).reverse()]
      .map(k => adoptButtons.current.get(k));
    const target = [same, statusControl, ...neighbours, dismissRef.current, focusFallback?.(req.item)].find(focusable);
    target?.focus();
  }, [settled, p.status]); // eslint-disable-line react-hooks/exhaustive-deps -- resolves a settled request after its commit
  return (
    <>
      {p.status === 'initializing' && (
        <p role="status" aria-busy="true" data-testid="hanja-persistence-status" data-status={p.status} className={`${box} text-slate-600 bg-white border-slate-100`}>
          저장된 한자 선택을 불러오는 중입니다. 준비되면 한자를 선택할 수 있습니다.
        </p>
      )}
      {p.status === 'saving' && (
        <p role="status" aria-busy="true" data-testid="hanja-persistence-status" data-status={p.status} className={`${box} text-slate-600 bg-white border-slate-100`}>
          한자 선택을 저장하는 중입니다…
        </p>
      )}
      {(p.status === 'read-only-error' || p.status === 'blocked-upgrade' || p.status === 'unknown-outcome' || p.status === 'reimport-confirm') && p.notice && (
        <div role="status" data-testid="hanja-persistence-status" data-status={p.status} className={`${box} text-amber-900 bg-amber-50 border-amber-200 space-y-2`}>
          <p>{p.notice}</p>
          {p.status === 'unknown-outcome' && (
            <button ref={recheckRef} type="button" onClick={e => statusAction(e.currentTarget, p.recheck)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              저장 결과 다시 확인
            </button>
          )}
          {p.status === 'reimport-confirm' && (
            <button ref={reimportRef} type="button" onClick={e => statusAction(e.currentTarget, p.confirmReimport)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              이전 기록에서 다시 불러오기
            </button>
          )}
          {(p.status === 'read-only-error' || p.status === 'blocked-upgrade') && (
            <button ref={retryRef} type="button" onClick={e => statusAction(e.currentTarget, p.retry)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              다시 시도
            </button>
          )}
        </div>
      )}
      {/* kept mounted while saving (controls aria-disabled), so the focused adoption button stays */}
      {p.external && (p.status === 'ready' || p.status === 'conflict' || p.status === 'saving') && (
        <section data-testid="hanja-external-changes" aria-label="다른 탭의 이전 버전 변경" className={`${box} text-slate-700 bg-white border-amber-200 space-y-2`}>
          {p.external.kind === 'unreadable' ? (
            <p>다른 탭의 이전 버전 화면이 남긴 한자 기록을 읽을 수 없어 반영하지 않았습니다. 현재 저장 기록은 그대로입니다. {OLD_TAB_GUIDANCE}</p>
          ) : (
            <>
              <p className="font-bold">다른 탭(이전 버전)에서 다르게 고른 한자가 있습니다. 자동으로 합치지 않았습니다.</p>
              <ul className="space-y-1.5">
                {p.external.items.map(it => (
                  <li key={`${it.fullName}#${it.index}`} data-external-item={`${it.fullName}#${it.index}`} className="flex flex-wrap items-center gap-2">
                    <span>
                      {it.fullName}의 {it.index + 1}번째 글자{syllableOf(it.fullName, it.index) ? ` '${syllableOf(it.fullName, it.index)}'` : ''}: 현재 {it.current ?? '선택 없음'} · 다른 탭 {it.legacy}
                    </span>
                    <button type="button" aria-disabled={!p.canSave || undefined}
                      ref={el => { if (el) adoptButtons.current.set(positionKey(it), el); }}
                      onClick={e => adopt(it, e.currentTarget)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-bold aria-disabled:opacity-50 aria-disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                      {it.legacy}(으)로 바꾸기
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-slate-500">{OLD_TAB_GUIDANCE}</p>
              <button ref={dismissRef} type="button" aria-disabled={!p.canSave || undefined} onClick={() => { if (p.canSave) p.dismissExternal(); }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-bold aria-disabled:opacity-50 aria-disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                현재 저장 기록 유지(이 알림 닫기)
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
