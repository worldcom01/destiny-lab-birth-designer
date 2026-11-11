// @vitest-environment jsdom
// R3.2: Mode B/C page states of the IndexedDB persistence (in-memory backend in
// jsdom). Logic/UI tests only — cross-tab safety is proven in real Chrome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnalysisResult, ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { TxBody, overrideHanjaBackend } from '@/lib/hanjaPersistence';
import { MemoryHanjaBackend } from '@/test-utils/memoryHanjaBackend';
import { hanjaIdbMarkerKey, parseDocument } from '@/lib/hanjaPersistenceCore';
import { committedNames } from '@/test-utils/hanjaTestBackend';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const pdfResults: AnalysisResult[][] = [];
vi.mock('@/components/PDFButton', () => ({ default: (p: { results: AnalysisResult[] }) => { pdfResults.push(p.results); return null; } }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const KEY_B = HANJA_SELECTION_KEYS.modeB, KEY_C = HANJA_SELECTION_KEYS.modeC;
const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '이준'] };
const scopeB = () => { const v = validateModeBInput(B_INPUT); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };
const scopeC = () => { const v = validateModeCInput(C_INPUT); if (!v.ok) throw new Error('invalid'); return analysisScope(v.value); };

/** Memory backend whose transactions can be held until released (to observe pending states). */
class GatedBackend extends MemoryHanjaBackend {
  gate: Promise<void> | null = null;
  private open: (() => void) | null = null;
  hold() { this.gate = new Promise(r => { this.open = r; }); }
  release() { this.open?.(); this.gate = null; }
  override async transact<T>(key: string, mode: 'readonly' | 'readwrite', body: TxBody<T>) {
    if (this.gate) await this.gate;
    return super.transact(key, mode, body);
  }
}
let be: GatedBackend;
beforeEach(() => { localStorage.clear(); push.mockClear(); pdfResults.length = 0; be = new GatedBackend(); overrideHanjaBackend(be); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); overrideHanjaBackend(null); });

const status = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const card = async (name = '김민서') => (await screen.findByRole('heading', { name }, { timeout: 15000 })).closest('div.bg-white') as HTMLElement;
const quick = (c: HTMLElement, syl: string) => within(within(c).getByTestId('hanja-quick-select')).getByRole('button', { name: new RegExp(`^'${syl}' 한자 선택`) });
const option = (hanja: string) => within(screen.getByRole('dialog')).getAllByRole('button').find(b => b.textContent?.trim().startsWith(hanja))!;

describe('initialising and saving states', () => {
  it('before ready: accessible loading status, controls aria-disabled, nothing presented as confirmed; then ready', async () => {
    be.hold();
    localStorage.setItem(KEY_C, JSON.stringify({ version: 2, scopes: { [scopeC()]: { updatedAt: 1, names: { 김민서: [null, '書'] } } } }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    const s = screen.getByTestId('hanja-persistence-status');
    expect(s.getAttribute('data-status')).toBe('initializing');
    expect(s.getAttribute('aria-busy')).toBe('true');
    expect(quick(c, '서').getAttribute('aria-disabled')).toBe('true');
    expect(quick(c, '서').textContent).not.toContain('書'); // the stored record is not shown before the import completed
    fireEvent.click(quick(c, '서'));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => be.release());
    await waitFor(() => expect(status()).toBe('idle'));
    expect(quick(c, '서').getAttribute('aria-disabled')).toBeNull();
    expect(quick(c, '서').textContent).toContain('書');
  }, 60000);

  it('while saving: one save at a time, prior confirmed display kept, focus returns to the trigger after success', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('idle'));
    const commits = be.commits;
    const trigger = quick(c, '민');
    trigger.focus();
    be.hold();
    fireEvent.click(trigger);
    fireEvent.click(option('敏'));
    await waitFor(() => expect(status()).toBe('saving'));
    expect(document.activeElement).toBe(trigger); // focus returned although the save is pending
    expect(quick(c, '민').getAttribute('aria-disabled')).toBe('true');
    expect(quick(c, '민').textContent).not.toContain('敏'); // not confirmed before completion
    fireEvent.click(quick(c, '서')); // a second save cannot start
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => be.release());
    await waitFor(() => expect(status()).toBe('idle'));
    expect(be.commits - commits).toBe(1);
    expect(quick(c, '민').textContent).toContain('敏');
    expect(document.activeElement).toBe(quick(c, '민'));
  }, 60000);

  it('StrictMode: the double effect run imports once and never claims a second outcome', async () => {
    localStorage.setItem(KEY_C, JSON.stringify({ version: 2, scopes: {} }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<StrictMode><ModeCResults /></StrictMode>);
    await card();
    await waitFor(() => expect(status()).toBe('idle'));
    expect(be.commits).toBe(1);
  }, 60000);
});

