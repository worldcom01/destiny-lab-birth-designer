// R5.10 — landing-page result preview. NOT fabricated numbers: the CURRENT analysis engine (Mode A,
// unchanged) runs at build time on a FICTIONAL input that is shown next to the result. The display
// helpers are the ones the R4 result card and PDF use (date/time formatting, score components and
// weights, grade bands, Hanja legal-status labels). Server-side only (imported by the landing page,
// a server component); nothing here ships to the browser as code.
import { analyzeModeA, formatKoreanDate } from '@/lib/analysis';
import { formatTimeSlot } from '@/lib/schedule';
import { isLegallyConfirmedReading } from '@/lib/hanjaModel';
import { LEGAL_LABEL } from '@/lib/hanjaSearch';
import { GRADE_BANDS, OVERALL_COMPONENTS } from '@/lib/scoreComponents';
import type { DesignerInput, Grade } from '@/types';

/** fictional example input — not a real person; the window stands in for a medically permitted one */
export const SAMPLE_INPUT: DesignerInput = {
  startDate: '2027-03-02', endDate: '2027-03-02', surname: '김', gender: '여',
  dolrimChar: '', dolrimPosition: 'auto', images: [], nameStyles: [],
  schedule: { providerConfirmed: true, timeRanges: [{ start: '10:00', end: '11:30' }], exactTimes: [] },
};
export const SAMPLE_INPUT_TEXT = '가상의 입력: 2027년 3월 2일 · 10:00~11:30 · 성 ‘김’ · 여';

export interface PreviewCandidate {
  rank: number;
  name: string;
  dateText: string;
  timeText: string;
  overall: number;
  grade: Grade;
  gradeBand: string;
  components: { label: string; weight: number; value: number }[];
  hanja: { hangul: string; hanja: string | null; legal: string | null }[];
}

export function buildSamplePreview(count = 3): PreviewCandidate[] {
  const set = analyzeModeA(SAMPLE_INPUT);
  const out: PreviewCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < set.length && out.length < count; i++) {
    const name = set.entry(i).name;
    if (seen.has(name)) continue;
    seen.add(name);
    const r = set.at(i);
    out.push({
      rank: out.length + 1,
      name: r.name.full,
      dateText: formatKoreanDate(r.date),
      timeText: r.timeSlot ? formatTimeSlot(r.timeSlot) : `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`,
      overall: r.scores.overall,
      grade: r.grade,
      gradeBand: GRADE_BANDS[r.grade],
      components: OVERALL_COMPONENTS.map(c => ({ label: c.label, weight: c.weight, value: r.scores[c.key] })),
      hanja: r.name.hanja.given.map(c => ({
        hangul: c.hangul,
        hanja: c.hanja,
        legal: c.hanja ? LEGAL_LABEL[isLegallyConfirmedReading(c.hanja, c.hangul) ? 'CONFIRMED' : 'NOT_CONFIRMED'] : null,
      })),
    });
  }
  return out;
}
