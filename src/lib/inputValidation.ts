import {
  DesignerInput, Gender, ImageType, IMAGE_LABELS, MedicalSchedule, ModeBInput, ModeCInput,
  NameStyle, NAME_STYLE_LABELS, SIJIN_VERSION,
} from '@/types';
import { SUPPORTED_KST_DATE_RANGE, isSupportedIsoDate, parseIsoCivilDate } from './calendar';
import { getHanjaOptions } from '@/data/hanjaDB';
import { confirmedChar } from './hanjaModel';
import { isValidNameChar } from './nameGenerator';
import { findTransitionInSijin, formatHm, isScheduleEmpty, isoDatesBetween, normalizeSchedule, parseHm, parseRangeEnd, sijinInterval } from './schedule';

// Shared validation for the input pages (page boundary) and the analysis
// functions (engine boundary). Messages are user-facing Korean.

export const MAX_SCHEDULE_DAYS = 30;
const MAX_TIME_RANGES = 12;
const MAX_EXACT_TIMES = 24;
const MAX_MODE_C_NAMES = 10;

export type InputField = 'date' | 'time' | 'confirm' | 'surname' | 'dolrim' | 'names' | 'other';
export interface InputIssue { field: InputField; message: string }

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'legacy' | 'invalid'; issues: InputIssue[] };

export class InputValidationError extends Error {
  readonly kind: 'legacy' | 'invalid';
  readonly issues: InputIssue[];
  constructor(result: Extract<Validation<unknown>, { ok: false }>) {
    super(result.issues.map(i => i.message).join(' / '));
    this.name = 'InputValidationError';
    this.kind = result.kind;
    this.issues = result.issues;
  }
}

export function assertValid<T>(result: Validation<T>): T {
  if (!result.ok) throw new InputValidationError(result);
  return result.value;
}

export const RANGE_MESSAGE =
  `분석 가능 기간은 ${SUPPORTED_KST_DATE_RANGE.first} ~ ${SUPPORTED_KST_DATE_RANGE.last}입니다`;

// ─── Primitive checks ────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const HANGUL = /^[가-힣]+$/;
const GENDERS: Gender[] = ['남', '여'];
const POSITIONS = ['first', 'second', 'auto'] as const;
// Explicit allow-lists: membership is checked on strings only, never with `in`
// (which coerces values to keys and accepts inherited keys such as "constructor").
const IMAGE_VALUES: ReadonlySet<string> = new Set(Object.keys(IMAGE_LABELS));
const STYLE_VALUES: ReadonlySet<string> = new Set(Object.keys(NAME_STYLE_LABELS));

const isStringListOf = (v: unknown, allowed: ReadonlySet<string>) =>
  Array.isArray(v) && v.every(x => typeof x === 'string' && allowed.has(x));

// ─── Generational character (돌림자) ──────────────────────────────────────────

export type DolrimSupport =
  | { kind: 'none' }                         // no generational character
  | { kind: 'supported'; hasHanjaData: boolean }
  | { kind: 'native-word' }                  // Hangul syllable that is not a Sino-Korean reading
  | { kind: 'malformed' };                   // not a single Hangul syllable

/** Classifies a generational character. Shared by the input pages and the engine. */
export function classifyDolrim(char: unknown): DolrimSupport {
  if (char === undefined || char === '') return { kind: 'none' };
  if (typeof char !== 'string') return { kind: 'malformed' };
  const c = char.trim();
  if (c === '') return { kind: 'none' };
  if (c.length !== 1 || !HANGUL.test(c)) return { kind: 'malformed' };
  if (!isValidNameChar(c)) return { kind: 'native-word' };
  return { kind: 'supported', hasHanjaData: getHanjaOptions(c).length > 0 };
}

/** Explicit notice for a supported character without Hanja data (not an error). */
export function dolrimNotice(char: string): string | null {
  const s = classifyDolrim(char);
  return s.kind === 'supported' && !s.hasHanjaData
    ? `돌림자 '${char.trim()}'은(는) 한자 데이터가 없어 한자 없이(미지정) 발음 기준으로만 분석합니다`
    : null;
}

