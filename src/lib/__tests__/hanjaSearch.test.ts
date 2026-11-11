// R4.2 acceptance (library level): search, eligibility, meanings and legal labels.
import { describe, expect, it } from 'vitest';
import { RESEARCH_MEANINGS, RESEARCH_SOURCES } from '@/data/hanjaDictionary/research/overlay';
import { buildHanjaDataset, createHanjaDictionary, getHanjaDictionary } from '@/lib/hanjaDictionary';
import { resolveMode, searchHanja, unavailableReason } from '@/lib/hanjaSearch';
import { getHanjaOptions } from '@/data/hanjaDB';
import { selectionEligibility, storedSelectionChar } from '@/lib/hanjaModel';

const prod = getHanjaDictionary();
const research = createHanjaDictionary(buildHanjaDataset({ research: { sources: RESEARCH_SOURCES, meanings: RESEARCH_MEANINGS } }));
const one = (syl: string, q: string, d = prod) => searchHanja(d, syl, q).results[0];

describe('search modes', () => {
  it('auto mode: Han characters -> character, one syllable -> reading, other text -> meaning', () => {
    expect(resolveMode('鉉', 'auto')).toBe('character');
    expect(resolveMode('현', 'auto')).toBe('reading');
    expect(resolveMode('솥 손잡이', 'auto')).toBe('meaning');
    expect(resolveMode('현', 'meaning')).toBe('meaning');
  });

  it('character search keeps the exact typed code points, in order, without duplicates', () => {
    const out = searchHanja(prod, '현', '鉉铉鉉樂');
    expect(out.results.map(r => r.codePoint)).toEqual(['U+9249', 'U+94C9', 'U+F914']);
    expect(out.notInDictionary).toEqual(['铉']);
    expect(out.results[2].char).toBe('樂'); // never folded to U+6A02
  });

  it('reading search lists selectable characters first; others are found but not selectable', () => {
    const out = searchHanja(prod, '현', '현');
    const offered = getHanjaOptions('현').map(o => o.hanja);
    const firstN = out.results.slice(0, offered.length).map(r => r.char);
    expect(new Set(firstN)).toEqual(new Set(offered));
    expect(out.results.length).toBeGreaterThan(offered.length);
    expect(out.results.filter(r => r.selectable).map(r => r.char).sort()).toEqual([...offered].sort());
    expect(out.results.find(r => r.char === '玹')).toMatchObject({ selectable: false, eligibility: 'unknown-reading', readingDocumented: true });
  });

  it('reading search follows the official initial-sound note (율 finds 律 listed as 률)', () => {
    expect(searchHanja(prod, '율', '율').results.some(r => r.char === '律')).toBe(true);
  });

  it('meaning search: verified Korean meanings only from license-cleared data; legacy glosses are labelled', () => {
    expect(searchHanja(prod, '일', '시험용 합성 뜻').results).toEqual([]); // the research overlay is not in production
    expect(searchHanja(research, '일', '시험용 합성 뜻').results.map(r => [r.char, r.matchedBy])).toEqual([['一', 'verified-meaning']]);
    expect(searchHanja(prod, '현', '쇠줄').results.map(r => [r.char, r.matchedBy])).toEqual([['鉉', 'legacy-meaning']]);
  });
});

describe('鉉 (U+9249)', () => {
  it('production: no verified primary gloss; "쇠줄 현" only as a labelled legacy gloss; still selectable as a legacy option', () => {
    const r = one('현', '鉉');
    expect(r.meanings.primary).toBeNull();
    expect(r.meanings.verifiedKorean).toEqual([]);
    expect(r.meanings.legacy.map(m => m.text)).toEqual(['쇠줄 현']);
    expect(r.meanings.english.map(m => m.text)).toEqual(['device for carrying a tripod']);
    expect(r).toMatchObject({ char: '鉉', selectable: true, eligibility: 'legacy-offered', legal: { status: 'NOT_CONFIRMED' } });
  });

  it('research build: 鉉 is exactly as in production (the synthetic fixture is on 一, not 鉉)', () => {
    const r = one('현', '鉉', research);
    expect(r.meanings.primary).toBeNull();
    expect(r.meanings.legacy.map(m => m.text)).toEqual(['쇠줄 현']);
    expect(r.char).toBe('鉉');
  });

  it('research pipeline: several attested senses under one character in search (synthetic fixture)', () => {
    const r = one('일', '一', research);
    expect(r.meanings.primary).toMatchObject({ id: 'U+4E00#synthetic-test-a' });
    expect(r.meanings.verifiedKorean.map(m => m.id)).toEqual(['U+4E00#synthetic-test-a', 'U+4E00#synthetic-test-b']);
    expect(r.meanings.english.map(m => m.id)).toContain('U+4E00#synthetic-test-c');
    expect(r.char).toBe('一'); // meanings never change the character
  });
});

describe('eligibility', () => {
  it('verified incompatible reading: rejected with the documented reading named', () => {
    const r = one('민', '俊');
    expect(r).toMatchObject({ eligibility: 'reading-mismatch', selectable: false });
    expect(unavailableReason(r, '민')).toMatch(/준/);
    expect(one('현', '珉')).toMatchObject({ eligibility: 'reading-mismatch', selectable: false });
  });

  it('an absent-but-known character is found directly, explained, and never becomes selectable or confirmed', () => {
    expect(getHanjaOptions('민').some(o => o.hanja === '閔')).toBe(false);
    const r = one('민', '閔');
    expect(r).toMatchObject({ inDictionary: true, readingDocumented: true, eligibility: 'unknown-reading', selectable: false, legal: { status: 'NOT_CONFIRMED' } });
    expect(unavailableReason(r, '민')).toMatch(/공식 확인/);
    expect(selectionEligibility('민', '閔')).toBe('unknown-reading');
  });

  it('a character missing from the dictionary is reported as such and cannot be selected', () => {
    const r = one('현', '铉');
    expect(r).toMatchObject({ inDictionary: false, selectable: false, readings: [] });
    expect(unavailableReason(r, '현')).toMatch(/사전에 없는/);
  });

  it('valid legacy selections stay exactly as stored', () => {
    for (const [syl, opts] of [['현', getHanjaOptions('현')], ['민', getHanjaOptions('민')]] as const) {
      for (const o of opts) expect(storedSelectionChar(syl, o.hanja)).toMatchObject({ hanja: o.hanja, status: 'confirmed', meaning: o.meaning, strokes: o.strokes });
    }
  });
});
