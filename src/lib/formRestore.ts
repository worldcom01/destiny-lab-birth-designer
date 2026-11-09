import { Gender, ImageType, NameStyle } from '@/types';
import { validateModeBInput, validateModeCInput } from './inputValidation';
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
  birthHour: number;
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
  const v = validateModeBInput(read.raw);
  if (!v.ok) return { ...base, restoreNotice: INVALID_NOTICE };
  const x = v.value;
  return {
    birthDate: x.birthDate, birthHour: x.birthHour, surname: x.surname, gender: x.gender,
    dolrimChar: x.dolrimChar, dolrimPosition: x.dolrimPosition, dolrimHanja: x.dolrimHanja ?? null,
    nameStyles: [...x.nameStyles], images: [...x.images],
    restoreNotice: RESTORED_NOTICE,
  };
}

export interface ModeCFormInit {
  birthDate: string;
  birthHour: number;
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
  const v = validateModeCInput(read.raw);
  if (!v.ok) return { ...base, restoreNotice: INVALID_NOTICE };
  const names = v.value.names.filter(n => n.trim());
  return {
    birthDate: v.value.birthDate, birthHour: v.value.birthHour, gender: v.value.gender,
    names: names.length >= 2 ? names : [...names, ''],
    restoreNotice: RESTORED_NOTICE,
  };
}
