// @vitest-environment jsdom
// R3.2 F2 focus: keyboard focus after adopting an older-tab (legacy) Hanja value on the
// real Mode B / Mode C result pages. The adoption button can unmount once the outcome is
// applied; focus must never fall to <body>, and must not be taken back when the user
// moved it on purpose while the save was pending.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { TxBody, overrideHanjaBackend } from '@/lib/hanjaPersistence';
import { MemoryHanjaBackend } from '@/test-utils/memoryHanjaBackend';
import { committedNames } from '@/test-utils/hanjaTestBackend';
import { getHanjaOptions } from '@/data/hanjaDB';
import { hanjaAttemptMessage } from '@/components/HanjaPersistenceStatus';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/components/PDFButton', () => ({ default: () => null }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '이준'] };
function scopeOf(mode: 'B' | 'C') {
  const v = mode === 'B' ? validateModeBInput(B_INPUT) : validateModeCInput(C_INPUT);
  if (!v.ok) throw new Error('invalid');
  return analysisScope(v.value);
}

class GatedBackend extends MemoryHanjaBackend {
  gate: Promise<void> | null = null;
  private open: (() => void) | null = null;
  hold() { this.gate = new Promise(r => { this.open = r; }); }
  release() { this.open?.(); this.gate = null; }
  /** every transaction reports the database as unavailable while set (a failing re-check / re-open) */
  failAll = false;
  reads = 0;
  override async transact<T>(key: string, mode: 'readonly' | 'readwrite', body: TxBody<T>) {
    if (mode === 'readonly') this.reads++;
    if (this.gate) await this.gate;
    if (this.failAll) return { ok: false as const, reason: 'unavailable' as const };
    return super.transact(key, mode, body);
  }
}
let be: GatedBackend;
beforeEach(() => { localStorage.clear(); push.mockClear(); be = new GatedBackend(); overrideHanjaBackend(be); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); overrideHanjaBackend(null); });

const status = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const cardOf = (name: string) => screen.getByRole('heading', { name }).closest('div.bg-white') as HTMLElement;
const quick = (c: HTMLElement, syl: string) => within(within(c).getByTestId('hanja-quick-select')).getByRole('button', { name: new RegExp(`^'${syl}' 한자 선택`) });
/** The adoption button of one listed position (name#0). */
const adoptButton = (t: { fullName: string; legacy: string }) => {
  const row = screen.getByTestId('hanja-external-changes').querySelector(`[data-external-item="${t.fullName}#0"]`) as HTMLElement;
  return within(row).getByRole('button', { name: `${t.legacy}(으)로 바꾸기` });
};
/** Keyboard activation of the focused control (jsdom has no native Enter→click; real Chrome is checked separately). */
const press = (el: HTMLElement) => { el.focus(); expect(document.activeElement).toBe(el); fireEvent.keyDown(el, { key: 'Enter' }); fireEvent.click(el); fireEvent.keyUp(el, { key: 'Enter' }); };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

interface Target { fullName: string; syl: string; legacy: string }

/**
 * Renders the mode's real result page, then an older tab writes legacy values for the
 * given number of positions (first syllables of the first names shown).
 */
async function setup(mode: 'B' | 'C', count = 1, strict = false) {
  const key = mode === 'B' ? HANJA_SELECTION_KEYS.modeB : HANJA_SELECTION_KEYS.modeC;
  localStorage.setItem(key, JSON.stringify({ version: 2, scopes: {} }));
  localStorage.setItem(mode === 'B' ? 'dlbd_mode_b' : 'dlbd_mode_c', JSON.stringify(mode === 'B' ? B_INPUT : C_INPUT));
  const page = mode === 'B' ? <ModeBResults /> : <ModeCResults />;
  render(strict ? <StrictMode>{page}</StrictMode> : page);
  await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
  await waitFor(() => expect(status()).toBe('idle'));
  const targets: Target[] = [];
  for (const h of screen.getAllByRole('heading', { level: 3 })) {
    if (targets.length === count) break;
    const fullName = h.textContent!.trim();
    const c = cardOf(fullName);
    const btn = within(c).queryAllByRole('button').find(b => b.hasAttribute('data-hanja-quick'));
    if (!btn) continue;
    const index = Number(btn.getAttribute('data-hanja-quick'));
    const syl = btn.getAttribute('aria-label')!.match(/^'(.)'/)![1];
    const opts = getHanjaOptions(syl).map(o => o.hanja);
    const legacy = opts.find(x => !btn.textContent!.includes(x))!;
    expect(index).toBe(0);
    targets.push({ fullName, syl, legacy });
  }
  expect(targets).toHaveLength(count);
  const names: Record<string, (string | null)[]> = {};
  for (const t of targets) names[t.fullName] = [t.legacy];
  localStorage.setItem(key, JSON.stringify({ version: 2, scopes: { [scopeOf(mode)]: { updatedAt: 9e12, names } } }));
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key })); });
  await screen.findByTestId('hanja-external-changes');
  return { key, scope: scopeOf(mode), targets };
}

