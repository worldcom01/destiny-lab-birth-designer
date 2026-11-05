import { afterEach, describe, expect, it } from 'vitest';
import { DesignerInput } from '@/types';
import {
  addMonthsClamped, defaultScheduleDates, loadModeAFormInit, scheduleSelectionState, seoulToday, toIsoDate,
} from '@/lib/modeAForm';
import { validateDesignerInput } from '@/lib/inputValidation';

const at = (iso: string) => new Date(iso);
const store = (value: string | null, throws = false) => ({
  getItem: () => { if (throws) throw new DOMException('denied', 'SecurityError'); return value; },
});
const VALID: DesignerInput = {
  startDate: '2027-03-02', endDate: '2027-03-06', surname: '이', gender: '여',
  dolrimChar: '민', dolrimPosition: 'second', dolrimHanja: '敏', images: ['학자형'], nameStyles: ['현대형'],
  schedule: { providerConfirmed: true, timeRanges: [{ start: '10:00', end: '11:30' }], exactTimes: ['15:20'] },
};

describe('Asia/Seoul current date', () => {
  const originalTz = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTz; });

  it('uses the Seoul civil date for any instant and any host time zone', () => {
    for (const tz of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
      process.env.TZ = tz;
      expect(seoulToday(at('2026-11-04T14:59:59Z'))).toEqual({ year: 2026, month: 11, day: 4 });  // 23:59:59 KST
      expect(seoulToday(at('2026-11-04T15:00:00Z'))).toEqual({ year: 2026, month: 11, day: 5 });  // 00:00 KST
      expect(defaultScheduleDates(at('2026-11-04T15:00:00Z')).start).toBe('2027-01-05');
    }
  });
});

describe('two-month offset', () => {
  it.each([
    ['2026-11-05', '2027-01-05'], // example from the request, year rollover
    ['2026-12-31', '2027-02-28'], // clamp to February (non-leap)
    ['2027-12-31', '2028-02-29'], // clamp to February (leap year)
    ['2026-11-30', '2027-01-30'],
    ['2027-08-31', '2027-10-31'],
    ['2027-07-31', '2027-09-30'], // clamp to a 30-day month
    ['2027-01-15', '2027-03-15'],
  ])('%s + 2 months = %s', (from, to) => {
    const [y, m, d] = from.split('-').map(Number);
    expect(toIsoDate(addMonthsClamped({ year: y, month: m, day: d }, 2))).toBe(to);
  });

  it('default window is the start date plus 6 days', () => {
    expect(defaultScheduleDates(at('2026-11-04T15:00:00Z'))).toEqual({ start: '2027-01-05', end: '2027-01-11', notice: null });
  });

  it('keeps the default end inside the supported range', () => {
    expect(defaultScheduleDates(at('2028-10-28T03:00:00Z'))).toEqual({ start: '2028-12-28', end: '2028-12-31', notice: null });
  });

  it('explains an unsupported default instead of using it', () => {
    const d = defaultScheduleDates(at('2028-11-15T03:00:00Z')); // → 2029-01-15
    expect(d.start).toBe('');
    expect(d.end).toBe('');
    expect(d.notice).toContain('2029-01-15');
    expect(d.notice).toContain('절기 데이터 확장이 필요합니다');
  });
});

describe('permitted-time selection state', () => {
  it('a new input has no selection', () => {
    expect(scheduleSelectionState([], [])).toEqual({ status: 'none', issues: [], summary: [] });
    expect(scheduleSelectionState([{ start: '', end: '' }], [''])).toMatchObject({ status: 'none' }); // blank rows ignored
  });

  it('complete selections are summarised in normalized form', () => {
    const s = scheduleSelectionState(
      [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }, { start: '22:00', end: '00:00' }], ['16:05', '10:00'],
    );
    expect(s).toEqual({ status: 'complete', issues: [], summary: ['09:00~13:00', '22:00~24:00', '16:05 (특정 시각)'] });
  });

  it('reports input errors with the same rules as the engine', () => {
    const ranges = [{ start: '12:00', end: '09:00' }];
    const s = scheduleSelectionState(ranges, []);
    expect(s.status).toBe('error');
    const engine = validateDesignerInput({ ...VALID, schedule: { providerConfirmed: true, timeRanges: ranges, exactTimes: [] } });
    expect(engine.ok).toBe(false);
    expect(s.issues[0]).toBe(engine.ok ? '' : engine.issues.find(i => i.field === 'time')!.message);
    expect(scheduleSelectionState([{ start: '09:00', end: '' }], []).status).toBe('error'); // half-filled
  });
});

describe('restoring a previous Mode A input', () => {
  const now = at('2026-11-04T15:00:00Z');

  it('new input: computed dates, zero time ranges, no confirmation, no notice', () => {
    const init = loadModeAFormInit(now, store(null));
    expect(init).toMatchObject({ startDate: '2027-01-05', endDate: '2027-01-11', timeRanges: [], exactTimes: [], providerConfirmed: false, restoreNotice: null });
  });

  it('restores a valid saved input but never the provider confirmation', () => {
    const init = loadModeAFormInit(now, store(JSON.stringify(VALID)));
    expect(init).toMatchObject({
      startDate: '2027-03-02', endDate: '2027-03-06', surname: '이', gender: '여', dolrimChar: '민', dolrimHanja: '敏',
      dolrimPosition: 'second', images: ['학자형'], nameStyles: ['현대형'],
      timeRanges: [{ start: '10:00', end: '11:30' }], exactTimes: ['15:20'], providerConfirmed: false,
    });
    expect(init.restoreNotice).toContain('다시 확인한 뒤 체크');
  });

  it('a legacy input (no schedule) restores other fields but no permitted time', () => {
    const legacy = { ...VALID, analysisLevel: '정밀' } as Record<string, unknown>;
    delete legacy.schedule;
    const init = loadModeAFormInit(now, store(JSON.stringify(legacy)));
    expect(init).toMatchObject({ startDate: '2027-03-02', surname: '이', timeRanges: [], exactTimes: [] });
    expect(init.restoreNotice).toContain('허용 시간을 다시 선택');
  });

  it('an invalid saved schedule is not restored as a selection', () => {
    const bad = { ...VALID, schedule: { providerConfirmed: true, timeRanges: [{ start: '12:00', end: '09:00' }], exactTimes: [] } };
    expect(loadModeAFormInit(now, store(JSON.stringify(bad)))).toMatchObject({ startDate: '2027-03-02', timeRanges: [], exactTimes: [] });
  });

  it('unsupported saved dates, corrupt JSON and storage failures fall back to defaults with a notice', () => {
    for (const s of [
      store(JSON.stringify({ ...VALID, startDate: '2030-01-01', endDate: '2030-01-02' })),
      store('{broken'),
      store(null, true),
    ]) {
      const init = loadModeAFormInit(now, s);
      expect(init).toMatchObject({ startDate: '2027-01-05', timeRanges: [], exactTimes: [] });
      expect(init.restoreNotice).not.toBeNull();
    }
  });
});
