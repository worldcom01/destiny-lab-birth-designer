// R4.1B: human review records -> legal confirmation of (character, reading) pairs.
//
// Only a HUMAN review decision can confirm a pair. Machine image matching is an ordering
// aid in the review tool and is never evidence (a `machineSuggestion` on a record is kept
// for audit only and ignored here). Everything fails closed: an invalid record, a
// conflicting or ambiguous review, or a reading that differs from the official table
// confirms nothing.
import type { Evidence } from './types';
import { codePointOf, isSingleHanChar } from './validate';

export type ReviewDecision = 'exact-match' | 'ambiguous' | 'unable-to-identify';

export type ReviewEvidence =
  | {
    kind: 'appendix1-image';
    source: 'court-rule-3151-appendix1';
    /** SHA-256 of the official HWPX the image was taken from */
    fileSha256: string;
    /** image id inside the HWPX (e.g. "image6721") */
    image: string;
    /** the Hangul reading printed for that image in the official table */
    officialReading: string;
  }
  | {
    kind: 'court-lookup';
    source: 'efamily-lookup';
    /** page the reviewer used (manual browser lookup; automated access is not permitted) */
    url: string;
    lookedUpAt: string;
    /** reading shown by the official lookup */
    shownReading: string;
    /** the mark shown by the lookup; only "인명용" confirms */
    shownMark: string;
  };

export interface LegalReview {
  id: string;
  reviewer: string;
  reviewedAt: string;
  decision: ReviewDecision;
  char: string | null;
  codePoint: string | null;
  reading: string;
  evidence: ReviewEvidence;
  notes?: string;
  /** what the tool suggested, recorded for audit; never used as evidence */
  machineSuggestion?: { char: string; score: number } | null;
}

export interface ReviewIssue { review: string | null; code: string; message: string }

export interface ConfirmedReading {
  char: string;
  reading: string;
  basis: 'appendix1-image-review' | 'court-lookup-review';
  evidence: Evidence[];
  reviews: string[];
}

export interface ReviewOutcome {
  confirmed: ConfirmedReading[];
  /** records that were valid but could not confirm (ambiguous / unable / conflicts) */
  unresolved: { key: string; reason: string; reviews: string[] }[];
  issues: ReviewIssue[];
}

export interface OfficialImageIndex { fileSha256: string; images: [string, ...string[]][] }

const SYL = /^[가-힣]$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYmd = (y: number, m: number, d: number) => y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);

/** R4 audit R4: a real ISO-8601 timestamp (calendar date, time and offset all valid). */
export function isValidTimestamp(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = ISO.exec(v);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = [1, 2, 3, 4, 5, 6].map(i => Number(m[i]));
  if (!validYmd(y, mo, d) || h > 23 || mi > 59 || se > 59) return false;
  if (m[9] && (Number(m[10]) > 23 || Number(m[11]) > 59)) return false;
  return Number.isFinite(Date.parse(v));
}
/** A real calendar date written exactly as YYYY-MM-DD. */
export function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DATE.exec(v);
  return !!m && validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Validates and evaluates review records against the official image index. Pure. */
