// R4.2: a HUMAN-confirmed legal reading makes a character outside the legacy list selectable
// (simulated with a test fixture; the shipped confirmed list is empty).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/hanjaDictionary/legal-confirmed.json', () => ({ default: { note: 'test fixture', pairs: [['閔', '민'], ['律', '률']] } }));

const { buildHanjaDataset, createHanjaDictionary } = await import('@/lib/hanjaDictionary');
const { searchHanja } = await import('@/lib/hanjaSearch');
const { selectionEligibility, storedSelectionChar, classifyStoredSelection, charStatusLabel } = await import('@/lib/hanjaModel');

const lookup = (char: string, reading: string) => ({
  id: `fixture-${char}`, reviewer: 'test-fixture', reviewedAt: '2026-11-11T10:00:00Z', decision: 'exact-match' as const,
  char, codePoint: `U+${char.codePointAt(0)!.toString(16).toUpperCase()}`, reading,
  evidence: { kind: 'court-lookup' as const, source: 'efamily-lookup' as const, url: 'https://efamily.scourt.go.kr/', lookedUpAt: '2026-11-11', shownReading: reading, shownMark: '인명용' },
});
const dict = createHanjaDictionary(buildHanjaDataset({ legalReviews: [lookup('閔', '민'), lookup('律', '률')] }));

describe('confirmed legal reading', () => {
  it('is selectable, labelled CONFIRMED, and stored/shown as a normal confirmed character (not "음 미확인")', () => {
    expect(selectionEligibility('민', '閔')).toBe('verified-reading');
    const r = searchHanja(dict, '민', '閔').results[0];
    expect(r).toMatchObject({ selectable: true, eligibility: 'verified-reading', legal: { status: 'CONFIRMED', basis: 'court-lookup-review' } });
    expect(r.meanings.primary).toBeNull(); // no invented meaning
    const c = storedSelectionChar('민', '閔')!;
    expect(c).toMatchObject({ hanja: '閔', status: 'confirmed', meaning: null, strokes: null });
    expect(c.readingUnverified).toBeUndefined();
    expect(charStatusLabel(c)).toBe('확정');
  });

  it('confirmation is per reading: the same character under another syllable is still not selectable', () => {
    expect(selectionEligibility('문', '閔')).not.toBe('verified-reading');
    expect(classifyStoredSelection('률', '律')).toBe('verified-reading');
    expect(classifyStoredSelection('율', '律')).toBe('offered'); // the legacy table lists 律 under 율
    expect(selectionEligibility('룰', '律')).not.toBe('verified-reading');
  });
});
