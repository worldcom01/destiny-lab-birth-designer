// R4.1 Hanja dictionary: dataset assembly, exact-character and reading indexes,
// evidence-aware lookups. Not used by scoring, ranking or the R3.2 storage format.
//
// Layers (in this order; nothing is overwritten, only added with its own evidence):
//   1. Unihan 18.0.0 (readings with KS X 1001 / 교육용 / 인명용 flags, stroke totals,
//      English definition, variant relations) — Unicode License v3.
//   2. the app's legacy table (src/data/hanjaDB.ts): its gloss, syllable and stroke value
//      are kept as LEGACY-UNVERIFIED records, never as verified ones.
//   3. curated attested meanings (src/data/hanjaDictionary/curated.ts).
// Keys are exact code points: compatibility ideographs (e.g. U+F914 樂) are never
// normalised to their unified counterparts.
import unihan from '@/data/hanjaDictionary/unihan-korean.json';
import { HANJA_DB } from '@/data/hanjaDB';
import { HANJA_DICTIONARY_SOURCES } from '@/data/hanjaDictionary/sources';
import { CURATED_MEANINGS, CuratedEntry } from '@/data/hanjaDictionary/curated';
import legalReviewFile from '@/data/hanjaDictionary/legal-reviews.json';
import officialImages from '@/data/hanjaDictionary/official-appendix1-images.json';
import { evaluateLegalReviews, initialSoundReading, LegalReview, OfficialImageIndex, ReviewOutcome } from './legalReviews';
import type { Evidence, HanjaDataset, HanjaEntry, LegalStatus, MeaningRecord, ReadingRecord, SourceRef, VariantType } from './types';
import { codePointOf, isSingleHanChar, validateDataset } from './validate';

export * from './types';
export * from './legalReviews';
export { validateDataset, isSingleHanChar, codePointOf } from './validate';

export const HANJA_DICTIONARY_VERSION = 'r4.1-2026-11-11+unihan-18.0.0';
const REVIEWED = '2026-11-11';

type UnihanRow = [string, string, number | null, string | null, string | null, string | null, Record<string, string[]> | null];
const VARIANT_FIELD: Record<string, VariantType> = {
  kCompatibilityVariant: 'compatibility', kSemanticVariant: 'semantic', kSpecializedSemanticVariant: 'specialized-semantic',
  kZVariant: 'z', kSimplifiedVariant: 'simplified', kTraditionalVariant: 'traditional',
};

function fromUnihan(row: UnihanRow): HanjaEntry {
  const [cp, hangul, strokes, , definition, nameList, variants] = row;
  const char = String.fromCodePoint(parseInt(cp.slice(2), 16));
  const readings: ReadingRecord[] = hangul.split(' ').map(x => {
    const [h] = x.split(':');
    return { hangul: h, evidence: [{ source: 'unihan', locator: `${cp} kHangul`, detail: x }] };
  });
  // Unihan E (한문 교육용 기초 한자) / N (인명용 한자) flags are SECONDARY indicators of the
  // personal-name list (Article 37(1)1 and 37(1)2); they reflect the 2015/2018 lists
  // (kKoreanName), not the current official table, so they never confirm eligibility.
  const nameFlags = hangul.split(' ').filter(x => /:[0-9]*[EN]/.test(x));
  return {
    char, codePoint: cp, readings,
    meanings: definition ? [{
      id: `${cp}#unihan-definition`, lang: 'en', text: definition, primary: false, verification: 'attested',
      evidence: [{ source: 'unihan', locator: `${cp} kDefinition`, detail: definition }],
    }] : [],
    strokes: strokes ? [{ value: strokes, convention: 'unicode-kTotalStrokes', evidence: [{ source: 'unihan', locator: `${cp} kTotalStrokes`, detail: String(strokes) }] }] : [],
    // Unihan lists a character as its own simplified/traditional form when it is both
    // (UAX #38); that is not a relation between two characters, so it is not recorded.
    variants: Object.entries(variants ?? {}).flatMap(([field, targets]) => targets.filter(t => t !== char).map(target => ({
      type: VARIANT_FIELD[field], target, evidence: [{ source: 'unihan', locator: `${cp} ${field}`, detail: target }],
    }))),
    legal: {
      status: 'NOT_CONFIRMED', evidence: [],
      indicators: nameFlags.length ? [{ source: 'unihan', locator: `${cp} kHangul${nameList ? ` / kKoreanName ${nameList}` : ''}`, detail: nameFlags.join(' ') }] : [],
    },
    verification: 'source-derived',
    reviewedAt: REVIEWED,
  };
}

