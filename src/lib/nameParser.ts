// Splits a user-entered Korean full name into surname and given name.
// A space always wins: "남궁 민", "남 궁민". Without a space, a leading compound
// surname is used when the rest is 2-3 syllables; "compound surname + 1 syllable"
// (e.g. 남궁민 = 남궁+민 or 남+궁민) is ambiguous and must be entered with a space.

export const COMPOUND_SURNAMES = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문', '동방'] as const;

export type ParsedName =
  | { ok: true; surname: string; given: string }
  | { ok: false; reason: 'empty' | 'not-hangul' | 'ambiguous' | 'length'; message: string };

const HANGUL_SYLLABLES = /^[가-힣]+$/;

const fail = (reason: Exclude<ParsedName, { ok: true }>['reason'], message: string): ParsedName =>
  ({ ok: false, reason, message });

function shape(surname: string, given: string): ParsedName {
  if (surname.length < 1 || surname.length > 2) return fail('length', '성은 1~2글자여야 합니다');
  if (given.length < 1 || given.length > 3) return fail('length', '이름은 1~3글자여야 합니다');
  return { ok: true, surname, given };
}

export function parseKoreanName(raw: string): ParsedName {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return fail('empty', '이름이 비어 있습니다');

  const parts = text.split(' ');
  if (!parts.every(p => HANGUL_SYLLABLES.test(p))) {
    return fail('not-hangul', '한글 완성형 글자만 입력할 수 있습니다');
  }
  if (parts.length === 2) return shape(parts[0], parts[1]);
  if (parts.length > 2) return fail('length', '성과 이름 사이에 띄어쓰기는 한 번만 넣어 주세요');

  const n = text.length;
  const compound = n >= 3 && (COMPOUND_SURNAMES as readonly string[]).includes(text.slice(0, 2));
  if (n === 2) return shape(text.slice(0, 1), text.slice(1));
  if (n === 3 && compound) {
    return fail('ambiguous', `성과 이름을 띄어 써 주세요 (예: ${text.slice(0, 2)} ${text.slice(2)} / ${text.slice(0, 1)} ${text.slice(1)})`);
  }
  if (compound) return shape(text.slice(0, 2), text.slice(2));
  return shape(text.slice(0, 1), text.slice(1));
}