function checkDolrim(raw: Record<string, unknown>, issues: InputIssue[]) {
  const support = classifyDolrim(raw.dolrimChar);
  const char = typeof raw.dolrimChar === 'string' ? raw.dolrimChar.trim() : '';
  if (support.kind === 'malformed') {
    issues.push({ field: 'dolrim', message: '돌림자는 한글 한 글자로 입력해주세요' });
  } else if (support.kind === 'native-word') {
    issues.push({ field: 'dolrim', message: `'${char}'은(는) 한자 음이 아닌 순우리말이라 돌림자로 사용할 수 없습니다` });
  }
  const hanja = raw.dolrimHanja;
  if (hanja === undefined || hanja === null || hanja === '') return;
  if (typeof hanja !== 'string') {
    issues.push({ field: 'dolrim', message: '돌림자 한자 정보가 올바르지 않습니다' });
  } else if (support.kind !== 'supported') {
    if (support.kind === 'none') issues.push({ field: 'dolrim', message: '돌림자 없이 돌림자 한자가 지정되었습니다' });
  } else if (!confirmedChar(char, hanja)) {
    issues.push({ field: 'dolrim', message: `선택한 한자 '${hanja}'은(는) '${char}' 음으로 등록된 한자가 아닙니다. 돌림자 한자를 다시 선택해주세요` });
  }
}

function checkDate(v: unknown, label: string, issues: InputIssue[]): v is string {
  if (typeof v !== 'string' || !parseIsoCivilDate(v)) {
    issues.push({ field: 'date', message: `${label}을(를) 올바른 날짜로 선택해주세요` });
    return false;
  }
  if (!isSupportedIsoDate(v)) {
    issues.push({ field: 'date', message: RANGE_MESSAGE });
    return false;
  }
  return true;
}

function checkCommon(raw: Record<string, unknown>, issues: InputIssue[]) {
  if (typeof raw.surname !== 'string' || !HANGUL.test(raw.surname.trim()) || raw.surname.trim().length > 2) {
    issues.push({ field: 'surname', message: '성씨는 한글 1~2글자로 입력해주세요' });
  }
  if (!GENDERS.includes(raw.gender as Gender)) issues.push({ field: 'other', message: '성별 정보가 올바르지 않습니다' });
  checkDolrim(raw, issues);
  if (raw.dolrimPosition !== undefined && !POSITIONS.includes(raw.dolrimPosition as typeof POSITIONS[number])) {
    issues.push({ field: 'dolrim', message: '돌림자 위치 정보가 올바르지 않습니다' });
  }
  if (raw.images !== undefined && !isStringListOf(raw.images, IMAGE_VALUES)) {
    issues.push({ field: 'other', message: '이미지 선택 정보가 올바르지 않습니다' });
  }
  if (raw.nameStyles !== undefined && !isStringListOf(raw.nameStyles, STYLE_VALUES)) {
    issues.push({ field: 'other', message: '이름 스타일 정보가 올바르지 않습니다' });
  }
}

function commonValue(raw: Record<string, unknown>) {
  return {
    surname: (raw.surname as string).trim(),
    gender: raw.gender as Gender,
    dolrimChar: typeof raw.dolrimChar === 'string' ? raw.dolrimChar.trim() : '',
    dolrimPosition: (raw.dolrimPosition as DesignerInput['dolrimPosition']) ?? 'auto',
    dolrimHanja: typeof raw.dolrimHanja === 'string' && raw.dolrimHanja ? raw.dolrimHanja : undefined,
    images: [...((raw.images ?? []) as ImageType[])],
    nameStyles: [...((raw.nameStyles ?? []) as NameStyle[])],
  };
}

function checkBirthHour(v: unknown, issues: InputIssue[]): v is number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 23) {
    issues.push({ field: 'time', message: '출생 시간 정보가 올바르지 않습니다' });
    return false;
  }
  return true;
}

const isZiHour = (h: unknown) => h === 0 || h === 23;

function sijinName(hour: number): string {
  const [from, to] = sijinInterval(hour);
  const name = hour === 0 ? '조자시' : hour === 23 ? '야자시' : '선택한 시진';
  return `${name} ${formatHm(from)}~${to === 1440 ? '24:00' : formatHm(to)}`;
}

function checkSijinTransition(date: string, hour: number, issues: InputIssue[]) {
  const t = findTransitionInSijin(date, hour);
  if (t) {
    issues.push({
      field: 'time',
      message: `선택한 시간(${sijinName(hour)}) 안에 절기 전환(${t.name} ${t.time} KST)이 있어 시진 단위로는 월주를 확정할 수 없습니다. ` +
        '정확한 출생 시각(분 단위)이 필요하지만 이 화면은 아직 분 단위 입력을 지원하지 않으므로 이 조합은 분석하지 않습니다',
    });
  }
}

