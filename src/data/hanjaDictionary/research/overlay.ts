// RESEARCH/TEST-ONLY overlay (R4 audit L1; license cleanup, option B).
//
// Everything here is SYNTHETIC test data. It is not a dictionary source and its texts are not
// meanings of any character: they only exercise the research pipeline (several meanings per
// character, provenance, the pending-license gate, production isolation). No third-party
// dictionary text is stored in this repository.
//
// NEVER import this file from application code: only tests and scripts pass it explicitly to
// buildHanjaDataset({ research }). A test walks the production import graph and the postbuild
// check scans the compiled JavaScript for the markers below (scripts/hanja/forbidden-markers.mjs).
import type { SourceRef } from '@/lib/hanjaDictionary/types';
import type { CuratedEntry } from '@/data/hanjaDictionary/curated';

export const RESEARCH_SOURCES: SourceRef[] = [
  {
    id: 'test-fixture-pending-source',
    publisher: 'Synthetic test fixture (not a real publisher)',
    title: 'Synthetic pending-license source for tests',
    locator: 'test-fixture://pending-license-source',
    version: 'synthetic',
    retrieved: '2026-11-12',
    license: 'synthetic test data; modelled as a license that is NOT cleared',
    // deliberately not cleared: records citing it must never reach production
    licenseStatus: 'pending-approval',
    kind: 'community-lexical',
  },
];

/** Synthetic meanings on U+4E00 (一). They are NOT meanings of 一 or of any other character. */
export const RESEARCH_MEANINGS: CuratedEntry[] = [
  {
    char: '一',
    reviewedAt: '2026-11-12',
    meanings: [
      {
        id: 'U+4E00#synthetic-test-a',
        lang: 'ko',
        text: '[시험용 합성 뜻 A · 실제 뜻 아님]',
        primary: true,
        verification: 'attested',
        evidence: [{ source: 'test-fixture-pending-source', locator: 'synthetic record A', detail: 'synthetic test fixture' }],
      },
      {
        id: 'U+4E00#synthetic-test-b',
        lang: 'ko',
        text: '[시험용 합성 뜻 B · 실제 뜻 아님]',
        primary: false,
        verification: 'attested',
        evidence: [{ source: 'test-fixture-pending-source', locator: 'synthetic record B', detail: 'synthetic test fixture' }],
      },
      {
        id: 'U+4E00#synthetic-test-c',
        lang: 'en',
        text: '[synthetic test sense C — not a real definition]',
        primary: false,
        verification: 'attested',
        evidence: [{ source: 'test-fixture-pending-source', locator: 'synthetic record C', detail: 'synthetic test fixture' }],
      },
    ],
  },
];
