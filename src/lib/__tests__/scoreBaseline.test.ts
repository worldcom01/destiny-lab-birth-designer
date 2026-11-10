// Numerical integrity baseline for Mode A, B and C.
//
// The fixture was captured from the code before the R3 wording changes
// (commit b18708f). R3 changes labels and explanations only, so every component
// score, overall score, ranking, candidate universe and pillar must stay
// identical. Regenerate only for an intentional, reviewed scoring change:
//   UPDATE_SCORE_BASELINE=1 npx vitest run src/lib/__tests__/scoreBaseline.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnalysisResult, DesignerInput, ModeBInput, ModeCInput, SIJIN_VERSION } from '@/types';
import { analyzeModeA, analyzeModeCNames, applyHanjaSelections, runModeBAnalysis } from '@/lib/analysis';
import { generateCandidateNames } from '@/lib/nameGenerator';
import { getHanjaOptions } from '@/data/hanjaDB';

const FIXTURE = path.join(__dirname, 'fixtures', 'scoreBaseline.json');

// FNV-1a over a string: a compact fingerprint of a complete ranking.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const scoresOf = (r: AnalysisResult) => ({ ...r.scores });
const pillarsOf = (r: AnalysisResult) => [r.fourPillars.year, r.fourPillars.month, r.fourPillars.day, r.fourPillars.hour].map(p => p.label).join(' ');
const row = (r: AnalysisResult) => ({ rank: r.rank, id: r.id, grade: r.grade, pillars: pillarsOf(r), scores: scoresOf(r) });

const sched = (over: Partial<NonNullable<DesignerInput['schedule']>>) => ({ providerConfirmed: true, timeRanges: [], exactTimes: [], ...over });
const MODE_A: Record<string, DesignerInput> = {
  'audit-09:00-male-traditional': {
    startDate: '2026-11-10', endDate: '2026-11-10', surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto',
    images: [], nameStyles: ['전통형'], schedule: sched({ exactTimes: ['09:00'] }),
  },
  '7day-female-images-styles': {
    startDate: '2026-12-04', endDate: '2026-12-10', surname: '남궁', gender: '여', dolrimChar: '', dolrimPosition: 'auto',
    images: ['예술형', '리더형'], nameStyles: ['예술형', '리더형'], schedule: sched({ timeRanges: [{ start: '09:00', end: '13:00' }] }),
  },
  'dolrim-min-first': {
    startDate: '2027-01-04', endDate: '2027-01-06', surname: '이', gender: '남', dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'first',
    images: ['학자형'], nameStyles: [], schedule: sched({ timeRanges: [{ start: '22:00', end: '00:00' }] }),
  },
};
const B = (over: Partial<ModeBInput>): ModeBInput => ({
  birthDate: '2028-11-07', birthHour: 0, sijinVersion: SIJIN_VERSION, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], ...over,
});
const MODE_B: Record<string, ModeBInput> = {
  'early-zi-traditional': B({ nameStyles: ['전통형'] }),
  'late-zi-images': B({ birthHour: 23, images: ['예술형'] }),
  'dolrim-min-hanja': B({ birthDate: '2027-07-04', birthHour: 9, gender: '여', dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'auto', sijinVersion: undefined }),
};
const MODE_C: Record<string, ModeCInput> = {
  'mixed-names-early-zi': { birthDate: '2028-11-07', birthHour: 0, sijinVersion: SIJIN_VERSION, gender: '여', names: ['김민서', '이서윤', '남궁 민', '박똠별', '최하늘', '정우'] },
};

function capture() {
  const modeA: Record<string, unknown> = {};
  for (const [k, input] of Object.entries(MODE_A)) {
    const set = analyzeModeA(input);
    const keys: string[] = [];
    for (let p = 0; p < set.length; p++) {
      const e = set.entry(p);
      keys.push(`${e.date}|${e.timeSlot.start}|${e.timeSlot.end}|${e.name}|${e.overall}`);
    }
    modeA[k] = {
      coverage: set.coverage, gradeCounts: set.gradeCounts,
      rankingHash: fnv1a(keys.join('\n')),
      top: set.slice(0, 25).map(row),
    };
  }
  const modeB: Record<string, unknown> = {};
  for (const [k, input] of Object.entries(MODE_B)) {
    const rs = runModeBAnalysis(input);
    modeB[k] = { count: rs.length, rankingHash: fnv1a(rs.map(r => `${r.name.full}|${JSON.stringify(r.scores)}`).join('\n')), top: rs.slice(0, 25).map(row) };
  }
  const modeC: Record<string, unknown> = {};
  for (const [k, input] of Object.entries(MODE_C)) {
    const a = analyzeModeCNames(input);
    modeC[k] = { results: a.results.map(row), rejected: a.rejected };
  }
  const universe = {
    male: generateCandidateNames({ ...MODE_A['audit-09:00-male-traditional'] }).length,
    female: generateCandidateNames({ ...MODE_A['7day-female-images-styles'] }).length,
  };
  return { modeA, modeB, modeC, universe };
}

describe('score baseline (R3 must not change any number)', () => {
  const current = capture();
  if (process.env.UPDATE_SCORE_BASELINE === '1') fs.writeFileSync(FIXTURE, JSON.stringify(current, null, 1) + '\n');
  const baseline = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

  it('Mode A: coverage, grade counts, complete ranking and top component scores are identical', () => {
    expect(current.modeA).toEqual(baseline.modeA);
  });
  it('Mode B: every name, component score and order is identical (early/late 자시 pillars included)', () => {
    expect(current.modeB).toEqual(baseline.modeB);
  });
  it('Mode C: every component score, rank and pillar is identical', () => {
    expect(current.modeC).toEqual(baseline.modeC);
  });
  it('the R1 candidate universe is unchanged', () => {
    expect(current.universe).toEqual(baseline.universe);
    expect(current.universe).toEqual({ male: 1672, female: 1044 });
  });

  it('a Hanja selection changes Hanja text only, never a score or rank', () => {
    const before = runModeBAnalysis(MODE_B['early-zi-traditional']).slice(0, 40);
    // Choose, for every given-name syllable, a registered Hanja different from the current one.
    const selections = Object.fromEntries(before.map(r => [r.name.full, r.name.hanja.given.map(c =>
      getHanjaOptions(c.hangul).map(o => o.hanja).find(h => h !== c.hanja) ?? null)]));
    const changed = applyHanjaSelections(before, selections);
    let hanjaChanged = 0;
    changed.forEach((r, i) => {
      if (r.nameAnalysis.hanja !== before[i].nameAnalysis.hanja) hanjaChanged++;
      expect(r.scores).toEqual(before[i].scores);
      expect(r.rank).toBe(before[i].rank);
    });
    expect(hanjaChanged).toBeGreaterThan(30); // the selection really changed the Hanja
  });
});
