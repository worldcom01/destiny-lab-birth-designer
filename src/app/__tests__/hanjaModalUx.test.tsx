// @vitest-environment jsdom
// R3.1 UX audit fixes U1-U5: one coherent modal for every HanjaPicker consumer
// (focus containment, inert background, topmost-only Escape, focus return),
// accurate candidate/assignment wording, and save feedback at the card.
// jsdom has no native Tab movement and does not enforce `inert`; these tests
// assert the mechanism (Tab handling, inert attributes, guards). Real keyboard
// behaviour is checked separately in a browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModeBInput, ModeCInput } from '@/types';
import { runModeBAnalysis, analyzeModeCNames } from '@/lib/analysis';
import { HanjaOption, getHanjaOptions } from '@/data/hanjaDB';
import HanjaPicker from '@/components/HanjaPicker';
import HanjaQuickSelect, { NO_HANJA_CANDIDATES } from '@/components/HanjaQuickSelect';
import { HanjaInputRow } from '@/components/HanjaInputRow';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
const ModeBResults = (await import('@/app/mode-b/results/page')).default;
const ModeCResults = (await import('@/app/mode-c/results/page')).default;

const B_INPUT: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'],
};
const C_INPUT: ModeCInput = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서', '강시우', '김정훈'] };

async function cardOf(name: string) {
  return (await screen.findByRole('heading', { name }, { timeout: 15000 })).closest('div.bg-white') as HTMLElement;
}
const quickButton = (card: HTMLElement, syllable: string) =>
  within(within(card).getByTestId('hanja-quick-select')).getByRole('button', { name: new RegExp(`^'${syllable}' 한자 선택`) });
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => { localStorage.clear(); push.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ''; });

