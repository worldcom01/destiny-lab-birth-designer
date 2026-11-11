// R4.1B: human-reviewed legal verification (fail closed) and the prioritized review queue.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildHanjaDataset, createHanjaDictionary, evaluateDatasetReviews, getHanjaDictionary, initialSoundReading, validateDataset, LegalReview, OfficialImageIndex,
} from '@/lib/hanjaDictionary';
import { buildReviewQueue } from '@/lib/hanjaDictionary/reviewQueue';
import { HANJA_DB } from '@/data/hanjaDB';
import imagesJson from '@/data/hanjaDictionary/official-appendix1-images.json';
import reviewFile from '@/data/hanjaDictionary/legal-reviews.json';

const images = imagesJson as unknown as OfficialImageIndex;
const SHA = images.fileSha256;
const imageReview = (o: Partial<LegalReview> & { image?: string; officialReading?: string } = {}): LegalReview => {
  const { image = 'image6721', officialReading = '현', ...rest } = o;
  return {
    id: `t-${Math.random().toString(36).slice(2)}`, reviewer: 'test-fixture', reviewedAt: '2026-11-11T10:00:00Z',
    decision: 'exact-match', char: '鉉', codePoint: 'U+9249', reading: '현',
    evidence: { kind: 'appendix1-image', source: 'court-rule-3151-appendix1', fileSha256: SHA, image, officialReading },
    ...rest,
  };
};
const lookupReview = (char: string, reading: string, o: Partial<LegalReview> = {}, mark = '인명용'): LegalReview => ({
  id: `l-${Math.random().toString(36).slice(2)}`, reviewer: 'test-fixture', reviewedAt: '2026-11-11T10:00:00Z',
  decision: 'exact-match', char, codePoint: `U+${char.codePointAt(0)!.toString(16).toUpperCase()}`, reading,
  evidence: { kind: 'court-lookup', source: 'efamily-lookup', url: 'https://efamily.scourt.go.kr/', lookedUpAt: '2026-11-11', shownReading: reading, shownMark: mark },
  ...o,
});
const dictWith = (reviews: LegalReview[]) => createHanjaDictionary(buildHanjaDataset({ legalReviews: reviews }));

describe('no review, no confirmation', () => {
  it('the shipped review file is empty and nothing is legally confirmed (machine suggestions are not evidence)', () => {
    expect(reviewFile.reviews).toEqual([]);
    expect(evaluateDatasetReviews().confirmed).toEqual([]);
    expect(getHanjaDictionary().dataset.entries.every(e => e.legal.status === 'NOT_CONFIRMED' && e.readings.every(r => !r.legal))).toBe(true);
    expect(getHanjaDictionary().legalReading('鉉', '현')).toEqual({ status: 'NOT_CONFIRMED', basis: null });
  });

  it('a record carrying a machine suggestion confirms nothing unless a person decided exact-match', () => {
    for (const decision of ['ambiguous', 'unable-to-identify'] as const) {
      const r = imageReview({ decision, machineSuggestion: { char: '鉉', score: 0.99 } });
      expect(evaluateDatasetReviews([r]).confirmed).toEqual([]);
      expect(dictWith([r]).legalReading('鉉', '현').status).toBe('NOT_CONFIRMED');
    }
  });
});

describe('valid human review', () => {
  it('confirms exactly the reviewed character and the official table reading, with official evidence', () => {
    const d = dictWith([imageReview()]);
    expect(d.legalReading('鉉', '현')).toEqual({ status: 'CONFIRMED', basis: 'appendix1-image-review' });
    const reading = d.get('鉉')!.readings.find(r => r.hangul === '현')!;
    expect(reading.legal!.evidence[0]).toMatchObject({ source: 'court-rule-3151-appendix1', locator: 'image6721 (table reading 현)' });
    expect(d.legalStatus('鉉').status).toBe('CONFIRMED');
    expect(validateDataset(d.dataset)).toEqual([]);
    // nothing else is touched
    expect(d.dataset.entries.filter(e => e.legal.status === 'CONFIRMED').map(e => e.char)).toEqual(['鉉']);
    expect(d.legalReading('铉', '현').status).toBe('NOT_CONFIRMED');
  });

  it('a shared image (listed under 현 and 형) is reviewed per reading', () => {
    const shared = images.images.find(([id]) => id === 'image6759')!;
    expect(shared.slice(1)).toEqual(['현', '형']);
    const out = evaluateDatasetReviews([imageReview({ image: 'image6759', officialReading: '형', reading: '형', char: '炯', codePoint: 'U+70AF' })]);
    expect(out.issues).toEqual([]);
    expect(out.confirmed.map(c => `${c.char}${c.reading}`)).toEqual(['炯형']);
  });

  it('legacy data stays intact: the legacy gloss remains unverified and no primary gloss is invented', () => {
    const d = dictWith([imageReview()]);
    expect(d.meanings('鉉').find(m => m.text === '쇠줄 현')).toMatchObject({ verification: 'legacy-unverified', primary: false });
    expect(d.primaryMeaning('鉉')).toBeNull();
  });
});

