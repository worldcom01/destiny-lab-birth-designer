// R4.1 Hanja dictionary model (source-traceable). See docs/hanja-dictionary.md.
//
// The identity of a Hanja is its exact Unicode code point. Readings, meanings,
// stroke counts, variant relations and legal eligibility are attributes with
// their own evidence; none of them changes the identity, and nothing here is
// used by scoring or ranking (the app's scoring source stays src/data/hanjaDB.ts).

/** Legal eligibility for personal names (가족관계의 등록 등에 관한 규칙 제37조). */
export type LegalStatus =
  | 'CONFIRMED'      // official evidence (the rule's 별표 / court lookup) lists this character
  | 'NOT_CONFIRMED'  // no official evidence attached (secondary indicators may exist)
  | 'INELIGIBLE';    // official evidence shows it is not usable

export type LicenseStatus =
  | 'cleared'           // license allows redistribution in this repository (conditions recorded)
  | 'pending-approval'  // reuse depends on a license decision not yet made by the project owner
  | 'restricted';       // must not be redistributed; reference only

export interface SourceRef {
  id: string;
  publisher: string;
  title: string;
  /** URL or document identifier */
  locator: string;
  /** version / revision / effective date as published */
  version: string;
  /** date the source was read for this dataset (YYYY-MM-DD) */
  retrieved: string;
  license: string;
  licenseStatus: LicenseStatus;
  /** official sources may establish legal status; lexical/community ones never do */
  kind: 'official-legal' | 'standard-data' | 'community-lexical' | 'classical-reference' | 'legacy-app';
}

export interface Evidence {
  source: string;     // SourceRef.id
  locator?: string;   // field / page / entry inside the source
  detail?: string;    // verbatim value or short quote as found
}

export interface ReadingRecord {
  /** one Hangul syllable */
  hangul: string;
  evidence: Evidence[];
  /** R4.1B: legal confirmation of THIS reading for this character (human review of official evidence) */
  legal?: { status: 'CONFIRMED'; basis: 'appendix1-image-review' | 'court-lookup-review'; evidence: Evidence[] };
}

export interface MeaningRecord {
  /** stable id: `<codePoint>#<slug>`; independent of display order */
  id: string;
  lang: 'ko' | 'en';
  text: string;
  /** at most one primary meaning per entry; it must be an attested Korean gloss */
  primary: boolean;
  verification: 'attested' | 'legacy-unverified';
  evidence: Evidence[];
}

export type StrokeConvention =
  | 'unicode-kTotalStrokes'  // Unihan kTotalStrokes (first value)
  | 'legacy-app';            // src/data/hanjaDB.ts value; counting convention undocumented

export interface StrokeRecord {
  value: number;
  convention: StrokeConvention;
  evidence: Evidence[];
}

export type VariantType = 'compatibility' | 'semantic' | 'specialized-semantic' | 'z' | 'simplified' | 'traditional';

export interface VariantRelation {
  type: VariantType;
  /** exact target character (never merged with the entry) */
  target: string;
  evidence: Evidence[];
}

export interface LegalRecord {
  status: LegalStatus;
  evidence: Evidence[];
  /** secondary signals that never establish the status by themselves */
  indicators: Evidence[];
}

export interface HanjaEntry {
  char: string;
  /** 'U+9249' */
  codePoint: string;
  readings: ReadingRecord[];
  meanings: MeaningRecord[];
  strokes: StrokeRecord[];
  variants: VariantRelation[];
  legal: LegalRecord;
  /** 'source-derived': built from cited data; 'legacy-only': only the app's undocumented table */
  verification: 'source-derived' | 'legacy-only';
  reviewedAt: string;
}

export interface HanjaDataset {
  version: string;
  sources: SourceRef[];
  entries: HanjaEntry[];
}
