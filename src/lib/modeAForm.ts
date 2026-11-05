import { Gender, ImageType, MedicalSchedule, NameStyle, TimeRange } from '@/types';
import { CivilDate, SUPPORTED_KST_DATE_RANGE, isSupportedIsoDate, parseIsoCivilDate } from './calendar';
import { validateDesignerInput, validateScheduleTimes } from './inputValidation';
import { formatHm, normalizeSchedule } from './schedule';

// Mode A form state helpers: default dates, restoration of a previous input and
// the permitted-time selection state. Pure functions (no React) so they can be
// tested independently of the page.

export const MODE_A_STORAGE_KEY = 'dlbd_mode_a';

// UI shortcuts only. They are not medical recommendations and are never
// preselected: the user must choose them explicitly.
export const TIME_PRESETS = [
  { id: 'morning', label: '오전', range: { start: '09:00', end: '12:00' } },
  { id: 'afternoon', label: '오후', range: { start: '13:00', end: '17:00' } },
] as const;

const DEFAULT_WINDOW_DAYS = 7;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: CivilDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

/** Today's civil date in Asia/Seoul, regardless of the browser's time zone. */
export function seoulToday(now: Date): CivilDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Adds calendar months, keeping the day of month and clamping to the target month's last day. */
export function addMonthsClamped(d: CivilDate, months: number): CivilDate {
  const index = d.year * 12 + (d.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(d.day, lastDay) };
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoCivilDate(iso)!;
  return new Date(Date.UTC(d.year, d.month - 1, d.day + days)).toISOString().slice(0, 10);
}

export interface DefaultDates {
  start: string;  // '' when the computed default is unsupported
  end: string;
  notice: string | null;
}

/** Default start = today (Asia/Seoul) + 2 calendar months; end = a 7-day window inside the supported range. */
export function defaultScheduleDates(now: Date): DefaultDates {
  const start = toIsoDate(addMonthsClamped(seoulToday(now), 2));
  if (!isSupportedIsoDate(start)) {
    return {
      start: '', end: '',
      notice: `기본 시작일(${start})이 분석 지원 기간(${SUPPORTED_KST_DATE_RANGE.first} ~ ${SUPPORTED_KST_DATE_RANGE.last})을 벗어납니다. ` +
        '해당 기간을 분석하려면 절기 데이터 확장이 필요합니다. 지원 기간 안의 날짜를 직접 선택해주세요.',
    };
  }
  const end = addDaysIso(start, DEFAULT_WINDOW_DAYS - 1);
  return { start, end: end > SUPPORTED_KST_DATE_RANGE.last ? SUPPORTED_KST_DATE_RANGE.last : end, notice: null };
}

// ─── Permitted-time selection state ─────────────────────────────────────────

export type SelectionStatus = 'none' | 'complete' | 'error';

export interface SelectionState {
  status: SelectionStatus;
  issues: string[];
  summary: string[]; // normalized permitted times, e.g. "09:00~12:00", "14:20 (특정 시각)"
}

/** Blank rows are ignored, exactly as on submission. Uses the engine's validation rules. */
export function scheduleSelectionState(timeRanges: TimeRange[], exactTimes: string[]): SelectionState {
  const ranges = timeRanges.filter(r => r.start || r.end);
  const exact = exactTimes.filter(Boolean);
  if (ranges.length === 0 && exact.length === 0) return { status: 'none', issues: [], summary: [] };
  const issues = validateScheduleTimes(ranges, exact).map(i => i.message);
  if (issues.length > 0) return { status: 'error', issues, summary: [] };
  const n = normalizeSchedule({ providerConfirmed: false, timeRanges: ranges, exactTimes: exact });
  return {
    status: 'complete',
    issues: [],
    summary: [
      ...n.ranges.map(([s, e]) => `${formatHm(s)}~${formatHm(e)}`),
      ...n.exact.map(t => `${formatHm(t)} (특정 시각)`),
    ],
  };
}

export function hasRange(timeRanges: TimeRange[], range: TimeRange): boolean {
  return timeRanges.some(r => r.start === range.start && r.end === range.end);
}

// ─── Restoring a previous input ──────────────────────────────────────────────

export interface ModeAFormInit {
  startDate: string;
  endDate: string;
  surname: string;
  gender: Gender;
  dolrimChar: string;
  dolrimPosition: 'first' | 'second' | 'auto';
  dolrimHanja: string | null;
  nameStyles: NameStyle[];
  images: ImageType[];
  timeRanges: TimeRange[];
  exactTimes: string[];
  providerConfirmed: false; // never restored: the user re-confirms every submission
  dateNotice: string | null;
  restoreNotice: string | null;
}

// Used only to check the non-schedule fields of an input whose schedule is
// missing (legacy) or invalid. Never stored and never shown as a selection.
const PROBE_SCHEDULE: MedicalSchedule = { providerConfirmed: true, timeRanges: [], exactTimes: ['00:00'] };

export function loadModeAFormInit(now: Date, storage?: Pick<Storage, 'getItem'>): ModeAFormInit {
  const dates = defaultScheduleDates(now);
  const base: ModeAFormInit = {
    startDate: dates.start, endDate: dates.end, surname: '김', gender: '남',
    dolrimChar: '', dolrimPosition: 'auto', dolrimHanja: null, nameStyles: [], images: [],
    timeRanges: [], exactTimes: [], providerConfirmed: false,
    dateNotice: dates.notice, restoreNotice: null,
  };

  let raw: unknown;
  try {
    const text = (storage ?? window.localStorage).getItem(MODE_A_STORAGE_KEY);
    if (!text) return base;
    raw = JSON.parse(text);
  } catch {
    return { ...base, restoreNotice: '이전 입력을 불러올 수 없어 새 입력으로 시작합니다.' };
  }

  const full = validateDesignerInput(raw);
  if (full.ok) {
    const v = full.value;
    return {
      ...base,
      startDate: v.startDate, endDate: v.endDate, surname: v.surname, gender: v.gender,
      dolrimChar: v.dolrimChar, dolrimPosition: v.dolrimPosition, dolrimHanja: v.dolrimHanja ?? null,
      nameStyles: v.nameStyles, images: v.images,
      timeRanges: v.schedule.timeRanges.map(r => ({ ...r })), exactTimes: [...v.schedule.exactTimes],
      dateNotice: null,
      restoreNotice: '이전에 입력한 일정을 불러왔습니다. 의료진 허용 범위인지 다시 확인한 뒤 체크해주세요.',
    };
  }

  // Schedule missing or invalid: restore the other fields only, never the schedule.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const probe = validateDesignerInput({ ...(raw as Record<string, unknown>), schedule: PROBE_SCHEDULE });
    if (probe.ok) {
      const v = probe.value;
      return {
        ...base,
        startDate: v.startDate, endDate: v.endDate, surname: v.surname, gender: v.gender,
        dolrimChar: v.dolrimChar, dolrimPosition: v.dolrimPosition, dolrimHanja: v.dolrimHanja ?? null,
        nameStyles: v.nameStyles, images: v.images,
        dateNotice: null,
        restoreNotice: '이전 입력의 허용 시간대는 이전 버전 형식이거나 유효하지 않아 불러오지 않았습니다. 허용 시간을 다시 선택해주세요.',
      };
    }
  }
  return { ...base, restoreNotice: '이전 입력이 현재 기준에 맞지 않아 새 입력으로 시작합니다.' };
}
