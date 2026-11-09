import { describe, expect, it } from 'vitest';
import { DesignerInput, MedicalSchedule, NameStyle } from '@/types';
import { analyzeModeA, ModeAResultSet, runModeAAnalysis, runModeBAnalysis } from '@/lib/analysis';
import { generateCandidateNames } from '@/lib/nameGenerator';
import { isSlotPermitted, normalizeSchedule } from '@/lib/schedule';
import { comboKey, oracleEvaluate, oracleUniverse } from './fixtures/optimizationOracle';

const sched = (over: Partial<MedicalSchedule> = {}): MedicalSchedule => ({
  providerConfirmed: true, timeRanges: [], exactTimes: [], ...over,
});
const input = (over: Partial<DesignerInput> = {}): DesignerInput => ({
  startDate: '2026-11-10', endDate: '2026-11-10', surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
  schedule: sched({ exactTimes: ['09:00'] }), ...over,
});

/**
 * Asserts the engine's complete ranking equals the independent exhaustive
 * evaluation: same combinations, same scores, documented order.
 */
function expectMatchesOracle(i: DesignerInput): ModeAResultSet {
  const set = analyzeModeA(i);
  const oracle = oracleEvaluate(i);
  expect(set.length).toBe(oracle.size);
  expect(set.coverage.combinations).toBe(oracle.size);

  const best = Math.max(...[...oracle.values()].map(o => o.overall));
  let prev: { overall: number; date: string; start: string; idx: number } | null = null;
  for (let p = 0; p < set.length; p++) {
    const e = set.entry(p);
    const key = comboKey(e.date, e.timeSlot.start, e.timeSlot.end, e.name);
    const o = oracle.get(key);
    expect(o, `unexpected combination ${key}`).toBeDefined();
    expect(e.overall, key).toBe(o!.overall);
    oracle.delete(key);
    if (prev) {
      // overall ↓, then date ↑, slot start ↑, canonical candidate order ↑
      const cur = { overall: e.overall, date: e.date, start: e.timeSlot.start, idx: e.candidateIndex };
      const ordered = prev.overall > cur.overall || (prev.overall === cur.overall && (
        prev.date < cur.date || (prev.date === cur.date && (
          prev.start < cur.start || (prev.start === cur.start && prev.idx < cur.idx)))));
      expect(ordered, `order at ${p}`).toBe(true);
    }
    prev = { overall: e.overall, date: e.date, start: e.timeSlot.start, idx: e.candidateIndex };
  }
  expect(oracle.size, 'combinations missing from the engine').toBe(0);
  expect(set.entry(0).overall).toBe(best);

  // Detailed results reproduce the ranked identity and score, inside the window.
  const schedule = normalizeSchedule(i.schedule!);
  for (const r of set.slice(0, 5)) {
    const e = set.entry(r.rank! - 1);
    expect(r.name.full).toBe(e.name);
    expect(r.scores.overall).toBe(e.overall);
    expect(r.timeSlot).toEqual(e.timeSlot);
    expect(isSlotPermitted(r.timeSlot!, schedule)).toBe(true);
  }
  return set;
}

// ─── F01 regression: the 200-name cap dropped higher-scoring names ───────────

describe('Mode A global optimum (audit F01)', () => {
  const audit = input({ nameStyles: ['전통형'] });

  it('finds 김가서 (79) which the former 200-name pre-selection excluded', () => {
    const set = analyzeModeA(audit);
    const ranked = Array.from({ length: set.length }, (_, p) => set.entry(p));
    const gaseo = ranked.find(e => e.name === '김가서');
    expect(gaseo?.overall).toBe(79);
    expect(set.entry(0).overall).toBeGreaterThanOrEqual(79);
    // The former cap kept only the first 200 names of the canonical order.
    expect(gaseo!.candidateIndex).toBeGreaterThanOrEqual(200);
    // The old reported winner is still evaluated and scores below the optimum.
    expect(ranked.find(e => e.name === '김윤준')?.overall).toBe(76);
  });

  it('matches the independent exhaustive oracle for the audit input', () => {
    expectMatchesOracle(audit);
  });

  it('the candidate universe is complete and uncapped', () => {
    for (const gender of ['남', '여'] as const) {
      const i = input({ gender });
      const prod = generateCandidateNames(i).map(n => n.given).sort();
      const ref = oracleUniverse(i).map(n => n.given).sort();
      expect(prod).toEqual(ref);
    }
    expect(generateCandidateNames(input({ gender: '남' }))).toHaveLength(1672);
    expect(generateCandidateNames(input({ gender: '여' }))).toHaveLength(1044);
  });

  it('Mode B ranks the same complete universe at its single time', () => {
    const b = runModeBAnalysis({ birthDate: '2026-11-10', birthHour: 9, surname: '김', gender: '남', dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: ['전통형'] });
    expect(b).toHaveLength(1672);
    expect(b.find(r => r.name.full === '김가서')?.scores.overall).toBe(79);
    expect(b[0].scores.overall).toBe(analyzeModeA(audit).entry(0).overall);
  });
});

