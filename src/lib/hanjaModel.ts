import { GeneratedName, NameCharData, NameCharHanja, NameHanjaModel } from '@/types';
import { HanjaOption, findSurnameHanja, getHanjaOptions } from '@/data/hanjaDB';
import { parseKoreanName } from './nameParser';
import { validateModeBInput, validateModeCInput } from './inputValidation';

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
// analysis input, so they are never applied. They are also never deleted
// automatically (R3 final patch): result pages only read storage.
// purgeLegacyHanjaSelections() exists for a separate, explicit policy only.
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

/** Removes the unused v1 selection keys (only those two keys; nothing else is touched). Never throws.
 * Not called by any page: deleting stored records needs a separate explicit policy. */
export function purgeLegacyHanjaSelections(storage?: Pick<Storage, 'removeItem'>): void {
  let target = storage;
  try {
    target ??= typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return;
  }
  for (const key of Object.values(LEGACY_HANJA_SELECTION_KEYS)) {
    try {
      target?.removeItem(key);
    } catch {
      // Storage blocked: the stale keys are harmless because they are never read.
    }
  }
}

// ─── Strict storage contract (R3 data-safety hotfix) ────────────────────────
//
// Reads used before a WRITE must be lossless and must never mistake a failure
// for an empty store: only a missing key may start a new store. Every other
// problem refuses the write, leaves the stored text untouched and is reported.

export type HanjaStoreFailure =
  | 'no-storage'      // localStorage unavailable
  | 'read-error'      // getItem threw
  | 'malformed-json'  // stored text is not JSON
  | 'invalid-schema'  // JSON, but not a lossless v2 store (unknown/invalid parts)
  | 'too-large'       // over HANJA_READ_LIMITS.maxStoredChars (not parsed / not written)
  | 'write-error'     // setItem threw
  | 'quota-exceeded'  // setItem threw a quota error
  | 'invalid-selection' // the requested name/position/Hanja or the seed is not storable (H2)
  | 'invalid-scope'     // the scope is not the canonical scope of a valid Mode B/C input (C1)
  | 'invalid-stored-selection' // the stored record of this scope does not fit the analysis (C2; kept as is)
  | 'invalid-output';   // the store to be written would not pass the strict reader (H1/H3)

type HanjaReadFailure = Exclude<HanjaStoreFailure,
  'write-error' | 'quota-exceeded' | 'invalid-selection' | 'invalid-scope' | 'invalid-stored-selection' | 'invalid-output'>;

export type HanjaStoreRead =
  | { ok: true; kind: 'missing' | 'empty' | 'nonempty'; store: ScopedStore }
  | { ok: false; reason: HanjaReadFailure };

export type HanjaSaveResult =
  | { ok: true; selections: HanjaSelections }
  | { ok: false; reason: HanjaStoreFailure };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Lossless check: rewriting the parsed store must not drop or change anything. */
function strictScopedStore(raw: unknown): ScopedStore | null {
  if (!isPlainObject(raw) || raw.version !== 2 || !isPlainObject(raw.scopes)) return null;
  if (Object.keys(raw).some(k => k !== 'version' && k !== 'scopes')) return null;
  const parsed = parseScopedStore(raw);
  for (const [scope, entry] of Object.entries(raw.scopes)) {
    if (!isPlainObject(entry) || Object.keys(entry).some(k => k !== 'updatedAt' && k !== 'names')) return null;
    // Number.isFinite: JSON like 1e309 parses to Infinity, which JSON.stringify would turn into null (H3).
    if (typeof entry.updatedAt !== 'number' || !Number.isFinite(entry.updatedAt) || !isPlainObject(entry.names)) return null;
    const p = parsed.scopes[scope];
    if (!p || JSON.stringify(p.names) !== JSON.stringify(entry.names)) return null;
  }
  return parsed;
}

/** Strict read with an explicit result for every outcome. Never throws, never writes. */
export function readHanjaStore(
  key: string, storage: Pick<Storage, 'getItem'> | undefined = defaultStorage(),
  maxStoredChars: number = HANJA_READ_LIMITS.maxStoredChars,
): HanjaStoreRead {
  if (!storage) return { ok: false, reason: 'no-storage' };
  let text: string | null;
  try {
    text = storage.getItem(key);
  } catch {
    return { ok: false, reason: 'read-error' };
  }
  if (text === null) return { ok: true, kind: 'missing', store: parseScopedStore(null) };
  if (text.length > maxStoredChars) return { ok: false, reason: 'too-large' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'malformed-json' };
  }
  const store = strictScopedStore(json);
  if (!store) return { ok: false, reason: 'invalid-schema' };
  return { ok: true, kind: Object.keys(store.scopes).length ? 'nonempty' : 'empty', store };
}

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

