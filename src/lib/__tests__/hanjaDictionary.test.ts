// R4.1 Hanja dictionary foundation: regression cases (Phase F).
import { describe, expect, it } from 'vitest';
import { RESEARCH_MEANINGS, RESEARCH_SOURCES } from '@/data/hanjaDictionary/research/overlay';
import { buildHanjaDataset, createHanjaDictionary, getHanjaDictionary, validateDataset, HanjaDataset, HanjaEntry } from '@/lib/hanjaDictionary';
import { HANJA_DB, getHanjaOptions } from '@/data/hanjaDB';
import { applySelectionToName, confirmedChar, givenMeanings, storedSelectionChar, totalStrokes, MEANING_UNAVAILABLE } from '@/lib/hanjaModel';
import { analyzeModeCNames, applyHanjaSelections } from '@/lib/analysis';
import fs from 'node:fs';
import path from 'node:path';

const dict = getHanjaDictionary(); // production: license-cleared records only
const research = createHanjaDictionary(buildHanjaDataset({ research: { sources: RESEARCH_SOURCES, meanings: RESEARCH_MEANINGS } }));
const clone = (): HanjaDataset => structuredClone(buildHanjaDataset({ research: { sources: RESEARCH_SOURCES, meanings: RESEARCH_MEANINGS } }));
const codes = (ds: HanjaDataset) => validateDataset(ds).map(i => i.code);
const entry = (ds: HanjaDataset, ch: string) => ds.entries.find(e => e.char === ch) as HanjaEntry;

describe('multiple meanings (research pipeline, SYNTHETIC fixture on 一)', () => {
  it('several attested records under one character, each with its own id and source; primary first', () => {
    const primary = research.primaryMeaning('一')!;
    expect(primary).toMatchObject({ id: 'U+4E00#synthetic-test-a', lang: 'ko', verification: 'attested', primary: true });
    expect(primary.text).toContain('실제 뜻 아님'); // visibly synthetic
    const all = research.meanings('一');
    expect(all[0]).toBe(primary);
    const synthetic = all.filter(m => m.id.includes('#synthetic-test-'));
    expect(synthetic.map(m => m.id)).toEqual(['U+4E00#synthetic-test-a', 'U+4E00#synthetic-test-b', 'U+4E00#synthetic-test-c']);
    expect(new Set(all.map(m => m.id)).size).toBe(all.length);
    for (const m of synthetic) expect(m.evidence[0].source).toBe('test-fixture-pending-source');
  });

  it('the synthetic fixture never touches 鉉 and never enters the production dataset', () => {
    expect(research.meanings('鉉').map(m => m.id)).toEqual(dict.meanings('鉉').map(m => m.id));
    expect(dict.meanings('一').some(m => m.id.includes('#synthetic-test-'))).toBe(false);
    expect(dict.primaryMeaning('一')).toBeNull();
  });
});

describe('鉉 (U+9249) production regression', () => {
  it('production dataset: no record citing a non-cleared license is included', () => {
    expect(dict.primaryMeaning('鉉')).toBeNull(); // no license-cleared Korean gloss yet
    expect(dict.meanings('鉉').map(m => m.id)).toEqual(['U+9249#tripod-carrier', 'U+9249#legacy']);
    const cleared = new Set(dict.dataset.sources.filter(x => x.licenseStatus === 'cleared').map(x => x.id));
    for (const e of dict.dataset.entries) for (const r of [...e.readings, ...e.meanings, ...e.strokes, ...e.variants]) {
      for (const ev of r.evidence) expect(cleared.has(ev.source)).toBe(true);
    }
    expect(dict.dataset.sources.map(x => x.id)).not.toContain('test-fixture-pending-source');
    expect(research.dataset.version).toMatch(/\+research$/);
  });

  it('a restricted source is refused in any dataset', () => {
    const ds = structuredClone(research.dataset);
    ds.sources.find(x => x.id === 'test-fixture-pending-source')!.licenseStatus = 'restricted';
    expect(() => createHanjaDictionary(ds)).toThrow(/restricted sources/);
  });

  it('keeps the legacy gloss "쇠줄 현" only as an unverified legacy record, never as primary', () => {
    const legacy = dict.meanings('鉉').filter(m => m.verification === 'legacy-unverified');
    expect(legacy).toHaveLength(1);
    expect(legacy[0]).toMatchObject({ text: '쇠줄 현', primary: false });
    expect(legacy[0].evidence[0].source).toBe('legacy-hanjadb');
  });

  it('whichever gloss is shown, the character, strokes used by the app and the stored value stay 鉉', () => {
    for (const m of dict.meanings('鉉')) {
      void m; // meanings are attributes; no API maps a meaning to a different character
      expect(dict.get('鉉')!.char).toBe('鉉');
    }
    expect(confirmedChar('현', '鉉')).toMatchObject({ hanja: '鉉', strokes: 13, status: 'confirmed' });
    expect(dict.get('鉉')!.strokes.map(s => `${s.convention}:${s.value}`).sort()).toEqual(['legacy-app:13', 'unicode-kTotalStrokes:13']);
  });
});