describe('readings are checked independently', () => {
  it('a confirmed reading confirms no other reading of the same character', () => {
    const d = dictWith([lookupReview('樂', '악')]);
    expect(d.legalReading('樂', '악').basis).toBe('court-lookup-review');
    for (const r of ['요', '락', '낙']) expect(d.legalReading('樂', r).status).toBe('NOT_CONFIRMED');
  });

  it('the official note-1 initial-sound rule derives only from a confirmed reading', () => {
    expect([['률', '율'], ['라', '나'], ['련', '연'], ['례', '예'], ['룡', '용'], ['녀', '여'], ['노', null], ['가', null], ['x', null]].map(([a]) => initialSoundReading(a!)))
      .toEqual(['율', '나', '연', '예', '용', '여', null, null, null]);
    expect(getHanjaDictionary().legalReading('律', '율').status).toBe('NOT_CONFIRMED');
    const d = dictWith([lookupReview('律', '률')]);
    expect(d.legalReading('律', '률')).toEqual({ status: 'CONFIRMED', basis: 'court-lookup-review' });
    expect(d.legalReading('律', '율')).toEqual({ status: 'CONFIRMED', basis: 'initial-sound-rule', from: '률' });
    expect(d.legalReading('律', '룰').status).toBe('NOT_CONFIRMED');
  });

  it.each([
    ['reviewed reading differs from the table reading', imageReview({ reading: '형' }), 'reading-mismatch'],
    ['image printed under another reading', imageReview({ officialReading: '형', reading: '형' }), 'official-reading'],
    ['lookup showed another reading', lookupReview('鉉', '현', { evidence: { kind: 'court-lookup', source: 'efamily-lookup', url: 'https://efamily.scourt.go.kr/', lookedUpAt: '2026-11-11', shownReading: '견', shownMark: '인명용' } }), 'reading-mismatch'],
  ])('rejects: %s', (_l, r, code) => {
    const out = evaluateDatasetReviews([r]);
    expect(out.issues.map(i => i.code)).toContain(code);
    expect(out.confirmed).toEqual([]);
  });
});

describe('invalid evidence is refused', () => {
  it.each([
    ['other file', imageReview({ evidence: { kind: 'appendix1-image', source: 'court-rule-3151-appendix1', fileSha256: '0'.repeat(64), image: 'image6721', officialReading: '현' } }), 'evidence-file'],
    ['unknown image', imageReview({ image: 'image99999' }), 'evidence-image'],
    ['no reviewer', imageReview({ reviewer: ' ' }), 'reviewer'],
    ['bad timestamp', imageReview({ reviewedAt: 'yesterday' }), 'review-time'],
    ['code point mismatch', imageReview({ codePoint: 'U+94C9' }), 'code-point'],
    ['two characters', imageReview({ char: '鉉鉉' }), 'character'],
    ['lookup not showing 인명용', lookupReview('鉉', '현', {}, '표시 없음'), 'lookup-mark'],
    ['lookup on another site', lookupReview('鉉', '현', { evidence: { kind: 'court-lookup', source: 'efamily-lookup', url: 'https://example.com/', lookedUpAt: '2026-11-11', shownReading: '현', shownMark: '인명용' } }), 'evidence-url'],
  ])('%s', (_l, r, code) => {
    const out = evaluateDatasetReviews([r]);
    expect(out.issues.map(i => i.code)).toContain(code);
    expect(out.confirmed).toEqual([]);
  });

  it('duplicate review ids are refused', () => {
    const a = imageReview({ id: 'same' }), b = imageReview({ id: 'same' });
    expect(evaluateDatasetReviews([a, b]).issues.map(i => i.code)).toContain('duplicate-review-id');
  });
});

describe('conflicts fail closed', () => {
  it.each([
    ['two characters for one image', [imageReview(), imageReview({ char: '絃', codePoint: 'U+7D43' })]],
    ['exact-match contradicted by ambiguous on the same image', [imageReview(), imageReview({ decision: 'ambiguous' })]],
    ['one character/reading on two different images', [imageReview(), imageReview({ image: 'image6720' })]],
    ['lookup confirmed but another lookup could not identify', [lookupReview('鉉', '현'), lookupReview('鉉', '현', { decision: 'unable-to-identify' })]],
  ])('%s', (_l, reviews) => {
    const out = evaluateDatasetReviews(reviews as LegalReview[]);
    expect(out.issues).toEqual([]);
    expect(out.confirmed).toEqual([]);
    expect(out.unresolved.length).toBeGreaterThan(0);
    expect(dictWith(reviews as LegalReview[]).legalReading('鉉', '현').status).toBe('NOT_CONFIRMED');
  });

  it('agreeing reviews by two reviewers confirm once, citing both', () => {
    const out = evaluateDatasetReviews([imageReview({ reviewer: 'a' }), imageReview({ reviewer: 'b' })]);
    expect(out.confirmed).toHaveLength(1);
    expect(out.confirmed[0].evidence).toHaveLength(2);
  });
});

