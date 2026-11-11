// @vitest-environment jsdom
// R4.1 Phase D on the real Mode B / Mode C result pages: a stored R3.2 selection is shown
// as exactly the stored character after reloads, even when the app's option table does not
// list it (it is never dropped, replaced or remapped), and the stored document is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { ModeBInput, ModeCInput } from '@/types';
import { HANJA_SELECTION_KEYS, analysisScope } from '@/lib/hanjaModel';
import { validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { runModeBAnalysis } from '@/lib/analysis';
import { overrideHanjaBackend } from '@/lib/hanjaPersistence';
import { MemoryHanjaBackend } from '@/test-utils/memoryHanjaBackend';
import { committedNames } from '@/test-utils/hanjaTestBackend';
import { HANJA_DB, getHanjaOptions } from '@/data/hanjaDB';
import { getHanjaDictionary } from '@/lib/hanjaDictionary';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/components/PDFButton', () => ({ default: () => null }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '이준'] };

let be: MemoryHanjaBackend;
beforeEach(() => { localStorage.clear(); be = new MemoryHanjaBackend(); overrideHanjaBackend(be); });
afterEach(() => { cleanup(); overrideHanjaBackend(null); });

const status = () => screen.queryByTestId('hanja-persistence-status')?.getAttribute('data-status') ?? 'idle';
const cardOf = (name: string) => screen.getByRole('heading', { name }).closest('div.bg-white') as HTMLElement;
const quick = (c: HTMLElement, syl: string) => within(within(c).getByTestId('hanja-quick-select')).getByRole('button', { name: new RegExp(`^'${syl}' 한자 선택`) });

/** A real Hanja with this Korean reading (dictionary evidence) that the app does NOT offer for it. */
function notOffered(syl: string): string {
  const offered = new Set(Object.values(HANJA_DB).flat().map(o => o.hanja)); // unknown to the app's table
  const c = getHanjaDictionary().byReading(syl).find(x => !offered.has(x.char) && x.char.normalize('NFC') === x.char && x.evidence.some(e => e.source === 'unihan'));
  if (!c) throw new Error(`no candidate for ${syl}`);
  return c.char;
}

describe.each(['B', 'C'] as const)('Mode %s: stored selections outside the app option table', mode => {
  it('a stored character with a verified incompatible reading is not shown there; nothing is rewritten', async () => {
    const key = mode === 'B' ? HANJA_SELECTION_KEYS.modeB : HANJA_SELECTION_KEYS.modeC;
    const v = mode === 'B' ? validateModeBInput(B_INPUT) : validateModeCInput(C_INPUT);
    if (!v.ok) throw new Error('invalid input');
    const scope = analysisScope(v.value);
    const fullName = mode === 'B' ? runModeBAnalysis(v.value as ModeBInput)[0].name.full : '김민서';
    const syl = Array.from(fullName)[1];
    const wrong = getHanjaOptions('준').find(o => !getHanjaOptions(syl).some(x => x.hanja === o.hanja))!.hanja; // listed only under 준
    localStorage.setItem(key, JSON.stringify({ version: 2, scopes: { [scope]: { updatedAt: 1, names: { [fullName]: [wrong] } } } }));
    localStorage.setItem(mode === 'B' ? 'dlbd_mode_b' : 'dlbd_mode_c', JSON.stringify(mode === 'B' ? B_INPUT : C_INPUT));
    render(mode === 'B' ? <ModeBResults /> : <ModeCResults />);
    await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
    await waitFor(() => expect(status()).toBe('idle'));
    const button = quick(cardOf(fullName), syl);
    expect(button.textContent).not.toContain(wrong);
    expect(button.getAttribute('data-quick-status')).not.toBe('confirmed');
    expect(committedNames(be, key, scope)).toEqual({ [fullName]: [wrong] }); // kept in storage, untouched
  }, 60000);

  it('are shown as the exact stored character after repeated reloads; the stored document never changes', async () => {
    const key = mode === 'B' ? HANJA_SELECTION_KEYS.modeB : HANJA_SELECTION_KEYS.modeC;
    const v = mode === 'B' ? validateModeBInput(B_INPUT) : validateModeCInput(C_INPUT);
    if (!v.ok) throw new Error('invalid input');
    const scope = analysisScope(v.value);
    const fullName = mode === 'B' ? runModeBAnalysis(v.value as ModeBInput)[0].name.full : '김민서';
    const syl = Array.from(fullName)[1];
    const stored = notOffered(syl);
    expect(getHanjaOptions(syl).some(o => o.hanja === stored)).toBe(false);
    // an older (R3.2 / legacy v2) record: imported into IndexedDB unchanged
    localStorage.setItem(key, JSON.stringify({ version: 2, scopes: { [scope]: { updatedAt: 1, names: { [fullName]: [stored] } } } }));
    localStorage.setItem(mode === 'B' ? 'dlbd_mode_b' : 'dlbd_mode_c', JSON.stringify(mode === 'B' ? B_INPUT : C_INPUT));
    const legacyText = localStorage.getItem(key);
    let docText: string | undefined;
    for (let reload = 0; reload < 3; reload++) {
      const { unmount } = render(mode === 'B' ? <ModeBResults /> : <ModeCResults />);
      await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
      await waitFor(() => expect(status()).toBe('idle'));
      const button = quick(cardOf(fullName), syl);
      expect(button.textContent).toContain(stored);
      expect(button.getAttribute('data-quick-status')).toBe('confirmed');
      // preserved, but never presented as a verified reading
      expect(button.getAttribute('aria-label')).toBe(`'${syl}' 한자 선택 (현재: ${stored} 확정·음 미확인)`);
      expect(committedNames(be, key, scope)).toEqual({ [fullName]: [stored] });
      if (reload === 0) docText = be.documents.get(key);
      expect(be.documents.get(key)).toBe(docText); // the R3.2 document is never rewritten
      unmount();
    }
    expect(localStorage.getItem(key)).toBe(legacyText); // legacy record untouched
  }, 60000);
});
