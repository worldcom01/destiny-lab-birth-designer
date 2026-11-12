// @vitest-environment jsdom
// R4 G2 mobile result clipping: iOS Safari zooms the page when a form field with text smaller
// than 16px is focused, and the zoom is kept across the client-side navigation to the result
// page, which then looks clipped until the user zooms out. Every text-entry field on the input
// pages and the result pages must therefore render at 16px or more below the `sm` breakpoint.
// The result pages must also not contain fixed widths wider than a 320px screen.
// jsdom has no layout engine: these tests pin the class contracts; geometry is checked in a
// real browser separately.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ModeBInput, ModeCInput } from '@/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/components/PDFButton', () => ({ default: () => null }));
const { overrideHanjaBackend } = await import('@/lib/hanjaPersistence');
const { MemoryHanjaBackend } = await import('@/test-utils/memoryHanjaBackend');
const ModeAPage = (await import('@/app/mode-a/page')).default;
const ModeBPage = (await import('@/app/mode-b/page')).default;
const ModeCPage = (await import('@/app/mode-c/page')).default;
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const B_INPUT: ModeBInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'] };
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김정훈', '김현서'] };

beforeEach(() => { localStorage.clear(); overrideHanjaBackend(new MemoryHanjaBackend()); });
afterEach(() => { cleanup(); overrideHanjaBackend(null); });

const NON_TEXT = new Set(['checkbox', 'radio', 'hidden', 'button', 'submit', 'reset', 'range', 'color', 'file']);
/** Unprefixed (mobile) font-size classes of each text-entry field that are below 16px. */
function smallFields(root: ParentNode = document) {
  const fields = [...root.querySelectorAll<HTMLElement>('input, select, textarea')].filter(e => !(e instanceof HTMLInputElement && NON_TEXT.has(e.type)));
  expect(fields.length).toBeGreaterThan(0);
  return fields.flatMap(e => {
    const base = (e.getAttribute('class') ?? '').split(/\s+/).filter(c => /^text-(xs|sm|\[\d+(\.\d+)?px\])$/.test(c));
    const hasSize = (e.getAttribute('class') ?? '').split(/\s+/).some(c => /^text-(xs|sm|base|lg|[2-9]?xl|\[[^\]]+\])$/.test(c));
    // a field without any size class inherits the page font size; flag it as well
    return base.length || !hasSize ? [`${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? e.id}] ${base.join(' ') || '(no size class)'}`] : [];
  });
}
/** Unprefixed fixed widths or min-widths wider than a 320px screen. */
function wideFixedWidths(root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>('[class]')].flatMap(e => (e.getAttribute('class') ?? '').split(/\s+/).filter(c => {
    const m = /^(?:min-)?w-(?:\[(\d+)px\]|(\d+))$/.exec(c);
    return m ? (m[1] ? Number(m[1]) : Number(m[2]) * 4) > 320 : false;
  }));
}

describe('input pages: no field triggers the iOS focus zoom', () => {
  it.each([['A', ModeAPage], ['B', ModeBPage], ['C', ModeCPage]] as const)('Mode %s', (_m, Page) => {
    render(<Page />);
    expect(smallFields()).toEqual([]);
  });
});

describe.each([['B', ModeBResults, 'dlbd_mode_b', B_INPUT], ['C', ModeCResults, 'dlbd_mode_c', C_INPUT]] as const)('Mode %s result page', (_m, Results, key, input) => {
  it('has no fixed width wider than 320px, and every field (including the Hanja search) avoids the iOS focus zoom', async () => {
    localStorage.setItem(key, JSON.stringify(input));
    render(<Results />);
    await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
    expect(wideFixedWidths()).toEqual([]);
    // fields only exist inside the picker on result pages: open it, then check
    const trigger = await waitFor(() => {
      const t = document.querySelector<HTMLButtonElement>('[data-hanja-quick]:not([aria-disabled="true"])');
      expect(t).not.toBeNull();
      return t!;
    }, { timeout: 15000 });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('searchbox', { name: '한자 검색' })).toBeTruthy();
    expect(smallFields()).toEqual([]);
    expect(wideFixedWidths()).toEqual([]);
  }, 60000);

  it('opening the picker (legacy list or zero-legacy search entry) does not focus the search field', async () => {
    localStorage.setItem(key, JSON.stringify(input));
    render(<Results />);
    await screen.findAllByTestId('hanja-quick-select', {}, { timeout: 15000 });
    for (const sel of ['[data-hanja-quick]', '[data-hanja-search]']) {
      const trigger = await waitFor(() => {
        const t = document.querySelector<HTMLButtonElement>(`${sel}:not([aria-disabled="true"])`);
        expect(t).not.toBeNull();
        return t!;
      }, { timeout: 15000 });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = await screen.findByRole('dialog');
      // focus goes to the dialog itself: a programmatic focus on the field would open the
      // mobile keyboard (and, below 16px, zoom the page) without the user tapping the field
      expect(document.activeElement).toBe(dialog);
      expect(document.activeElement).not.toBe(within(dialog).getByRole('searchbox', { name: '한자 검색' }));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger); // focus restoration
    }
  }, 60000);
});
