import { describe, expect, it } from 'vitest';
import { DesignerInput, MedicalSchedule, ModeBInput } from '@/types';
import { analyzeModeCNames, runModeAAnalysis, runModeBAnalysis } from '@/lib/analysis';
import { InputValidationError, validateDesignerInput, validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { buildDaySlots, findTransitionInSijin, normalizeSchedule, parseHm } from '@/lib/schedule';
import { parseIsoCivilDate } from '@/lib/calendar';
import { loadAndRun } from '@/lib/resultLoader';
import { calculateFourPillars } from '@/lib/saju';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const schedule = (over: Partial<MedicalSchedule> = {}): MedicalSchedule => ({
  providerConfirmed: true, timeRanges: [{ start: '09:00', end: '12:00' }], exactTimes: [], ...over,
});
const modeA = (over: Partial<DesignerInput> = {}): DesignerInput => ({
  startDate: '2027-07-01', endDate: '2027-07-03', surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], schedule: schedule(), ...over,
});
const modeB: ModeBInput = {
  birthDate: '2027-07-04', birthHour: 9, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
};
const messages = (v: ReturnType<typeof validateDesignerInput>) => (v.ok ? [] : v.issues.map(i => i.message).join(' | '));
const slotsOn = (iso: string, s: MedicalSchedule) => buildDaySlots(parseIsoCivilDate(iso)!, normalizeSchedule(s)).map(x => x.slot);
const minutesOf = (hhmm: string) => (hhmm === '24:00' ? 1440 : parseHm(hhmm)!);

// ─── Scheduling range validation ─────────────────────────────────────────────

describe('Mode A scheduling validation', () => {
  it('accepts a confirmed window inside the supported range', () => {
    expect(validateDesignerInput(modeA()).ok).toBe(true);
    expect(validateDesignerInput(modeA({ startDate: '2027-07-01', endDate: '2027-07-30' })).ok).toBe(true); // 30 days
  });

  it.each([
    ['start after end', { startDate: '2027-07-05', endDate: '2027-07-01' }, '종료일은 시작일 이후'],
    ['31 days (tampered past the UI limit)', { startDate: '2027-07-01', endDate: '2027-07-31' }, '최대 30일'],
    ['outside supported years', { startDate: '2029-01-01', endDate: '2029-01-02' }, '분석 가능 기간'],
    ['before supported range', { startDate: '2019-01-06', endDate: '2019-01-07' }, '분석 가능 기간'],
    ['impossible date', { startDate: '2027-02-30', endDate: '2027-03-01' }, '올바른 날짜'],
    ['provider not confirmed', { schedule: schedule({ providerConfirmed: false }) }, '의료진이 허용한 범위인지'],
    ['empty availability', { schedule: schedule({ timeRanges: [], exactTimes: [] }) }, '1개 이상'],
    ['end before start', { schedule: schedule({ timeRanges: [{ start: '12:00', end: '09:00' }] }) }, '종료 시각은 시작 시각보다'],
    ['zero-length range', { schedule: schedule({ timeRanges: [{ start: '09:00', end: '09:00' }] }) }, '종료 시각은 시작 시각보다'],
    ['malformed time', { schedule: schedule({ timeRanges: [{ start: '9시', end: '12:00' }] }) }, '형식이 올바르지'],
    ['malformed exact time', { schedule: schedule({ exactTimes: ['25:00'] }) }, '형식이 올바르지'],
    ['non-Hangul surname', { surname: 'Kim' }, '성씨는 한글'],
  ] as [string, Partial<DesignerInput>, string][])('rejects %s', (_, over, expected) => {
    const v = validateDesignerInput(modeA(over));
    expect(v.ok).toBe(false);
    expect(messages(v)).toContain(expected);
  });

  it('treats a stored input without a schedule as legacy, never as "all hours"', () => {
    const legacy = { ...modeA(), analysisLevel: '정밀' } as Record<string, unknown>;
    delete legacy.schedule;
    const v = validateDesignerInput(legacy);
    expect(v).toMatchObject({ ok: false, kind: 'legacy' });
    expect(() => runModeAAnalysis(legacy as unknown as DesignerInput)).toThrow(InputValidationError);
  });

  it('validates at the engine boundary too (invalid input never reaches scoring)', () => {
    expect(() => runModeAAnalysis(modeA({ endDate: '2027-08-15' }))).toThrow(InputValidationError);
    expect(() => runModeAAnalysis(modeA({ schedule: schedule({ timeRanges: [] }) }))).toThrow(/1개 이상/);
  });
});

// ─── Permitted slots ─────────────────────────────────────────────────────────