describe('U1: the active dialog contains focus and the background is inert', () => {
  it('Tab / Shift+Tab wrap inside the dialog; background is inert and scroll-locked; all restored on close', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    const trigger = quickButton(await cardOf('김민서'), '민');
    const other = quickButton(await cardOf('강시우'), '우');
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button')];
    const first = focusables[0], last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    // background: every control outside the dialog is inside an inert subtree
    expect(other.closest('[inert]')).not.toBeNull();
    expect(trigger.closest('[inert]')).not.toBeNull();
    expect(dialog.closest('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(quickButton(await cardOf('김민서'), '민'));
  }, 60000);

  it('focus that lands outside the dialog is brought back into it', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    fireEvent.click(quickButton(await cardOf('김민서'), '민'));
    const dialog = screen.getByRole('dialog');
    const outside = quickButton(await cardOf('강시우'), '우');
    outside.focus(); // jsdom ignores inert; simulate focus escaping
    fireEvent.keyDown(outside, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  }, 60000);
});

describe('U2: one active picker; Escape closes only the topmost dialog', () => {
  it('a second card cannot open a competing picker while one is open', async () => {
    localStorage.setItem('dlbd_mode_c', JSON.stringify(C_INPUT));
    render(<ModeCResults />);
    fireEvent.click(quickButton(await cardOf('김민서'), '민'));
    fireEvent.click(quickButton(await cardOf('강시우'), '우')); // background activation attempt
    fireEvent.click(quickButton(await cardOf('김민서'), '서')); // same card, other syllable
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe("'민' 한자 선택");
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  }, 60000);

  it('with two stacked pickers, one Escape closes only the top one', () => {
    const closeA = vi.fn(), closeB = vi.fn();
    const { rerender } = render(<HanjaPicker hangul="민" onSelect={() => {}} onClose={closeA} />);
    rerender(<>
      <HanjaPicker hangul="민" onSelect={() => {}} onClose={closeA} />
      <HanjaPicker hangul="서" onSelect={() => {}} onClose={closeB} />
    </>);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    // only the top dialog is outside an inert subtree
    const [a, b] = screen.getAllByRole('dialog');
    expect(a.closest('[inert]')).not.toBeNull();
    expect(b.closest('[inert]')).toBeNull();
  });

  it('unmounting (e.g. route change) leaves no inert attribute, scroll lock or key handler behind', () => {
    const close = vi.fn();
    const { unmount } = render(<HanjaPicker hangul="민" onSelect={() => {}} onClose={close} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });
});

describe('U3: candidate availability is not confused with the assigned Hanja', () => {
  const gisi = runModeBAnalysis(B_INPUT).find(r => r.name.full === '김기시')!;
  it('dataset facts: 김기시 has no candidates but carries the suggested 基時', () => {
    expect(gisi.name.hanja.given.map(c => [c.hanja, c.status])).toEqual([['基', 'suggested'], ['時', 'suggested']]);
    for (const c of gisi.name.hanja.given) expect(getHanjaOptions(c.hangul)).toHaveLength(0);
  });

  it('김기시 shows 基 / 時 as 추천 and never claims they are unassigned', () => {
    render(<HanjaQuickSelect model={gisi.name.hanja} onOpen={() => {}} />);
    const section = screen.getByTestId('hanja-quick-select');
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    for (const [syl, hanja] of [['기', '基'], ['시', '時']]) {
      const item = section.querySelector(`[data-hanja-quick-unavailable][data-syllable="${syl}"]`)!;
      expect(item.textContent).toContain(hanja);
      expect(item.textContent).toContain('추천');
      expect(item.textContent).toContain(NO_HANJA_CANDIDATES);
    }
    const note = within(section).getByTestId('hanja-quick-none').textContent!;
    expect(note).not.toContain('미지정');
    expect(note).toContain('추천');
  });

  it('김정훈 (no candidates, nothing assigned) explains the limitation and states it is unassigned', () => {
    const [jh] = analyzeModeCNames({ ...C_INPUT, names: ['김정훈'] }).results;
    render(<HanjaQuickSelect model={jh.name.hanja} onOpen={() => {}} />);
    const note = screen.getByTestId('hanja-quick-none').textContent!;
    expect(note).toContain('현재 제공되는 한자 후보가 없어');
    expect(note).toContain('미지정');
  });
});

describe('U4: save feedback is shown at the card that was edited', () => {
  it('a failure on a low-ranked Mode B card is reported in that card, named, linked to its controls, and replaced on retry', async () => {
    localStorage.setItem('dlbd_mode_b', JSON.stringify(B_INPUT));
    render(<ModeBResults />);
    await cardOf('김민서');
    const cards = [...document.querySelectorAll<HTMLElement>('div.bg-white')].filter(c => c.querySelector('[data-hanja-quick]'));
    const card = cards[cards.length - 1]; // lowest visible card with a selectable syllable
    const name = card.querySelector('h3')!.textContent!;
    const btn = card.querySelector<HTMLElement>('[data-hanja-quick]')!;
    const before = btn.textContent;
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    fireEvent.click(btn);
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button').find(b => /^[一-鿿]/.test(b.textContent!.trim()))!);
    const local = within(card).getByTestId('hanja-card-feedback');
    expect(local.textContent).toContain(name);
    expect(local.textContent).toContain('저장하지 못했습니다');
    expect(local.dataset.state).toBe('error');
    expect(card.querySelector<HTMLElement>('[data-hanja-quick]')!.textContent).toBe(before); // not shown as confirmed
    expect(btn.getAttribute('aria-describedby')).toBe(local.id);
    expect(scrolled).toContain(local); // brought into view where the user is working
    expect(screen.getByRole('alert').textContent).toContain(name); // page-level announcement agrees
    // other cards carry no feedback
    expect(cards.filter(c => c !== card).some(c => c.querySelector('[data-testid=hanja-card-feedback]'))).toBe(false);
    spy.mockRestore();
    fireEvent.click(card.querySelector<HTMLElement>('[data-hanja-quick]')!);
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button').find(b => /^[一-鿿]/.test(b.textContent!.trim()))!);
    const after = within(card).getByTestId('hanja-card-feedback');
    expect(after.dataset.state).toBe('ok');
    expect(Number(after.dataset.attempt)).toBe(Number(local.dataset.attempt) + 1); // a new attempt re-renders the message
    expect(after.textContent).toContain(name);
    expect(after.textContent).toContain('저장했습니다');
  }, 60000);
});

describe('U5: every HanjaPicker consumer gets focus back', () => {
  const Row = () => <HanjaInputRow label="돌림자 '민'" hangul="민" selected={null} onSelect={() => {}} onClear={() => {}} />;
  it('HanjaInputRow: Escape returns focus to its trigger', async () => {
    render(<Row />);
    const trigger = screen.getByRole('button', { name: /돌림자 '민'/ });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flush();
    expect(document.activeElement).toBe(trigger);
  });

  it('HanjaInputRow: a selection and the close button return focus to its trigger', async () => {
    render(<Row />);
    const trigger = screen.getByRole('button', { name: /돌림자 '민'/ });
    fireEvent.click(trigger); // pointer: the trigger may not have been focused (e.g. Safari)
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button').find(b => b.textContent!.trim().startsWith('敏'))!);
    await flush();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
    await flush();
    expect(document.activeElement).toBe(trigger);
  });

  it('a trigger that no longer exists falls back safely (no throw, focus on the page)', async () => {
    const close = vi.fn();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const { unmount } = render(<HanjaPicker hangul="민" onSelect={() => {}} onClose={close} returnFocusTo={trigger} />);
    trigger.remove();
    unmount();
    await flush();
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});

describe('N1: HanjaInputRow never nests interactive controls', () => {
  const MIN = getHanjaOptions('민').find(o => o.hanja === '敏')!;
  function StatefulRow({ onClear = () => {} }: { onClear?: () => void }) {
    const [sel, setSel] = useState<HanjaOption | null>(null);
    return <HanjaInputRow label="돌림자 '민'" hangul="민" selected={sel} onSelect={setSel} onClear={() => { onClear(); setSel(null); }} />;
  }

  it('unselected and selected states: no button inside a button, no React nesting warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, rerender } = render(<HanjaInputRow label="돌림자 '민'" hangul="민" selected={null} onSelect={() => {}} onClear={() => {}} />);
    expect(container.querySelectorAll('button button')).toHaveLength(0);
    rerender(<HanjaInputRow label="돌림자 '민'" hangul="민" selected={MIN} onSelect={() => {}} onClear={() => {}} />);
    expect(container.querySelectorAll('button button, button a, button input, button [tabindex]')).toHaveLength(0);
    expect(within(container).getByRole('button', { name: /돌림자 '민'/ })).toBeTruthy();
    expect(within(container).getByRole('button', { name: /초기화/ })).toBeTruthy();
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/cannot be a descendant of|cannot contain a nested|hydration/i);
  });

  it('select, then reset independently: reset never opens the picker; focus returns to the trigger', async () => {
    const cleared = vi.fn();
    render(<StatefulRow onClear={cleared} />);
    const trigger = () => screen.getByRole('button', { name: /돌림자 '민'/ });
    fireEvent.click(trigger());
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button').find(b => b.textContent!.trim().startsWith('敏'))!);
    await flush();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toContain('敏');
    const reset = screen.getByRole('button', { name: /초기화/ });
    expect(reset.closest('button')).toBe(reset); // not inside the trigger
    expect(trigger().contains(reset)).toBe(false);
    reset.focus();
    fireEvent.click(reset);
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger().textContent).not.toContain('敏');
  });
});

describe('N2: the scroll lock restores the exact original inline overflow', () => {
  const open = () => render(<HanjaPicker hangul="민" onSelect={() => {}} onClose={() => {}} />);
  afterEach(() => { document.body.removeAttribute('style'); });

  it('value and !important priority are restored; unrelated inline styles are kept', () => {
    document.body.style.setProperty('overflow', 'scroll', 'important');
    document.body.style.setProperty('padding-right', '9px');
    const { unmount } = open();
    expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
    expect(document.body.style.getPropertyValue('padding-right')).toBe('9px');
    unmount();
    expect(document.body.style.getPropertyValue('overflow')).toBe('scroll');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
    expect(document.body.style.getPropertyValue('padding-right')).toBe('9px');
    expect(document.body.style.getPropertyPriority('padding-right')).toBe('');
  });

  it('an absent original overflow stays absent; other styles untouched', () => {
    document.body.style.setProperty('color', 'red');
    const { unmount } = open();
    unmount();
    expect(document.body.style.getPropertyValue('overflow')).toBe('');
    expect(document.body.style.getPropertyValue('color')).toBe('red');
    expect(document.body.getAttribute('style')).toBe('color: red;');
  });

  it('nested dialogs keep the lock until the last one closes; repeated cycles restore every time', () => {
    document.body.style.setProperty('overflow', 'auto', 'important');
    for (let i = 0; i < 3; i++) {
      const a = render(<HanjaPicker hangul="민" onSelect={() => {}} onClose={() => {}} />);
      const b = render(<HanjaPicker hangul="서" onSelect={() => {}} onClose={() => {}} />);
      a.unmount(); // the lower dialog closes first
      expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');
      b.unmount();
      expect(document.body.style.getPropertyValue('overflow')).toBe('auto');
      expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
      expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    }
  });

  it('a lone overflow-x longhand (with its priority) is restored, not erased', () => {
    document.body.style.setProperty('overflow-x', 'hidden', 'important');
    const { unmount } = open();
    unmount();
    expect(document.body.style.getPropertyValue('overflow-x')).toBe('hidden');
    expect(document.body.style.getPropertyPriority('overflow-x')).toBe('important');
    expect(document.body.style.getPropertyValue('overflow-y')).toBe('');
  });

  it('a pre-existing inert element keeps its own value', () => {
    const keep = document.createElement('div');
    keep.setAttribute('inert', 'preserve');
    document.body.appendChild(keep);
    const { unmount } = open();
    unmount();
    expect(keep.getAttribute('inert')).toBe('preserve');
    keep.remove();
  });
});