export interface BuildOptions {
  /**
   * Research overlay (tests/scripts only; see data/hanjaDictionary/research/overlay.ts).
   * Records citing a non-cleared source are included ONLY when passed here; production code
   * never imports the overlay, so they are absent from shipped JavaScript (R4 audit L1).
   */
  research?: { sources: SourceRef[]; meanings: CuratedEntry[] };
  /** review records to apply (default: src/data/hanjaDictionary/legal-reviews.json) */
  legalReviews?: LegalReview[];
}

/** The review outcome for the default (or given) review records — confirmations, unresolved items, issues. */
export function evaluateDatasetReviews(reviews: LegalReview[] = (legalReviewFile as { reviews: LegalReview[] }).reviews): ReviewOutcome {
  return evaluateLegalReviews(reviews, officialImages as unknown as OfficialImageIndex);
}

/** Assembles the layered dataset (pure; no I/O). */
export function buildHanjaDataset(options: BuildOptions = {}): HanjaDataset {
  const registry = [...HANJA_DICTIONARY_SOURCES, ...(options.research?.sources ?? [])];
  const cleared = new Set(registry.filter(x => x.licenseStatus === 'cleared').map(x => x.id));
  const allowed = (m: MeaningRecord) => options.research
    ? m.evidence.every(e => { const st = registry.find(x => x.id === e.source)?.licenseStatus; return st !== undefined && st !== 'restricted'; })
    : m.evidence.every(e => cleared.has(e.source));
  const byChar = new Map<string, HanjaEntry>();
  for (const row of (unihan as unknown as { rows: UnihanRow[] }).rows) {
    const e = fromUnihan(row);
    byChar.set(e.char, e);
  }
  for (const [syllable, options] of Object.entries(HANJA_DB)) {
    for (const o of options) {
      const cp = codePointOf(o.hanja);
      let e = byChar.get(o.hanja);
      if (!e) {
        e = { char: o.hanja, codePoint: cp, readings: [], meanings: [], strokes: [], variants: [],
          legal: { status: 'NOT_CONFIRMED', evidence: [], indicators: [] }, verification: 'legacy-only', reviewedAt: REVIEWED };
        byChar.set(o.hanja, e);
      }
      const legacy: Evidence = { source: 'legacy-hanjadb', locator: `HANJA_DB['${syllable}']`, detail: `${o.hanja} ${o.meaning} ${o.strokes}획` };
      const reading = e.readings.find(r => r.hangul === syllable);
      if (reading) reading.evidence.push(legacy);
      else e.readings.push({ hangul: syllable, evidence: [legacy] }); // e.g. 빛/光: kept, but only legacy evidence
      e.meanings.push({ id: `${cp}#legacy`, lang: 'ko', text: o.meaning, primary: false, verification: 'legacy-unverified', evidence: [legacy] });
      e.strokes.push({ value: o.strokes, convention: 'legacy-app', evidence: [legacy] });
    }
  }
  for (const c of [...CURATED_MEANINGS, ...(options.research?.meanings ?? [])]) {
    const e = byChar.get(c.char);
    if (!e) throw new Error(`curated entry ${c.char} has no base entry`);
    for (const m of c.meanings.filter(allowed)) {
      const dup = e.meanings.findIndex(x => x.lang === m.lang && x.text === m.text && x.verification === 'attested');
      if (dup >= 0) e.meanings.splice(dup, 1, { ...m, evidence: [...m.evidence] }); // same sense from Unihan: one record
      else e.meanings.push(m);
    }
    e.reviewedAt = c.reviewedAt;
  }
  // R4.1B: human-reviewed legal confirmations, per (character, reading); fail closed.
  // R4 audit R1: invalid review records stop the assembly instead of being skipped.
  const reviewOutcome = evaluateDatasetReviews(options.legalReviews);
  if (reviewOutcome.issues.length) {
    throw new Error(`invalid legal review records (${reviewOutcome.issues.length}): ${reviewOutcome.issues.slice(0, 3).map(i => `${i.review ?? '-'} ${i.code}`).join('; ')}`);
  }
  for (const c of reviewOutcome.confirmed) {
    let e = byChar.get(c.char);
    if (!e) { // an official character without a Unihan Korean reading: kept with official evidence only
      e = { char: c.char, codePoint: codePointOf(c.char), readings: [], meanings: [], strokes: [], variants: [],
        legal: { status: 'NOT_CONFIRMED', evidence: [], indicators: [] }, verification: 'source-derived', reviewedAt: REVIEWED };
      byChar.set(c.char, e);
    }
    let r = e.readings.find(x => x.hangul === c.reading);
    if (!r) { r = { hangul: c.reading, evidence: [...c.evidence] }; e.readings.push(r); }
    r.legal = { status: 'CONFIRMED', basis: c.basis, evidence: c.evidence };
    e.legal = { status: 'CONFIRMED', evidence: [...e.legal.evidence, ...c.evidence], indicators: e.legal.indicators };
  }
  const used = new Set<string>();
  for (const e of byChar.values()) for (const ev of [...e.readings, ...e.meanings, ...e.strokes, ...e.variants].flatMap(r => r.evidence)) used.add(ev.source);
  return {
    version: options.research ? `${HANJA_DICTIONARY_VERSION}+research` : HANJA_DICTIONARY_VERSION,
    // official sources are registered for structure/notes even when no record cites them yet
    sources: registry.filter(x => used.has(x.id) || x.kind === 'official-legal'),
    entries: [...byChar.values()].sort((a, b) => a.char.codePointAt(0)! - b.char.codePointAt(0)!),
  };
}

