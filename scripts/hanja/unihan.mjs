// Reader for a pinned Unihan release (Unicode License v3; see
// https://www.unicode.org/license.txt). Only fields relevant to Korean Hanja use
// are read. Nothing is inferred: absent fields stay absent.
import fs from 'node:fs';
import path from 'node:path';

const FIELDS = new Set([
  'kHangul', 'kTotalStrokes', 'kRSUnicode', 'kDefinition', 'kKoreanName', 'kKoreanEducationHanja',
  'kSimplifiedVariant', 'kTraditionalVariant', 'kSemanticVariant', 'kSpecializedSemanticVariant',
  'kZVariant', 'kCompatibilityVariant', 'kIRG_KSource',
]);
const VARIANT_FIELDS = ['kSimplifiedVariant', 'kTraditionalVariant', 'kSemanticVariant', 'kSpecializedSemanticVariant', 'kZVariant', 'kCompatibilityVariant'];
const cpToChar = cp => String.fromCodePoint(parseInt(cp.slice(2), 16));

/** Parses the Unihan text files of `dir`; returns entries keyed by character plus release metadata. */
export function readUnihan(dir) {
  const raw = new Map();
  let version = null, date = null;
  for (const f of fs.readdirSync(dir).filter(n => /^Unihan_.*\.txt$/.test(n)).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (line.startsWith('#')) {
        version ??= line.match(/^# Unicode Version (\S+)/)?.[1] ?? null;
        date ??= line.match(/^# Date: (.+?) \[/)?.[1] ?? null;
        continue;
      }
      const [cp, field, value] = line.split('\t');
      if (!value || !FIELDS.has(field)) continue;
      const ch = cpToChar(cp);
      if (!raw.has(ch)) raw.set(ch, { cp });
      raw.get(ch)[field] = value;
    }
  }
  const byChar = new Map();
  for (const [ch, r] of raw) {
    if (!r.kHangul) continue; // only characters with a documented Korean reading
    byChar.set(ch, {
      char: ch, codePoint: r.cp,
      // "현:0N" -> { hangul: '현', sources: '0N' }; sources per UAX #38 (0 KS X 1001, 1 KS X 1002,
      // E 한문 교육용 기초 한자, N 인명용 한자)
      readings: r.kHangul.split(' ').map(x => { const [hangul, sources = ''] = x.split(':'); return { hangul, sources }; }),
      totalStrokes: r.kTotalStrokes ? Number(r.kTotalStrokes.split(' ')[0]) : null,
      totalStrokesRaw: r.kTotalStrokes ?? null,
      radicalStroke: r.kRSUnicode ?? null,
      definition: r.kDefinition ?? null,
      koreanNameList: r.kKoreanName ? r.kKoreanName.split(' ') : [],
      variants: Object.fromEntries(VARIANT_FIELDS.filter(f => r[f]).map(f => [f, r[f].split(' ').map(v => cpToChar(v.split('<')[0]))])),
    });
  }
  return { byChar, meta: { version, date, entriesWithKoreanReading: byChar.size } };
}