/** True when `sel` is exactly what the strict reader accepts for a scope's names (lossless). */
function isStorableSelections(sel: unknown): sel is HanjaSelections {
  return isPlainObject(sel) && JSON.stringify(parseNames(sel)) === JSON.stringify(sel);
}

/** Name context of a verified analysis scope (C1). */
export type AnalysisScopeContext =
  | { mode: 'B'; surname: string }
  | { mode: 'C'; names: string[] };

/**
 * Resolves `scope` only when it is exactly the canonical scope of a valid Mode B
 * or Mode C input (C1). The scope is parsed and run through the SAME validators
 * the result pages use (default options, so a legacy 자시 input without
 * sijinVersion is refused exactly as on the pages); the validated value is then
 * serialized with analysisScope and must equal `scope` byte for byte. This
 * rejects fragments, missing or invalid fields, unknown or mixed B/C fields
 * (the validators drop fields they do not know, so the round-trip differs) and
 * noncanonical spellings (key order, whitespace, untrimmed or duplicate
 * values). The mode is the validator whose round-trip matches; it is never
 * inferred from a single field. Nothing is repaired or migrated. The validators
 * are pure (no storage, no clock).
 */
export function resolveAnalysisScope(scope: unknown): AnalysisScopeContext | null {
  if (typeof scope !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(scope);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;
  const found: AnalysisScopeContext[] = [];
  const b = validateModeBInput(raw);
  if (b.ok && analysisScope(b.value) === scope) found.push({ mode: 'B', surname: b.value.surname });
  const c = validateModeCInput(raw);
  if (c.ok && analysisScope(c.value) === scope) found.push({ mode: 'C', names: c.value.names });
  return found.length === 1 ? found[0] : null;
}

/**
 * Given-name syllable count of `fullName` in a verified analysis (H2-P): Mode C
 * parses each entered name with the same parser the analysis uses; Mode B uses
 * the validated surname. The surname boundary is never guessed from the full
 * name, and a caller cannot supply the length. null when it cannot be
 * established unambiguously.
 */
function givenLengthIn(ctx: AnalysisScopeContext, fullName: unknown): number | null {
  if (typeof fullName !== 'string' || !FULL_NAME.test(fullName)) return null;
  if (ctx.mode === 'C') {
    const lengths = new Set<number>();
    for (const n of ctx.names) {
      const p = parseKoreanName(n);
      if (p.ok && p.surname + p.given === fullName) lengths.add(p.given.length);
    }
    return lengths.size === 1 ? [...lengths][0] : null; // two readings (남궁 민 / 남 궁민) → never guess
  }
  if (!fullName.startsWith(ctx.surname)) return null;
  const given = fullName.length - ctx.surname.length;
  return given >= 1 && given <= 3 ? given : null;
}

/** Given-name length of `fullName` in the analysis `scope`; null for an unverified scope (C1). */
export function givenLengthInScope(scope: string, fullName: unknown): number | null {
  const ctx = resolveAnalysisScope(scope);
  return ctx ? givenLengthIn(ctx, fullName) : null;
}

/** Every name belongs to the analysis and uses only positions of its actual given name. */
function positionsFit(ctx: AnalysisScopeContext, selections: HanjaSelections): boolean {
  return Object.entries(selections).every(([full, positions]) => {
    const len = givenLengthIn(ctx, full);
    return len !== null && positions.length <= len;
  });
}

/**
 * The single write path. Reads strictly ONCE, derives the new names for
 * `scope` from what is actually stored and writes. Refuses (no write) on any
 * read failure, on unstorable selections, when the result would exceed the read
 * limit, and when the final text would not round-trip through the strict
 * reader with the intended record. Success only after setItem returned.
 *
 * Retention (MAX_SCOPES, unchanged size): the scope being saved is always kept
 * (H1); the remaining MAX_SCOPES - 1 places go to the most recently updated
 * other scopes. With ordinary timestamps this is identical to "20 most recent".
 */
function writeScope(
  key: string, scope: string, ctx: AnalysisScopeContext,
  update: (stored: HanjaSelections | undefined) => HanjaSelections | HanjaStoreFailure,
  storage: StorageLike | undefined, maxStoredChars: number,
): HanjaSaveResult {
  if (!storage) return { ok: false, reason: 'no-storage' };
  const read = readHanjaStore(key, storage, maxStoredChars);
  if (!read.ok) return read;
  const store = read.store;
  const selections = update(store.scopes[scope]?.names);
  if (typeof selections === 'string') return { ok: false, reason: selections };
  // The COMPLETE final map must be storable AND fit the analysis (C2), whichever API wrote it.
  if (!isStorableSelections(selections) || !positionsFit(ctx, selections)) return { ok: false, reason: 'invalid-selection' };
  const updatedAt = Date.now();
  if (!Number.isFinite(updatedAt)) return { ok: false, reason: 'invalid-output' };
  const others = Object.entries(store.scopes)
    .filter(([s]) => s !== scope)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MAX_SCOPES - 1);
  const keep: [string, ScopedStore['scopes'][string]][] = [[scope, { updatedAt, names: selections }], ...others];
  const text = JSON.stringify({ version: 2, scopes: Object.fromEntries(keep) });
  if (text.length > maxStoredChars) return { ok: false, reason: 'too-large' };
  // Final structure check (bounded by maxStoredChars): what is written must be readable
  // by the strict reader and contain exactly the intended record and the kept scopes.
  let back: ScopedStore | null = null;
  try {
    back = strictScopedStore(JSON.parse(text));
  } catch {
    back = null;
  }
  if (!back || Object.keys(back.scopes).length !== keep.length
    || JSON.stringify(back.scopes[scope]?.names) !== JSON.stringify(selections)) {
    return { ok: false, reason: 'invalid-output' };
  }
  try {
    storage.setItem(key, text);
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota-exceeded' : 'write-error' };
  }
  return { ok: true, selections };
}

