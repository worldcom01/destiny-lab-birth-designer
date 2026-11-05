import { CalendarRangeError } from './calendar';
import { InputValidationError, RANGE_MESSAGE, Validation } from './inputValidation';

// Loads a stored input, validates it and runs the analysis. Never throws: every
// failure becomes an error state with a Korean recovery message. Stored data is
// never modified or removed here.

export type RecoveryKind = 'missing' | 'corrupt' | 'legacy' | 'invalid' | 'range' | 'analysis';

export interface RecoveryError {
  kind: RecoveryKind;
  title: string;
  details: string[];
}

export type LoadState<I, R> =
  | { status: 'loading' }
  | { status: 'ready'; input: I; data: R }
  | { status: 'error'; error: RecoveryError };

type StorageLike = Pick<Storage, 'getItem'>;

const TITLES: Record<RecoveryKind, string> = {
  missing: '저장된 입력이 없습니다. 입력 화면에서 분석을 다시 시작해주세요.',
  corrupt: '저장된 입력 데이터가 손상되어 읽을 수 없습니다. 입력 화면에서 다시 입력해주세요.',
  legacy: '이전 버전에서 저장된 입력이라 그대로 분석할 수 없습니다.',
  invalid: '저장된 입력이 유효하지 않아 분석하지 않았습니다.',
  range: '분석 가능 기간을 벗어난 날짜·시간이 포함되어 있습니다.',
  analysis: '분석 중 예기치 않은 오류가 발생해 결과를 표시하지 않았습니다.',
};

const fail = (kind: RecoveryKind, details: string[] = []): { status: 'error'; error: RecoveryError } =>
  ({ status: 'error', error: { kind, title: TITLES[kind], details } });

function defaultStorage(): StorageLike | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

export function loadAndRun<I, R>(
  key: string,
  validate: (raw: unknown) => Validation<I>,
  run: (input: I) => R,
  storage?: StorageLike,
): LoadState<I, R> {
  let text: string | null;
  try {
    text = (storage ?? defaultStorage())?.getItem(key) ?? null;
  } catch {
    return fail('corrupt', ['브라우저 저장소에 접근할 수 없습니다.']);
  }
  if (!text) return fail('missing');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('corrupt');
  }

  // Validation runs inside the recovery boundary: a validator that throws on
  // malformed data still ends in an error state, never an endless loading screen.
  try {
    const valid = validate(raw);
    if (!valid.ok) return fail(valid.kind, valid.issues.map(i => i.message));
    return { status: 'ready', input: valid.value, data: run(valid.value) };
  } catch (e) {
    if (e instanceof InputValidationError) return fail(e.kind, e.issues.map(i => i.message));
    if (e instanceof CalendarRangeError) return fail('range', [RANGE_MESSAGE]);
    return fail('analysis');
  }
}