describe('missing characters are never replaced', () => {
  it('a valid Han character absent from the dictionary stays itself (no variant or look-alike fallback)', () => {
    expect(dict.get('铉')).toBeUndefined();               // simplified form: no Korean reading in Unihan
    expect(dict.legalStatus('铉')).toEqual({ status: 'NOT_CONFIRMED', indicators: [], known: false });
    expect(storedSelectionChar('현', '铉')).toMatchObject({ hanja: '铉', status: 'confirmed', meaning: null, strokes: null, inDatabase: false });
  });

  it('a stored selection not offered for its syllable keeps the exact character with unknown data', () => {
    expect(getHanjaOptions('민').some(o => o.hanja === '閔')).toBe(false);
    const c = storedSelectionChar('민', '閔')!;
    expect(c).toMatchObject({ hangul: '민', hanja: '閔', status: 'confirmed', meaning: null, strokes: null, jaWonOhaeng: null, inDatabase: false });
    expect(totalStrokes([c])).toBeNull(); // no invented stroke count
    expect(storedSelectionChar('민', 'A')).toBeNull();
    expect(confirmedChar('민', '閔')).toBeNull(); // new selections still come only from the offered list
  });

  it('a character the app lists only under another reading stays outside the position boundary (ignored, not remapped)', () => {
    expect(getHanjaOptions('준').some(o => o.hanja === '俊')).toBe(true);
    expect(storedSelectionChar('현', '俊')).toBeNull();
  });
});

describe('multiple readings', () => {
  it('樂 has four readings, each with its own source flags', () => {
    const e = dict.get('樂')!;
    expect(e.readings.map(r => r.hangul)).toEqual(['낙', '락', '악', '요']);
    expect(e.readings.map(r => r.evidence[0].detail)).toEqual(['낙:0', '락:0E', '악:0N', '요:0N']);
    for (const h of ['낙', '락', '악', '요']) expect(dict.byReading(h).some(x => x.char === '樂')).toBe(true);
  });

  it('readings asserted only by the legacy table are kept with legacy evidence only (e.g. 빛/光)', () => {
    const r = dict.get('光')!.readings.find(x => x.hangul === '빛')!;
    expect(r.evidence.map(x => x.source)).toEqual(['legacy-hanjadb']);
    expect(dict.get('光')!.readings.find(x => x.hangul === '광')!.evidence[0].source).toBe('unihan');
  });
});

describe('variants are related, never merged', () => {
  it('compatibility ideographs are separate entries keyed by exact code point (no NFC folding)', () => {
    const compat = '樂';
    expect(compat.normalize('NFC')).toBe('樂');
    const e = dict.get(compat)!;
    expect(e.codePoint).toBe('U+F914');
    expect(e.readings.map(r => r.hangul)).toEqual(['낙']);
    expect(e.variants).toContainEqual(expect.objectContaining({ type: 'compatibility', target: '樂' }));
    expect(dict.get('樂')).not.toBe(e);
    expect(storedSelectionChar('낙', compat)!.hanja).toBe(compat); // the stored code point is kept as is
  });

  it('鉉 and its simplified form 铉 are related but distinct', () => {
    expect(dict.get('鉉')!.variants).toEqual([expect.objectContaining({ type: 'simplified', target: '铉' })]);
    expect(dict.get('铉')).toBeUndefined();
  });

  it('nothing in the app normalises Hanja strings', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== '__tests__') walk(p); } else if (/\.tsx?$/.test(f.name)) files.push(p); } };
    walk(path.resolve('src'));
    expect(files.filter(f => fs.readFileSync(f, 'utf8').includes('.normalize('))).toEqual([]);
  });
});