/** Another tab commits `value` at fullName#0 after this page loaded its snapshot. */
function otherTabCommits(key: string, scope: string, fullName: string, value: string) {
  const doc = JSON.parse(be.documents.get(key)!);
  const meta = structuredClone(be.metadata.get(key)!);
  doc.scopes[scope] = { updatedAt: 2, names: { [fullName]: [value] } };
  meta.scopes[scope] = { incarnation: meta.nextIncarnation, order: meta.seq + 1, positions: { [`${fullName}#0`]: 1 } };
  meta.nextIncarnation += 1; meta.seq += 1; meta.revision += 1;
  be.documents.set(key, JSON.stringify(doc)); be.metadata.set(key, meta);
}

const expectNotBody = () => { expect(document.activeElement).not.toBe(document.body); expect(document.activeElement?.isConnected).toBe(true); };

describe.each(['B', 'C'] as const)('Mode %s: focus after adopting a legacy Hanja value', mode => {
  it('keyboard success: the adoption button is removed; focus goes to the card control for that syllable', async () => {
    const { key, scope, targets: [t] } = await setup(mode);
    const btn = adoptButton(t);
    be.hold();
    press(btn);
    await waitFor(() => expect(status()).toBe('saving'));
    // while saving the button stays mounted, focused and aria-disabled (no focus drop, no second save)
    expect(btn.isConnected).toBe(true);
    expect(document.activeElement).toBe(btn);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(btn);
    act(() => be.release());
    await screen.findByTestId('hanja-save-status');
    await settle();
    expect(screen.getByTestId('hanja-save-status').textContent).toBe(`${t.fullName}의 한자 선택을 브라우저에 저장했습니다.`);
    expect(btn.isConnected).toBe(false); // the original target is detached
    expect(screen.queryByTestId('hanja-external-changes')).toBeNull();
    const target = quick(cardOf(t.fullName), t.syl);
    expect(document.activeElement).toBe(target);
    expect(target.getAttribute('aria-disabled')).toBeNull();
    expect(target.textContent).toContain(t.legacy);
    expect(committedNames(be, key, scope)).toEqual({ [t.fullName]: [t.legacy] });
    expect(be.commits).toBe(2); // the import + exactly one adoption
  }, 60000);

  it('success with another candidate left: focus moves to the next adoption button in the list', async () => {
    const { targets: [a, b] } = await setup(mode, 2);
    press(adoptButton(a));
    await screen.findByTestId('hanja-save-status');
    await settle();
    expect(document.activeElement).toBe(adoptButton(b));
  }, 60000);

  it('conflict: the alert text is unchanged and focus stays on the still-mounted adoption button', async () => {
    const { key, scope, targets: [t] } = await setup(mode);
    const other = getHanjaOptions(t.syl).map(o => o.hanja).find(x => x !== t.legacy)!;
    otherTabCommits(key, scope, t.fullName, other);
    const btn = adoptButton(t);
    press(btn);
    const alert = await screen.findByRole('alert');
    await settle();
    expect(alert.textContent).toBe(hanjaAttemptMessage(t.fullName, 0, t.syl, t.legacy, { ok: false, reason: 'conflict', current: other }));
    expect(btn.isConnected).toBe(true);
    expect(document.activeElement).toBe(btn);
    expect(committedNames(be, key, scope)).toEqual({ [t.fullName]: [other] });
  }, 60000);

  it('quota, then a repeated attempt: focus stays on the button after the failure; the retry succeeds once', async () => {
    const { key, scope, targets: [t] } = await setup(mode);
    const btn = adoptButton(t);
    be.failNext = 'quota';
    press(btn);
    const alert = await screen.findByRole('alert');
    await settle();
    expect(alert.textContent).toContain('브라우저 저장 공간이 부족합니다');
    expect(document.activeElement).toBe(btn);
    expect(committedNames(be, key, scope)).toBeUndefined();
    press(btn); // repeated attempt from the same (still focused) control
    await screen.findByTestId('hanja-save-status');
    await settle();
    expect(document.activeElement).toBe(quick(cardOf(t.fullName), t.syl));
    expect(committedNames(be, key, scope)).toEqual({ [t.fullName]: [t.legacy] });
    expect(be.commits).toBe(2);
  }, 60000);

  it('abort: the cancellation message is unchanged and focus stays on the adoption button', async () => {
    const { key, scope, targets: [t] } = await setup(mode);
    const btn = adoptButton(t);
    be.failNext = 'aborted';
    press(btn);
    const alert = await screen.findByRole('alert');
    await settle();
    expect(alert.textContent).toBe(hanjaAttemptMessage(t.fullName, 0, t.syl, t.legacy, { ok: false, reason: 'aborted' }));
    expect(document.activeElement).toBe(btn);
    expect(committedNames(be, key, scope)).toBeUndefined();
  }, 60000);

  it('unknown outcome: the list is hidden; focus goes to "저장 결과 다시 확인", never shown as saved', async () => {
    const { targets: [t] } = await setup(mode);
    const btn = adoptButton(t);
    be.failNext = 'unknown-commit';
    press(btn);
    const alert = await screen.findByRole('alert');
    await settle();
    expect(alert.textContent).toBe(hanjaAttemptMessage(t.fullName, 0, t.syl, t.legacy, { ok: false, reason: 'unknown-outcome' }));
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    expect(btn.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '저장 결과 다시 확인' }));
    expect(quick(cardOf(t.fullName), t.syl).getAttribute('aria-disabled')).toBe('true'); // not chosen: locked
  }, 60000);

  it('no focus theft: focus moved on purpose while the save is pending is left where the user put it', async () => {
    const { targets: [t] } = await setup(mode);
    be.hold();
    press(adoptButton(t));
    await waitFor(() => expect(status()).toBe('saving'));
    const elsewhere = screen.getByRole('button', { name: /돌아가기/ });
    elsewhere.focus();
    act(() => be.release());
    await screen.findByTestId('hanja-save-status');
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  }, 60000);

  it('R3.1 picker after an adoption: opens from the focused card control and returns focus on Escape', async () => {
    const { targets: [t] } = await setup(mode);
    press(adoptButton(t));
    await screen.findByTestId('hanja-save-status');
    await settle();
    const trigger = quick(cardOf(t.fullName), t.syl);
    expect(document.activeElement).toBe(trigger);
    press(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expectNotBody();
  }, 60000);
});

