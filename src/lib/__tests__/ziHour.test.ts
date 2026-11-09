import { describe, expect, it } from 'vitest';
import { ModeBInput, ModeCInput, SIJIN_OPTIONS, SIJIN_VERSION } from '@/types';
import { analyzeModeCNames, runModeBAnalysis } from '@/lib/analysis';
import { InputValidationError, isLegacyZiInput, LEGACY_ZI_MESSAGE, validateModeBInput, validateModeCInput } from '@/lib/inputValidation';
import { findTransitionInSijin, isoDatesBetween, jieTransitionsOn, sijinInterval } from '@/lib/schedule';
import { parseIsoCivilDate, SUPPORTED_KST_DATE_RANGE } from '@/lib/calendar';
import { calculateFourPillars } from '@/lib/saju';
import { loadAndRun } from '@/lib/resultLoader';
import { loadModeBFormInit, loadModeCFormInit, MODE_B_STORAGE_KEY, MODE_C_STORAGE_KEY } from '@/lib/formRestore';

const B = (over: Record<string, unknown> = {}): ModeBInput => ({
  birthDate: '2028-11-07', birthHour: 23, sijinVersion: SIJIN_VERSION, surname: '김', gender: '남',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [], ...over,
} as ModeBInput);
const C = (over: Record<string, unknown> = {}): ModeCInput => ({
  birthDate: '2028-11-07', birthHour: 23, sijinVersion: SIJIN_VERSION, gender: '여', names: ['김민서', '이서윤'], ...over,
} as ModeCInput);
const legacy = <T extends object>(x: T) => { const r = { ...x } as Record<string, unknown>; delete r.sijinVersion; return r; };
const pillars = (iso: string, h: number, m = 0) => {
  const p = calculateFourPillars(new Date(iso + 'T00:00:00'), h, m);
  return { year: p.year.label, month: p.month.label, day: p.day.label, hour: p.hour.label };
};
// Pillar labels look like '임壬·술戌'; compare the Hanja only.
const hz = (label: string) => label.replace(/[^\u4e00-\u9fff]/g, '');
const store = (key: string, value: unknown) => ({ getItem: (k: string) => (k === key ? JSON.stringify(value) : null) });

// ─── Audit F03: a jie between 조자시 and 야자시 no longer rejects either choice ─

describe('split 자시 (조자시 00:00-01:00 / 야자시 23:00-24:00)', () => {
  it('2028-11-07 (입동 06:27 KST): both 자시 choices are valid and keep their own month pillar', () => {
    expect(findTransitionInSijin('2028-11-07', 0)).toBeNull();
    expect(findTransitionInSijin('2028-11-07', 23)).toBeNull();
    expect(findTransitionInSijin('2028-11-07', 5)).toEqual({ name: '입동', time: '06:27' }); // 卯 05-07 still rejected

    const early = runModeBAnalysis(B({ birthHour: 0 }));
    const late = runModeBAnalysis(B({ birthHour: 23 }));
    expect(hz(early[0].fourPillars.month.label)).toBe('壬戌'); // before 입동
    expect(hz(late[0].fourPillars.month.label)).toBe('癸亥');  // after 입동
    // Same-civil-date convention unchanged: same day and hour pillar for both.
    expect(early[0].fourPillars.day).toEqual(late[0].fourPillars.day);
    expect(early[0].fourPillars.hour).toEqual(late[0].fourPillars.hour);

    expect(hz(analyzeModeCNames(C({ birthHour: 0 })).results[0].fourPillars.month.label)).toBe('壬戌');
    expect(hz(analyzeModeCNames(C({ birthHour: 23 })).results[0].fourPillars.month.label)).toBe('癸亥');
  });

  it.each([
    ['2026-12-07 대설 11:53', '2026-12-07', { month: '己亥' }, { month: '庚子' }],
    ['2027-02-04 입춘 10:46 (year changes)', '2027-02-04', { year: '丙午', month: '辛丑' }, { year: '丁未', month: '壬寅' }],
    ['2026-11-07 입동 18:52', '2026-11-07', { month: '戊戌' }, { month: '己亥' }],
  ])('%s: daytime jie, each 자시 uses its own interval', (_, date, early, late) => {
    expect(validateModeBInput(B({ birthDate: date, birthHour: 0 })).ok).toBe(true);
    expect(validateModeBInput(B({ birthDate: date, birthHour: 23 })).ok).toBe(true);
    const e = runModeBAnalysis(B({ birthDate: date, birthHour: 0 }))[0].fourPillars;
    const l = runModeBAnalysis(B({ birthDate: date, birthHour: 23 }))[0].fourPillars;
    for (const [k, v] of Object.entries(early)) expect(hz(e[k as 'year' | 'month'].label)).toBe(v);
    for (const [k, v] of Object.entries(late)) expect(hz(l[k as 'year' | 'month'].label)).toBe(v);
  });

  it.each([
    ['소한 inside 야자시', '2027-01-05', 23, '소한 23:10', 0],
    ['대설 inside 야자시', '2028-12-06', 23, '대설 23:25', 0],
    ['망종 inside 조자시', '2026-06-06', 0, '망종 00:48', 23],
    ['입동 inside 조자시', '2027-11-08', 0, '입동 00:39', 23],
  ])('%s: the affected choice asks for an exact time, the other is valid', (_, date, hour, jie, other) => {
    for (const v of [validateModeBInput(B({ birthDate: date, birthHour: hour })), validateModeCInput(C({ birthDate: date, birthHour: hour }))]) {
      expect(v.ok).toBe(false);
      if (v.ok) continue;
      expect(v.kind).toBe('invalid');
      expect(v.issues[0].field).toBe('time');
      expect(v.issues[0].message).toContain(`${jie} KST`);
      expect(v.issues[0].message).toContain('정확한 출생 시각');
      expect(v.issues[0].message).toContain(hour === 0 ? '조자시 00:00~01:00' : '야자시 23:00~24:00');
    }
    expect(() => runModeBAnalysis(B({ birthDate: date, birthHour: hour }))).toThrow(InputValidationError);
    expect(validateModeBInput(B({ birthDate: date, birthHour: other })).ok).toBe(true);
  });

  it('every sijin choice: accepted exactly when no jie is inside its interval, and then the pillars are constant over it', () => {
    const dates = isoDatesBetween(SUPPORTED_KST_DATE_RANGE.first, SUPPORTED_KST_DATE_RANGE.last);
    expect(dates.length).toBeGreaterThan(3600);
    let rejected = 0;
    for (const iso of dates) {
      const jie = jieTransitionsOn(parseIsoCivilDate(iso)!);
      for (const { hour } of SIJIN_OPTIONS) {
        const [from, to] = sijinInterval(hour);
        const inside = jie.some(t => t.minute >= from && t.minute < to);
        expect(validateModeBInput(B({ birthDate: iso, birthHour: hour })).ok, `${iso} ${hour}`).toBe(!inside);
        if (inside) { rejected++; continue; }
        const start = pillars(iso, Math.floor(from / 60), from % 60);
        const last = pillars(iso, Math.floor((to - 1) / 60), (to - 1) % 60);
        expect(last, `${iso} ${hour}`).toEqual(start);
        expect(pillars(iso, hour)).toEqual(start); // the analysed representative time
      }
    }
    expect(rejected).toBeGreaterThan(0);
  }, 60_000); // ~47,000 date × choice checks over the whole supported range

  it('the 13 choices partition the civil day exactly once', () => {
    const hours = SIJIN_OPTIONS.map(o => o.hour);
    expect(new Set(hours).size).toBe(13);
    const covered = new Array(1440).fill(0);
    for (const h of hours) { const [a, b] = sijinInterval(h); for (let m = a; m < b; m++) covered[m]++; }
    expect(covered.every(c => c === 1)).toBe(true);
    expect(SIJIN_OPTIONS[0]).toMatchObject({ hour: 0, label: expect.stringContaining('조자시') });
    expect(SIJIN_OPTIONS[12]).toMatchObject({ hour: 23, label: expect.stringContaining('야자시') });
  });
});

