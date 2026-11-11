// R4.2 Hanja search for the result-card picker (pure; runs on a loaded HanjaDictionary).
//
// Search finds characters; SELECTION stays restricted (see selectionEligibility): only the
// legacy option table and human-confirmed legal readings are selectable. Everything else
// is shown for discovery with the reason it cannot be chosen. Characters are matched by
// exact code point; nothing is normalised, folded to a variant or substituted.
import type { HanjaDictionary, LegalStatus, MeaningRecord } from '@/lib/hanjaDictionary';
import { initialSoundReading } from '@/lib/hanjaDictionary/legalReviews';
import { SelectionEligibility, isSelectableEligibility, selectionEligibility } from '@/lib/hanjaModel';

export type SearchMode = 'auto' | 'character' | 'reading' | 'meaning';
export type ResolvedMode = Exclude<SearchMode, 'auto'>;

export interface ReadingInfo {
  hangul: string;
  /** Unihan kHangul detail, e.g. "현:0N" (secondary indicator) */
  unihan: string | null;
  /** listed in the app's legacy option table */
  legacy: boolean;
  /** legally confirmed by human review (this reading) */
  legal: boolean;
}

export interface SearchResult {
  char: string;
  codePoint: string;
  inDictionary: boolean;
  readings: ReadingInfo[];
  /** eligibility for the syllable being chosen */
  eligibility: SelectionEligibility;
  selectable: boolean;
  /** the dictionary documents this syllable as a reading of the character (Unihan, legacy or legal) */
  readingDocumented: boolean;
  legal: { status: LegalStatus; basis: string | null };
  meanings: {
    /** attested primary Korean gloss (production: license-cleared only) */
    primary: MeaningRecord | null;
    /** every attested Korean meaning, primary first */
    verifiedKorean: MeaningRecord[];
    /** attested English definitions (Unicode Unihan), reference only */
    english: MeaningRecord[];
    /** pre-R4 glosses without a source */
    legacy: MeaningRecord[];
  };
  matchedBy: 'character' | 'reading' | 'verified-meaning' | 'legacy-meaning';
}

export interface SearchOutcome {
  mode: ResolvedMode;
  query: string;
  results: SearchResult[];
  /** queried characters that are not in the dictionary (kept exactly as typed) */
  notInDictionary: string[];
}

const HAN = /\p{Script=Han}/u;
const SYLLABLE = /^[가-힣]$/;

export function resolveMode(query: string, mode: SearchMode): ResolvedMode {
  if (mode !== 'auto') return mode;
  if (HAN.test(query)) return 'character';
  if (SYLLABLE.test(query.trim())) return 'reading';
  return 'meaning';
}

function describe(dict: HanjaDictionary, syllable: string, char: string, matchedBy: SearchResult['matchedBy']): SearchResult {
  const e = dict.get(char);
  const readings: ReadingInfo[] = (e?.readings ?? []).map(r => ({
    hangul: r.hangul,
    unihan: r.evidence.find(x => x.source === 'unihan')?.detail ?? null,
    legacy: r.evidence.some(x => x.source === 'legacy-hanjadb'),
    legal: !!r.legal,
  }));
  const eligibility = selectionEligibility(syllable, char);
  const documented = readings.some(r => r.hangul === syllable || initialSoundReading(r.hangul) === syllable);
  const meanings = e?.meanings ?? [];
  const verifiedKorean = meanings.filter(m => m.verification === 'attested' && m.lang === 'ko').sort((a, b) => Number(b.primary) - Number(a.primary));
  return {
    char, codePoint: `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`, inDictionary: !!e,
    readings, eligibility, selectable: isSelectableEligibility(eligibility), readingDocumented: documented,
    legal: (() => { const l = dict.legalReading(char, syllable); return { status: l.status, basis: l.basis }; })(),
    meanings: {
      primary: verifiedKorean.find(m => m.primary) ?? null,
      verifiedKorean,
      english: meanings.filter(m => m.verification === 'attested' && m.lang === 'en'),
      legacy: meanings.filter(m => m.verification === 'legacy-unverified'),
    },
    matchedBy,
  };
}

