// R4.1 Phase A: machine-readable inventory of the EXISTING Hanja data.
// Usage: node scripts/hanja/inventory.mjs <unihanDir> <out.json>
// Read-only: compares the app's data with a pinned Unihan release; changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { loadTs } from './load-ts.mjs';
import { readUnihan } from './unihan.mjs';

const [unihanDir, out] = process.argv.slice(2);
if (!unihanDir || !out) { console.error('usage: inventory.mjs <unihanDir> <out.json>'); process.exit(2); }

const [db, chars] = await loadTs(['/src/data/hanjaDB.ts', '/src/data/nameChars.ts']);
const uni = readUnihan(unihanDir);

const rows = [];
for (const [hangul, opts] of Object.entries(db.HANJA_DB)) {
  for (const o of opts) {
    const u = uni.byChar.get(o.hanja);
    const reading = u?.readings.find(r => r.hangul === hangul) ?? null;
    rows.push({
      table: 'HANJA_DB', hangul, hanja: o.hanja, codePoint: `U+${o.hanja.codePointAt(0).toString(16).toUpperCase()}`,
      legacyMeaning: o.meaning, legacyFullMeaning: o.fullMeaning, legacyStrokes: o.strokes, radical: o.radical,
      unihan: u ? {
        readings: u.readings.map(r => `${r.hangul}:${r.sources}`), totalStrokes: u.totalStrokes, definition: u.definition,
        koreanNameList: u.koreanNameList, readingListed: !!reading, // 인명용: Article 37(1)1 (교육용 기초한자, Unihan E) or 37(1)2 (별표 1, Unihan N); a secondary indicator only
        readingNameIndicator: !!reading && /[EN]/.test(reading.sources),
        strokesEqualLegacy: u.totalStrokes === o.strokes,
      } : null,
    });
  }
}
const surnames = db.SURNAME_HANJA_DB.map(s => {
  const u = uni.byChar.get(s.hanja);
  return { table: 'SURNAME_HANJA_DB', hangul: s.hangul, hanja: s.hanja, legacyMeaning: s.meaning, legacyStrokes: s.strokes,
    unihan: u ? { readings: u.readings.map(r => `${r.hangul}:${r.sources}`), totalStrokes: u.totalStrokes } : null };
});
const profileList = Object.values(chars).find(v => Array.isArray(v) && v[0]?.hangul && 'modernity' in v[0]) ?? [];
const profiles = profileList.map(p => ({ hangul: p.hangul, hanja: p.hanja, meaning: p.meaning,
  inHanjaDb: (db.HANJA_DB[p.hangul] ?? []).some(o => o.hanja === p.hanja) }));

const uniqueChars = new Set(rows.map(r => r.hanja));
const dupWithinSyllable = Object.entries(db.HANJA_DB).filter(([, o]) => new Set(o.map(x => x.hanja)).size !== o.length).map(([h]) => h);
const crossSyllable = [...uniqueChars].filter(ch => rows.filter(r => r.hanja === ch).length > 1)
  .map(ch => ({ hanja: ch, syllables: rows.filter(r => r.hanja === ch).map(r => r.hangul) }));
const summary = {
  hanjaDb: {
    syllables: Object.keys(db.HANJA_DB).length, records: rows.length, uniqueCharacters: uniqueChars.size,
    duplicateWithinSyllable: dupWithinSyllable, sameCharacterUnderSeveralSyllables: crossSyllable,
    meaningsPerRecord: 1, provenanceDocumented: 0,
    notInUnihan: rows.filter(r => !r.unihan).length,
    readingNotListedInUnihan: rows.filter(r => r.unihan && !r.unihan.readingListed).map(r => `${r.hangul}/${r.hanja}`),
    readingWithoutNameIndicator: rows.filter(r => r.unihan?.readingListed && !r.unihan.readingNameIndicator).map(r => `${r.hangul}/${r.hanja}`),
    strokesDifferFromUnihanTotal: rows.filter(r => r.unihan && !r.unihan.strokesEqualLegacy)
      .map(r => ({ hanja: r.hanja, legacy: r.legacyStrokes, unihanTotal: r.unihan.totalStrokes })),
  },
  surnameDb: { records: surnames.length, notInUnihan: surnames.filter(s => !s.unihan).length },
  nameCharProfiles: { records: profiles.length, hanjaNotInHanjaDb: profiles.filter(p => !p.inHanjaDb).length },
  strokeDiffCount: rows.filter(r => r.unihan && !r.unihan.strokesEqualLegacy).length,
  hyeon: rows.filter(r => r.hanja === '鉉'),
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), unihan: uni.meta, summary, hanjaDb: rows, surnames, profiles }, null, 1));
const { strokesDifferFromUnihanTotal, ...brief } = summary.hanjaDb;
console.log(JSON.stringify({ ...summary, hanjaDb: { ...brief, strokesDifferFromUnihanTotal: strokesDifferFromUnihanTotal.map(d => `${d.hanja} ${d.legacy}/${d.unihanTotal}`).join(' ') } }, null, 1));
process.exit(0);
