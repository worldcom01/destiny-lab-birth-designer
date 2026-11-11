// R4.1 dataset validation: rejects malformed characters, duplicates, conflicting
// definitions, missing provenance and invalid relation references.
import type { Evidence, HanjaDataset, SourceRef } from './types';

const HAN_CHAR = /^\p{Script=Han}$/u;
const HANGUL_SYLLABLE = /^[가-힣]$/;
const CODE_POINT = /^U\+[0-9A-F]{4,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VARIANT_TYPES = new Set(['compatibility', 'semantic', 'specialized-semantic', 'z', 'simplified', 'traditional']);
const CONVENTIONS = new Set(['unicode-kTotalStrokes', 'legacy-app']);

export const codePointOf = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

/** Exactly one Han code point (well-formed UTF-16; compatibility ideographs are kept as themselves). */
export function isSingleHanChar(v: unknown): v is string {
  return typeof v === 'string' && v.isWellFormed() && [...v].length === 1 && HAN_CHAR.test(v);
}

export interface ValidationIssue { char: string | null; code: string; message: string }

export function validateDataset(ds: HanjaDataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (char: string | null, code: string, message: string) => issues.push({ char, code, message });
  if (typeof ds.version !== 'string' || !ds.version) err(null, 'dataset-version', 'missing dataset version');

  const sources = new Map<string, SourceRef>();
  for (const s of ds.sources) {
    if (sources.has(s.id)) err(null, 'duplicate-source', `source ${s.id} defined twice`);
    if (!s.publisher || !s.locator || !s.version || !s.license || !DATE.test(s.retrieved)) err(null, 'source-incomplete', `source ${s.id} lacks publisher/locator/version/license/retrieved`);
    sources.set(s.id, s);
  }
  const checkEvidence = (char: string, what: string, ev: Evidence[] | undefined) => {
    if (!ev || ev.length === 0) { err(char, 'missing-provenance', `${what} has no evidence`); return; }
    for (const e of ev) if (!sources.has(e.source)) err(char, 'unknown-source', `${what} cites unknown source ${e.source}`);
  };

  const seen = new Set<string>();
  for (const e of ds.entries) {
    const ch = e.char;
    if (!isSingleHanChar(ch)) { err(typeof ch === 'string' ? ch : null, 'malformed-character', `not a single well-formed Han character: ${JSON.stringify(ch)}`); continue; }
    if (seen.has(ch)) err(ch, 'duplicate-entry', `${ch} (${codePointOf(ch)}) defined twice`);
    seen.add(ch);
    if (!CODE_POINT.test(e.codePoint) || e.codePoint !== codePointOf(ch)) err(ch, 'code-point-mismatch', `${e.codePoint} does not match ${codePointOf(ch)}`);
    if (!DATE.test(e.reviewedAt)) err(ch, 'review-date', 'missing review date');

    const readings = new Set<string>();
    for (const r of e.readings) {
      if (!HANGUL_SYLLABLE.test(r.hangul)) err(ch, 'malformed-reading', `reading ${JSON.stringify(r.hangul)} is not one Hangul syllable`);
      if (readings.has(r.hangul)) err(ch, 'duplicate-reading', `reading ${r.hangul} listed twice`);
      readings.add(r.hangul);
      checkEvidence(ch, `reading ${r.hangul}`, r.evidence);
      if (r.legal) {
        if (r.legal.status !== 'CONFIRMED') err(ch, 'reading-legal-status', `reading ${r.hangul}: unknown legal status`);
        if (!r.legal.evidence.length || !r.legal.evidence.every(x => sources.get(x.source)?.kind === 'official-legal')) {
          err(ch, 'reading-legal-without-official-evidence', `reading ${r.hangul} confirmed without official legal evidence`);
        }
      }
    }
    const confirmedReadings = e.readings.filter(r => r.legal).length;
    if ((e.legal.status === 'CONFIRMED') !== (confirmedReadings > 0)) {
      err(ch, 'legal-reading-inconsistent', `character status ${e.legal.status} but ${confirmedReadings} confirmed reading(s)`);
    }

    const ids = new Set<string>();
    const texts = new Set<string>();
    let primaries = 0;
    for (const m of e.meanings) {
      if (!m.id.startsWith(`${e.codePoint}#`)) err(ch, 'meaning-id', `meaning id ${m.id} does not belong to ${e.codePoint}`);
      if (ids.has(m.id)) err(ch, 'duplicate-meaning-id', `meaning id ${m.id} used twice`);
      ids.add(m.id);
      const key = `${m.lang}\u0000${m.text.trim()}`;
      if (texts.has(key)) err(ch, 'duplicate-meaning', `meaning "${m.text}" (${m.lang}) listed twice`);
      texts.add(key);
      if (!m.text.trim()) err(ch, 'empty-meaning', `meaning ${m.id} is empty`);
      if (m.primary) {
        primaries++;
        if (m.verification !== 'attested' || m.lang !== 'ko') err(ch, 'primary-not-attested', `primary meaning ${m.id} must be an attested Korean gloss`);
      }
      if (m.verification === 'attested' && m.evidence.some(x => sources.get(x.source)?.kind === 'legacy-app')) {
        err(ch, 'legacy-as-attested', `meaning ${m.id} is marked attested but cites the undocumented legacy table`);
      }
      checkEvidence(ch, `meaning ${m.id}`, m.evidence);
    }
    if (primaries > 1) err(ch, 'conflicting-primary', `${primaries} primary meanings`);

    const byConvention = new Map<string, number>();
    for (const s of e.strokes) {
      if (!Number.isInteger(s.value) || s.value < 1 || s.value > 84) err(ch, 'stroke-range', `stroke count ${s.value} out of range`);
      if (!CONVENTIONS.has(s.convention)) err(ch, 'stroke-convention', `unknown stroke convention ${s.convention}`);
      const prev = byConvention.get(s.convention);
      if (prev !== undefined && prev !== s.value) err(ch, 'conflicting-strokes', `${s.convention}: ${prev} vs ${s.value}`);
      byConvention.set(s.convention, s.value);
      checkEvidence(ch, `strokes (${s.convention})`, s.evidence);
    }

    for (const v of e.variants) {
      if (!VARIANT_TYPES.has(v.type)) err(ch, 'variant-type', `unknown variant type ${v.type}`);
      if (!isSingleHanChar(v.target)) err(ch, 'invalid-relation', `variant target ${JSON.stringify(v.target)} is not a Han character`);
      else if (v.target === ch) err(ch, 'self-relation', `${v.type} variant points to itself`);
      checkEvidence(ch, `${v.type} variant ${v.target}`, v.evidence);
    }

    const legal = e.legal;
    if (!['CONFIRMED', 'NOT_CONFIRMED', 'INELIGIBLE'].includes(legal.status)) err(ch, 'legal-status', `unknown legal status ${legal.status}`);
    if (legal.status !== 'NOT_CONFIRMED') {
      // CONFIRMED / INELIGIBLE only from official legal evidence, never from dictionaries or Unicode data
      const official = legal.evidence.filter(x => sources.get(x.source)?.kind === 'official-legal');
      if (official.length === 0) err(ch, 'legal-without-official-evidence', `${legal.status} requires official legal evidence`);
    }
    for (const x of legal.indicators) checkEvidence(ch, 'legal indicator', [x]);
    if (e.verification === 'source-derived' && !e.readings.some(r => r.evidence.some(x => sources.get(x.source)?.kind !== 'legacy-app'))) {
      err(ch, 'source-derived-without-source', 'marked source-derived but no reading cites a non-legacy source');
    }
  }
  return issues;
}
