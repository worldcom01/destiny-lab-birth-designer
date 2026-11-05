import { GeneratedName, NameCharData, NameCharHanja, NameHanjaModel } from '@/types';
import { HanjaOption, findSurnameHanja, getHanjaOptions } from '@/data/hanjaDB';

// Canonical Hanja model helpers. Every consumer (analysis text, UI cards, PDF)
// reads Hanja from GeneratedName.hanja, never from HANJA_DB directly.

export const UNASSIGNED_MARK = '□';
export const UNASSIGNED_MEANING = '한자 미지정';

const HANJA_CHAR = /^[㐀-䶿一-鿿豈-﫿]$/u;

export function unassignedChar(hangul: string): NameCharHanja {
  return { hangul, hanja: null, status: 'unassigned', meaning: null, strokes: null, jaWonOhaeng: null, inDatabase: false };
}

function charFromOption(hangul: string, opt: HanjaOption, status: 'confirmed' | 'suggested'): NameCharHanja {
  return {
    hangul, hanja: opt.hanja, status, meaning: opt.meaning, strokes: opt.strokes,
    jaWonOhaeng: opt.jaWonOhaeng, inDatabase: true,
  };
}

/** Confirmed char for a user selection, or null when `hanja` is not an option for `hangul`. */
export function confirmedChar(hangul: string, hanja: string): NameCharHanja | null {
  const opt = getHanjaOptions(hangul).find(o => o.hanja === hanja);
  return opt ? charFromOption(hangul, opt, 'confirmed') : null;
}

/**
 * System suggestion taken from a syllable profile (nameChars). Meaning and strokes
 * come from the HANJA_DB record of exactly that hanja; when no record exists they
 * stay null instead of borrowing another character's data.
 */
export function suggestedCharFromProfile(profile: NameCharData): NameCharHanja {
  if (!HANJA_CHAR.test(profile.hanja)) return unassignedChar(profile.hangul);
  const opt = getHanjaOptions(profile.hangul).find(o => o.hanja === profile.hanja);
  if (opt) return charFromOption(profile.hangul, opt, 'suggested');
  return {
    hangul: profile.hangul, hanja: profile.hanja, status: 'suggested',
    meaning: profile.meaning || null, strokes: null, jaWonOhaeng: null, inDatabase: false,
  };
}

/**
 * Surname Hanja. Single-syllable surnames found in the surname table get its
 * representative hanja as a suggestion; other surnames (including compound
 * surnames) stay unassigned per syllable rather than being guessed.
 */
export function buildSurnameHanja(surname: string): NameCharHanja[] {
  const s = findSurnameHanja(surname);
  if (s) {
    return [{
      hangul: surname, hanja: s.hanja, status: 'suggested', meaning: s.meaning,
      strokes: s.strokes, jaWonOhaeng: s.jaWonOhaeng, inDatabase: true,
    }];
  }
  return Array.from(surname).map(unassignedChar);
}

/** Keeps a scoring profile's hanja/meaning mirrored to the canonical char. */
export function syncProfile(profile: NameCharData, c: NameCharHanja): NameCharData {
  return { ...profile, hanja: c.hanja ?? '?', meaning: c.meaning ?? '' };
}

const mark = (c: NameCharHanja) => c.hanja ?? UNASSIGNED_MARK;

export function formatGivenHanja(model: NameHanjaModel): string {
  return model.given.map(mark).join('');
}

export function formatFullHanja(model: NameHanjaModel): string {
  return [...model.surname, ...model.given].map(mark).join('');
}

export function givenMeanings(model: NameHanjaModel): string[] {
  return model.given.map(c => (c.hanja && c.meaning) ? c.meaning : UNASSIGNED_MEANING);
}

/** Sum of strokes, or null when any character's strokes are unknown. */
export function totalStrokes(chars: NameCharHanja[]): number | null {
  let sum = 0;
  for (const c of chars) {
    if (c.strokes == null) return null;
    sum += c.strokes;
  }
  return sum;
}

export function hanjaStatusLabel(model: NameHanjaModel): string {
  if (model.given.some(c => c.status === 'unassigned')) return '한자 미지정 포함';
  if (model.given.every(c => c.status === 'confirmed')) return '확정 한자';
  return '추천 한자';
}

export const STATUS_LABEL: Record<NameCharHanja['status'], string> = {
  confirmed: '확정', suggested: '추천', unassigned: '미지정',
};

// ─── User selections ─────────────────────────────────────────────────────────

/** Confirmed hanja per given-name index, keyed by full name. null = no selection. */
export type HanjaSelections = Record<string, (string | null)[]>;

