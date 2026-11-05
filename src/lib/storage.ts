// Writes a validated input to localStorage before navigating to a results page.
// Failures are reported (never swallowed), and no other key is touched.

export type StorageWriteResult = { ok: true } | { ok: false; message: string };

function errorName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
}

export function writeStoredInput(key: string, value: unknown, storage?: Pick<Storage, 'setItem'>): StorageWriteResult {
  try {
    const target = storage ?? window.localStorage; // accessing localStorage itself can throw SecurityError
    target.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    const name = errorName(e);
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return { ok: false, message: '브라우저 저장 공간이 부족해 입력을 저장하지 못했습니다. 사용하지 않는 탭이나 사이트 데이터를 정리한 뒤 다시 시도해주세요.' };
    }
    if (name === 'SecurityError') {
      return { ok: false, message: '브라우저 설정(개인정보 보호 모드, 저장소 차단 등) 때문에 입력을 저장할 수 없습니다. 설정을 확인한 뒤 다시 시도해주세요.' };
    }
    return { ok: false, message: '입력을 브라우저에 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' };
  }
}