describe('permitted time slots', () => {
  it('splits a range only at branch boundaries and never widens it to a whole branch', () => {
    expect(slotsOn('2027-07-02', schedule({ timeRanges: [{ start: '09:30', end: '10:15' }] })))
      .toEqual([{ start: '09:30', end: '10:15' }]);
    expect(slotsOn('2027-07-02', schedule({ timeRanges: [{ start: '08:30', end: '11:20' }] }))).toEqual([
      { start: '08:30', end: '09:00' }, { start: '09:00', end: '11:00' }, { start: '11:00', end: '11:20' },
    ]);
  });

  it('supports exact time slots, merges overlaps and drops exact times already covered', () => {
    const s = schedule({
      timeRanges: [{ start: '09:00', end: '10:00' }, { start: '09:30', end: '10:30' }],
      exactTimes: ['09:45', '14:20', '14:20'],
    });
    expect(slotsOn('2027-07-02', s)).toEqual([
      { start: '09:00', end: '10:30' }, { start: '14:20', end: null },
    ]);
  });

  it('"00:00" as an end means midnight and 23:00-24:00 keeps the 23:00 convention', () => {
    expect(slotsOn('2027-07-02', schedule({ timeRanges: [{ start: '22:30', end: '00:00' }] }))).toEqual([
      { start: '22:30', end: '23:00' }, { start: '23:00', end: '24:00' },
    ]);
  });

  it('splits at a real solar-term instant inside the permitted range (2027 소한 23:10 KST)', () => {
    const r = runModeAAnalysis(modeA({
      startDate: '2027-01-05', endDate: '2027-01-05',
      schedule: schedule({ timeRanges: [{ start: '22:00', end: '00:00' }] }),
    }));
    const bySlot = new Map(r.map(x => [`${x.timeSlot!.start}~${x.timeSlot!.end}`, x.fourPillars.month.label]));
    expect([...bySlot.keys()].sort()).toEqual(['22:00~23:00', '23:00~23:10', '23:10~24:00']);
    expect(bySlot.get('23:00~23:10')).toContain('子'); // 庚子 month before 소한
    expect(bySlot.get('23:10~24:00')).toContain('丑'); // 辛丑 month after 소한
    expect(bySlot.get('22:00~23:00')).toContain('子');
  });

  it('never generates or ranks a time outside the permitted window', () => {
    const s = schedule({ timeRanges: [{ start: '10:10', end: '13:40' }], exactTimes: ['16:05'] });
    const r = runModeAAnalysis(modeA({ schedule: s }));
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) {
      const start = minutesOf(x.timeSlot!.start);
      const evaluated = x.hour * 60 + x.minute;
      expect(evaluated).toBe(start);
      if (x.timeSlot!.end === null) expect(x.timeSlot!.start).toBe('16:05');
      else {
        expect(start).toBeGreaterThanOrEqual(600);
        expect(minutesOf(x.timeSlot!.end)).toBeLessThanOrEqual(820);
      }
      expect(x.date.getDate()).toBeGreaterThanOrEqual(1);
      expect(x.date.getDate()).toBeLessThanOrEqual(3);
    }
    expect(new Set(r.map(x => x.id)).size).toBe(r.length);
  });

  it('medical eligibility is a filter, not a score: same slot gives the same scores with or without other slots', () => {
    const narrow = runModeAAnalysis(modeA({ startDate: '2027-07-02', endDate: '2027-07-02', schedule: schedule({ timeRanges: [{ start: '09:00', end: '10:00' }] }) }));
    const wide = runModeAAnalysis(modeA({ startDate: '2027-07-02', endDate: '2027-07-02', schedule: schedule({ timeRanges: [{ start: '09:00', end: '10:00' }, { start: '15:00', end: '16:00' }] }) }));
    const key = (x: typeof narrow[number]) => `${x.timeSlot!.start}-${x.name.full}`;
    const wideMap = new Map(wide.map(x => [key(x), x.scores]));
    for (const x of narrow) expect(wideMap.get(key(x))).toEqual(x.scores);
  });
});

// ─── Mode B/C 시진 vs solar-term transitions ─────────────────────────────────

