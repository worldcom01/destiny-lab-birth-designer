// R4 audit remediation: regression tests reproducing findings L1, R1, R2, R4 (library level).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHanjaDataset, createHanjaDictionary, evaluateDatasetReviews, getHanjaDictionary, isValidDate, isValidTimestamp, LegalReview } from '@/lib/hanjaDictionary';
import imagesJson from '@/data/hanjaDictionary/official-appendix1-images.json';
import { FORBIDDEN } from '../../../scripts/hanja/forbidden-markers.mjs';
import { canonical, planImport, publish, recover, pendingImport } from '../../../scripts/hanja/import-core.mjs';
import { analyzeModeCNames, applyHanjaSelections } from '@/lib/analysis';

const SHA = imagesJson.fileSha256;
const exact = (o: Partial<LegalReview> = {}): LegalReview => ({
  id: 'dup-1', reviewer: 'test-fixture', reviewedAt: '2026-11-11T10:00:00Z', decision: 'exact-match', char: '鉉', codePoint: 'U+9249', reading: '현',
  evidence: { kind: 'appendix1-image', source: 'court-rule-3151-appendix1', fileSha256: SHA, image: 'image6721', officialReading: '현' }, ...o,
});

// ── L1: research-only data never in the production import graph ──
describe('L1: research overlay is outside the production import graph', () => {
  const prodFiles: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['__tests__', 'test-utils', 'research'].includes(e.name)) walk(p); }
      else if (/\.(ts|tsx|json)$/.test(e.name)) prodFiles.push(p);
    }
  };
  walk(path.resolve('src'));

  it('no production module imports the research overlay', () => {
    expect(prodFiles.length).toBeGreaterThan(50);
    // static or dynamic import of anything under data/hanjaDictionary/research (comments may mention it)
    const importsResearch = /(from\s+|import\s*\(\s*)['"][^'"]*hanjaDictionary\/research[^'"]*['"]|(from\s+|import\s*\(\s*)['"]\.{1,2}\/[^'"]*research\/[^'"]*['"]/;
    expect(prodFiles.filter(f => importsResearch.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
    expect(importsResearch.test("import { RESEARCH_MEANINGS } from '@/data/hanjaDictionary/research/overlay';")).toBe(true);
  });

  it('no production source contains research-only or test-fixture markers (the same list the build check scans)', () => {
    expect(FORBIDDEN).toContain('시험용 합성 뜻');
    const hits = prodFiles.flatMap(f => (FORBIDDEN as string[]).filter(m => fs.readFileSync(f, 'utf8').includes(m)).map(m => `${path.relative('src', f)}: ${m}`));
    expect(hits).toEqual([]);
  });

  it('the production dictionary has no non-cleared source or record', () => {
    const d = getHanjaDictionary();
    expect(d.dataset.sources.every(s => s.licenseStatus === 'cleared')).toBe(true);
    expect(d.meanings('鉉').map(m => m.id)).toEqual(['U+9249#tripod-carrier', 'U+9249#legacy']);
  });
});

// ── R1: fail-closed assembly ──
describe('R1: invalid review batches never confirm', () => {
  it('audit counterexample: same id as exact-match and ambiguous -> no confirmation, assembly refused', () => {
    const batch = [exact(), exact({ decision: 'ambiguous' })];
    const out = evaluateDatasetReviews(batch);
    expect(out.issues.map(i => i.code)).toEqual(['duplicate-review-id', 'duplicate-review-id']);
    expect(out.confirmed).toEqual([]);
    expect(() => buildHanjaDataset({ legalReviews: batch })).toThrow(/invalid legal review records/);
    expect(getHanjaDictionary().legalReading('鉉', '현').status).toBe('NOT_CONFIRMED');
  });

  it('one invalid record anywhere in the batch blocks every confirmation (whole-batch rejection)', () => {
    const batch = [exact({ id: 'ok-1' }), exact({ id: 'bad-1', char: '絃', codePoint: 'U+7D43', image: 'image6720', reviewedAt: '2026-99-99T99:99:99Z' } as Partial<LegalReview>)];
    const out = evaluateDatasetReviews(batch);
    expect(out.issues.length).toBeGreaterThan(0);
    expect(out.confirmed).toEqual([]);
    expect(() => buildHanjaDataset({ legalReviews: batch })).toThrow();
  });

  it('a clean batch still confirms (the gate is not simply closed)', () => {
    const d = createHanjaDictionary(buildHanjaDataset({ legalReviews: [exact({ id: 'ok-only' })] }));
    expect(d.legalReading('鉉', '현').status).toBe('CONFIRMED');
  });
});

// ── R4: timestamps ──
describe('R4: real calendar timestamps and dates', () => {
  it.each(['2026-99-99T99:99:99Z', '2026-02-30T10:00:00Z', '2026-11-11T24:00:00Z', '2026-11-11T10:60:00Z', '2026-11-11T10:00:00+25:00', '2026-11-11 10:00:00Z', '2026-11-11', ''])('rejects timestamp %j', v => {
    expect(isValidTimestamp(v)).toBe(false);
    expect(evaluateDatasetReviews([exact({ reviewedAt: v })]).issues.map(i => i.code)).toContain('review-time');
  });
  it.each(['2026-11-11T10:00:00Z', '2026-11-11T10:00:00.123Z', '2026-11-11T10:00:00+09:00', '2024-02-29T00:00:00Z'])('accepts timestamp %j', v => {
    expect(isValidTimestamp(v)).toBe(true);
  });
  it('lookup dates must be real YYYY-MM-DD dates', () => {
    for (const v of ['2026-13-01', '2026-02-29', '2026-11-11T00:00:00Z', '11/11/2026']) expect(isValidDate(v)).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    const lookup: LegalReview = { ...exact(), evidence: { kind: 'court-lookup', source: 'efamily-lookup', url: 'https://efamily.scourt.go.kr/', lookedUpAt: '2026-02-30', shownReading: '현', shownMark: '인명용' } };
    expect(evaluateDatasetReviews([lookup]).issues.map(i => i.code)).toContain('evidence-date');
  });
});

// ── R2: import ──
describe('R2: safe review import', () => {
  const evaluate = (rs: LegalReview[]) => evaluateDatasetReviews(rs);
  const env = (reviews: unknown[], o: Record<string, unknown> = {}) => ({ schemaVersion: 1, source: { id: 'court-rule-3151-appendix1', fileSha256: SHA }, reviews, ...o });
  const base = { reviews: [exact({ id: 'r-1' })] };

  it.each([
    ['schema version', env([], { schemaVersion: 999 }), /schemaVersion/],
    ['other source', env([], { source: { id: 'something-else', fileSha256: SHA } }), /source\.id/],
    ['other file', env([], { source: { id: 'court-rule-3151-appendix1', fileSha256: '0'.repeat(64) } }), /fileSha256/],
    ['no reviews array', env([], { reviews: 'x' }), /reviews must be an array/],
    ['not an object', [], /not a JSON object/],
  ])('malformed envelope (%s) is refused', (_l, envelope, re) => {
    const p = planImport({ current: base, envelope, evaluate, pinnedSha: SHA });
    expect(p.ok).toBe(false);
    expect(p.errors.join('\n')).toMatch(re);
  });

  it('a reused id with different content is refused (audit counterexample); an identical record is skipped', () => {
    const conflict = planImport({ current: base, envelope: env([exact({ id: 'r-1', decision: 'ambiguous' })]), evaluate, pinnedSha: SHA });
    expect(conflict).toMatchObject({ ok: false });
    expect(conflict.errors.join()).toMatch(/r-1 is reused with different content/);
    const same = planImport({ current: base, envelope: env([JSON.parse(JSON.stringify(exact({ id: 'r-1' })))]), evaluate, pinnedSha: SHA });
    expect(same).toMatchObject({ ok: true, skipped: ['r-1'], added: [] });
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });

  it('records that fail evaluation (e.g. impossible timestamp) refuse the whole import', () => {
    const p = planImport({ current: { reviews: [] }, envelope: env([exact({ id: 'n-1' }), exact({ id: 'n-2', reviewedAt: '2026-99-99T99:99:99Z', image: 'image6720', char: '絃', codePoint: 'U+7D43' } as Partial<LegalReview>)]), evaluate, pinnedSha: SHA });
    expect(p.ok).toBe(false);
  });

  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-import-'));
    fs.writeFileSync(path.join(d, 'legal-reviews.json'), 'OLD-REVIEWS');
    fs.writeFileSync(path.join(d, 'legal-confirmed.json'), 'OLD-CONFIRMED');
    return d;
  };
  const files = { 'legal-reviews.json': 'NEW-REVIEWS', 'legal-confirmed.json': 'NEW-CONFIRMED' };
  const read = (d: string) => [fs.readFileSync(path.join(d, 'legal-reviews.json'), 'utf8'), fs.readFileSync(path.join(d, 'legal-confirmed.json'), 'utf8')];

  it('publishes both files', () => {
    const d = tmp();
    publish({ dir: d, files, fs });
    expect(read(d)).toEqual(['NEW-REVIEWS', 'NEW-CONFIRMED']);
    expect(pendingImport({ dir: d, fs })).toBe(false);
  });

  it('interrupted after the first rename: detected as pending, then rolled forward consistently', () => {
    const d = tmp();
    let renames = 0;
    const crashing = { ...fs, renameSync: (a: string, b: string) => { if (++renames === 3) throw new Error('crash'); return fs.renameSync(a, b); } };
    expect(() => publish({ dir: d, files, fs: crashing })).toThrow('crash'); // journal rename = 1, first file = 2, second = crash
    expect(read(d)).toEqual(['NEW-REVIEWS', 'OLD-CONFIRMED']); // the inconsistent intermediate state …
    expect(pendingImport({ dir: d, fs })).toBe(true);           // … is flagged (verify/build refuse it)
    expect(recover({ dir: d, fs })).toBe('rolled-forward');
    expect(read(d)).toEqual(['NEW-REVIEWS', 'NEW-CONFIRMED']);
    expect(pendingImport({ dir: d, fs })).toBe(false);
  });

  it('interrupted before the journal: temp files are discarded and the originals stay intact', () => {
    const d = tmp();
    const crashing = { ...fs, renameSync: () => { throw new Error('crash'); } };
    expect(() => publish({ dir: d, files, fs: crashing })).toThrow('crash');
    expect(recover({ dir: d, fs })).toBe('discarded-incomplete');
    expect(read(d)).toEqual(['OLD-REVIEWS', 'OLD-CONFIRMED']);
    expect(fs.readdirSync(d).sort()).toEqual(['legal-confirmed.json', 'legal-reviews.json']);
  });
});

// ── P1 (text generator): the description never presents a legacy gloss as verified ──
describe('P1: description sentence provenance', () => {
  it('names the gloss as recorded and unverified, never "뜻을 지닌 한자입니다"', () => {
    const base = analyzeModeCNames({ birthDate: '2027-07-04', birthHour: 9, sijinVersion: 2, gender: '남', names: ['김현서'] }).results;
    const r = applyHanjaSelections(base, { 김현서: ['鉉'] })[0];
    expect(r.nameAnalysis.meanings[0]).toBe('쇠줄 현');
    // the description is generated at analysis time from the suggestions; check the generator text form
    expect(fs.readFileSync(path.resolve('src/lib/scoring.ts'), 'utf8')).not.toMatch(/의 뜻을 지닌 한자입니다/);
    const withMeaning = base.find(x => x.description.includes('기록된 뜻'));
    if (withMeaning) expect(withMeaning.description).toMatch(/출처 미확인, 점수에 반영되지 않음/);
  });
});

describe('L1: the build-output check really detects leaked research content', () => {
  const run = (dir: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    return spawnSync(process.execPath, [path.resolve('scripts/hanja/check-bundle.mjs'), dir], { encoding: 'utf8' });
  };
  it('fails on a planted research marker and passes on clean output', () => {
    const dirty = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-bundle-'));
    fs.mkdirSync(path.join(dirty, 'static'));
    fs.writeFileSync(path.join(dirty, 'static', 'chunk.js'), 'var a="device for carrying a tripod";var b="[시험용 합성 뜻 A · 실제 뜻 아님]";');
    const bad = run(dirty);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('시험용 합성 뜻');
    fs.writeFileSync(path.join(dirty, 'static', 'chunk.js'), 'var a="device for carrying a tripod";');
    expect(run(dirty).status).toBe(0);
  });
});

// ── R4 re-audit R2-b: duplicate ids inside ONE incoming file (CLI planner + real CLI) ──
describe('R2-b: same-file and cross-file duplicate ids', () => {
  const evaluate = (rs: LegalReview[]) => evaluateDatasetReviews(rs);
  const env = (reviews: unknown[]) => ({ schemaVersion: 1, source: { id: 'court-rule-3151-appendix1', fileSha256: SHA }, reviews });
  const plan = (current: LegalReview[], reviews: unknown[]) => planImport({ current: { reviews: current }, envelope: env(reviews), evaluate, pinnedSha: SHA });

  it('same file, identical content: one record kept', () => {
    const reordered = Object.fromEntries(Object.entries(exact({ id: 'x-1' })).reverse());
    const p = plan([], [exact({ id: 'x-1' }), reordered]);
    expect(p).toMatchObject({ ok: true, skipped: ['x-1'] });
    expect(p.added).toHaveLength(1);
    expect(p.confirmed).toEqual([['鉉', '현']]);
  });

  it.each([
    ['conflicting decisions', exact({ id: 'x-2', decision: 'ambiguous' })],
    ['different evidence', exact({ id: 'x-2', evidence: { kind: 'appendix1-image', source: 'court-rule-3151-appendix1', fileSha256: SHA, image: 'image6720', officialReading: '현' } })],
    ['different reviewer', exact({ id: 'x-2', reviewer: 'someone-else' })],
  ])('same file, %s: the whole file is refused with a clear diagnostic', (_l, second) => {
    const p = plan([], [exact({ id: 'x-2' }), second, exact({ id: 'x-3', image: 'image6720', char: '絃', codePoint: 'U+7D43' } as Partial<LegalReview>)]);
    expect(p.ok).toBe(false);
    expect(p.errors).toEqual(['review id x-2 is reused with different content']);
    expect(p.merged).toBeUndefined(); // nothing to publish
  });

  it('cross file: identical stored id is skipped; different content is refused', () => {
    expect(plan([exact({ id: 'x-4' })], [exact({ id: 'x-4' })])).toMatchObject({ ok: true, skipped: ['x-4'], added: [] });
    expect(plan([exact({ id: 'x-4' })], [exact({ id: 'x-4', decision: 'ambiguous' })])).toMatchObject({ ok: false });
  });

  it('a valid import publishes reviews and the derived confirmed pairs consistently (temp dir)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-import-ok-'));
    fs.writeFileSync(path.join(d, 'legal-reviews.json'), JSON.stringify({ schemaVersion: 1, reviews: [] }));
    fs.writeFileSync(path.join(d, 'legal-confirmed.json'), JSON.stringify({ pairs: [] }));
    const p = plan([], [exact({ id: 'ok-a' }), exact({ id: 'ok-a' })]);
    expect(p.ok).toBe(true);
    publish({ dir: d, fs, files: {
      'legal-reviews.json': JSON.stringify({ schemaVersion: 1, reviews: p.merged }),
      'legal-confirmed.json': JSON.stringify({ pairs: p.confirmed }),
    } });
    const reviews = JSON.parse(fs.readFileSync(path.join(d, 'legal-reviews.json'), 'utf8')).reviews;
    const pairs = JSON.parse(fs.readFileSync(path.join(d, 'legal-confirmed.json'), 'utf8')).pairs;
    expect(reviews).toHaveLength(1);
    expect(pairs).toEqual(evaluateDatasetReviews(reviews).confirmed.map(c => [c.char, c.reading]));
    expect(pendingImport({ dir: d, fs })).toBe(false);
  });

  it('the real CLI refuses a same-file conflict and leaves both data files byte-for-byte unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const files = ['legal-reviews.json', 'legal-confirmed.json'].map(f => path.resolve('src/data/hanjaDictionary', f));
    const hash = () => files.map(f => createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
    const before = hash();
    const input = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r4-cli-')), 'conflict.json');
    fs.writeFileSync(input, JSON.stringify(env([exact({ id: 'cli-dup' }), exact({ id: 'cli-dup', decision: 'ambiguous' })])));
    const r = spawnSync(process.execPath, [path.resolve('scripts/hanja/import-reviews.mjs'), input], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('review id cli-dup is reused with different content');
    expect(r.stderr).toContain('nothing written');
    expect(hash()).toEqual(before);
    expect(fs.readdirSync(path.resolve('src/data/hanjaDictionary')).filter(n => n.includes('importing') || n.includes('journal'))).toEqual([]);
  }, 60000);
});