export function evaluateLegalReviews(reviews: LegalReview[], index: OfficialImageIndex): ReviewOutcome {
  const issues: ReviewIssue[] = [];
  const bad = (r: LegalReview | null, code: string, message: string) => issues.push({ review: r?.id ?? null, code, message });
  const readingsOf = new Map(index.images.map(([id, ...rs]) => [id, rs]));
  const valid: LegalReview[] = [];
  const idCount = new Map<string, number>();
  for (const r of reviews) if (r && typeof r.id === 'string') idCount.set(r.id, (idCount.get(r.id) ?? 0) + 1);

  for (const r of reviews) {
    const before = issues.length;
    if (!r || typeof r.id !== 'string' || !r.id) { bad(null, 'review-id', 'review without id'); continue; }
    if ((idCount.get(r.id) ?? 0) > 1) bad(r, 'duplicate-review-id', `review id ${r.id} used by ${idCount.get(r.id)} records`);
    if (typeof r.reviewer !== 'string' || !r.reviewer.trim()) bad(r, 'reviewer', 'missing reviewer identity');
    if (!isValidTimestamp(r.reviewedAt)) bad(r, 'review-time', 'reviewedAt must be a valid ISO timestamp');
    if (!['exact-match', 'ambiguous', 'unable-to-identify'].includes(r.decision)) bad(r, 'decision', `unknown decision ${String(r.decision)}`);
    if (typeof r.reading !== 'string' || !SYL.test(r.reading)) bad(r, 'reading', 'reading must be one Hangul syllable');
    if (r.decision === 'exact-match') {
      if (!isSingleHanChar(r.char)) bad(r, 'character', 'exact-match needs exactly one Han character');
      else if (r.codePoint !== codePointOf(r.char)) bad(r, 'code-point', `${r.codePoint} does not match ${codePointOf(r.char)}`);
    }
    const ev = r.evidence;
    if (ev?.kind === 'appendix1-image') {
      if (ev.source !== 'court-rule-3151-appendix1') bad(r, 'evidence-source', 'image evidence must cite court-rule-3151-appendix1');
      if (ev.fileSha256 !== index.fileSha256) bad(r, 'evidence-file', 'image evidence is from a different file than the pinned official HWPX');
      const official = readingsOf.get(ev.image);
      if (!official) bad(r, 'evidence-image', `${ev.image} is not an entry image of the official table`);
      else if (!official.includes(ev.officialReading)) bad(r, 'official-reading', `${ev.image} is printed under ${official.join('/')}, not ${ev.officialReading}`);
      // the permitted reading is checked independently of the character: only the table reading
      if (ev.officialReading !== r.reading) bad(r, 'reading-mismatch', `reviewed reading ${r.reading} differs from the table reading ${ev.officialReading}`);
    } else if (ev?.kind === 'court-lookup') {
      if (ev.source !== 'efamily-lookup') bad(r, 'evidence-source', 'lookup evidence must cite efamily-lookup');
      if (typeof ev.url !== 'string' || !ev.url.startsWith('https://efamily.scourt.go.kr/')) bad(r, 'evidence-url', 'lookup evidence must be an efamily.scourt.go.kr page');
      if (!isValidDate(ev.lookedUpAt)) bad(r, 'evidence-date', 'lookedUpAt must be a valid YYYY-MM-DD date');
      if (ev.shownReading !== r.reading) bad(r, 'reading-mismatch', `lookup showed ${ev.shownReading}, review says ${r.reading}`);
      if (r.decision === 'exact-match' && ev.shownMark !== '인명용') bad(r, 'lookup-mark', 'only a lookup showing "인명용" can confirm');
    } else {
      bad(r, 'evidence-kind', 'unknown evidence kind');
    }
    if (issues.length === before) valid.push(r);
  }

  const unresolved: ReviewOutcome['unresolved'] = [];
  // 1. per official image: every decision must agree on one exact character
  const byImage = new Map<string, LegalReview[]>();
  for (const r of valid) if (r.evidence.kind === 'appendix1-image') byImage.set(r.evidence.image, [...(byImage.get(r.evidence.image) ?? []), r]);
  const imageResults = new Map<string, LegalReview[]>(); // image -> agreeing exact reviews
  for (const [img, rs] of byImage) {
    const chars = new Set(rs.map(r => (r.decision === 'exact-match' ? r.char : `#${r.decision}`)));
    if (chars.size === 1 && rs[0].decision === 'exact-match') imageResults.set(img, rs);
    else unresolved.push({ key: `image:${img}`, reason: chars.size > 1 ? 'conflicting reviews' : rs[0].decision, reviews: rs.map(r => r.id) });
  }
  // 2. per (character, reading): one table entry at most; lookups must not be contradicted
  const byPair = new Map<string, { images: Set<string>; lookups: LegalReview[]; negative: LegalReview[]; image: LegalReview[] }>();
  const pair = (c: string, rd: string) => {
    const k = `${c}|${rd}`;
    if (!byPair.has(k)) byPair.set(k, { images: new Set(), lookups: [], negative: [], image: [] });
    return byPair.get(k)!;
  };
  for (const [img, rs] of imageResults) { const p = pair(rs[0].char!, rs[0].reading); p.images.add(img); p.image.push(...rs); }
  for (const r of valid) if (r.evidence.kind === 'court-lookup') {
    if (!r.char) { unresolved.push({ key: `lookup:${r.id}`, reason: r.decision, reviews: [r.id] }); continue; }
    if (r.decision === 'exact-match') pair(r.char, r.reading).lookups.push(r);
    else pair(r.char, r.reading).negative.push(r);
  }
  const confirmed: ConfirmedReading[] = [];
  for (const [k, p] of byPair) {
    const [char, reading] = k.split('|');
    const all = [...p.image, ...p.lookups, ...p.negative].map(r => r.id);
    if (p.images.size > 1) { unresolved.push({ key: k, reason: `one character/reading identified on ${p.images.size} different official images`, reviews: all }); continue; }
    if (p.negative.length) { unresolved.push({ key: k, reason: 'contradicted by an ambiguous/unable review', reviews: all }); continue; }
    if (!p.image.length && !p.lookups.length) continue;
    const evidence: Evidence[] = [...p.image, ...p.lookups].flatMap((r): Evidence[] => {
      const ev = r.evidence;
      if (ev.kind === 'appendix1-image') return [{ source: 'court-rule-3151-appendix1', locator: `${ev.image} (table reading ${ev.officialReading})`, detail: `human review ${r.id} by ${r.reviewer} at ${r.reviewedAt}` }];
      return [{ source: 'efamily-lookup', locator: `${ev.url} (${ev.lookedUpAt})`, detail: `human review ${r.id} by ${r.reviewer}: ${ev.shownMark} ${ev.shownReading}` }];
    });
    confirmed.push({ char, reading, basis: p.image.length ? 'appendix1-image-review' : 'court-lookup-review', evidence, reviews: all });
  }
  confirmed.sort((a, b) => (a.char.codePointAt(0)! - b.char.codePointAt(0)!) || a.reading.localeCompare(b.reading));
  // R4 audit R1: fail closed for the WHOLE batch. A single invalid record (duplicate id,
  // bad timestamp, wrong file, ...) means the review set cannot be trusted: nothing confirms.
  if (issues.length) return { confirmed: [], unresolved: [...unresolved, { key: 'batch', reason: `${issues.length} invalid review record(s): no confirmation from this batch`, reviews: [] }], issues };
  return { confirmed, unresolved, issues };
}

// ─── Official note 1 of [별표 1]/[별표 2] ──────────────────────────────────────
// "첫소리(初聲)가 ㄴ 또는 ㄹ인 한자는 각각 소리 나는 바에 따라 ㅇ 또는 ㄴ으로 사용할 수 있다."
// Applied as the pronunciation rule of 한글 맞춤법 제10–12항: ㄹ → ㅇ before ㅑㅕㅖㅛㅠㅣ,
// otherwise ㄹ → ㄴ; ㄴ → ㅇ before ㅑㅕㅖㅛㅠㅣ. Only derives from an already confirmed reading.
const Y_VOWELS = new Set([2, 6, 7, 12, 17, 20]); // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ
export function initialSoundReading(reading: string): string | null {
  if (!SYL.test(reading)) return null;
  const o = reading.charCodeAt(0) - 0xac00;
  const initial = Math.floor(o / 588), medial = Math.floor((o % 588) / 28), final = o % 28;
  const make = (i: number) => String.fromCharCode(0xac00 + i * 588 + medial * 28 + final);
  if (initial === 5) return make(Y_VOWELS.has(medial) ? 11 : 2); // ㄹ
  if (initial === 2 && Y_VOWELS.has(medial)) return make(11);    // ㄴ
  return null;
}
