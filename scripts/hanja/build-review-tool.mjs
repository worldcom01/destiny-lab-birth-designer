// R4.1B: builds the offline HUMAN review tool for legal (character, reading) verification.
//
//   node scripts/hanja/build-review-tool.mjs <appendix1.hwpx> <outDir> [--suggestions suggestions.tsv]
//
// Writes <outDir>/index.html, <outDir>/queue.json and <outDir>/img/*.bmp (official glyph
// images extracted from the pinned HWPX). Open index.html in a browser; decisions are kept
// in that browser (localStorage) and exported as JSON, then merged with
// scripts/hanja/import-reviews.mjs. Machine suggestions (glyph-suggest.swift) only ORDER
// candidates; nothing is ever pre-selected or confirmed automatically.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadTs } from './load-ts.mjs';

const args = process.argv.slice(2);
const [hwpx, outDir] = args;
const si = args.indexOf('--suggestions');
if (!hwpx || !outDir) { console.error('usage: build-review-tool.mjs <appendix1.hwpx> <outDir> [--suggestions file.tsv]'); process.exit(2); }

const [db, chars, dictMod, queueMod] = await loadTs([
  '/src/data/hanjaDB.ts', '/src/data/nameChars.ts', '/src/lib/hanjaDictionary/index.ts', '/src/lib/hanjaDictionary/reviewQueue.ts',
]);
const images = JSON.parse(fs.readFileSync(new URL('../../src/data/hanjaDictionary/official-appendix1-images.json', import.meta.url), 'utf8'));
const sha = crypto.createHash('sha256').update(fs.readFileSync(hwpx)).digest('hex');
if (sha !== images.fileSha256) { console.error(`HWPX sha256 ${sha} != pinned ${images.fileSha256}`); process.exit(1); }

const dictionary = dictMod.getHanjaDictionary();
const appPairs = Object.entries(db.HANJA_DB).flatMap(([syl, opts]) => opts.map(o => [syl, o.hanja]));
const profiles = Object.values(chars).find(v => Array.isArray(v) && v[0]?.hangul && 'modernity' in v[0]) ?? [];
const profilePairs = profiles.filter(p => /^\p{Script=Han}$/u.test(p.hanja)).map(p => [p.hangul, p.hanja]);
const reported = [['현', '鉉']];
const queue = queueMod.buildReviewQueue({ appPairs, reported, profilePairs, dictionary, images });

// candidate characters per official reading (Unihan readings incl. note-1 base forms), labelled
const byReading = new Map();
for (const e of dictionary.dataset.entries) for (const r of e.readings) {
  if (!byReading.has(r.hangul)) byReading.set(r.hangul, []);
  byReading.get(r.hangul).push({ c: e.char, cp: e.codePoint, f: r.evidence.find(x => x.source === 'unihan')?.detail ?? 'app-table',
    compat: /^[豈-﫿]$/.test(e.char) && !/^\p{Unified_Ideograph}$/u.test(e.char) });
}
const suggestions = new Map();
if (si > 0) for (const line of fs.readFileSync(args[si + 1], 'utf8').split('\n')) {
  const [id, list] = line.split('\t'); if (!id || !list) continue;
  suggestions.set(id, list.split(',').map(x => { const i = x.lastIndexOf(':'); return [x.slice(0, i), Number(x.slice(i + 1))]; }));
}
const candidatesFor = readings => {
  const set = new Map();
  for (const r of readings) for (const x of byReading.get(r) ?? []) if (!set.has(x.c)) set.set(x.c, x);
  for (const r of readings) for (const base of byReading.keys()) if (dictMod.initialSoundReading(base) === r) for (const x of byReading.get(base)) if (!set.has(x.c)) set.set(x.c, x);
  return [...set.values()];
};

const data = {
  generatedAt: new Date().toISOString(),
  source: { id: 'court-rule-3151-appendix1', fileSha256: sha, version: '대법원규칙 제3151호 [별표 1] (개정 2024. 5. 30.)', url: 'https://www.law.go.kr/BYL/grtFile/law0105692024053003151KC_000100E.hwpx' },
  datasetVersion: dictionary.dataset.version,
  summary: queue.summary,
  targets: queue.targets.map(t => ({ ...t, suggestionOrder: t.images.map(id => [id, (suggestions.get(id) ?? []).find(([c]) => c === t.char)?.[1] ?? null]) })),
  imageTasks: queue.imageTasks.map(t => ({ ...t, candidates: candidatesFor(t.readings), suggestions: suggestions.get(t.image) ?? [] })),
};

fs.mkdirSync(path.join(outDir, 'img'), { recursive: true });
const tmp = fs.mkdtempSync(path.join(outDir, '.x-'));
execFileSync('unzip', ['-q', '-o', hwpx, 'BinData/*', '-d', tmp]);
for (const [id] of images.images) {
  const f = fs.readdirSync(path.join(tmp, 'BinData')).find(n => n.startsWith(`${id}.`));
  if (f) fs.copyFileSync(path.join(tmp, 'BinData', f), path.join(outDir, 'img', `${id}${path.extname(f)}`));
}
const ext = Object.fromEntries(fs.readdirSync(path.join(outDir, 'img')).map(n => [n.replace(/\.[^.]+$/, ''), path.extname(n)]));
fs.rmSync(tmp, { recursive: true, force: true });
data.imageExt = ext;
fs.writeFileSync(path.join(outDir, 'queue.json'), JSON.stringify(data));
const html = fs.readFileSync(new URL('./review-tool.html', import.meta.url), 'utf8').replace('/*__DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(JSON.stringify({ outDir, ...queue.summary, imagesCopied: Object.keys(ext).length, suggestions: suggestions.size }));
process.exit(0);
