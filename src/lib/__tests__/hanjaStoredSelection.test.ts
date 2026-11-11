// R4.1A Phase 3: compatibility audit of stored given-name selections (storedSelectionChar).
import { describe, expect, it } from 'vitest';
import { HANJA_DB } from '@/data/hanjaDB';
import {
  applySelectionToName, charStatusLabel, classifyStoredSelection, hanjaStatusLabel, storedSelectionChar, totalStrokes,
} from '@/lib/hanjaModel';
import { analyzeModeCNames, applyHanjaSelections } from '@/lib/analysis';
import type { AnalysisResult } from '@/types';

const C = (names: string[]) => analyzeModeCNames({ birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names }).results;
const byName = (rs: AnalysisResult[], n: string) => rs.find(r => r.name.full === n)!;

describe('classification of stored selections', () => {
  it('every syllable/Hanja pair the app has ever offered (all values it can have saved) is "offered" and fully resolved', () => {
    let n = 0;
    for (const [syl, opts] of Object.entries(HANJA_DB)) for (const o of opts) {
      expect(classifyStoredSelection(syl, o.hanja)).toBe('offered');
      expect(storedSelectionChar(syl, o.hanja)).toMatchObject({ hanja: o.hanja, status: 'confirmed', meaning: o.meaning, strokes: o.strokes, inDatabase: true });
      expect(storedSelectionChar(syl, o.hanja)!.readingUnverified).toBeUndefined();
      n++;
    }
    expect(n).toBe(118);
  });

  it.each([
    ['민', '閔', 'unknown-reading'],       // real 민 character the app does not list: preserved, unverified
    ['현', '俊', 'reading-mismatch'],      // the app lists 俊 only under 준
    ['민', '鉉', 'reading-mismatch'],      // the app lists 鉉 only under 현
    ['낙', '樂', 'compatibility-form'], // compatibility code point of 樂: never folded
    ['요', '樂', 'compatibility-form'],
    ['민', 'A', 'invalid'],
    ['민', '민', 'invalid'],
    ['민', '珉珉', 'invalid'],
    ['민', '\uD800', 'invalid'],
    ['민', '', 'invalid'],
  ])('%s + %s -> %s', (syl, hanja, kind) => {
    expect(classifyStoredSelection(syl, hanja)).toBe(kind);
  });

  it('a unified ideograph inside the compatibility block (U+FA0E 﨎) is not treated as a compatibility form', () => {
    expect(classifyStoredSelection('민', '﨎')).toBe('unknown-reading');
  });
});

describe('display policy (never replaced, never presented as verified)', () => {
  it('unknown-reading and compatibility forms keep the exact stored code point, marked unverified, with no borrowed data', () => {
    for (const [syl, h] of [['민', '閔'], ['낙', '樂']] as const) {
      const c = storedSelectionChar(syl, h)!;
      expect(c).toEqual({ hangul: syl, hanja: h, status: 'confirmed', meaning: null, strokes: null, jaWonOhaeng: null, inDatabase: false, readingUnverified: true });
      expect(c.hanja!.codePointAt(0)).toBe(h.codePointAt(0));
      expect(charStatusLabel(c)).toBe('확정·음 미확인');
      expect(totalStrokes([c])).toBeNull();
    }
  });

  it('mismatched readings and invalid values are not applied; the suggestion/unassigned state stays', () => {
    const r = byName(C(['김현서']), '김현서');
    expect(applySelectionToName(r.name, ['俊'])).toBe(r.name);
    expect(applySelectionToName(r.name, ['A', '\uD800'])).toBe(r.name);
  });

  it('a verified offered choice keeps the plain "확정" label', () => {
    expect(charStatusLabel(storedSelectionChar('민', '珉')!)).toBe('확정');
  });
});

describe('name shapes and position boundaries', () => {
  it('compound surname: selections apply to given-name positions only, surname untouched', () => {
    const base = C(['남궁민준']);
    const r = byName(applyHanjaSelections(base, { 남궁민준: ['閔', '俊'] }), '남궁민준');
    expect(r.name.hanja.surname).toEqual(byName(base, '남궁민준').name.hanja.surname);
    expect(r.name.hanja.surname.map(c => c.status)).toEqual(['unassigned', 'unassigned']);
    expect(r.name.hanja.given.map(c => [c.hangul, c.hanja, c.readingUnverified ?? false])).toEqual([['민', '閔', true], ['준', '俊', false]]);
    expect(hanjaStatusLabel(r.name.hanja)).toBe('확정 한자(음 미확인 포함)');
  });

  it('one-, two- and three-syllable given names: each index stays at its own syllable; extra entries are ignored', () => {
    const base = C(['이준', '김민서', '김가나서']);
    const out = applyHanjaSelections(base, { 이준: ['俊', '珉'], 김민서: ['閔', '瑞'], 김가나서: [null, null, '瑞'] });
    expect(byName(out, '이준').name.hanja.given.map(c => c.hanja)).toEqual(['俊']);
    expect(byName(out, '김민서').name.hanja.given.map(c => [c.hanja, c.status])).toEqual([['閔', 'confirmed'], ['瑞', 'confirmed']]);
    const three = byName(out, '김가나서').name.hanja.given;
    expect(three).toHaveLength(3);
    expect(three[2]).toMatchObject({ hangul: '서', hanja: '瑞', status: 'confirmed', strokes: 13 });
    expect(three.slice(0, 2)).toEqual(byName(base, '김가나서').name.hanja.given.slice(0, 2));
    // a value placed at the wrong position is a reading mismatch there, not moved elsewhere
    expect(byName(applyHanjaSelections(base, { 김민서: ['瑞', '珉'] }), '김민서').name).toBe(byName(base, '김민서').name);
  });

  it('scores and ranks never change, whatever is stored', () => {
    const base = C(['김민서', '이준', '남궁민준', '김가나서']);
    const out = applyHanjaSelections(base, { 김민서: ['閔', '樂'], 이준: ['鉉'], 남궁민준: ['閔', '俊'], 김가나서: [null, null, '瑞'] });
    expect(out.map(r => [r.name.full, r.rank, r.scores])).toEqual(base.map(r => [r.name.full, r.rank, r.scores]));
  });

  it('the stored selections object is never modified', () => {
    const sel = { 김민서: ['閔', '俊'] };
    const copy = structuredClone(sel);
    applyHanjaSelections(C(['김민서']), sel);
    expect(sel).toEqual(copy);
  });
});