export const LEGACY_ZI_MESSAGE =
  "이전 버전에서 저장된 '자시' 선택은 조자시(00:00~01:00)인지 야자시(23:00~24:00)인지 알 수 없습니다. " +
  '입력 화면에서 출생 시간을 다시 선택해주세요';

/**
 * A stored 자시 (birthHour 0 or 23) saved before 조자시/야자시 were separate
 * choices. It meant either interval, so it is never reinterpreted: the user
 * must choose again.
 */
export function isLegacyZiInput(raw: unknown): boolean {
  return isRecord(raw) && isZiHour(raw.birthHour) && raw.sijinVersion === undefined;
}

/**
 * Birth date and sijin checks shared by Mode B and C. Returns true when the only
 * time problem is a legacy 자시 selection (validation kind 'legacy').
 * With `ignoreTime`, only the date is checked (used to restore the other fields
 * of a legacy input while asking for the time again).
 */
function checkBirthTime(raw: Record<string, unknown>, issues: InputIssue[], ignoreTime: boolean): boolean {
  const dateOk = checkDate(raw.birthDate, '출생일', issues);
  if (ignoreTime) return false;
  if (raw.sijinVersion !== undefined && raw.sijinVersion !== SIJIN_VERSION) {
    issues.push({ field: 'time', message: '출생 시간 정보가 올바르지 않습니다' });
    return false;
  }
  if (!checkBirthHour(raw.birthHour, issues)) return false;
  if (isLegacyZiInput(raw)) {
    issues.push({ field: 'time', message: LEGACY_ZI_MESSAGE });
    return true;
  }
  if (dateOk) checkSijinTransition(raw.birthDate as string, raw.birthHour as number, issues);
  return false;
}

/** The marker is kept only where it matters (자시), so other inputs keep their analysis scope. */
const sijinValue = (raw: Record<string, unknown>) => (isZiHour(raw.birthHour) ? { sijinVersion: SIJIN_VERSION } : {});

export interface BirthTimeOptions { ignoreTime?: boolean }

// ─── Mode A ──────────────────────────────────────────────────────────────────

export type ValidDesignerInput = DesignerInput & { schedule: MedicalSchedule };

function checkSchedule(v: unknown, issues: InputIssue[]): v is MedicalSchedule {
  if (!isRecord(v)) {
    issues.push({ field: 'time', message: '의료진이 허용한 시간대 정보가 없습니다' });
    return false;
  }
  if (v.providerConfirmed !== true) {
    issues.push({ field: 'confirm', message: '날짜·시간 범위가 담당 의료진이 허용한 범위인지 확인해주세요' });
  }
  const timeIssues = validateScheduleTimes(v.timeRanges, v.exactTimes);
  issues.push(...timeIssues);
  return timeIssues.length === 0;
}

/**
 * Permitted-time rules shared by the engine (via checkSchedule) and the Mode A
 * form's selection-state display, so both always agree.
 */
export function validateScheduleTimes(ranges: unknown, exact: unknown): InputIssue[] {
  const issues: InputIssue[] = [];
  if (!Array.isArray(ranges) || !Array.isArray(exact)) {
    issues.push({ field: 'time', message: '허용 시간대 정보가 올바르지 않습니다' });
    return issues;
  }
  if (ranges.length > MAX_TIME_RANGES || exact.length > MAX_EXACT_TIMES) {
    issues.push({ field: 'time', message: `허용 시간대는 구간 ${MAX_TIME_RANGES}개, 특정 시각 ${MAX_EXACT_TIMES}개까지 입력할 수 있습니다` });
  }
  let valid = true;
  ranges.forEach((r, i) => {
    const s = isRecord(r) ? parseHm(r.start) : null;
    const e = isRecord(r) ? parseRangeEnd(r.end) : null;
    if (s === null || e === null) {
      issues.push({ field: 'time', message: `허용 시간 구간 ${i + 1}의 시각 형식이 올바르지 않습니다` });
      valid = false;
    } else if (e <= s) {
      issues.push({ field: 'time', message: `허용 시간 구간 ${i + 1}: 종료 시각은 시작 시각보다 늦어야 합니다 (자정을 넘기는 구간은 두 개로 나눠 입력)` });
      valid = false;
    }
  });
  exact.forEach((t, i) => {
    if (parseHm(t) === null) {
      issues.push({ field: 'time', message: `특정 시각 ${i + 1}의 형식이 올바르지 않습니다` });
      valid = false;
    }
  });
  if (valid && isScheduleEmpty(normalizeSchedule({ providerConfirmed: true, timeRanges: ranges, exactTimes: exact }))) {
    issues.push({ field: 'time', message: '의료진이 허용한 시간대를 1개 이상 입력해주세요. 허용 시간이 없으면 분석할 수 없습니다' });
  }
  return issues;
}

