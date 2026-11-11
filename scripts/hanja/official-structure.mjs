// R4.1A: structural extraction of the official name-Hanja appendices
// (가족관계의 등록 등에 관한 규칙 [별표 1] HWPX, [별표 2] PDF; 대법원규칙 제3151호).
//
//   node scripts/hanja/official-structure.mjs <appendix1.hwpx> <appendix2.pdf> [--check]
//
// In both official files every Hanja is an embedded glyph IMAGE; only readings, headers
// and notes are text. This script therefore records structure only (version, hashes,
// categories, entries per reading, notes) and never guesses character identities.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PINNED = {
  appendix1: { sha256: '66e8005ad0843f92bfae5854b9403611799e3c543518d950a0c2a77395c3daed', url: 'https://www.law.go.kr/BYL/grtFile/law0105692024053003151KC_000100E.hwpx' },
  appendix2: { sha256: '5ea97665c33910daf6b6459624c33ec4b1ca30878ccec16a9bd49862232f22df', url: 'https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110201&flSeq=153523507' },
};
const OUT = fileURLToPath(new URL('../../src/data/hanjaDictionary/official-structure.json', import.meta.url));
// image id -> official reading(s) of [별표 1]; used to check human reviews against the table reading
const OUT_IMAGES = fileURLToPath(new URL('../../src/data/hanjaDictionary/official-appendix1-images.json', import.meta.url));
const [a1Path, a2Path, flag] = process.argv.slice(2);
if (!a1Path || !a2Path) { console.error('usage: official-structure.mjs <appendix1.hwpx> <appendix2.pdf> [--check]'); process.exit(2); }
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const [k, p] of [['appendix1', a1Path], ['appendix2', a2Path]]) {
  if (sha(p) !== PINNED[k].sha256) { console.error(`${k} sha256 ${sha(p)} != pinned ${PINNED[k].sha256}`); process.exit(1); }
}
const SYL = /^[가-힣]$/;

