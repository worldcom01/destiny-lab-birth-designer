// Shared modal manager for HanjaPicker (R3.1 UX audit U1/U2/U5).
//
// One document-level keyboard/focus handler serves every open dialog; only the
// topmost dialog receives keys. While any dialog is open:
//  - every other child of <body> (the app root and lower dialogs) is `inert`,
//    so background controls can be neither focused nor clicked;
//  - Tab / Shift+Tab wrap inside the topmost dialog, and focus that escapes is
//    brought back;
//  - Escape closes the topmost dialog only;
//  - page scrolling is locked.
// Releasing a dialog (close, confirm or unmount) restores exactly what was
// changed and returns focus to the dialog's trigger when it still exists and is
// interactive; otherwise to the next dialog, or it is left on the page body.

interface ModalEntry {
  /** The portal root (a direct child of <body>). */
  overlay: HTMLElement;
  /** The element with role="dialog". */
  dialog: HTMLElement;
  onEscape: () => void;
  returnFocus: HTMLElement | null;
}

const stack: ModalEntry[] = [];
let inerted: Element[] = [];
// Inline overflow of <body> before the lock: value and priority of the shorthand
// and of both longhands (N2), so `overflow: scroll !important` or a lone
// `overflow-x` come back exactly. null while unlocked.
type SavedProp = { value: string; priority: string };
let savedOverflow: Record<'overflow' | 'overflow-x' | 'overflow-y', SavedProp> | null = null;

function lockScroll() {
  if (savedOverflow) return;
  const st = document.body.style;
  const snap = (p: string): SavedProp => ({ value: st.getPropertyValue(p), priority: st.getPropertyPriority(p) });
  savedOverflow = { overflow: snap('overflow'), 'overflow-x': snap('overflow-x'), 'overflow-y': snap('overflow-y') };
  // important: the lock must also win over an author `!important` inline value.
  st.setProperty('overflow', 'hidden', 'important');
}

function unlockScroll() {
  if (!savedOverflow) return;
  const st = document.body.style;
  const saved = savedOverflow;
  savedOverflow = null;
  st.removeProperty('overflow'); // clears both longhands; nothing else is touched
  if (saved.overflow.value) {
    st.setProperty('overflow', saved.overflow.value, saved.overflow.priority);
  } else {
    for (const p of ['overflow-x', 'overflow-y'] as const) {
      if (saved[p].value) st.setProperty(p, saved[p].value, saved[p].priority);
    }
  }
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const top = () => stack[stack.length - 1];
const focusablesIn = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));

export function isModalOpen(): boolean {
  return stack.length > 0;
}

function applyBackground() {
  for (const el of inerted) el.removeAttribute('inert');
  inerted = [];
  const t = top();
  if (!t) { unlockScroll(); return; }
  lockScroll(); // once per lock cycle; nested dialogs keep it until the last one closes
  for (const el of Array.from(document.body.children)) {
    // Elements made inert by someone else are left alone (and never un-inerted by us).
    if (el === t.overlay || el.hasAttribute('inert') || el.tagName === 'SCRIPT') continue;
    el.setAttribute('inert', '');
    inerted.push(el);
  }
}

function onKeyDown(e: KeyboardEvent) {
  const t = top();
  if (!t) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    t.onEscape();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusablesIn(t.dialog);
  const active = document.activeElement;
  if (items.length === 0) { e.preventDefault(); t.dialog.focus(); return; }
  const first = items[0], last = items[items.length - 1];
  if (!active || !t.dialog.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && (active === first || active === t.dialog)) { e.preventDefault(); last.focus(); return; }
  if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

function onFocusIn(e: FocusEvent) {
  const t = top();
  // focusin targets are always elements; no reliance on the global Node constructor.
  const target = e.target as Element | null;
  if (t && target && !t.overlay.contains(target)) t.dialog.focus();
}

/**
 * Registers an open dialog as the topmost one and moves focus into it.
 * Returns the release function (idempotent) to call when it closes or unmounts.
 */
export function openModal(entry: ModalEntry): () => void {
  if (stack.length === 0) {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn, true);
  }
  stack.push(entry);
  applyBackground();
  entry.dialog.focus();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = stack.indexOf(entry);
    const wasTop = i === stack.length - 1;
    if (i >= 0) stack.splice(i, 1);
    applyBackground();
    if (stack.length === 0) {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
    }
    if (!wasTop) return; // a lower dialog closing never moves focus
    const next = top();
    const target = entry.returnFocus;
    if (target && target.isConnected && !target.closest('[inert]') && (!next || next.overlay.contains(target))) {
      target.focus();
    } else if (next) {
      next.dialog.focus();
    } else if (document.activeElement instanceof HTMLElement && entry.overlay.contains(document.activeElement)) {
      document.activeElement.blur(); // safe fallback: the page body
    }
  };
}
