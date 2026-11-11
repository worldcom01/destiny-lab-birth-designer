// R4.1: reproducible build of src/data/hanjaDictionary/unihan-korean.json from a
// pinned Unihan release (Unicode License v3, notice in UNICODE-LICENSE.txt).
//
//   node scripts/hanja/build-dictionary.mjs <Unihan.zip>           # (re)write the JSON
//   node scripts/hanja/build-dictionary.mjs <Unihan.zip> --check   # fail if the committed JSON differs
//
// The zip is verified against the pinned SHA-256 before use. Download:
//   https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip (Unicode 18.0.0)
// Only characters with a documented Korean reading (kHangul) are kept; values are
// copied as published, never completed or guessed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readUnihan } from './unihan.mjs';

export const PINNED = { unicodeVersion: '18.0.0', sha256: '4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e' };
const OUT = fileURLToPath(new URL('../../src/data/hanjaDictionary/unihan-korean.json', import.meta.url));

const [zip, flag] = process.argv.slice(2);
if (!zip) { console.error('usage: build-dictionary.mjs <Unihan.zip> [--check]'); process.exit(2); }
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
if (sha !== PINNED.sha256) { console.error(`Unihan.zip sha256 ${sha} != pinned ${PINNED.sha256}`); process.exit(1); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unihan-'));
try {
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  const { byChar, meta } = readUnihan(dir);
  if (meta.version !== PINNED.unicodeVersion) throw new Error(`Unihan version ${meta.version} != ${PINNED.unicodeVersion}`);
  const rows = [...byChar.values()]
    .sort((a, b) => a.char.codePointAt(0) - b.char.codePointAt(0))
    // compact row: [codePoint, kHangul readings, kTotalStrokes (first), kRSUnicode, kDefinition, kKoreanName, variants]
    .map(e => [e.codePoint, e.readings.map(r => `${r.hangul}:${r.sources}`).join(' '), e.totalStrokes, e.radicalStroke,
      e.definition, e.koreanNameList.join(' ') || null, Object.keys(e.variants).length ? e.variants : null]);
  const json = JSON.stringify({
    source: { id: 'unihan', unicodeVersion: meta.version, date: meta.date, zipSha256: sha, license: 'Unicode License v3 (UNICODE-LICENSE.txt)' },
    fields: ['codePoint', 'kHangul', 'kTotalStrokes', 'kRSUnicode', 'kDefinition', 'kKoreanName', 'variants'],
    rows,
  }).replace(/\],\[/g, '],\n[') + '\n';
  if (flag === '--check') {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === json;
    console.log(same ? `OK: ${path.relative(process.cwd(), OUT)} reproduces from the pinned Unihan (${rows.length} rows)` : 'MISMATCH: the committed JSON does not reproduce');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${rows.length} rows (Unicode ${meta.version}) -> ${path.relative(process.cwd(), OUT)}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