// ─── Legacy stored 자시 is never reinterpreted ───────────────────────────────

describe('legacy 자시 inputs (saved before the split)', () => {
  it.each([
    ['23, no jie that day', '2027-07-04', 23],
    ['0, no jie that day', '2027-07-04', 0],
    ['23, daytime jie (audit date)', '2028-11-07', 23],
  ])('hour %s: rejected as legacy for B and C, never mapped to 조자시/야자시', (_, date, hour) => {
    const b = legacy(B({ birthDate: date, birthHour: hour }));
    const c = legacy(C({ birthDate: date, birthHour: hour }));
    expect(isLegacyZiInput(b)).toBe(true);
    for (const v of [validateModeBInput(b), validateModeCInput(c)]) {
      expect(v.ok).toBe(false);
      if (v.ok) continue;
      expect(v.kind).toBe('legacy');
      expect(v.issues).toEqual([{ field: 'time', message: LEGACY_ZI_MESSAGE }]);
    }
    const state = loadAndRun('k', validateModeBInput, runModeBAnalysis, store('k', b));
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.error.kind).toBe('legacy');
  });

  it('non-자시 legacy inputs are unchanged (no marker added, same analysis scope)', () => {
    const b = legacy(B({ birthDate: '2027-07-04', birthHour: 9 }));
    const v = validateModeBInput(b);
    expect(v.ok).toBe(true);
    if (v.ok) expect('sijinVersion' in v.value).toBe(false);
    const c = validateModeCInput(C({ birthDate: '2027-07-04', birthHour: 9 }));
    if (c.ok) expect('sijinVersion' in c.value).toBe(false);
  });

  it('rejects an unknown sijin marker', () => {
    expect(validateModeBInput(B({ sijinVersion: 3 })).ok).toBe(false);
    expect(validateModeBInput(B({ sijinVersion: '2' })).ok).toBe(false);
    expect(validateModeCInput(C({ sijinVersion: 1 })).ok).toBe(false);
  });

  it('the input form restores everything except the ambiguous 자시 and asks for it again', () => {
    const now = new Date('2026-11-10T03:00:00Z');
    const b = loadModeBFormInit(now, store(MODE_B_STORAGE_KEY, legacy(B({ birthDate: '2027-07-04', surname: '남궁', nameStyles: ['전통형'] }))));
    expect(b).toMatchObject({ birthDate: '2027-07-04', birthHour: null, surname: '남궁', nameStyles: ['전통형'] });
    expect(b.restoreNotice).toContain('다시 선택');
    const c = loadModeCFormInit(now, store(MODE_C_STORAGE_KEY, legacy(C({ birthDate: '2027-07-04', birthHour: 0 }))));
    expect(c).toMatchObject({ birthDate: '2027-07-04', birthHour: null, gender: '여', names: ['김민서', '이서윤'] });
    expect(c.restoreNotice).toContain('다시 선택');
    // A new-model 자시 is restored as chosen.
    expect(loadModeBFormInit(now, store(MODE_B_STORAGE_KEY, B({ birthDate: '2027-07-04', birthHour: 0 }))).birthHour).toBe(0);
  });
});
