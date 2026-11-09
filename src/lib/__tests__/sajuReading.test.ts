import { describe, expect, it } from 'vitest';
import { NameHanjaModel, OhaengBalance } from '@/types';
import { calculateFourPillars } from '@/lib/saju';
import { buildSajuReading, describeNameRelation, describeSaju, READING_DISCLAIMER } from '@/lib/sajuReading';
import { analyzeModeCNames, runModeBAnalysis } from '@/lib/analysis';

const bal = (목: number, 화: number, 토: number, 금: number, 수: number): OhaengBalance => ({ 목, 화, 토, 금, 수 });
const noHanja = (n: number): NameHanjaModel => ({
  surname: [],
  given: Array.from({ length: n }, () => ({ hangul: '가', hanja: null, status: 'unassigned', meaning: null, strokes: null, jaWonOhaeng: null, inDatabase: false })),
});

describe('day master line', () => {
  it('covers all ten day stems with their traditional image and correct particle', () => {
    const seen = new Map<string, string>();
    for (let i = 0; i < 10; i++) {
      const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
      const fp = calculateFourPillars(new Date(`${date}T00:00:00`), 9);
      seen.set(fp.day.label.slice(0, 2), describeSaju(fp, bal(2, 2, 2, 1, 1)).dayMaster);
    }
    expect(seen.size).toBe(10);
    expect(seen.get('경庚')).toBe('경금(庚金) 일간입니다. 전통 해석에서 경금은 단단한 쇠와 바위에 비유됩니다.');
    expect(seen.get('임壬')).toBe('임수(壬水) 일간입니다. 전통 해석에서 임수는 넓은 바다와 큰 강에 비유됩니다.');
    expect(seen.get('병丙')).toBe('병화(丙火) 일간입니다. 전통 해석에서 병화는 하늘의 태양에 비유됩니다.');
    expect(seen.get('갑甲')).toBe('갑목(甲木) 일간입니다. 전통 해석에서 갑목은 곧게 자라는 큰 나무에 비유됩니다.');
  });
});

describe('distribution line', () => {
  const fp = calculateFourPillars(new Date('2027-01-11T00:00:00'), 13);

  it('names the most and least frequent elements', () => {
    expect(describeSaju(fp, bal(1, 2, 2, 2, 1)).distribution)
      .toBe('목 1 · 화 2 · 토 2 · 금 2 · 수 1 — 화·토·금이 각 2개로 가장 많고, 목·수가 각 1개로 가장 적습니다.');
    expect(describeSaju(fp, bal(0, 3, 2, 2, 1)).distribution)
      .toBe('목 0 · 화 3 · 토 2 · 금 2 · 수 1 — 화가 3개로 가장 많고, 목이 없습니다.');
    expect(describeSaju(fp, bal(0, 3, 2, 3, 0)).weak).toEqual(['목', '수']);
  });
});

describe('name relation line', () => {
  it('reports whether the name supplies a lacking element (pronunciation or Hanja)', () => {
    expect(describeNameRelation('재우', ['금', '토'], noHanja(2), ['목', '수']))
      .toBe("이름 '재우'의 발음오행은 금·토입니다. 사주에 적은 목·수가 이름에는 없습니다. 전통 작명에서는 적은 오행을 이름으로 보완하는 것을 선호합니다.");
    expect(describeNameRelation('민서', ['수', '금'], noHanja(2), ['목', '수']))
      .toBe("이름 '민서'의 발음오행은 수·금입니다. 사주에 적은 목·수 가운데 수가 이름에 들어 있어, 전통 작명에서 말하는 보완에 해당합니다.");
    const withHanja: NameHanjaModel = {
      surname: [],
      given: [
        { hangul: '재', hanja: '在', status: 'confirmed', meaning: '있을 재', strokes: 6, jaWonOhaeng: '토', inDatabase: true },
        { hangul: '우', hanja: '羽', status: 'confirmed', meaning: '깃 우', strokes: 6, jaWonOhaeng: '목', inDatabase: true },
      ],
    };
    expect(describeNameRelation('재우', ['금', '토'], withHanja, ['목', '수']))
      .toBe("이름 '재우'의 발음오행은 금·토, 한자 자원오행은 토·목입니다. 사주에 적은 목·수 가운데 목이 이름에 들어 있어, 전통 작명에서 말하는 보완에 해당합니다.");
  });
});

describe('full reading on real results', () => {
  // Same safety bar as P0-D1 H05: no developmental, health or success predictions.
  const FORBIDDEN = /발달 가능성|성취로|성공|탁월|잠재력|예상할 수|될 것입니다|할 것입니다|이어질 것|보장합니다|능력이 뛰어|능력이 있습니다|성과를|적성|건강하|장수|재물운|운이 좋/;

  it('is deterministic, complete and free of predictive claims', () => {
    const results = [
      ...runModeBAnalysis({ birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '여', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [] }).slice(0, 30),
      ...analyzeModeCNames({ birthDate: '2027-03-15', birthHour: 21, gender: '남', names: ['남궁민준', '김준', '이가나다'] }).results,
    ];
    for (const r of results) {
      const a = buildSajuReading(r);
      expect(buildSajuReading(r)).toEqual(a);
      expect(a.disclaimer).toBe(READING_DISCLAIMER);
      for (const line of [a.dayMaster, a.distribution, a.nameRelation]) {
        expect(line.length).toBeGreaterThan(10);
        expect(line).not.toMatch(FORBIDDEN);
      }
      expect(a.nameRelation).toContain(`'${r.name.given}'`);
    }
  });
});
