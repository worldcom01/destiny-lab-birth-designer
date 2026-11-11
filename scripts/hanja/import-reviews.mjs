// R4.1B / R4 audit R2: merges human review records exported by the review tool into
// src/data/hanjaDictionary/legal-reviews.json and regenerates legal-confirmed.json.
//
//   node scripts/hanja/import-reviews.mjs <export.json> [--dry-run]
//
// The whole envelope is validated first (schema version, official source and file hash,
// reused ids compared by full content, every record evaluated against the pinned official
// image index). Any error refuses the import and writes nothing. Publication is staged
// and journaled (scripts/hanja/import-core.mjs) so an interruption is recovered on the next run.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './load-ts.mjs';
import { planImport, publish, recover } from './import-core.mjs';

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: import-reviews.mjs <export.json> [--dry-run]'); process.exit(2); }
const DIR = fileURLToPath(new URL('../../src/data/hanjaDictionary/', import.meta.url));
console.log('recovery:', recover({ dir: DIR, fs }));
const [mod] = await loadTs(['/src/lib/hanjaDictionary/index.ts']);
const images = JSON.parse(fs.readFileSync(`${DIR}official-appendix1-images.json`, 'utf8'));
const current = JSON.parse(fs.readFileSync(`${DIR}legal-reviews.json`, 'utf8'));
let envelope;
try { envelope = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`REFUSED: cannot read ${file}: ${e.message}`); process.exit(1); }
const plan = planImport({ current, envelope, evaluate: r => mod.evaluateDatasetReviews(r), pinnedSha: images.fileSha256 });
if (!plan.ok) { console.error('REFUSED (nothing written):\n- ' + plan.errors.join('\n- ')); process.exit(1); }
console.log(JSON.stringify({ added: plan.added.length, skippedIdentical: plan.skipped.length, confirmedPairs: plan.confirmed.length, unresolved: plan.unresolved }, null, 1));
if (flag === '--dry-run') process.exit(0);
const confirmedNote = JSON.parse(fs.readFileSync(`${DIR}legal-confirmed.json`, 'utf8')).note;
publish({ dir: DIR, fs, files: {
  'legal-reviews.json': JSON.stringify({ ...current, reviews: plan.merged }, null, 1) + '\n',
  'legal-confirmed.json': JSON.stringify({ note: confirmedNote, pairs: plan.confirmed }, null, 1) + '\n',
} });
console.log('published');
process.exit(0);