/**
 * N1: after an adoption with an unknown outcome, "저장 결과 다시 확인" is ACTIVATED (not only
 * focused). It unmounts once the re-check finished; focus must land on a meaningful control.
 */
describe.each(['B', 'C'] as const)('Mode %s: focus after re-checking an unknown adoption outcome (N1)', mode => {
  const recheckButton = () => screen.getByRole('button', { name: '저장 결과 다시 확인' });
  async function toUnknown(fault: 'unknown-commit' | 'unknown-rollback', strict = false) {
    const ctx = await setup(mode, 1, strict);
    const [t] = ctx.targets;
    be.failNext = fault;
    press(adoptButton(t));
    await screen.findByRole('alert');
    await settle();
    expect(status()).toBe('unknown-outcome');
    const recheck = recheckButton();
    expect(document.activeElement).toBe(recheck); // F2 behaviour kept
    return { ...ctx, t, recheck };
  }

  it('unknown-commit → re-check (held, activated twice) → ready: focus goes to the card control showing the committed value', async () => {
    const { key, scope, t, recheck } = await toUnknown('unknown-commit');
    const reads = be.reads;
    be.hold();
    press(recheck);
    press(recheck); // repeated activation while the re-check is pending: ignored
    await settle();
    expect(status()).toBe('unknown-outcome');
    expect(document.activeElement).toBe(recheck); // focus stays on a meaningful control while pending
    expect(recheck.isConnected).toBe(true);
    act(() => be.release());
    await waitFor(() => expect(status()).toBe('idle'));
    await settle();
    expect(be.reads - reads).toBe(1); // one re-check read only
    expect(recheck.isConnected).toBe(false);
    const target = quick(cardOf(t.fullName), t.syl);
    expect(document.activeElement).toBe(target);
    expect(target.isConnected).toBe(true);
    expect(target.getAttribute('aria-disabled')).toBeNull();
    expect(target.textContent).toContain(t.legacy); // canonical committed value shown
    expect(committedNames(be, key, scope)).toEqual({ [t.fullName]: [t.legacy] });
    expect(screen.queryByTestId('hanja-save-status')).toBeNull(); // never claimed as saved
    expect(screen.queryByTestId('hanja-external-changes')).toBeNull();
  }, 60000);

  it('unknown-rollback → re-check → ready: nothing committed; focus returns to the re-listed adoption button', async () => {
    const { key, scope, t, recheck } = await toUnknown('unknown-rollback');
    press(recheck);
    await waitFor(() => expect(status()).toBe('idle'));
    await settle();
    expect(recheck.isConnected).toBe(false);
    const again = adoptButton(t);
    expect(document.activeElement).toBe(again);
    expect(again.isConnected).toBe(true);
    expect(again.getAttribute('aria-disabled')).toBeNull();
    expect(committedNames(be, key, scope)).toBeUndefined();
    expect(quick(cardOf(t.fullName), t.syl).textContent).not.toContain(t.legacy);
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
  }, 60000);

  it('re-check fails → read-only with "다시 시도" focused → repeated attempt succeeds → focus restored', async () => {
    const { key, scope, t, recheck } = await toUnknown('unknown-commit');
    be.failAll = true;
    press(recheck);
    await waitFor(() => expect(status()).toBe('read-only-error'));
    await settle();
    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(document.activeElement).toBe(retry);
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    be.failAll = false;
    press(retry);
    await waitFor(() => expect(status()).toBe('idle'));
    await settle();
    expect(retry.isConnected).toBe(false);
    const target = quick(cardOf(t.fullName), t.syl);
    expect(document.activeElement).toBe(target);
    expect(target.textContent).toContain(t.legacy);
    expect(committedNames(be, key, scope)).toEqual({ [t.fullName]: [t.legacy] });
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
  }, 60000);

  it('StrictMode: unknown-commit → re-check → ready restores focus once to the card control', async () => {
    const { key, scope, t, recheck } = await toUnknown('unknown-commit', true);
    press(recheck);
    await waitFor(() => expect(status()).toBe('idle'));
    await settle();
    expect(document.activeElement).toBe(quick(cardOf(t.fullName), t.syl));
    expect(committedNames(be, key, scope)).toEqual({ [t.fullName]: [t.legacy] });
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
  }, 60000);

  it('no focus theft: focus moved on purpose while the re-check is pending stays there', async () => {
    const { recheck } = await toUnknown('unknown-rollback');
    be.hold();
    press(recheck);
    const elsewhere = screen.getByRole('button', { name: /돌아가기/ });
    elsewhere.focus();
    act(() => be.release());
    await waitFor(() => expect(status()).toBe('idle'));
    await settle();
    expect(document.activeElement).toBe(elsewhere);
  }, 60000);
});

describe('Mode B: fallback when the adopted name has no visible card', () => {
  it('focus goes to the save message (programmatically focusable, not in the tab order)', async () => {
    const { targets: [t] } = await setup('B');
    // filter to a grade that excludes this card
    const filterBox = screen.getByText('등급 필터').closest('div.bg-white') as HTMLElement;
    for (const b of within(filterBox).getAllByRole('button').filter(x => !x.textContent!.startsWith('전체'))) {
      fireEvent.click(b);
      if (!screen.queryByRole('heading', { name: t.fullName })) break;
    }
    expect(screen.queryByRole('heading', { name: t.fullName })).toBeNull();
    press(adoptButton(t));
    const msg = await screen.findByTestId('hanja-save-status');
    await settle();
    expect(document.activeElement).toBe(msg);
    expect(msg.getAttribute('tabindex')).toBe('-1');
    expectNotBody();
  }, 60000);
});
