// R4 audit L1: markers that must never appear in production sources or build output.
// The research overlay contains only synthetic test fixtures; these markers detect it (or any
// test fixture) leaking into shipped JavaScript.
export const FORBIDDEN = [
  '시험용 합성 뜻',               // synthetic Korean test meanings (research overlay)
  'synthetic test sense',        // synthetic English test meaning (research overlay)
  '#synthetic-test-',            // synthetic meaning ids
  'test-fixture',                // fixture source ids / review fixtures used by tests
  'qa-smoke',
  'wiktionary',                  // no Wiktionary-derived record may ship (license not cleared)
];