describe('canonical snapshot consistency', () => {
  it('quick selection, detailed analysis and the PDF input show the same committed state', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('idle'));
    fireEvent.click(quick(c, '서'));
    fireEvent.click(option('書'));
    await screen.findByTestId('hanja-save-status');
    expect(committedNames(be, KEY_B, scopeB())).toEqual({ 김민서: [null, '書'] });
    fireEvent.click(within(c).getByRole('button', { name: /세부 분석 보기/ }));
    fireEvent.click(within(c).getByRole('button', { name: /한자 분석/ }));
    expect(c.querySelectorAll<HTMLElement>('[data-hanja-status]')[2].dataset.hanjaChar).toBe('書');
    expect(quick(c, '서').textContent).toContain('書');
    const pdf = pdfResults[pdfResults.length - 1].find(r => r.name.full === '김민서')!;
    expect(pdf.name.hanja.given[1]).toMatchObject({ hanja: '書', status: 'confirmed' });
  }, 60000);
});

describe('conflicts and unknown outcomes', () => {
  it('another tab changed the same syllable: typed conflict naming name, syllable and both values; refreshed snapshot', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('idle'));
    // "another tab" commits 珉 at 김민서#0 after this page loaded its snapshot
    const doc = JSON.parse(be.documents.get(KEY_C)!);
    const meta = structuredClone(be.metadata.get(KEY_C)!);
    doc.scopes[scopeC()] = { updatedAt: 2, names: { 김민서: ['珉'] } };
    meta.scopes[scopeC()] = { incarnation: meta.nextIncarnation, order: meta.seq + 1, positions: { '김민서#0': 1 } };
    meta.nextIncarnation += 1; meta.seq += 1; meta.revision += 1;
    be.documents.set(KEY_C, JSON.stringify(doc)); be.metadata.set(KEY_C, meta);
    fireEvent.click(quick(c, '민'));
    fireEvent.click(option('敏'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("김민서의 1번째 이름 글자('민')는 다른 탭에서 이미 珉(으)로 저장돼 있어, 이번에 고른 敏을(를) 저장하지 않았습니다");
    expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['珉'] }); // nothing overwritten
    await waitFor(() => expect(quick(c, '민').textContent).toContain('珉')); // canonical snapshot refreshed
    expect(status()).toBe('idle'); // conflict blocks nothing: no blocking notice, saving allowed again
    expect(quick(c, '민').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(quick(c, '민'));
    fireEvent.click(option('敏')); // the user deliberately reselects with the refreshed token
    await waitFor(() => expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['敏'] }));
  }, 60000);

  it('unknown outcome: never shown as saved; "저장 결과 다시 확인" loads the committed state', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('idle'));
    be.failNext = 'unknown-commit'; // committed, but completion was not observed
    fireEvent.click(quick(c, '민'));
    fireEvent.click(option('敏'));
    await waitFor(() => expect(status()).toBe('unknown-outcome'));
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    expect(quick(c, '민').textContent).not.toContain('敏');
    expect(quick(c, '민').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '저장 결과 다시 확인' }));
    await waitFor(() => expect(status()).toBe('idle'));
    expect(quick(c, '민').textContent).toContain('敏');
  }, 60000);
});

describe('database lifecycle', () => {
  it('a missing database with a marker requires explicit re-import (read-only until confirmed)', async () => {
    localStorage.setItem(KEY_C, JSON.stringify({ version: 2, scopes: { [scopeC()]: { updatedAt: 1, names: { 김민서: ['敏'] } } } }));
    localStorage.setItem(hanjaIdbMarkerKey(KEY_C), 'old-generation');
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('reimport-confirm'));
    expect(be.documents.size).toBe(0);
    expect(quick(c, '민').getAttribute('aria-disabled')).toBe('true');
    expect(quick(c, '민').textContent).toContain('敏'); // legacy shown read-only
    fireEvent.click(screen.getByRole('button', { name: '이전 기록에서 다시 불러오기' }));
    await waitFor(() => expect(status()).toBe('idle'));
    expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['敏'] });
  }, 60000);

  it('version change from another tab: saving stops with an explanation', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('idle'));
    act(() => be.emit('blocked-upgrade'));
    expect(status()).toBe('blocked-upgrade');
    expect(screen.getByTestId('hanja-persistence-status').textContent).toContain('다른 탭');
    expect(quick(c, '민').getAttribute('aria-disabled')).toBe('true');
  }, 60000);
});