/**
 * Replaces the selections of one scope (fail-closed). Returns false when nothing
 * was persisted (including an unverified scope, C1, or selections that do not
 * fit the analysis, H2/C2); the stored text is then unchanged.
 */
export function saveHanjaSelections(
  key: string, scope: string, selections: HanjaSelections, storage = defaultStorage(),
): boolean {
  // Scope (C1), format and positions (H2/C2) are checked before any storage access.
  const ctx = resolveAnalysisScope(scope);
  if (!ctx || !isStorableSelections(selections) || !positionsFit(ctx, selections)) return false;
  return writeScope(key, scope, ctx, () => selections, storage, HANJA_READ_LIMITS.maxStoredChars).ok;
}

/**
 * Confirms one Hanja position of one name (what the result pages call).
 * The patch is applied to the record actually stored for `scope`, so other
 * names and the other positions of the same name are kept. `seed` (the
 * selections currently shown, e.g. recovered legacy ones) is used only when
 * the scope has no stored record yet; an existing record, even {}, wins.
 * The scope must be a verified analysis scope (C1, `invalid-scope`), and the
 * complete result must fit the analysis: a stored record that does not is
 * refused unchanged (C2, `invalid-stored-selection`).
 */
export function saveHanjaSelectionPatch(
  key: string, scope: string, fullName: string, index: number, hanja: string,
  seed: HanjaSelections, storage = defaultStorage(),
  maxStoredChars: number = HANJA_READ_LIMITS.maxStoredChars,
): HanjaSaveResult {
  // H2: validate before touching storage. typeof first (H2-T: no implicit string coercion);
  // the position must exist in the actual given name of this analysis (H2-P), which also
  // bounds the array growth; the seed must fit the same scope so it cannot bypass the rule.
  if (typeof fullName !== 'string' || typeof hanja !== 'string' || !HANJA_CHAR.test(hanja)) {
    return { ok: false, reason: 'invalid-selection' };
  }
  const ctx = resolveAnalysisScope(scope); // C1: only a verified canonical analysis scope
  if (!ctx) return { ok: false, reason: 'invalid-scope' };
  const givenLength = givenLengthIn(ctx, fullName);
  if (givenLength === null || !Number.isInteger(index) || index < 0 || index >= givenLength || !isStorableSelections(seed)) {
    return { ok: false, reason: 'invalid-selection' };
  }
  // C2: the complete record must fit this analysis. A stored record holding positions or
  // names outside it is refused as a whole and left exactly as stored (no truncation, no
  // migration). The seed is used only when no record exists and must fit as well.
  return writeScope(key, scope, ctx, stored => {
    if (stored) return positionsFit(ctx, stored) ? withSelection(stored, fullName, index, hanja) : 'invalid-stored-selection';
    return positionsFit(ctx, seed) ? withSelection(seed, fullName, index, hanja) : 'invalid-selection';
  }, storage, maxStoredChars);
}

