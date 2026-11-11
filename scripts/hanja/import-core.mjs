// R4 audit R2: safe import of human legal-review records (pure planning + recoverable publish).
// Used by scripts/hanja/import-reviews.mjs and by tests (fs and evaluator are injected).
import path from 'node:path';

export const SCHEMA_VERSION = 1;
export const OFFICIAL_SOURCE_ID = 'court-rule-3151-appendix1';
const JOURNAL = 'legal-import.journal.json';

/** Stable JSON with sorted object keys (record identity for repeated ids). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/**
 * Validates an exported envelope against the current review file and plans the merge.
 * Nothing is written here. Any error -> ok:false (the import is refused as a whole).
 */
export function planImport({ current, envelope, evaluate, pinnedSha }) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) errors.push('envelope: not a JSON object');
  else {
    if (envelope.schemaVersion !== SCHEMA_VERSION) errors.push(`envelope: schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(envelope.schemaVersion)}`);
    if (!envelope.source || envelope.source.id !== OFFICIAL_SOURCE_ID) errors.push(`envelope: source.id must be ${OFFICIAL_SOURCE_ID}`);
    else if (envelope.source.fileSha256 !== pinnedSha) errors.push('envelope: source.fileSha256 differs from the pinned official file');
    if (!Array.isArray(envelope.reviews)) errors.push('envelope: reviews must be an array');
  }
  if (!current || !Array.isArray(current.reviews)) errors.push('current review file is unreadable');
  if (errors.length) return { ok: false, errors };

  const byId = new Map(current.reviews.map(r => [r.id, canonical(r)]));
  const added = [], skipped = [];
  for (const r of envelope.reviews) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) { errors.push('record without a string id'); continue; }
    const c = canonical(r);
    if (byId.has(r.id)) {
      if (byId.get(r.id) === c) { skipped.push(r.id); continue; } // exact duplicate: idempotent
      errors.push(`review id ${r.id} is reused with different content`);
      continue;
    }
    byId.set(r.id, c);
    added.push(r);
  }
  if (errors.length) return { ok: false, errors };
  const merged = [...current.reviews, ...added].sort((a, b) => (a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : a.id.localeCompare(b.id)));
  const outcome = evaluate(merged);
  if (outcome.issues.length) return { ok: false, errors: outcome.issues.map(i => `${i.review ?? '-'}: ${i.code} ${i.message}`) };
  return { ok: true, errors: [], merged, added, skipped, confirmed: outcome.confirmed.map(c => [c.char, c.reading]), unresolved: outcome.unresolved.length };
}

/**
 * Publishes both files recoverably. Two renames are NOT atomic together, so:
 * 1) write both complete temp files, 2) write the journal (temp + rename), 3) rename the
 * temp files over the targets, 4) remove the journal. recover() rolls an interrupted
 * publication forward (journal present) or discards temp files written before the journal.
 */
export function publish({ dir, files, fs }) {
  recover({ dir, fs });
  const entries = Object.keys(files).map(name => ({ target: name, temp: `${name}.importing` }));
  for (const e of entries) fs.writeFileSync(path.join(dir, e.temp), files[e.target]);
  fs.writeFileSync(path.join(dir, `${JOURNAL}.tmp`), JSON.stringify({ entries }));
  fs.renameSync(path.join(dir, `${JOURNAL}.tmp`), path.join(dir, JOURNAL));
  for (const e of entries) fs.renameSync(path.join(dir, e.temp), path.join(dir, e.target));
  fs.unlinkSync(path.join(dir, JOURNAL));
}

export function recover({ dir, fs }) {
  const journal = path.join(dir, JOURNAL);
  if (fs.existsSync(journal)) {
    const { entries } = JSON.parse(fs.readFileSync(journal, 'utf8'));
    for (const e of entries) if (fs.existsSync(path.join(dir, e.temp))) fs.renameSync(path.join(dir, e.temp), path.join(dir, e.target));
    fs.unlinkSync(journal);
    return 'rolled-forward';
  }
  let cleaned = false;
  for (const n of fs.readdirSync(dir)) if (n.endsWith('.importing') || n === `${JOURNAL}.tmp`) { fs.unlinkSync(path.join(dir, n)); cleaned = true; }
  return cleaned ? 'discarded-incomplete' : 'clean';
}

/** True while a publication is unfinished (verify/build refuse this state). */
export function pendingImport({ dir, fs }) {
  return fs.existsSync(path.join(dir, JOURNAL)) || fs.readdirSync(dir).some(n => n.endsWith('.importing'));
}