describe('old-version tabs (legacy changes after migration)', () => {
  it('a storage event lists differing values; adoption is a conditional save; dismissal is remembered; never merged automatically', async () => {
    localStorage.setItem(KEY_C, JSON.stringify({ version: 2, scopes: {} }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    await card();
    await waitFor(() => expect(status()).toBe('idle'));
    const legacy = JSON.stringify({ version: 2, scopes: { [scopeC()]: { updatedAt: 9e12, names: { 김민서: ['珉', null], 이준: ['俊'] } } } });
    localStorage.setItem(KEY_C, legacy);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY_C })); });
    const panel = await screen.findByTestId('hanja-external-changes');
    expect(panel.textContent).toContain('자동으로 합치지 않았습니다');
    expect(panel.textContent).toContain('새로고침');
    expect(parseDocument(be.documents.get(KEY_C))!.scopes[scopeC()]).toBeUndefined(); // nothing merged
    fireEvent.click(within(panel).getByRole('button', { name: '珉(으)로 바꾸기' }));
    await waitFor(() => expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['珉'] }));
    const after = await screen.findByTestId('hanja-external-changes');
    expect(after.textContent).not.toContain('珉(으)로 바꾸기');
    fireEvent.click(within(after).getByRole('button', { name: /현재 저장 기록 유지/ }));
    await waitFor(() => expect(screen.queryByTestId('hanja-external-changes')).toBeNull());
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY_C })); });
    await act(async () => { await new Promise(r => setTimeout(r, 400)); }); // past the 250 ms check debounce
    expect(screen.queryByTestId('hanja-external-changes')).toBeNull(); // dismissed digest stays quiet (this scope)
    expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['珉'] }); // 이준 was never merged
    expect(localStorage.getItem(KEY_C)).toBe(legacy);
  }, 60000);
});

describe('audit F2: adopting a legacy value reports every outcome like a normal selection', () => {
  async function withCandidate() {
    localStorage.setItem(KEY_C, JSON.stringify({ version: 2, scopes: {} }));
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const c = await card();
    await waitFor(() => expect(status()).toBe('idle'));
    localStorage.setItem(KEY_C, JSON.stringify({ version: 2, scopes: { [scopeC()]: { updatedAt: 9e12, names: { 김민서: ['珉', null] } } } }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY_C })); });
    const panel = await screen.findByTestId('hanja-external-changes');
    return { c, adopt: () => fireEvent.click(within(panel).getByRole('button', { name: '珉(으)로 바꾸기' })) };
  }
  /** "another tab" commits 旼 at 김민서#0 after this page loaded its snapshot */
  function otherTabCommits() {
    const doc = JSON.parse(be.documents.get(KEY_C)!);
    const meta = structuredClone(be.metadata.get(KEY_C)!);
    doc.scopes[scopeC()] = { updatedAt: 2, names: { 김민서: ['旼'] } };
    meta.scopes[scopeC()] = { incarnation: meta.nextIncarnation, order: meta.seq + 1, positions: { '김민서#0': 1 } };
    meta.nextIncarnation += 1; meta.seq += 1; meta.revision += 1;
    be.documents.set(KEY_C, JSON.stringify(doc)); be.metadata.set(KEY_C, meta);
  }

  it('success: named success status and card feedback', async () => {
    const { c, adopt } = await withCandidate();
    adopt();
    expect((await screen.findByTestId('hanja-save-status')).textContent).toContain('김민서');
    expect(within(c).getByTestId('hanja-card-feedback').dataset.state).toBe('ok');
    expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['珉'] });
  }, 60000);

  it('conflict: alert names the name, syllable, current and requested values; nothing overwritten', async () => {
    const { c, adopt } = await withCandidate();
    otherTabCommits();
    adopt();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("김민서의 1번째 이름 글자('민')는 다른 탭에서 이미 旼(으)로 저장돼 있어, 이번에 고른 珉을(를) 저장하지 않았습니다");
    expect(within(c).getByTestId('hanja-card-feedback').dataset.state).toBe('error');
    expect(committedNames(be, KEY_C, scopeC())).toEqual({ 김민서: ['旼'] });
  }, 60000);

  it('quota: the storage-space cause is shown; nothing committed', async () => {
    const { adopt } = await withCandidate();
    const before = be.documents.get(KEY_C);
    be.failNext = 'quota';
    adopt();
    expect((await screen.findByRole('alert')).textContent).toContain('브라우저 저장 공간이 부족합니다');
    expect(be.documents.get(KEY_C)).toBe(before);
  }, 60000);

  it('unknown outcome: reported as unknown (never as saved) with the re-check action', async () => {
    const { adopt } = await withCandidate();
    be.failNext = 'unknown-commit';
    adopt();
    expect((await screen.findByRole('alert')).textContent).toContain('저장됐는지 확인하지 못했습니다');
    expect(screen.queryByTestId('hanja-save-status')).toBeNull();
    expect(screen.getByRole('button', { name: '저장 결과 다시 확인' })).toBeTruthy();
  }, 60000);
});