describe('legal eligibility is evidence-based', () => {
  it('no entry is CONFIRMED or INELIGIBLE without official legal evidence (none acquired in R4.1)', () => {
    const s = dict.dataset.entries.map(e => e.legal.status);
    expect(new Set(s)).toEqual(new Set(['NOT_CONFIRMED']));
    expect(dict.legalStatus('鉉')).toMatchObject({ status: 'NOT_CONFIRMED', known: true });
    expect(dict.legalStatus('鉉').indicators[0]).toMatchObject({ source: 'unihan', detail: '현:0N' });
  });

  it('the validator rejects CONFIRMED/INELIGIBLE backed by Unicode or dictionary data', () => {
    for (const status of ['CONFIRMED', 'INELIGIBLE'] as const) {
      const ds = clone();
      entry(ds, '鉉').legal = { status, evidence: [{ source: 'unihan', detail: '현:0N' }], indicators: [] };
      expect(codes(ds)).toContain('legal-without-official-evidence');
    }
    const ok = clone();
    ok.sources.push({ id: 'court-table', publisher: '대법원', title: '별표 1', locator: 'test', version: 'test', retrieved: '2026-11-11', license: 'public law text', licenseStatus: 'cleared', kind: 'official-legal' });
    entry(ok, '鉉').legal = { status: 'CONFIRMED', evidence: [{ source: 'court-table', detail: '鉉 현' }], indicators: [] };
    expect(codes(ok)).toContain('legal-reading-inconsistent'); // a character is confirmed only through a confirmed reading
    entry(ok, '鉉').readings[0].legal = { status: 'CONFIRMED', basis: 'appendix1-image-review', evidence: [{ source: 'court-table', detail: '鉉 현' }] };
    expect(codes(ok)).toEqual([]);
    entry(ok, '鉉').readings[0].legal = { status: 'CONFIRMED', basis: 'appendix1-image-review', evidence: [{ source: 'unihan', detail: '현:0N' }] };
    expect(codes(ok)).toContain('reading-legal-without-official-evidence');
  });
});

