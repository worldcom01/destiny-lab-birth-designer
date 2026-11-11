import type { Ref } from 'react';
import { HanjaStoreFailure, hanjaSaveFailureMessage } from '@/lib/hanjaModel';

/** Result of the last explicit Hanja confirmation (null: nothing confirmed yet). */
export type HanjaSaveState =
  | null
  | { ok: true; fullName: string }
  | { ok: false; fullName: string; reason: HanjaStoreFailure; message?: string };

/**
 * Success is shown only after the save was verified (R3.2: transaction complete); a refused or failed
 * save is an alert, and the choice was not applied on screen (see the pages).
 */
export default function HanjaSaveFeedback({ state, messageRef }: {
  state: HanjaSaveState;
  /** R3.2: last-resort focus destination after a legacy adoption (tabIndex -1: not in the tab order). */
  messageRef?: Ref<HTMLParagraphElement>;
}) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p ref={messageRef} tabIndex={-1} role="status" data-testid="hanja-save-status" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
        {state.fullName}의 한자 선택을 브라우저에 저장했습니다.
      </p>
    );
  }
  return (
    <p ref={messageRef} tabIndex={-1} role="alert" data-testid="hanja-save-error" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
      {state.message ?? hanjaSaveFailureMessage(state.fullName, state.reason)}
    </p>
  );
}
