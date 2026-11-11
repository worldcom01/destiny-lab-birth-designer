// R4.1: validates the assembled Hanja dictionary and prints its coverage.
//   node scripts/hanja/verify-dictionary.mjs [--json out.json]
// Exit 1 on any validation issue. Also lists records whose license is not cleared.
import fs from 'node:fs';
import { loadTs } from './load-ts.mjs';
import { pendingImport } from './import-core.mjs';
import { fileURLToPath } from 'node:url';

const [mod, overlay] = await loadTs(['/src/lib/hanjaDictionary/index.ts', '/src/data/hanjaDictionary/research/overlay.ts']);
const ds = mod.buildHanjaDataset();
const research = mod.buildHanjaDataset({ research: { sources: overlay.RESEARCH_SOURCES, meanings: overlay.RESEARCH_MEANINGS } });
const reviewIssues = mod.evaluateDatasetReviews().issues.map(i => ({ char: null, code: `review:${i.code}`, message: i.message }));
if (pendingImport({ dir: fileURLToPath(new URL('../../src/data/hanjaDictionary/', import.meta.url)), fs })) {
  reviewIssues.push({ char: null, code: 'review:import-pending', message: 'an interrupted review import is pending; run import-reviews to recover' });
}
const derived = JSON.parse(fs.readFileSync(new URL('../../src/data/hanjaDictionary/legal-confirmed.json', import.meta.url), 'utf8')).pairs.map(p => p.join('|')).join(',');
const expected = mod.evaluateDatasetReviews().confirmed.map(c => `${c.char}|${c.reading}`).join(',');
// independent cross-check: the assembled dataset's confirmed readings == the derived pairs file
const assembled = ds.entries.flatMap(e => e.readings.filter(r => r.legal).map(r => `${e.char}|${r.hangul}`)).sort().join(',');
if (assembled !== derived.split(',').filter(Boolean).sort().join(',')) reviewIssues.push({ char: null, code: 'review:dataset-confirmed-mismatch', message: 'dataset legal readings differ from legal-confirmed.json' });
if (derived !== expected) reviewIssues.push({ char: null, code: 'review:legal-confirmed-out-of-date', message: 'legal-confirmed.json differs from the review records; run import-reviews' });
const issues = [...mod.validateDataset(ds), ...mod.validateDataset(research).map(i => ({ ...i, dataset: 'research' })), ...reviewIssues];
const official = JSON.parse(fs.readFileSync(new URL('../../src/data/hanjaDictionary/official-structure.json', import.meta.url), 'utf8'));
const src = new Map(ds.sources.map(s => [s.id, s]));
const E = ds.entries;
const readings = E.flatMap(e => e.readings);
const coverage = {
  datasetVersion: ds.version,
  entries: E.length,
  sourceDerivedEntries: E.filter(e => e.verification === 'source-derived').length,
  legacyOnlyEntries: E.filter(e => e.verification === 'legacy-only').length,
  compatibilityIdeographs: E.filter(e => e.char.normalize('NFC') !== e.char).length,
  readingRecords: readings.length,
  distinctReadings: new Set(readings.map(r => r.hangul)).size,
  entriesWithSeveralReadings: E.filter(e => e.readings.length > 1).length,
  readingsWithLegacyEvidenceOnly: E.flatMap(e => e.readings.filter(r => !r.evidence.some(x => src.get(x.source).kind !== 'legacy-app')).map(r => `${r.hangul}/${e.char}`)),
  meaningRecords: {
    attested: E.flatMap(e => e.meanings).filter(m => m.verification === 'attested').length,
    attestedKorean: E.flatMap(e => e.meanings).filter(m => m.verification === 'attested' && m.lang === 'ko').length,
    attestedEnglish: E.flatMap(e => e.meanings).filter(m => m.verification === 'attested' && m.lang === 'en').length,
    legacyUnverified: E.flatMap(e => e.meanings).filter(m => m.verification === 'legacy-unverified').length,
    entriesWithPrimaryKoreanGloss: E.filter(e => e.meanings.some(m => m.primary)).length,
  },
  legal: {
    CONFIRMED: E.filter(e => e.legal.status === 'CONFIRMED').length,
    NOT_CONFIRMED: E.filter(e => e.legal.status === 'NOT_CONFIRMED').length,
    INELIGIBLE: E.filter(e => e.legal.status === 'INELIGIBLE').length,
    withSecondaryNameListIndicator: E.filter(e => e.legal.indicators.length > 0).length,
  },
  strokes: {
    unicodeTotal: E.filter(e => e.strokes.some(s => s.convention === 'unicode-kTotalStrokes')).length,
    legacyApp: E.filter(e => e.strokes.some(s => s.convention === 'legacy-app')).length,
    legacyDiffersFromUnicode: E.filter(e => { const u = e.strokes.find(s => s.convention === 'unicode-kTotalStrokes'); const l = e.strokes.find(s => s.convention === 'legacy-app'); return u && l && u.value !== l.value; }).length,
  },
  variantRelations: E.reduce((n, e) => n + e.variants.length, 0),
  variantTargetsOutsideDataset: E.flatMap(e => e.variants).filter(v => !E.some(x => x.char === v.target)).length,
  productionRecordsCitingNonClearedLicense: E.flatMap(e => [...e.meanings, ...e.readings].filter(r => r.evidence.some(x => src.get(x.source).licenseStatus !== 'cleared'))).length,
  researchOnlyRecords: research.entries.flatMap(e => e.meanings.filter(m => !E.find(x => x.char === e.char)?.meanings.some(p => p.id === m.id)).map(m => `${e.char} ${m.id}`)),
  legalReviews: (() => {
    const o = mod.evaluateDatasetReviews();
    const bySource = {};
    for (const c of o.confirmed) bySource[c.basis] = (bySource[c.basis] ?? 0) + 1;
    return { records: JSON.parse(fs.readFileSync(new URL('../../src/data/hanjaDictionary/legal-reviews.json', import.meta.url), 'utf8')).reviews.length,
      confirmedCharacterReadings: o.confirmed.length, confirmedBySource: bySource, unresolved: o.unresolved.length, invalidRecords: o.issues.length };
  })(),
  official: {
    appendixVersion: official.regulation.appendixVersion,
    appendix1Entries: official.categories.appendix1.entries, appendix1DistinctGlyphs: official.categories.appendix1.distinctGlyphImages,
    appendix1Readings: official.categories.appendix1.readings, appendix2PermittedForms: official.categories.appendix2.permittedForms,
    reconciledTotal: official.reconciliation.total, characterIdentities: official.characterIdentities,
  },
};
const out = { coverage, issues };
const i = process.argv.indexOf('--json');
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
if (!process.argv.includes('--quiet')) console.log(JSON.stringify(coverage, null, 1));
console.log(issues.length ? `INVALID: ${issues.length} issues, e.g. ${JSON.stringify(issues.slice(0, 5))}` : 'VALID: 0 issues');
process.exit(issues.length ? 1 : 0);
