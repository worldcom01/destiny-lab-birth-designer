// R4.1 curated lexical records: ONLY values found in a cited source, copied as found.
// Korean glosses are never composed or translated here; an English sense stays English.
// PRODUCTION file: only records whose every source is license-cleared. Records citing a
// non-cleared source (e.g. CC BY-SA, pending approval) live in research/overlay.ts, which no
// production module imports (R4 audit L1). See docs/hanja-dictionary.md §9.
import type { MeaningRecord } from '@/lib/hanjaDictionary/types';

export interface CuratedEntry {
  char: string;
  meanings: MeaningRecord[];
  reviewedAt: string;
}

export const CURATED_MEANINGS: CuratedEntry[] = [
  {
    // Regression case (R4.1): the app showed only the legacy gloss "쇠줄 현", for which no
    // source was found. Only the license-cleared Unihan sense is here; the character stays 鉉.
    char: '鉉',
    reviewedAt: '2026-11-11',
    meanings: [
      {
        id: 'U+9249#tripod-carrier',
        lang: 'en',
        text: 'device for carrying a tripod',
        primary: false,
        verification: 'attested',
        evidence: [{ source: 'unihan', locator: 'U+9249 kDefinition', detail: 'device for carrying a tripod' }],
      },
    ],
  },
];
