// @vitest-environment jsdom
// R3.1: Hanja selection is visible and operable directly from the collapsed
// result card (Mode B and Mode C), through one picker per card and the
// existing single save path. R3.2: saves go to the persistence backend
// (in-memory here, IndexedDB in the browser); they are asynchronous.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { committedNames, installMemoryHanjaBackend } from '@/test-utils/hanjaTestBackend';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { analyzeModeCNames } from '@/lib/analysis';
import { getHanjaOptions } from '@/data/hanjaDB';
import { NO_HANJA_CANDIDATES, noCandidatesNote } from '@/components/HanjaQuickSelect';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const KEY_B = HANJA_SELECTION_KEYS.modeB;
const KEY_C = HANJA_SELECTION_KEYS.modeC;
const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '강시우', '김정훈'] };
const scopeB = (i: ModeBInput = B_INPUT) => { const v = validateModeBInput(i); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const scopeC = (i: ModeCInput = C_INPUT) => { const v = validateModeCInput(i); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const store = (scope: string, names: object) => JSON.stringify({ version: 2, scopes: { [scope]: { updatedAt: 1, names } } });

const be = installMemoryHanjaBackend();
const persistenceStatus = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
/** The collapsed card of `name` (details never opened), once persistence finished initialising. */
async function cardOf(name: string) {
  const heading = await screen.findByRole('heading', { name }, { timeout: 15000 });
  await waitFor(() => expect(persistenceStatus()).not.toBe('initializing'));
  return heading.closest('div.bg-white') as HTMLElement;
}
const quick = (card: HTMLElement) => within(card).getByTestId('hanja-quick-select');
const quickButton = (card: HTMLElement, syllable: string) =>
  within(quick(card)).getByRole('button', { name: new RegExp(`^'${syllable}' 한자 선택`) });
/** Picks `hanja` in the (single) open picker dialog and waits until the save settled. */
const choose = async (hanja: string) => {
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getAllByRole('button').find(b => b.textContent?.trim().startsWith(hanja))!);
  await waitFor(() => expect(persistenceStatus()).not.toBe('saving'));
};

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('picker access from a collapsed card', () => {
  it('Mode B: select, single save, success feedback, confirmed value shown, survives reload', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const card = await cardOf('김민서');
    expect(within(card).queryByRole('button', { name: /닫기/ })).toBeNull(); // details still collapsed
    expect(within(quick(card)).getByRole('heading', { name: '한자 선택' })).toBeTruthy();
    const commits = be().commits;
    fireEvent.click(quickButton(card, '민'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await choose('敏');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(be().commits - commits).toBe(1); // exactly one committed save
    expect(screen.getByTestId('hanja-save-status').textContent).toContain('김민서');
    const btn = quickButton(card, '민');
    expect(btn.getAttribute('data-quick-status')).toBe('confirmed');
    expect(btn.textContent).toContain('敏');
    expect(committedNames(be(), KEY_B, scopeB())).toEqual({ 김민서: ['敏'] });
    cleanup();
    render(<ModeBResults />); // reload
    const again = quickButton(await cardOf('김민서'), '민');
    expect(again.getAttribute('data-quick-status')).toBe('confirmed');
    expect(again.textContent).toContain('敏');
  }, 60000);

  it('Mode C: the same flow, scope and storage key of Mode C', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const card = await cardOf('김민서');
    fireEvent.click(quickButton(card, '서'));
    await choose('書');
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(committedNames(be(), KEY_C, scopeC())).toEqual({ 김민서: [null, '書'] });
    expect(be().documents.get(KEY_B)).toBeUndefined();
    expect(localStorage.getItem(KEY_B)).toBeNull(); // legacy storage is never written
    cleanup();
    render(<ModeCResults />);
    expect(quickButton(await cardOf('김민서'), '서').textContent).toContain('書');
  }, 60000);
});

describe('stored, recovered and failed selections', () => {
  it('existing stored Hanja are shown as confirmed in the collapsed card (Mode B)', async () => {
    localStorage.setItem(KEY_B, store(scopeB(), { 김민서: [null, '書'] }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const card = await cardOf('김민서');
    const seo = quickButton(card, '서');
    expect(seo.getAttribute('data-quick-status')).toBe('confirmed');
    expect(seo.getAttribute('aria-label')).toBe("'서' 한자 선택 (현재: 書 확정)");
    expect(quickButton(card, '민').getAttribute('data-quick-status')).not.toBe('confirmed');
  }, 60000);

  it('existing positions are preserved when another position is chosen from the card (Mode C)', async () => {
    localStorage.setItem(KEY_C, store(scopeC(), { 김민서: [null, '書'] }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    fireEvent.click(quickButton(await cardOf('김민서'), '민'));
    await choose('敏');
    expect(committedNames(be(), KEY_C, scopeC())).toEqual({ 김민서: ['敏', '書'] });
  }, 60000);

  it('legacy duplicate-style selections recovered read-only are shown as they are applied', async () => {
    const legacyInput = { ...B_INPUT, nameStyles: ['전통형', '전통형'] };
    const v = validateModeBInput(legacyInput); if (!v.ok) throw new Error('invalid');
    const oldScope = analysisScope({ ...v.value, nameStyles: ['전통형', '전통형'] });
    localStorage.setItem(KEY_B, store(oldScope, { 김민서: ['敏', null] }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(legacyInput));
    render(<ModeBResults />);
    await screen.findByTestId('hanja-recovery-notice', {}, { timeout: 15000 });
    const min = quickButton(await cardOf('김민서'), '민');
    expect(min.getAttribute('data-quick-status')).toBe('confirmed');
    expect(min.textContent).toContain('敏');
  }, 60000);

  it('a failed save leaves the shown value unchanged and reports the failure; a retry succeeds', async () => {
    localStorage.setItem(KEY_B, store(scopeB(), { 김민서: [null, '書'] }));
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const card = await cardOf('김민서');
    const before = quickButton(card, '서').textContent;
    const alt = getHanjaOptions('서').find(o => o.hanja !== '書')!.hanja;
    be().failNext = 'quota';
    fireEvent.click(quickButton(card, '서'));
    await choose(alt);
    expect(screen.getByRole('alert').textContent).toContain('브라우저 저장 공간이 부족합니다');
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    expect(quickButton(card, '서').textContent).toBe(before);
    expect(quickButton(card, '서').getAttribute('data-quick-status')).toBe('confirmed');
    expect(committedNames(be(), KEY_B, scopeB())).toEqual({ 김민서: [null, '書'] }); // nothing committed
    fireEvent.click(quickButton(card, '서'));
    await choose(alt);
    expect(screen.getByTestId('hanja-save-status')).toBeTruthy();
    expect(quickButton(card, '서').textContent).toContain(alt);
  }, 60000);
});

describe('missing Hanja data (actual dataset)', () => {
  it('dataset facts used below', () => {
    for (const s of ['민', '서', '우']) expect(getHanjaOptions(s).length).toBeGreaterThan(0);
    for (const s of ['시', '정', '훈']) expect(getHanjaOptions(s)).toHaveLength(0);
  });

  it('full, partial and zero coverage are shown honestly; no button without candidates', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const full = quick(await cardOf('김민서'));
    expect(within(full).getAllByRole('button')).toHaveLength(2);
    expect(within(full).queryByText(NO_HANJA_CANDIDATES)).toBeNull();

    const partial = quick(await cardOf('강시우'));
    expect(within(partial).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^'우' 한자 선택/)]);
    const si = partial.querySelector('[data-hanja-quick-unavailable="0"]')!;
    expect(si.textContent).toContain('시');
    expect(si.textContent).toContain(NO_HANJA_CANDIDATES);
    expect(si.closest('button')).toBeNull();
    expect(within(partial).queryByTestId('hanja-quick-none')).toBeNull();

    const noneCard = await cardOf('김정훈');
    const none = quick(noneCard);
    expect(within(none).queryAllByRole('button')).toHaveLength(0);
    expect(within(none).getAllByText(NO_HANJA_CANDIDATES)).toHaveLength(2);
    const jh = analyzeModeCNames({ ...C_INPUT, names: ['김정훈'] }).results[0];
    expect(within(none).getByTestId('hanja-quick-none').textContent).toBe(noCandidatesNote(jh.name.hanja));
    expect(within(none).getByTestId('hanja-quick-none').textContent).toContain('한자 미지정으로 표시됩니다'); // nothing assigned: true here
  }, 60000);

  it('surname Hanja are never offered for selection', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify({ ...C_INPUT, names: ['남궁 민'] }));
    render(<ModeCResults />);
    const card = await cardOf('남궁민');
    const labels = within(quick(card)).getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual([expect.stringMatching(/^'민' 한자 선택/)]);
  }, 60000);
});

describe('accessibility and a single coordinated picker', () => {
  it('semantic buttons, dialog semantics, Escape closes, focus returns to the trigger', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const btn = quickButton(await cardOf('김민서'), '민');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button'); // native Enter/Space activation
    expect(btn.tabIndex).toBe(0);
    expect(btn.className).toContain('focus-visible:ring-2');
    expect(btn.querySelector('button, a, input')).toBeNull(); // no nested interactive control
    btn.focus();
    fireEvent.click(btn);
    const dialog = screen.getByRole('dialog', { name: "'민' 한자 선택" });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // rendered outside the card: an animated (transformed) or overflow-hidden ancestor
    // must not clip or reposition the fixed overlay (found in the R3.1 browser check)
    expect((await cardOf('김민서')).contains(dialog)).toBe(false);
    expect(dialog.closest('.fade-up, .overflow-hidden:not([role=dialog])')).toBeNull();
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // focus returns synchronously through the shared modal stack (R3.1)
    expect(document.activeElement).toBe(quickButton(await cardOf('김민서'), '민'));
  }, 60000);

  it('the expanded detailed analysis still works, uses buttons and the same single picker', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const card = await cardOf('김민서');
    fireEvent.click(within(card).getByRole('button', { name: /세부 분석 보기/ }));
    const toggle = within(card).getByRole('button', { name: /한자 분석/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const chars = card.querySelectorAll<HTMLElement>('[data-hanja-status]');
    expect(chars).toHaveLength(3); // 김 + 민 + 서
    expect(chars[0].tagName).toBe('DIV'); // surname: not interactive
    expect(chars[1].tagName).toBe('BUTTON');
    expect(chars[1].getAttribute('aria-label')).toBe("'민' 한자 선택");
    const commits = be().commits;
    fireEvent.click(quickButton(card, '민'));
    fireEvent.click(chars[2]); // background request while a picker is open: ignored (U2), still one picker
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe("'민' 한자 선택");
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.click(chars[2]); // the detail view opens the same single picker
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe("'서' 한자 선택");
    await choose('書');
    expect(be().commits - commits).toBe(1);
    expect(committedNames(be(), KEY_B, scopeB())).toEqual({ 김민서: [null, '書'] });
    // detail view and collapsed section reflect the same saved state
    expect(card.querySelectorAll<HTMLElement>('[data-hanja-status]')[2].dataset.hanjaChar).toBe('書');
    expect(quickButton(card, '서').textContent).toContain('書');
  }, 60000);
});

describe('rankings and scores are unchanged by the UI', () => {
  it('Mode C order and overall scores match the analysis', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    await cardOf('김민서');
    const v = validateModeCInput(C_INPUT);
    if (!v.ok) throw new Error('invalid');
    const expected = analyzeModeCNames(v.value).results;
    const headings = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(headings.filter(h => expected.some(r => r.name.full === h))).toEqual(expected.map(r => r.name.full));
    for (const r of expected) {
      const card = await cardOf(r.name.full);
      expect(card.textContent).toContain(String(r.scores.overall));
    }
  }, 60000);
});