export interface HanjaDictionary {
  dataset: HanjaDataset;
  /** exact character lookup (no normalisation, no variant folding) */
  get(char: string): HanjaEntry | undefined;
  /** characters having this Hangul reading, each with the kind of evidence for that reading */
  byReading(hangul: string): { char: string; evidence: Evidence[] }[];
  /** the attested primary Korean gloss, or null (a legacy gloss is never returned here) */
  primaryMeaning(char: string): MeaningRecord | null;
  /** every meaning record (attested and legacy), primary first */
  meanings(char: string): MeaningRecord[];
  legalStatus(char: string): { status: LegalStatus; indicators: Evidence[]; known: boolean };
  /**
   * Legal status of one READING of a character: confirmed by review ('table'/'lookup'), or
   * derived from a confirmed reading by the official note-1 initial-sound rule; otherwise
   * NOT_CONFIRMED. A confirmed character never makes another reading confirmed by itself.
   */
  legalReading(char: string, reading: string): { status: LegalStatus; basis: 'appendix1-image-review' | 'court-lookup-review' | 'initial-sound-rule' | null; from?: string };
}

export function createHanjaDictionary(dataset: HanjaDataset = buildHanjaDataset()): HanjaDictionary {
  // a restricted source must never be part of any dataset
  const restricted = dataset.sources.filter(x => x.licenseStatus === 'restricted').map(x => x.id);
  if (restricted.length) throw new Error(`restricted sources in dataset: ${restricted.join(', ')}`);
  const issues = validateDataset(dataset);
  if (issues.length) throw new Error(`invalid Hanja dataset: ${issues.slice(0, 5).map(i => `${i.char ?? '-'} ${i.code}`).join('; ')}${issues.length > 5 ? ` (+${issues.length - 5})` : ''}`);
  const byChar = new Map(dataset.entries.map(e => [e.char, e]));
  const reading = new Map<string, { char: string; evidence: Evidence[] }[]>();
  for (const e of dataset.entries) for (const r of e.readings) {
    if (!reading.has(r.hangul)) reading.set(r.hangul, []);
    reading.get(r.hangul)!.push({ char: e.char, evidence: r.evidence });
  }
  return {
    dataset,
    get: char => (isSingleHanChar(char) ? byChar.get(char) : undefined),
    byReading: hangul => reading.get(hangul) ?? [],
    primaryMeaning: char => byChar.get(char)?.meanings.find(m => m.primary) ?? null,
    meanings: char => [...(byChar.get(char)?.meanings ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary)),
    legalReading: (char, reading) => {
      const e = byChar.get(char);
      const direct = e?.readings.find(r => r.hangul === reading && r.legal);
      if (direct) return { status: 'CONFIRMED', basis: direct.legal!.basis };
      const base = e?.readings.find(r => r.legal && initialSoundReading(r.hangul) === reading);
      if (base) return { status: 'CONFIRMED', basis: 'initial-sound-rule', from: base.hangul };
      return { status: 'NOT_CONFIRMED', basis: null };
    },
    legalStatus: char => {
      const e = byChar.get(char);
      return e ? { status: e.legal.status, indicators: e.legal.indicators, known: true } : { status: 'NOT_CONFIRMED', indicators: [], known: false };
    },
  };
}

let shared: HanjaDictionary | null = null;
/** Lazily built shared PRODUCTION dictionary (license-cleared records only; validated once). */
export function getHanjaDictionary(): HanjaDictionary {
  return (shared ??= createHanjaDictionary());
}