describe('scoring compatibility', () => {
  it('a stored character outside the app table changes no score or rank and creates no stroke count', () => {
    const input = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2 as const, gender: '남' as const, names: ['김민서', '이준'] };
    const base = analyzeModeCNames(input).results;
    const applied = applyHanjaSelections(base, { 김민서: ['閔', null] });
    const r = applied.find(x => x.name.full === '김민서')!;
    expect(r.name.hanja.given[0]).toMatchObject({ hanja: '閔', status: 'confirmed', strokes: null });
    expect(givenMeanings(r.name.hanja)[0]).toBe(MEANING_UNAVAILABLE);
    expect(applied.map(x => [x.name.full, x.rank, x.scores.overall])).toEqual(base.map(x => [x.name.full, x.rank, x.scores.overall]));
  });

  it('the dictionary is not imported by scoring, ranking, calendar, saju or PDF code', () => {
    for (const f of ['scoring.ts', 'scoreComponents.ts', 'analysis.ts', 'calendar.ts', 'saju.ts', 'schedule.ts', 'modeAOptimizer.ts', 'nameGenerator.ts', 'sungmyung.ts']) {
      expect(fs.readFileSync(path.resolve('src/lib', f), 'utf8')).not.toMatch(/hanjaDictionary|hanjaSearch/);
    }
    // hanjaModel reads only the small generated list of human-confirmed pairs (R4.2), never the dictionary
    const model = fs.readFileSync(path.resolve('src/lib/hanjaModel.ts'), 'utf8');
    expect(model).not.toMatch(/@\/lib\/hanjaDictionary|unihan-korean|official-appendix1-images|legal-reviews/);
    expect(model.match(/@\/data\/hanjaDictionary\/[^'"]+/g)).toEqual(['@/data/hanjaDictionary/legal-confirmed.json']);
    expect(fs.readFileSync(path.resolve('src/components/pdf/PdfNameDetail.tsx'), 'utf8')).not.toMatch(/hanjaDictionary|hanjaSearch/);
  });

  it('every legacy table value is preserved unchanged (meaning, strokes) for the app', () => {
    for (const [syl, opts] of Object.entries(HANJA_DB)) for (const o of opts) {
      const e = dict.get(o.hanja)!;
      expect(e.meanings.find(m => m.verification === 'legacy-unverified')!.text).toBe(o.meaning);
      expect(e.strokes.find(s => s.convention === 'legacy-app')!.value).toBe(o.strokes);
      expect(e.readings.some(r => r.hangul === syl)).toBe(true);
    }
  });
});

describe('dataset integrity', () => {
  it('the production and research datasets validate with no issues', () => {
    expect(validateDataset(dict.dataset)).toEqual([]);
    expect(validateDataset(research.dataset)).toEqual([]);
    expect(dict.dataset.version).toMatch(/^r4\.1-/);
  });

  it.each([
    ['duplicate entry', (ds: HanjaDataset) => { ds.entries.push(structuredClone(entry(ds, '鉉'))); }, 'duplicate-entry'],
    ['lone surrogate', (ds: HanjaDataset) => { entry(ds, '鉉').char = '\uD800'; }, 'malformed-character'],
    ['two characters', (ds: HanjaDataset) => { entry(ds, '鉉').char = '鉉鉉'; }, 'malformed-character'],
    ['Hangul as Hanja', (ds: HanjaDataset) => { entry(ds, '鉉').char = '현'; }, 'malformed-character'],
    ['code point mismatch', (ds: HanjaDataset) => { entry(ds, '鉉').codePoint = 'U+94C9'; }, 'code-point-mismatch'],
    ['malformed reading', (ds: HanjaDataset) => { entry(ds, '鉉').readings[0].hangul = 'hyeon'; }, 'malformed-reading'],
    ['missing provenance (reading)', (ds: HanjaDataset) => { entry(ds, '鉉').readings[0].evidence = []; }, 'missing-provenance'],
    ['missing provenance (meaning)', (ds: HanjaDataset) => { entry(ds, '鉉').meanings[0].evidence = []; }, 'missing-provenance'],
    ['unknown source', (ds: HanjaDataset) => { entry(ds, '鉉').meanings[0].evidence = [{ source: 'blog' }]; }, 'unknown-source'],
    ['duplicate meaning', (ds: HanjaDataset) => { const e = entry(ds, '鉉'); e.meanings.push({ ...e.meanings[1], id: 'U+9249#dup' }); }, 'duplicate-meaning'],
    ['conflicting primary', (ds: HanjaDataset) => { const e = entry(ds, '鉉'); for (const x of ['x1', 'x2']) e.meanings.push({ id: `U+9249#${x}`, lang: 'ko', text: `[test ${x}]`, primary: true, verification: 'attested', evidence: [{ source: 'unihan' }] }); }, 'conflicting-primary'],
    ['legacy gloss as primary', (ds: HanjaDataset) => { entry(ds, '鉉').meanings.find(m => m.verification === 'legacy-unverified')!.primary = true; }, 'primary-not-attested'],
    ['legacy gloss marked attested', (ds: HanjaDataset) => { entry(ds, '鉉').meanings.find(m => m.verification === 'legacy-unverified')!.verification = 'attested'; }, 'legacy-as-attested'],
    ['foreign meaning id', (ds: HanjaDataset) => { entry(ds, '鉉').meanings[0].id = 'U+6A02#x'; }, 'meaning-id'],
    ['conflicting strokes', (ds: HanjaDataset) => { const e = entry(ds, '鉉'); e.strokes.push({ ...e.strokes[0], value: 14 }); }, 'conflicting-strokes'],
    ['invalid relation target', (ds: HanjaDataset) => { entry(ds, '鉉').variants[0].target = 'x'; }, 'invalid-relation'],
    ['self relation', (ds: HanjaDataset) => { entry(ds, '鉉').variants[0].target = '鉉'; }, 'self-relation'],
    ['incomplete source', (ds: HanjaDataset) => { ds.sources[0].license = ''; }, 'source-incomplete'],
  ])('rejects %s', (_label, mutate, code) => {
    const ds = clone();
    mutate(ds);
    expect(codes(ds)).toContain(code);
    expect(() => createHanjaDictionary(ds)).toThrow(/invalid Hanja dataset/);
  });
});

describe('stored R3.2 selections (document format unchanged)', () => {
  it('a confirmed selection re-applied after a reload resolves to the identical character', () => {
    const input = { birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2 as const, gender: '남' as const, names: ['김민서'] };
    const doc = JSON.stringify({ 김민서: ['閔', '瑞'] }); // as persisted (values only): unknown to the app / offered
    for (let reload = 0; reload < 3; reload++) {
      const sel = JSON.parse(doc);
      const r = applyHanjaSelections(analyzeModeCNames(input).results, sel)[0];
      expect(r.name.hanja.given.map(c => [c.hanja, c.status, c.strokes])).toEqual([['閔', 'confirmed', null], ['瑞', 'confirmed', 13]]);
    }
    expect(JSON.parse(doc)).toEqual({ 김민서: ['閔', '瑞'] });
  });

  it('applySelectionToName keeps a suggestion when nothing is stored for the position', () => {
    const r = analyzeModeCNames({ birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김민서'] }).results[0];
    expect(applySelectionToName(r.name, [null, null])).toBe(r.name);
  });
});

describe('official appendices (R4.1A structural reconciliation)', () => {
  const official = JSON.parse(fs.readFileSync(path.resolve('src/data/hanjaDictionary/official-structure.json'), 'utf8'));
  const a1 = official.categories.appendix1, a2 = official.categories.appendix2;

  it('records the effective versions and pinned files', () => {
    expect(a1.title).toContain('[별표1] <개정 2024. 5. 30.>인명용추가한자표');
    expect(a2.title).toContain('[ 별표 2] < 개정 2024. 5. 30.> 인명용한자허용자체표');
    expect(official.regulation.appendixVersion).toMatch(/제3151호/);
    expect(official.regulation.currentVersion).toMatch(/제3220호.*제23조 only/);
    expect(official.files.appendix1.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('1,800 basic + 7,272 Appendix 1 entries + 317 Appendix 2 forms reconcile to the official 9,389', () => {
    expect(a1.entries).toBe(7272);
    expect(Object.values(a1.perReading as Record<string, number>).reduce((n, v) => n + v, 0)).toBe(a1.entries);
    expect(a1.distinctGlyphImages).toBe(7265);
    expect(a1.glyphsListedUnderTwoReadings).toHaveLength(7);
    expect(a2.permittedForms).toBe(317);
    expect(official.reconciliation.total).toBe(official.reconciliation.officialHeadline);
  });

  it('keeps the official reading rule and form-interchange notes verbatim', () => {
    expect(a1.notes).toContain('위 한자는 이 표에 지정된 발음으로만 사용할 수 있다');
    expect(a1.notes).toContain('“示”변과 “礻”변, “++”변과 “卄”변은 서로 바꾸어 쓸 수 있다');
  });

  it('asserts no character identities, so nothing is CONFIRMED or INELIGIBLE from it', () => {
    expect(official.characterIdentities).toMatch(/^NOT EXTRACTED/);
    expect(dict.dataset.entries.some(e => e.legal.status !== 'NOT_CONFIRMED')).toBe(false);
    expect(dict.dataset.sources.filter(x => x.kind === 'official-legal').map(x => x.id)).toEqual(['court-rule-3151-appendix1', 'court-rule-3151-appendix2', 'efamily-lookup']);
  });
});
