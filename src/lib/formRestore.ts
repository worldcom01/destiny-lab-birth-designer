import { Gender, ImageType, NameStyle } from '@/types';
import { isLegacyZiInput, isNameStyle, uniqueList, validateModeBInput, validateModeCInput } from './inputValidation';
import { addMonthsClamped, seoulToday, toIsoDate } from './modeAForm';

// Restores the previous Mode B / Mode C input (the one saved before the last
// analysis) when the user comes back to the input page. Pure functions: the
// stored value is re-validated with the same rules as the results page, and an
// unusable value falls back to defaults with a notice. Nothing is written.

export const MODE_B_STORAGE_KEY = 'dlbd_mode_b';
export const MODE_C_STORAGE_KEY = 'dlbd_mode_c';

const RESTORED_NOTICE = '이전에 입력한 내용을 불러왔습니다.';
const UNREADABLE_NOTICE = '이전 입력을 불러올 수 없어 새 입력으로 시작합니다.';
const INVALID_NOTICE = '이전 입력이 현재 기준에 맞지 않아 새 입력으로 시작합니다.';
// A legacy 자시 meant 조자시 or 야자시; it is never mapped to one of them.
const LEGACY_ZI_NOTICE = "이전 입력을 불러왔습니다. 자시가 조자시(00:00~01:00)와 야자시(23:00~24:00)로 나뉘어, 이전에 고른 '자시'는 어느 쪽인지 알 수 없습니다. 출생 시간을 다시 선택해주세요.";

/** Default birth date: one year after today in Asia/Seoul (independent of the browser time zone). */
export function defaultBirthDate(now: Date): string {
  return toIsoDate(addMonthsClamped(seoulToday(now), 12));
}

type Read = { kind: 'empty' } | { kind: 'unreadable' } | { kind: 'value'; raw: unknown };

function readStored(key: string, storage?: Pick<Storage, 'getItem'>): Read {
  try {
    const text = (storage ?? window.localStorage).getItem(key);
    return text ? { kind: 'value', raw: JSON.parse(text) } : { kind: 'empty' };
  } catch {
    return { kind: 'unreadable' };
  }
}

export interface ModeBFormInit {
  birthDate: string;
  birthHour: number | null; // null: the user must choose (legacy 자시)
  surname: string;
  gender: Gender;
  dolrimChar: string;
  dolrimPosition: 'first' | 'second' | 'auto';
  dolrimHanja: string | null;
  nameStyles: NameStyle[];
  images: ImageType[];
  restoreNotice: string | null;
}

export function loadModeBFormInit(now: Date, storage?: Pick<Storage, 'getItem'>): ModeBFormInit {
  const base: ModeBFormInit = {
    birthDate: defaultBirthDate(now), birthHour: 9, surname: '김', gender: '남',
    dolrimChar: '', dolrimPosition: 'auto', dolrimHanja: null, nameStyles: [], images: [],
    restoreNotice: null,
  };
  const read = readStored(MODE_B_STORAGE_KEY, storage);
  if (read.kind === 'empty') return base;
  if (read.kind === 'unreadable') return { ...base, restoreNotice: UNREADABLE_NOTICE };
  const legacyZi = isLegacyZiInput(read.raw);
  const styles = inspectStoredStyles(read.raw);
  // A malformed style list alone does not discard the rest of the input: the
  // valid entries are kept and the user is told which ones were dropped.
  const raw = styles.malformed && typeof read.raw === 'object' && read.raw !== null
    ? { ...(read.raw as Record<string, unknown>), nameStyles: styles.valid }
    : read.raw;
  const v = validateModeBInput(raw, { ignoreTime: legacyZi });
  if (!v.ok) return { ...base, restoreNotice: INVALID_NOTICE };
  const x = v.value;
  const notices = [legacyZi ? LEGACY_ZI_NOTICE : RESTORED_NOTICE];
  if (styles.malformed) {
    notices.push(styles.valid.length > 0
      ? `저장된 이름 스타일 중 올바르지 않은 값(${styles.dropped})은 제외했습니다. 남은 스타일: ${x.nameStyles.join('·')}.`
      : `저장된 이름 스타일 정보(${styles.dropped})가 올바르지 않아 스타일 선택 없이 불러왔습니다.`);
  }
  if (styles.duplicates) notices.push('중복 저장된 이름 스타일은 하나로 정리했습니다.');
  if (x.nameStyles.length > 0) {
    notices.push(`이전에 고른 이름 스타일(${x.nameStyles.join('·')})이 선택된 상태입니다. 아래 '이름 스타일'에서 확인하거나 해제할 수 있습니다.`);
  }
  return {
    birthDate: x.birthDate, birthHour: legacyZi ? null : x.birthHour, surname: x.surname, gender: x.gender,
    dolrimChar: x.dolrimChar, dolrimPosition: x.dolrimPosition, dolrimHanja: x.dolrimHanja ?? null,
    nameStyles: [...x.nameStyles], images: [...x.images],
    restoreNotice: notices.join(' '),
  };
}

/** Classifies a stored nameStyles value: valid entries, malformed parts, duplicates. */
function inspectStoredStyles(raw: unknown): { valid: string[]; malformed: boolean; dropped: string; duplicates: boolean } {
  const v = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).nameStyles : undefined;
  if (v === undefined) return { valid: [], malformed: false, dropped: '', duplicates: false };
  if (!Array.isArray(v)) return { valid: [], malformed: true, dropped: JSON.stringify(v).slice(0, 40), duplicates: false };
  const valid = v.filter(isNameStyle);
  const bad = v.filter(x => !isNameStyle(x));
  return {
    valid,
    malformed: bad.length > 0,
    dropped: bad.map(x => JSON.stringify(x)).join(', ').slice(0, 60),
    duplicates: uniqueList(valid).length !== valid.length,
  };
}

export interface ModeCFormInit {
  birthDate: string;
  birthHour: number | null; // null: the user must choose (legacy 자시)
  gender: Gender;
  names: string[];
  restoreNotice: string | null;
}

export function loadModeCFormInit(now: Date, storage?: Pick<Storage, 'getItem'>): ModeCFormInit {
  const base: ModeCFormInit = {
    birthDate: defaultBirthDate(now), birthHour: 9, gender: '남', names: ['', ''], restoreNotice: null,
  };
  const read = readStored(MODE_C_STORAGE_KEY, storage);
  if (read.kind === 'empty') return base;
  if (read.kind === 'unreadable') return { ...base, restoreNotice: UNREADABLE_NOTICE };
  const legacyZi = isLegacyZiInput(read.raw);
  const v = validateModeCInput(read.raw, { ignoreTime: legacyZi });
  if (!v.ok) return { ...base, restoreNotice: INVALID_NOTICE };
  const names = v.value.names.filter(n => n.trim());
  return {
    birthDate: v.value.birthDate, birthHour: legacyZi ? null : v.value.birthHour, gender: v.value.gender,
    names: names.length >= 2 ? names : [...names, ''],
    restoreNotice: legacyZi ? LEGACY_ZI_NOTICE : RESTORED_NOTICE,
  };
}
