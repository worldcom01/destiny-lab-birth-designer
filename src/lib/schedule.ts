import { MedicalSchedule, TimeSlot } from '@/types';
import { CivilDate, SOLAR_TERMS, kstToUtcMs, parseIsoCivilDate } from './calendar';

// Medically permitted time windows → evaluation slots.
// A window is cut wherever the Saju pillars can change inside it: at hour-branch
// boundaries (odd hours, the existing 12-branch model) and at solar-term (jie)
// instants on that date. Within each slot all four pillars are constant, so one
// evaluation per slot is exact and no time outside the window is ever produced.

const DAY_MINUTES = 1440;
const MINUTE_MS = 60_000;
const BRANCH_BOUNDARIES = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23].map(h => h * 60);

/** "HH:mm" → minutes since midnight. Returns null when malformed. */
export function parseHm(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Range end: "00:00" means 24:00 (end of day). */
export function parseRangeEnd(value: unknown): number | null {
  const m = parseHm(value);
  return m === 0 ? DAY_MINUTES : m;
}

export function formatHm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export interface NormalizedSchedule {
  ranges: [number, number][]; // merged, sorted, half-open minutes
  exact: number[];            // exact times not already covered by a range
}

/** Assumes a validated schedule (see validateDesignerInput). */
export function normalizeSchedule(schedule: MedicalSchedule): NormalizedSchedule {
  const raw = schedule.timeRanges
    .map(r => [parseHm(r.start)!, parseRangeEnd(r.end)!] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const ranges: [number, number][] = [];
  for (const [s, e] of raw) {
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else ranges.push([s, e]);
  }
  const exact = [...new Set(schedule.exactTimes.map(t => parseHm(t)!))]
    .filter(t => !ranges.some(([s, e]) => t >= s && t < e))
    .sort((a, b) => a - b);
  return { ranges, exact };
}

export function isScheduleEmpty(n: NormalizedSchedule): boolean {
  return n.ranges.length === 0 && n.exact.length === 0;
}

/** Jie (month-boundary) solar terms whose instant falls on this KST civil date. */
export function jieTransitionsOn(date: CivilDate): { name: string; minute: number }[] {
  const dayStart = kstToUtcMs(date, 0, 0);
  const dayEnd = dayStart + DAY_MINUTES * MINUTE_MS;
  return SOLAR_TERMS
    .filter(t => t.index % 2 === 0 && t.utcMs >= dayStart && t.utcMs < dayEnd)
    .map(t => ({ name: t.name, minute: (t.utcMs - dayStart) / MINUTE_MS }));
}

export interface EvaluationSlot {
  hour: number;
  minute: number;
  slot: TimeSlot;
}

/** Evaluation slots for one date. Every slot lies inside the permitted window. */
export function buildDaySlots(date: CivilDate, schedule: NormalizedSchedule): EvaluationSlot[] {
  const cuts = [...BRANCH_BOUNDARIES, ...jieTransitionsOn(date).map(t => t.minute)];
  const out: { start: number; end: number | null }[] = [];
  for (const [s, e] of schedule.ranges) {
    const points = [...new Set(cuts.filter(c => c > s && c < e))].sort((a, b) => a - b);
    const edges = [s, ...points, e];
    for (let i = 0; i < edges.length - 1; i++) out.push({ start: edges[i], end: edges[i + 1] });
  }
  for (const t of schedule.exact) out.push({ start: t, end: null });
  return out
    .sort((a, b) => a.start - b.start)
    .map(({ start, end }) => ({
      hour: Math.floor(start / 60),
      minute: start % 60,
      slot: { start: formatHm(start), end: end === null ? null : formatHm(end) },
    }));
}

/** Display text for a permitted slot, e.g. "09:30~10:15 (KST)" or "14:00 (KST)". */
export function formatTimeSlot(slot: TimeSlot): string {
  return slot.end === null ? `${slot.start} (KST)` : `${slot.start}~${slot.end} (KST)`;
}

/** True when the slot lies inside the permitted window (defensive post-check). */
export function isSlotPermitted(slot: TimeSlot, schedule: NormalizedSchedule): boolean {
  const s = parseHm(slot.start);
  if (s === null) return false;
  if (slot.end === null) {
    return schedule.exact.includes(s) || schedule.ranges.some(([a, b]) => s >= a && s < b);
  }
  const e = slot.end === '24:00' ? DAY_MINUTES : parseHm(slot.end);
  return e !== null && e > s && schedule.ranges.some(([a, b]) => s >= a && e <= b);
}

/** ISO dates from start to end inclusive (UTC arithmetic, host-timezone independent). */
export function isoDatesBetween(startIso: string, endIso: string): string[] {
  const a = parseIsoCivilDate(startIso);
  const b = parseIsoCivilDate(endIso);
  if (!a || !b) return [];
  const out: string[] = [];
  const end = Date.UTC(b.year, b.month - 1, b.day);
  for (let t = Date.UTC(a.year, a.month - 1, a.day); t <= end; t += DAY_MINUTES * MINUTE_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Mode B/C use a representative hour per 2-hour branch. When a jie transition
 * falls inside the chosen branch on that date, the month (and possibly year)
 * pillar depends on the exact birth time, so the representative hour would be a
 * silent approximation. Under the preserved convention 子 covers 00:00-00:59 and
 * 23:00-23:59 of the same date, so any jie on that date affects 子.
 */
export function findTransitionInSijin(dateIso: string, hour: number): { name: string; time: string } | null {
  const date = parseIsoCivilDate(dateIso);
  if (!date) return null;
  let from = 0;
  let to = DAY_MINUTES;
  if (hour !== 23 && hour !== 0) {
    const start = hour % 2 === 1 ? hour : hour - 1;
    from = start * 60;
    to = from + 120;
  }
  const hit = jieTransitionsOn(date).find(t => t.minute >= from && t.minute < to);
  return hit ? { name: hit.name, time: formatHm(hit.minute) } : null;
}