// ── Appendix 1 (HWPX = zip; Contents/section0.xml) ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byl1-'));
let a1, a1Images;
try {
  execFileSync('unzip', ['-q', '-o', a1Path, 'Contents/section0.xml', '-d', dir]);
  const xml = fs.readFileSync(path.join(dir, 'Contents/section0.xml'), 'utf8');
  const text = s => [...s.matchAll(/<hp:t>(.*?)<\/hp:t>/gs)].map(m => m[1].replace(/<[^>]+>/g, '')).join('').trim();
  const runs = [...xml.matchAll(/<hp:t>(.*?)<\/hp:t>/gs)].map(m => m[1].replace(/<[^>]+>/g, ''));
  const header = runs.slice(0, runs.findIndex(r => r.startsWith(')')) + 1).join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const perReading = {}; const images = []; let cur = null; let notes = null;
  for (const [cell] of xml.matchAll(/<hp:tc .*?<\/hp:tc>/gs)) {
    const t = text(cell); const pics = [...cell.matchAll(/binaryItemIDRef="(image\d+)"/g)].map(m => m[1]);
    if (t.includes('주: 1.')) { notes = t.slice(t.indexOf('주: 1.')).replace(/\s+/g, ' '); break; } // note examples are not entries
    if (SYL.test(t) && pics.length === 0) { cur = t; perReading[cur] ??= 0; continue; }
    if (pics.length && cur) { perReading[cur] += pics.length; images.push(...pics.map(id => [cur, id])); }
  }
  const byImage = new Map();
  for (const [r, id] of images) byImage.set(id, [...(byImage.get(id) ?? []), r]);
  a1Images = [...byImage.entries()].map(([id, readings]) => [id, ...readings]);
  a1 = {
    title: header, entries: images.length, distinctGlyphImages: byImage.size, readings: Object.keys(perReading).length,
    glyphsListedUnderTwoReadings: [...byImage.entries()].filter(([, r]) => r.length > 1).map(([id, r]) => ({ image: id, readings: r })),
    perReading, notes,
  };
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

// ── Appendix 2 (PDF; text via ToUnicode CMaps, glyph images not decoded) ──
function pdfText(buf) {
  const s = buf.toString('latin1');
  const objs = new Map([...s.matchAll(/(\d+) 0 obj(.*?)endobj/gs)].map(m => [Number(m[1]), m[2]]));
  const stream = body => { const m = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/); if (!m) return null; const raw = Buffer.from(m[1], 'latin1'); try { return body.includes('FlateDecode') ? zlib.inflateSync(raw).toString('latin1') : m[1]; } catch { return null; } };
  const cmaps = new Map();
  for (const [n, b] of objs) {
    const st = stream(b); if (!st || !/begin(bfchar|bfrange)/.test(st)) continue;
    const m = new Map();
    for (const [, blk] of st.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const [, a, u] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) m.set(parseInt(a, 16), Buffer.from(u, 'hex').swap16().toString('utf16le'));
    for (const [, blk] of st.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const [, a, b2, u] of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) for (let c = parseInt(a, 16), k = 0; c <= parseInt(b2, 16); c++, k++) m.set(c, String.fromCodePoint(parseInt(u, 16) + k));
    cmaps.set(n, m);
  }
  const fontMap = new Map();
  for (const [n, b] of objs) { const t = b.match(/\/ToUnicode (\d+) 0 R/); if (t && cmaps.has(Number(t[1]))) fontMap.set(n, cmaps.get(Number(t[1]))); }
  const names = new Map();
  for (const [, b] of objs) for (const [, nm, ref] of b.matchAll(/\/([A-Za-z]+\d*) (\d+) 0 R/g)) if (fontMap.has(Number(ref))) names.set(nm, fontMap.get(Number(ref)));
  let out = '';
  for (const [, b] of objs) {
    const st = stream(b); if (!st || !st.includes('BT')) continue;
    let cur = new Map();
    for (const m of st.matchAll(/\/([^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>|(ET)|(T\*|Td|TD)/g)) {
      if (m[1]) cur = names.get(m[1]) ?? new Map();
      else if (m[2]) { const h = m[2]; const w = h.length % 4 === 0 ? 4 : 2; for (let i = 0; i < h.length; i += w) out += cur.get(parseInt(h.slice(i, i + w), 16)) ?? ''; }
      else out += ' ';
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}
const t2 = pdfText(fs.readFileSync(a2Path));
const body = t2.split('인명용한자허용자체 한글 인명용한자허용자체')[1].split('주 :')[0];
const a2PerReading = {}; let cur2 = null;
for (const [tok] of body.matchAll(/[가-힣]|\([^()]*\)/g)) {
  if (tok.startsWith('(')) a2PerReading[cur2].push(1 + (tok.match(/[․ㆍ]/g) ?? []).length);
  else { cur2 = tok; a2PerReading[cur2] = []; }
}
const a2 = {
  title: t2.slice(0, t2.indexOf('한글')).trim(),
  baseCharacters: Object.values(a2PerReading).reduce((n, v) => n + v.length, 0),
  permittedForms: Object.values(a2PerReading).reduce((n, v) => n + v.reduce((a, b) => a + b, 0), 0),
  readings: Object.keys(a2PerReading).length,
  perReading: Object.fromEntries(Object.entries(a2PerReading).map(([r, v]) => [r, { baseCharacters: v.length, permittedForms: v.reduce((a, b) => a + b, 0) }])),
  notes: t2.slice(t2.indexOf('주 :')).trim(),
};

const result = {
  regulation: {
    title: '가족관계의 등록 등에 관한 규칙', article: '제37조',
    currentVersion: '대법원규칙 제3220호, 2025. 6. 26. 일부개정, 시행 2025. 7. 19. (amends 제23조 only)',
    appendixVersion: '대법원규칙 제3151호, 2024. 5. 30. 일부개정, 시행 2024. 6. 11. (1,070자 추가, 별표 1 및 별표 2)',
    sources: ['https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=263097', 'https://www.law.go.kr/LSW/lsRvsRsnListP.do?lsId=010569&chrClsCd=010202&lsRvsGubun=all'],
    verifiedOn: '2026-11-11',
  },
  files: { appendix1: { ...PINNED.appendix1, format: 'HWPX' }, appendix2: { ...PINNED.appendix2, format: 'PDF' } },
  categories: {
    basicEducation: { legalBasis: '제37조 제1항 제1호 (교육부가 정한 한문 교육용 기초한자)', entries: 1800, note: 'list not in the rule; count from the reconciliation below' },
    appendix1: { legalBasis: '제37조 제1항 제2호 [별표 1] 인명용추가한자표', ...a1 },
    appendix2: { legalBasis: '제37조 제2항 [별표 2] 인명용한자허용자체표 (permitted forms of listed characters)', ...a2 },
  },
  reconciliation: { formula: '1,800 basic + Appendix 1 entries + Appendix 2 permitted forms', total: 1800 + a1.entries + a2.permittedForms, officialHeadline: 9389 },
  characterIdentities: 'NOT EXTRACTED: every Hanja in both appendices is a glyph image; no code points are asserted.',
};
const json = JSON.stringify(result, null, 1) + '\n';
const imagesJson = JSON.stringify({
  source: 'court-rule-3151-appendix1', fileSha256: PINNED.appendix1.sha256,
  note: 'official glyph image id -> official reading(s); order as in the table; note example images excluded',
  images: a1Images,
}).replace(/\],\[/g, '],\n[') + '\n';
if (flag === '--check') {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === json && fs.existsSync(OUT_IMAGES) && fs.readFileSync(OUT_IMAGES, 'utf8') === imagesJson;
  console.log(same ? 'OK: official-structure.json and official-appendix1-images.json reproduce' : 'MISMATCH'); process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, json);
fs.writeFileSync(OUT_IMAGES, imagesJson);
console.log(JSON.stringify({ a1: { entries: a1.entries, distinct: a1.distinctGlyphImages, readings: a1.readings, shared: a1.glyphsListedUnderTwoReadings.length }, a2: { base: a2.baseCharacters, forms: a2.permittedForms, readings: a2.readings }, total: result.reconciliation.total }));