/** Applies confirmed selections. Selections that are not valid options are ignored. */
export function applySelectionToName(name: GeneratedName, selection: (string | null)[] | undefined): GeneratedName {
  if (!selection) return name;
  let changed = false;
  const given = name.hanja.given.map((c, i) => {
    const h = selection[i];
    if (!h || (c.status === 'confirmed' && c.hanja === h)) return c;
    const next = confirmedChar(c.hangul, h);
    if (!next) return c;
    changed = true;
    return next;
  });
  if (!changed) return name;
  const char1 = syncProfile(name.char1, given[0]);
  const char2 = given.length > 1 ? syncProfile(name.char2, given[1]) : char1;
  return { ...name, char1, char2, hanja: { ...name.hanja, given } };
}

export function withSelection(
  selections: HanjaSelections, fullName: string, index: number, hanja: string,
): HanjaSelections {
  const current = [...(selections[fullName] ?? [])];
  while (current.length <= index) current.push(null);
  current[index] = hanja;
  return { ...selections, [fullName]: current };
}

// ─── Storage (localStorage) ──────────────────────────────────────────────────

// v2: selections are scoped to the analysis input they were made in, so a choice
// never leaks into a different analysis that happens to produce the same full
// name (e.g. a new run with a different confirmed generational Hanja).
export const HANJA_SELECTION_KEYS = {
  modeB: 'dlbd_mode_b_hanja_v2',
  modeC: 'dlbd_mode_c_hanja_v2',
} as const;

// v1 stored selections by full name only. They cannot be attributed to an
// analysis input, so they are never applied; they are left in place (not deleted).
export const LEGACY_HANJA_SELECTION_KEYS = {
  modeB: 'dlbd_mode_b_hanja',
  modeC: 'dlbd_mode_c_hanja',
} as const;

const MAX_SCOPES = 20;
const FULL_NAME = /^[가-힣]{2,5}$/;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Validates a full-name → selection map. Non-name keys (e.g. "__proto__") and malformed values are dropped. */
function parseNames(names: unknown): HanjaSelections {
  const out: HanjaSelections = {};
  if (!names || typeof names !== 'object' || Array.isArray(names)) return out;
  for (const [full, value] of Object.entries(names as Record<string, unknown>)) {
    if (!FULL_NAME.test(full)) continue;
    if (!Array.isArray(value) || value.length === 0 || value.length > 3) continue;
    if (!value.every(v => v === null || (typeof v === 'string' && HANJA_CHAR.test(v)))) continue;
    out[full] = [...value] as (string | null)[];
  }
  return out;
}

/** Parses the v1 format (kept for inspection/compatibility tests; never applied by pages). */
export function parseHanjaSelections(raw: unknown): HanjaSelections {
  if (!raw || typeof raw !== 'object') return {};
  const { version, names } = raw as { version?: unknown; names?: unknown };
  return version === 1 ? parseNames(names) : {};
}

interface ScopedStore {
  version: 2;
  scopes: Record<string, { updatedAt: number; names: HanjaSelections }>;
}

function parseScopedStore(raw: unknown): ScopedStore {
  const scopes: ScopedStore['scopes'] = Object.create(null);
  if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === 2) {
    const src = (raw as { scopes?: unknown }).scopes;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (const [scope, entry] of Object.entries(src as Record<string, unknown>)) {
        if (!scope.startsWith('{') || !entry || typeof entry !== 'object') continue;
        const { updatedAt, names } = entry as { updatedAt?: unknown; names?: unknown };
        scopes[scope] = { updatedAt: typeof updatedAt === 'number' ? updatedAt : 0, names: parseNames(names) };
      }
    }
  }
  return { version: 2, scopes };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonical);
    return items.every(i => typeof i === 'string') ? [...(items as string[])].sort() : items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .filter(k => (value as Record<string, unknown>)[k] !== undefined)
      .map(k => [k, canonical((value as Record<string, unknown>)[k])]));
  }
  return value;
}

/** Stable identity of an analysis input (validated input object). */
export function analysisScope(input: object): string {
  return JSON.stringify(canonical(input));
}

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function readStore(key: string, storage: StorageLike | undefined): ScopedStore {
  try {
    const raw = storage?.getItem(key);
    return parseScopedStore(raw ? JSON.parse(raw) : null);
  } catch {
    return parseScopedStore(null);
  }
}

export function loadHanjaSelections(key: string, scope: string, storage = defaultStorage()): HanjaSelections {
  const entry = readStore(key, storage).scopes[scope];
  return entry ? entry.names : {};
}

/** Returns false when the selection could not be persisted (it then survives only in memory). */
export function saveHanjaSelections(
  key: string, scope: string, selections: HanjaSelections, storage = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    const store = readStore(key, storage);
    store.scopes[scope] = { updatedAt: Date.now(), names: selections };
    const keep = Object.entries(store.scopes)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_SCOPES);
    storage.setItem(key, JSON.stringify({ version: 2, scopes: Object.fromEntries(keep) }));
    return true;
  } catch {
    return false;
  }
}