const FAILURE_CAUSE: Record<HanjaStoreFailure, string> = {
  'no-storage': '브라우저 저장소를 사용할 수 없습니다',
  'read-error': '브라우저 저장소를 읽지 못했습니다',
  'malformed-json': '저장된 한자 데이터의 형식이 손상돼 있습니다',
  'invalid-schema': '저장된 한자 데이터에 알 수 없는 형식이 섞여 있습니다',
  'too-large': '저장된 한자 데이터가 안전 한도보다 큽니다',
  'write-error': '브라우저 저장소에 쓰지 못했습니다',
  'quota-exceeded': '브라우저 저장 공간이 부족합니다',
  'invalid-selection': '저장할 수 없는 한자·위치 값입니다',
  'invalid-scope': '분석 입력 정보를 확인할 수 없습니다',
  'invalid-stored-selection': '이 분석에 저장된 기존 한자 선택에 이름에 없는 글자 위치나 이름이 있습니다',
  'invalid-output': '저장 결과를 검증하지 못했습니다',
};

/** User-facing failure text for a refused or failed save. */
export function hanjaSaveFailureMessage(fullName: string, reason: HanjaStoreFailure): string {
  return `${fullName}의 한자 선택을 저장하지 못했습니다(${FAILURE_CAUSE[reason]}). ` +
    '기존에 저장된 한자는 그대로 두었고, 이번 선택은 화면에도 적용하지 않았습니다. ' +
    '브라우저 저장소 문제(공간·권한·사생활 보호 모드 등)를 확인한 뒤 다시 선택해주세요.';
}

/** Display read for Mode C (no legacy recovery). A failure is never shown as "no selection". */
export function loadHanjaSelectionsChecked(
  key: string, scope: string, storage: Pick<Storage, 'getItem'> | undefined = defaultStorage(),
): { selections: HanjaSelections; failure: HanjaReadFailure | null } {
  const read = readHanjaStore(key, storage);
  if (!read.ok) return { selections: {}, failure: read.reason };
  return { selections: read.store.scopes[scope]?.names ?? {}, failure: null };
}

/** Notice for a display read that could not be used. */
export function hanjaReadFailureNotice(reason: HanjaReadFailure): string {
  return `저장된 한자 선택을 불러오지 못했습니다(${FAILURE_CAUSE[reason]}). 저장 데이터는 삭제하거나 바꾸지 않았습니다. ` +
    '이 상태에서는 새 한자 선택도 저장하지 않으니, 문제를 해결한 뒤 다시 열어주세요.';
}

// ─── Legacy duplicate-preference scopes (R3-CLOSE, read-only) ────────────────
//
// Before R3-FIX the validator kept duplicate nameStyles / images entries, so a
// selection confirmed then is stored under a scope such as
//   {..."nameStyles":["전통형","전통형"]...}
// while the same input now validates to {..."nameStyles":["전통형"]...}.
// The lookup below recovers such a selection only when the stored scope is
// provably the same analysis input except for duplicate entries in these two
// lists. Every other field must be byte-identical. Nothing is written, copied
// or deleted: the old entry stays where it is; a later edit is saved under the
// current scope as usual.

const DUPLICATE_ONLY_KEYS = new Set(['nameStyles', 'images']);

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

/** True when `stored` equals `current` except that its preference lists contain duplicates. */
export function isDuplicateOnlyVariant(stored: string, current: string): boolean {
  if (stored === current) return false;
  let a: unknown, b: unknown;
  try {
    a = JSON.parse(stored);
    b = JSON.parse(current);
  } catch {
    return false;
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).sort(), kb = Object.keys(rb).sort();
  if (ka.join('\u0000') !== kb.join('\u0000')) return false;
  let hadDuplicates = false;
  for (const k of ka) {
    if (DUPLICATE_ONLY_KEYS.has(k)) {
      const x = ra[k], y = rb[k];
      if (!isStringArray(x) || !isStringArray(y)) return false;
      if (new Set(y).size !== y.length) return false; // the current input is normalized
      const dedup = Array.from(new Set(x)).sort();
      if (JSON.stringify(dedup) !== JSON.stringify([...y].sort())) return false;
      if (dedup.length !== x.length) hadDuplicates = true;
    } else if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) {
      return false;
    }
  }
  return hadDuplicates;
}

export type HanjaScopeRecovery =
  | { kind: 'none' }
  | { kind: 'recovered'; fromScopes: string[]; names: number }
  | { kind: 'ambiguous'; fromScopes: string[] }
  /** Safety limit hit: nothing was examined (size) or the legacy scan was skipped (scopes). Nothing is deleted. */
  | { kind: 'skipped'; reason: 'size' | 'scopes' }
  /** The stored record could not be read or validated: nothing shown, nothing written. */
  | { kind: 'unreadable'; reason: 'no-storage' | 'read-error' | 'malformed-json' | 'invalid-schema' };

