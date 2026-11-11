// R4.1B: prioritized human review queue for legal (character, reading) verification.
// Dev tooling (used by scripts/hanja/build-review-tool.mjs and tests); not imported by the app.
//
// Tiers: 1 the app's 118 HANJA_DB pairs · 2 reported characters (鉉 …) · 3 other Hanja the
// current Mode B/C recommendations use (nameChars profiles) · 4 every official image under
// the readings the app uses · 5 the remaining official images (backlog).
import type { HanjaDictionary } from './index';
import { initialSoundReading, OfficialImageIndex } from './legalReviews';
import { codePointOf } from './validate';

export type ReviewRoute =
  | 'appendix1'        // expected among the official [별표 1] images of the reading cell(s)
  | 'basic-or-lookup'  // Unihan marks it 교육용 기초한자 (E): not in [별표 1]; verify by a manual court lookup
  | 'lookup-only';     // no official table cell for this reading: manual court lookup only

export interface ReviewTarget {
  tier: 1 | 2 | 3;
  reason: string;
  /** reported as wrong or missing (tier 2), also when it is already in a higher tier */
  reported: boolean;
  char: string;
  codePoint: string;
  reading: string;
  route: ReviewRoute;
  /** official table readings that can carry this reading (itself, or its ㄴ/ㄹ base form per note 1) */
  tableReadings: string[];
  /** Unihan kHangul source flags for this reading (secondary indicator only) */
  unihanFlags: string | null;
  /** official image ids to search (appendix1 route) */
  images: string[];
}

export interface ImageTask { tier: 4 | 5; image: string; readings: string[] }

export interface ReviewQueue {
  targets: ReviewTarget[];
  imageTasks: ImageTask[];
  summary: Record<string, number>;
  /** input pairs that are not (one Hangul syllable, one character): reported, not queued */
  skipped: string[];
}

export interface QueueInput {
  /** [syllable, hanja] pairs of the app's option table */
  appPairs: [string, string][];
  /** [syllable, hanja] pairs reported as wrong or missing */
  reported: [string, string][];
  /** [syllable, hanja] pairs used by Mode B/C recommendation profiles */
  profilePairs: [string, string][];
  dictionary: HanjaDictionary;
  images: OfficialImageIndex;
}

export function buildReviewQueue(input: QueueInput): ReviewQueue {
  const cells = new Map<string, string[]>();
  for (const [id, ...readings] of input.images.images) for (const r of readings) cells.set(r, [...(cells.get(r) ?? []), id]);
  const tableReadingsFor = (reading: string) => [...cells.keys()].filter(c => c === reading || initialSoundReading(c) === reading).sort();
  const flagsOf = (char: string, readings: string[]) => {
    const rs = input.dictionary.get(char)?.readings ?? [];
    const f = rs.filter(r => readings.includes(r.hangul))
      .flatMap(r => r.evidence.filter(e => e.source === 'unihan').map(e => e.detail ?? ''));
    return f.length ? f.join(' ') : null;
  };

  const targets: ReviewTarget[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];
  const add = (tier: 1 | 2 | 3, reason: string, [reading, char]: [string, string]) => {
    const key = `${char}|${reading}`;
    if (!/^[가-힣]$/.test(reading) || [...char].length !== 1) { skipped.push(`${reading}/${char}`); return; }
    const existing = targets.find(t => `${t.char}|${t.reading}` === key);
    if (existing) { if (!existing.reason.includes(reason)) existing.reason += `; ${reason}`; existing.reported ||= tier === 2; return; }
    if (seen.has(key)) return;
    seen.add(key);
    const tableReadings = tableReadingsFor(reading);
    const flags = flagsOf(char, [reading, ...tableReadings]);
    const route: ReviewRoute = flags && /:[0-9]*E/.test(flags) ? 'basic-or-lookup' : tableReadings.length ? 'appendix1' : 'lookup-only';
    targets.push({
      tier, reason, reported: tier === 2, char, codePoint: codePointOf(char), reading, route, tableReadings, unihanFlags: flags,
      images: route === 'appendix1' ? tableReadings.flatMap(r => cells.get(r) ?? []) : [],
    });
  };
  for (const p of input.appPairs) add(1, 'app option table (HANJA_DB)', p);
  for (const p of input.reported) add(2, 'reported incorrect or missing', p);
  for (const t of targets) if (input.reported.some(([r, c]) => r === t.reading && c === t.char)) t.reported = true;
  for (const p of input.profilePairs) add(3, 'Mode B/C recommendation profile', p);

  const appReadings = new Set([...input.appPairs, ...input.profilePairs, ...input.reported].flatMap(([r]) => [r, ...tableReadingsFor(r)]));
  const imageTasks: ImageTask[] = input.images.images.map(([image, ...readings]) => ({
    tier: readings.some(r => appReadings.has(r)) ? 4 : 5, image, readings,
  }));
  imageTasks.sort((a, b) => a.tier - b.tier);

  const count = (f: (t: ReviewTarget) => boolean) => targets.filter(f).length;
  return {
    targets,
    imageTasks,
    skipped,
    summary: {
      reportedTargets: count(t => t.reported), skippedNonSyllable: skipped.length,
      tier1Targets: count(t => t.tier === 1), tier2Targets: count(t => t.tier === 2), tier3Targets: count(t => t.tier === 3),
      routeAppendix1: count(t => t.route === 'appendix1'), routeBasicOrLookup: count(t => t.route === 'basic-or-lookup'), routeLookupOnly: count(t => t.route === 'lookup-only'),
      tier4Images: imageTasks.filter(t => t.tier === 4).length, tier5Images: imageTasks.filter(t => t.tier === 5).length,
    },
  };
}