describe('Mode B/C sijin at solar-term transitions', () => {
  it('detects a jie inside the chosen 시진 and refuses to approximate', () => {
    expect(findTransitionInSijin('2024-02-04', 17)).toEqual({ name: '입춘', time: '17:27' }); // 酉시 17-19
    expect(findTransitionInSijin('2024-02-04', 15)).toBeNull();
    expect(findTransitionInSijin('2027-01-05', 23)).toEqual({ name: '소한', time: '23:10' }); // 자시 covers 23:00-24:00 and 00:00-01:00
    const v = validateModeBInput({ ...modeB, birthDate: '2024-02-04', birthHour: 17 });
    expect(v.ok).toBe(false);
    expect(() => runModeBAnalysis({ ...modeB, birthDate: '2024-02-04', birthHour: 17 })).toThrow(/절기 전환\(입춘 17:27 KST\)/);
    expect(validateModeCInput({ birthDate: '2024-02-04', birthHour: 17, gender: '남', names: ['김민준'] }).ok).toBe(false);
  });

  it('accepts other sijin and rejects tampered hours, dates and name lists', () => {
    expect(validateModeBInput(modeB).ok).toBe(true);
    expect(validateModeBInput({ ...modeB, birthHour: 25 }).ok).toBe(false);
    expect(validateModeBInput({ ...modeB, birthHour: '9' as unknown as number }).ok).toBe(false);
    expect(validateModeBInput({ ...modeB, birthDate: '2035-01-01' }).ok).toBe(false);
    expect(validateModeBInput({ ...modeB, images: ['해킹형' as never] }).ok).toBe(false);
    expect(validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: '김민준' }).ok).toBe(false);
    expect(validateModeCInput({ birthDate: '2027-07-04', birthHour: 9, gender: '남', names: Array(11).fill('김민준') }).ok).toBe(false);
    expect(() => analyzeModeCNames({ birthDate: 'bad', birthHour: 9, gender: '남', names: ['김민준'] })).toThrow(InputValidationError);
  });

  it('keeps accepting legacy Mode B input without the optional dolrimHanja/nameStyles fields', () => {
    const legacy = { ...modeB } as Record<string, unknown>;
    delete legacy.dolrimHanja;
    delete legacy.nameStyles;
    expect(validateModeBInput(legacy).ok).toBe(true);
  });
});

// ─── Stored-input recovery (pure loader) ─────────────────────────────────────

describe('result loader recovery', () => {
  const store = (value: string | null, throws = false) => ({
    getItem: () => { if (throws) throw new Error('denied'); return value; },
  });
  const runA = (i: DesignerInput) => runModeAAnalysis(i);

  it('ready for valid stored input', () => {
    const s = loadAndRun('k', validateDesignerInput, runA, store(JSON.stringify(modeA())));
    expect(s.status).toBe('ready');
  });

  it.each([
    ['missing', null, 'missing'],
    ['invalid JSON', '{"startDate": ', 'corrupt'],
    ['JSON null', 'null', 'invalid'],
    ['legacy Mode A (no schedule)', JSON.stringify({ ...modeA(), schedule: undefined, analysisLevel: '간단' }), 'legacy'],
    ['tampered 31-day range', JSON.stringify(modeA({ startDate: '2027-07-01', endDate: '2027-07-31' })), 'invalid'],
    ['tampered out-of-range year', JSON.stringify(modeA({ startDate: '2030-01-01', endDate: '2030-01-02' })), 'invalid'],
    ['tampered schedule', JSON.stringify(modeA({ schedule: { providerConfirmed: true } as unknown as MedicalSchedule })), 'invalid'],
  ])('%s → %s', (_, raw, kind) => {
    const s = loadAndRun('k', validateDesignerInput, runA, store(raw));
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error.kind).toBe(kind);
      expect(s.error.title.length).toBeGreaterThan(0);
    }
  });

  it('storage access failure, engine exceptions and calendar range errors become error states', () => {
    expect(loadAndRun('k', validateDesignerInput, runA, store(null, true))).toMatchObject({ status: 'error', error: { kind: 'corrupt' } });
    const boom = loadAndRun('k', validateModeBInput, () => { throw new Error('boom'); }, store(JSON.stringify(modeB)));
    expect(boom).toMatchObject({ status: 'error', error: { kind: 'analysis' } });
    // A validator that lets an unsupported date through still ends in a 'range' error state.
    const lax = (raw: unknown) => ({ ok: true as const, value: raw as ModeBInput });
    const range = loadAndRun('k', lax, i => runModeBAnalysisUnchecked(i), store(JSON.stringify({ ...modeB, birthDate: '2035-06-01' })));
    expect(range).toMatchObject({ status: 'error', error: { kind: 'range' } });
  });
});

// Calls the calendar directly so a CalendarRangeError (not a validation error) is raised.
function runModeBAnalysisUnchecked(i: ModeBInput) {
  return calculateFourPillars(new Date(`${i.birthDate}T00:00:00`), i.birthHour);
}