/** Read limits of the result-loading path (R36-L1). The write policy (MAX_SCOPES) is unchanged. */
export const HANJA_READ_LIMITS = {
  /** Stored JSON larger than this (UTF-16 code units) is not parsed on page load. */
  maxStoredChars: 1_000_000,
  /** Stores with more scopes than this are not scanned for legacy variants. */
  maxLegacyScopes: 50,
} as const;

/**
 * loadHanjaSelections plus the read-only legacy lookup. Rules:
 * - An entry under the current scope is authoritative (also an explicit {}).
 * - Every stored duplicate-only variant takes part in the decision, including
 *   empty ones: an empty record may mean "the user cleared the selection", so
 *   it is never overridden by a non-empty one ('ambiguous', user reselects).
 * - Identical non-empty variants are recovered deterministically; all-empty
 *   variants mean there is nothing to recover ('none').
 * - Over a read limit the lookup fails closed ('skipped') without throwing.
 * Nothing is ever written, copied or deleted here.
 */
export function loadHanjaSelectionsWithLegacy(
  key: string, scope: string, storage = defaultStorage(),
  limits: { maxStoredChars: number; maxLegacyScopes: number } = HANJA_READ_LIMITS,
): { selections: HanjaSelections; recovery: HanjaScopeRecovery } {
  const read = readHanjaStore(key, storage, limits.maxStoredChars);
  if (!read.ok) {
    if (read.reason === 'too-large') return { selections: {}, recovery: { kind: 'skipped', reason: 'size' } };
    // A missing key is 'none'; storage that cannot be used is reported, never shown as "no selection".
    if (read.reason === 'no-storage') return { selections: {}, recovery: { kind: 'none' } };
    return { selections: {}, recovery: { kind: 'unreadable', reason: read.reason } };
  }
  const store = read.store;
  const own = store.scopes[scope];
  if (own) return { selections: own.names, recovery: { kind: 'none' } };
  const entries = Object.entries(store.scopes);
  if (entries.length > limits.maxLegacyScopes) {
    return { selections: {}, recovery: { kind: 'skipped', reason: 'scopes' } };
  }
  const candidates = entries
    .filter(([s]) => isDuplicateOnlyVariant(s, scope))
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
  if (candidates.length === 0) return { selections: {}, recovery: { kind: 'none' } };
  const fromScopes = candidates.map(([s]) => s);
  // Position-preserving comparison (canonical() would sort per-syllable arrays).
  const sig = (n: HanjaSelections) => JSON.stringify(Object.keys(n).sort().map(k => [k, n[k]]));
  const first = sig(candidates[0][1].names);
  if (candidates.some(([, e]) => sig(e.names) !== first)) {
    return { selections: {}, recovery: { kind: 'ambiguous', fromScopes } };
  }
  const names = candidates[0][1].names;
  if (Object.keys(names).length === 0) return { selections: {}, recovery: { kind: 'none' } };
  return { selections: names, recovery: { kind: 'recovered', fromScopes, names: Object.keys(names).length } };
}

/** User-facing notice for a legacy recovery (null when nothing happened). */
export function hanjaRecoveryNotice(r: HanjaScopeRecovery): string | null {
  if (r.kind === 'recovered') {
    return `이전 입력에 중복 저장돼 있던 스타일·이미지를 하나로 정리했습니다. 정리 전과 다른 입력은 모두 같아, 그때 확정한 한자 선택(${r.names}명)을 그대로 불러왔습니다. 결과 순위는 정리된 입력 기준입니다.`;
  }
  if (r.kind === 'ambiguous') {
    return '이전 입력에 중복 저장돼 있던 스타일·이미지를 하나로 정리했습니다. 정리 전 같은 입력에 서로 다른 한자 선택 기록(선택을 비운 기록 포함)이 남아 있어 어느 쪽이 최종 선택인지 알 수 없으므로 자동으로 불러오지 않았습니다. 필요한 이름의 한자를 다시 선택해주세요(이전 기록은 삭제되지 않았습니다).';
  }
  if (r.kind === 'skipped') {
    return r.reason === 'size'
      ? '저장된 한자 선택 데이터가 안전 한도보다 커서 불러오지 않았습니다. 저장된 데이터는 삭제하거나 바꾸지 않았으며, 이 상태에서는 새 한자 선택도 저장하지 않습니다.'
      : '저장된 한자 선택 기록이 많아 이전 입력의 한자 선택 복구 확인을 건너뛰었습니다. 저장된 데이터는 삭제되지 않았습니다. 필요하면 한자를 다시 선택해주세요.';
  }
  if (r.kind === 'unreadable') return hanjaReadFailureNotice(r.reason);
  return null;
}