// ─── Oracle matrix ───────────────────────────────────────────────────────────

describe('Mode A engine equals the independent exhaustive oracle', () => {
  const styles: NameStyle[][] = [[], ['전통형'], ['예술형', '리더형'], ['지적인 느낌']];
  const cases: [string, Partial<DesignerInput>][] = [
    ...styles.flatMap((s, k): [string, Partial<DesignerInput>][] => [
      [`남 ${s.join('+') || '선호 없음'}`, { gender: '남', nameStyles: s, startDate: '2026-06-15', endDate: '2026-06-15', schedule: sched({ timeRanges: [{ start: '08:00', end: '12:00' }] }) }],
      [`여 ${s.join('+') || '선호 없음'}`, { gender: '여', nameStyles: s, surname: ['이', '박', '최', '남궁'][k], startDate: '2027-03-02', endDate: '2027-03-02', schedule: sched({ exactTimes: ['13:30', '23:15'] }) }],
    ]),
    ['7-day schedule', { startDate: '2026-11-04', endDate: '2026-11-10', schedule: sched({ timeRanges: [{ start: '10:00', end: '11:00' }] }) }],
    ['14-day schedule (female, images)', { gender: '여', images: ['예술형', '리더형'], startDate: '2027-01-01', endDate: '2027-01-14', schedule: sched({ exactTimes: ['15:00'] }) }],
    ['solar-term boundary 2027 소한 23:10', { startDate: '2027-01-05', endDate: '2027-01-05', schedule: sched({ timeRanges: [{ start: '22:00', end: '00:00' }] }) }],
    ['solar-term boundary 2026 입동', { startDate: '2026-11-07', endDate: '2026-11-07', schedule: sched({ timeRanges: [{ start: '00:00', end: '00:00' }] }) }],
    ['generational 준 auto', { dolrimChar: '준', dolrimPosition: 'auto', startDate: '2026-11-10', endDate: '2026-11-12' , schedule: sched({ timeRanges: [{ start: '09:00', end: '13:00' }] }) }],
    ['generational 민 first + confirmed 敏', { gender: '여', dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'first' }],
    ['generational outside the data (똠) second', { dolrimChar: '똠', dolrimPosition: 'second' }],
  ];

  it.each(cases)('%s', (_, over) => {
    expectMatchesOracle(input(over));
  });

  it('Hanja variants of the generational character do not change any score or rank', () => {
    const a = analyzeModeA(input({ gender: '여', dolrimChar: '민', dolrimHanja: '敏', dolrimPosition: 'first' }));
    const b = analyzeModeA(input({ gender: '여', dolrimChar: '민', dolrimPosition: 'first' }));
    expect(a.length).toBe(b.length);
    for (let p = 0; p < a.length; p++) expect(a.entry(p)).toEqual(b.entry(p));
  });

  it('is deterministic and resolves ties by the documented order', () => {
    const i = input({ startDate: '2026-11-04', endDate: '2026-11-06', schedule: sched({ exactTimes: ['09:00', '21:00'] }) });
    const a = analyzeModeA(i), b = analyzeModeA(i);
    let ties = 0;
    for (let p = 0; p < a.length; p++) {
      expect(a.entry(p)).toEqual(b.entry(p));
      if (p > 0 && a.entry(p).overall === a.entry(p - 1).overall) ties++;
    }
    expect(ties).toBeGreaterThan(0); // the tie policy is actually exercised (checked by the oracle order test)
  });
});

// ─── Views and detailed results ──────────────────────────────────────────────

describe('Mode A result set', () => {
  const i = input({ gender: '여', images: ['예술형'], startDate: '2027-07-01', endDate: '2027-07-02', schedule: sched({ exactTimes: ['09:00', '14:30'] }) });

  it('detailed results equal the eager pipeline for every position', () => {
    const set = analyzeModeA(i);
    const eager = runModeAAnalysis(i);
    expect(eager).toHaveLength(set.length);
    eager.forEach((r, p) => {
      expect(r.rank).toBe(p + 1);
      expect(r.scores.overall).toBe(set.entry(p).overall);
      expect(r.name.full).toBe(set.entry(p).name);
    });
  });

  it('grade counts and grade/image views partition the ranking without reordering', () => {
    const set = analyzeModeA(i);
    const all = set.slice(0, set.length);
    const sum = Object.values(set.gradeCounts).reduce((x, y) => x + y, 0);
    expect(sum).toBe(set.length);
    for (const g of ['SS', 'S', 'A', 'B', 'C'] as const) {
      const v = set.view({ grade: g });
      const expected = all.filter(r => r.grade === g);
      expect(v.length).toBe(set.gradeCounts[g]);
      expect(v.slice(0, v.length).map(r => r.id)).toEqual(expected.map(r => r.id));
    }
    const img = set.view({ image: '예술형' });
    const expected = all.filter(r => r.imageMatches.includes('예술형'));
    expect(img.length).toBe(expected.length);
    expect(img.slice(0, 50).map(r => r.id)).toEqual(expected.slice(0, 50).map(r => r.id));
  });
});