const rank = (r: SearchResult) => (r.selectable ? 0 : 4) + (r.legal.status === 'CONFIRMED' ? 0 : 2) + (r.readingDocumented ? 0 : 1);

export function searchHanja(dict: HanjaDictionary, syllable: string, rawQuery: string, mode: SearchMode = 'auto', limit = 200): SearchOutcome {
  const query = rawQuery.trim();
  const resolved = resolveMode(query, mode);
  const out: SearchOutcome = { mode: resolved, query, results: [], notInDictionary: [] };
  if (!query) return out;
  if (resolved === 'character') {
    const seen = new Set<string>();
    for (const ch of query) {
      if (!HAN.test(ch) || seen.has(ch)) continue;
      seen.add(ch);
      if (!dict.get(ch)) out.notInDictionary.push(ch);
      out.results.push(describe(dict, syllable, ch, 'character'));
    }
    return out;
  }
  if (resolved === 'reading') {
    if (!SYLLABLE.test(query)) return out;
    const chars = new Set<string>();
    for (const x of dict.byReading(query)) chars.add(x.char);
    // official note 1: a ㄴ/ㄹ-initial reading may be used in its pronounced form (e.g. 률 → 율)
    for (const e of dict.dataset.entries) if (e.readings.some(r => initialSoundReading(r.hangul) === query)) chars.add(e.char);
    out.results = [...chars].map(c => describe(dict, syllable, c, 'reading'))
      .sort((a, b) => rank(a) - rank(b) || a.char.codePointAt(0)! - b.char.codePointAt(0)!).slice(0, limit);
    return out;
  }
  // meaning search: attested Korean meanings first, then legacy glosses (labelled as such)
  const verified: SearchResult[] = [], legacy: SearchResult[] = [];
  for (const e of dict.dataset.entries) {
    if (e.meanings.some(m => m.verification === 'attested' && m.lang === 'ko' && m.text.includes(query))) verified.push(describe(dict, syllable, e.char, 'verified-meaning'));
    else if (e.meanings.some(m => m.verification === 'legacy-unverified' && m.text.includes(query))) legacy.push(describe(dict, syllable, e.char, 'legacy-meaning'));
  }
  out.results = [...verified, ...legacy.sort((a, b) => rank(a) - rank(b))].slice(0, limit);
  return out;
}

/** Why a search result cannot be selected for this syllable (null when it can). */
export function unavailableReason(r: SearchResult, syllable: string): string | null {
  if (r.selectable) return null;
  if (!r.inDictionary) return '사전에 없는 글자입니다. 음과 인명용 여부를 확인할 근거가 없어 선택할 수 없습니다.';
  if (r.eligibility === 'reading-mismatch' || !r.readingDocumented) {
    const rs = r.readings.map(x => x.hangul).join('·');
    return `'${syllable}'으로 읽는 근거가 없습니다${rs ? ` (기록된 음: ${rs})` : ''}. 이 음절에는 선택할 수 없습니다.`;
  }
  return `'${syllable}' 음은 Unicode 자료에 있지만 인명용 여부가 공식 확인되지 않아 아직 선택할 수 없습니다. 공식 확인(검토) 후 선택할 수 있습니다.`;
}

export const LEGAL_LABEL: Record<LegalStatus, string> = {
  CONFIRMED: '인명용 확인됨',
  NOT_CONFIRMED: '인명용 미확인',
  INELIGIBLE: '인명용 아님(공식 근거)',
};
export const NOT_CONFIRMED_NOTICE = '인명용 여부가 공식 확인되지 않았습니다. 출생신고 전에 대법원 전자가족관계등록시스템의 인명용 한자 조회 등으로 확인해야 합니다.';