describe('Unicode compatibility forms stay distinct', () => {
  it('confirming U+6A02 樂 confirms neither U+F914 nor U+F95C; a compat char cannot claim the unified code point', () => {
    const d = dictWith([lookupReview('樂', '락')]);
    expect(d.legalReading('樂', '락').status).toBe('CONFIRMED');
    expect(d.legalReading('樂', '락').status).toBe('NOT_CONFIRMED');
    expect(d.legalReading('樂', '낙').status).toBe('NOT_CONFIRMED');
    const out = evaluateDatasetReviews([lookupReview('樂', '락', { codePoint: 'U+6A02' })]);
    expect(out.issues.map(i => i.code)).toContain('code-point');
  });
});

describe('determinism', () => {
  it('the dataset and review outcome are identical across builds and review order', () => {
    const rs = [imageReview({ id: 'a' }), lookupReview('樂', '악', { id: 'b' }), lookupReview('律', '률', { id: 'c' })];
    expect(JSON.stringify(buildHanjaDataset({ legalReviews: rs }))).toBe(JSON.stringify(buildHanjaDataset({ legalReviews: [...rs].reverse() })));
    expect(JSON.stringify(buildHanjaDataset())).toBe(JSON.stringify(buildHanjaDataset()));
  });

  it('the official image index reproduces the structural counts', () => {
    expect(images.images).toHaveLength(7265);
    expect(images.images.reduce((n, [, ...rs]) => n + rs.length, 0)).toBe(7272);
  });
});

describe('prioritized review queue', () => {
  const appPairs = Object.entries(HANJA_DB).flatMap(([s, o]) => o.map(x => [s, x.hanja] as [string, string]));
  const q = buildReviewQueue({ appPairs, reported: [['현', '鉉']], profilePairs: [['윤2', '允'], ['원', '媛']], dictionary: getHanjaDictionary(), images });

  it('tier 1 covers all 118 app pairs; 鉉 is tagged as reported; invalid profile syllables are skipped', () => {
    expect(q.summary.tier1Targets).toBe(118);
    expect(q.targets.find(t => t.char === '鉉')).toMatchObject({ tier: 1, reported: true, route: 'appendix1', tableReadings: ['현'] });
    expect(q.targets.find(t => t.char === '鉉')!.images).toHaveLength(45);
    expect(q.skipped).toEqual(['윤2/允']);
  });

  it('routes by evidence: basic-list characters to a manual court lookup, non-readings to lookup only', () => {
    expect(q.targets.find(t => t.char === '俊')!.route).toBe('basic-or-lookup');
    expect(q.targets.find(t => t.char === '光' && t.reading === '빛')).toMatchObject({ route: 'lookup-only', images: [] });
    // the table has its own 율 cell and a 률 cell whose note-1 form is 율: both are searched
    expect(q.targets.find(t => t.char === '律')).toMatchObject({ reading: '율', tableReadings: ['률', '율'] });
  });

  it('every official image appears exactly once in tiers 4-5; the queue confirms nothing by itself', () => {
    expect(q.imageTasks).toHaveLength(7265);
    expect(new Set(q.imageTasks.map(t => t.image)).size).toBe(7265);
    expect(q.summary.tier4Images + q.summary.tier5Images).toBe(7265);
    expect(JSON.stringify(q)).not.toMatch(/CONFIRMED/);
  });
});

describe('no storage or calculation coupling', () => {
  it('calculation and storage code never import review, queue or dictionary modules', () => {
    for (const f of ['src/lib/analysis.ts', 'src/lib/scoring.ts', 'src/lib/hanjaPersistence.ts', 'src/lib/hanjaPersistenceCore.ts', 'src/lib/useHanjaPersistence.ts']) {
      expect(fs.readFileSync(path.resolve(f), 'utf8')).not.toMatch(/legalReviews|reviewQueue|hanjaDictionary|hanjaSearch/);
    }
  });

  it('UI code loads the dictionary DATA only on demand (dynamic import) and never the review queue', () => {
    const ui = ['src/components/HanjaPicker.tsx', 'src/components/HanjaQuickSelect.tsx', 'src/components/HanjaSearchPanel.tsx', 'src/components/NameRankCard.tsx', 'src/components/HanjaDisplay.tsx', 'src/lib/hanjaSearch.ts'];
    for (const f of ui) {
      const src = fs.readFileSync(path.resolve(f), 'utf8');
      expect(src).not.toMatch(/reviewQueue|unihan-korean|official-appendix1-images|legal-reviews\.json/);
      // static value imports of the dictionary entry module are not allowed (type-only imports are erased)
      expect(src).not.toMatch(/^import (?!type )[^;]*from '@\/lib\/hanjaDictionary';/m);
    }
    expect(fs.readFileSync(path.resolve('src/components/HanjaSearchPanel.tsx'), 'utf8')).toMatch(/import\('@\/lib\/hanjaDictionary'\)/);
  });

  it('the generated confirmed-pairs file matches the review records', () => {
    const derived = JSON.parse(fs.readFileSync(path.resolve('src/data/hanjaDictionary/legal-confirmed.json'), 'utf8')).pairs;
    expect(derived).toEqual(evaluateDatasetReviews().confirmed.map(c => [c.char, c.reading]));
  });
});