export function validateDesignerInput(raw: unknown): Validation<ValidDesignerInput> {
  if (!isRecord(raw)) return { ok: false, kind: 'invalid', issues: [{ field: 'other', message: '입력 데이터 형식이 올바르지 않습니다' }] };
  const issues: InputIssue[] = [];
  if (raw.schedule === undefined) {
    return {
      ok: false, kind: 'legacy',
      issues: [{ field: 'time', message: '이전 버전에서 저장된 입력이라 의료진이 허용한 시간대 정보가 없습니다. 입력 화면에서 허용 기간과 시간대를 다시 지정해주세요' }],
    };
  }
  const startOk = checkDate(raw.startDate, '시작일', issues);
  const endOk = checkDate(raw.endDate, '종료일', issues);
  if (startOk && endOk) {
    const start = raw.startDate as string;
    const end = raw.endDate as string;
    if (start > end) issues.push({ field: 'date', message: '종료일은 시작일 이후여야 합니다' });
    else if (isoDatesBetween(start, end).length > MAX_SCHEDULE_DAYS) {
      issues.push({ field: 'date', message: `최대 ${MAX_SCHEDULE_DAYS}일 범위까지 가능합니다` });
    }
  }
  checkSchedule(raw.schedule, issues);
  checkCommon(raw, issues);
  if (issues.length > 0) return { ok: false, kind: 'invalid', issues };

  const s = raw.schedule as unknown as MedicalSchedule;
  return {
    ok: true,
    value: {
      ...commonValue(raw),
      startDate: raw.startDate as string,
      endDate: raw.endDate as string,
      schedule: {
        providerConfirmed: true,
        timeRanges: s.timeRanges.map(r => ({ start: r.start, end: r.end })),
        exactTimes: [...s.exactTimes],
      },
    },
  };
}

// ─── Mode B ──────────────────────────────────────────────────────────────────

export function validateModeBInput(raw: unknown, options: BirthTimeOptions = {}): Validation<ModeBInput> {
  if (!isRecord(raw)) return { ok: false, kind: 'invalid', issues: [{ field: 'other', message: '입력 데이터 형식이 올바르지 않습니다' }] };
  const issues: InputIssue[] = [];
  const legacy = checkBirthTime(raw, issues, options.ignoreTime === true);
  checkCommon(raw, issues);
  if (issues.length > 0) return { ok: false, kind: legacy && issues.length === 1 ? 'legacy' : 'invalid', issues };
  return {
    ok: true,
    value: { ...commonValue(raw), birthDate: raw.birthDate as string, birthHour: raw.birthHour as number, ...sijinValue(raw) },
  };
}

// ─── Mode C ──────────────────────────────────────────────────────────────────

/** Validates the stored structure. Individual names are parsed (and reported) by analyzeModeCNames. */
export function validateModeCInput(raw: unknown, options: BirthTimeOptions = {}): Validation<ModeCInput> {
  if (!isRecord(raw)) return { ok: false, kind: 'invalid', issues: [{ field: 'other', message: '입력 데이터 형식이 올바르지 않습니다' }] };
  const issues: InputIssue[] = [];
  const legacy = checkBirthTime(raw, issues, options.ignoreTime === true);
  if (!GENDERS.includes(raw.gender as Gender)) issues.push({ field: 'other', message: '성별 정보가 올바르지 않습니다' });
  const names = raw.names;
  if (!Array.isArray(names) || !names.every(n => typeof n === 'string' && n.length <= 20)) {
    issues.push({ field: 'names', message: '이름 목록 정보가 올바르지 않습니다' });
  } else if (names.filter(n => n.trim()).length === 0) {
    issues.push({ field: 'names', message: '이름을 최소 1개 입력해주세요' });
  } else if (names.length > MAX_MODE_C_NAMES) {
    issues.push({ field: 'names', message: `이름은 최대 ${MAX_MODE_C_NAMES}개까지 입력할 수 있습니다` });
  }
  if (issues.length > 0) return { ok: false, kind: legacy && issues.length === 1 ? 'legacy' : 'invalid', issues };
  return {
    ok: true,
    value: {
      birthDate: raw.birthDate as string, birthHour: raw.birthHour as number, ...sijinValue(raw),
      gender: raw.gender as Gender, names: names as string[],
    },
  };
}
