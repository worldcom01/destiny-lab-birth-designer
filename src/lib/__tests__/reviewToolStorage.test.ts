// @vitest-environment jsdom
// R4 audit R3: the offline review tool never reports a save it cannot confirm.
// Runs the real scripts/hanja/review-tool.html page script in jsdom with injected storage faults.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE = fs.readFileSync(path.resolve('scripts/hanja/review-tool.html'), 'utf8');
const KEY = 'hanja-legal-review-records-v1';
const DATA = {
  generatedAt: '2026-11-11T00:00:00Z',
  source: { id: 'court-rule-3151-appendix1', fileSha256: 'a'.repeat(64), version: 'test', url: 'https://www.law.go.kr/' },
  datasetVersion: 'test', summary: {}, imageExt: {},
  targets: [{ tier: 1, reason: 'test', reported: true, char: '鉉', codePoint: 'U+9249', reading: '현', route: 'appendix1', tableReadings: ['현'], unihanFlags: '현:0N', images: ['image6721'], suggestionOrder: [['image6721', 0.6]] }],
  imageTasks: [{ tier: 4, image: 'image6721', readings: ['현'], candidates: [], suggestions: [] }],
};

let alerts: string[];
let downloads: { name: string; text: Promise<string> }[];
function boot() {
  const html = TEMPLATE.replace('/*__DATA__*/null', JSON.stringify(DATA));
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script>'));
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  document.body.innerHTML = body;
  new Function(script)(); // the page's own code, unchanged
  return (window as unknown as { __reviewStore: { state: string; unsaved: number; raw: string | null } }).__reviewStore;
}
function reviewOne() {
  const reviewer = document.querySelector<HTMLInputElement>('#reviewer')!;
  reviewer.value = 'rev-test';
  reviewer.dispatchEvent(new Event('change'));
  document.querySelector<HTMLElement>('#list .item[data-i]')!.click();
  document.querySelector<HTMLElement>('#imgs .tile')!.click();
  document.querySelector<HTMLInputElement>('#iSaw')!.checked = true;
  document.querySelector<HTMLElement>('#dExact')!.click();
}
const banner = () => document.querySelector<HTMLElement>('#storage')!;

beforeEach(() => {
  localStorage.clear();
  alerts = []; downloads = [];
  vi.stubGlobal('alert', (m: string) => alerts.push(String(m)));
  vi.stubGlobal('prompt', (_q: string, d: string) => d);
  URL.createObjectURL = (b: Blob) => { downloads.push({ name: '', text: b.text() }); return 'blob:test'; };
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads[downloads.length - 1].name = this.download; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('review tool storage', () => {
  it('normal: a verified save says 저장됨 and survives reload', () => {
    boot(); reviewOne();
    expect(alerts.at(-1)).toMatch(/^저장됨: exact-match 鉉 현/);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1);
    const s = boot();
    expect(s.state).toBe('ok');
    expect(document.querySelector('#progress')!.textContent).toContain('검토 기록 1건(브라우저 저장됨)');
  });

  it('quota exceeded: never 저장됨; the record stays in memory, a warning stays visible, export recovers it', async () => {
    const s = boot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    reviewOne();
    expect(alerts.at(-1)).toMatch(/^저장되지 않았습니다\(QuotaExceededError\)/);
    expect(alerts.some(a => a.startsWith('저장됨'))).toBe(false);
    expect(s.unsaved).toBe(1);
    expect(banner().hidden).toBe(false);
    expect(banner().textContent).toContain('저장되지 않은 결정');
    expect(localStorage.getItem(KEY)).toBeNull();
    document.querySelector<HTMLElement>('#export')!.click();
    const exported = JSON.parse(await downloads.at(-1)!.text);
    expect(exported.reviews.map((r: { char: string }) => r.char)).toEqual(['鉉']);
    expect(alerts.at(-1)).toContain('다운로드 폴더에 파일이 생겼는지 확인'); // no claim that a backup exists
    // retry after the fault clears
    vi.mocked(Storage.prototype.setItem).mockRestore();
    document.querySelector<HTMLElement>('#retrySave')!.click();
    expect(alerts.at(-1)).toBe('저장됨 (브라우저 저장 확인)');
    expect(s.unsaved).toBe(0);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1);
  });

  it('a write that does not read back identically is not reported as saved', () => {
    boot();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) { return k === KEY ? '[]' : null; });
    reviewOne();
    expect(alerts.at(-1)).toMatch(/^저장되지 않았습니다\(Error\)|read-back/);
  });

  it('access denied: storage unavailable, nothing claimed, the reviewer is told to export', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const s = boot();
    expect(s.state).toBe('unavailable');
    expect(banner().textContent).toContain('브라우저 저장소를 사용할 수 없습니다');
    reviewOne();
    expect(alerts.at(-1)).toMatch(/^저장되지 않았습니다/);
    expect(set.mock.calls.filter(([k]) => k === KEY)).toEqual([]);
  });

  it('malformed stored JSON: kept untouched (never replaced by an empty set); raw text can be exported', async () => {
    localStorage.setItem(KEY, '{broken');
    const s = boot();
    expect(s.state).toBe('unreadable');
    expect(banner().textContent).toContain('저장된 검토 기록을 읽을 수 없습니다');
    reviewOne();
    expect(alerts.at(-1)).toMatch(/^저장되지 않았습니다/);
    expect(localStorage.getItem(KEY)).toBe('{broken');
    document.querySelector<HTMLElement>('#exportRaw')!.click();
    expect(await downloads.at(-1)!.text).toBe('{broken');
  });
});

// R4 re-audit R2-b: duplicate ids INSIDE one imported file
describe('review tool import: same-file duplicate ids', () => {
  const rec = (decision: string, o: Record<string, unknown> = {}) => ({
    id: 'dup-in-file', reviewer: 'rev-x', reviewedAt: '2026-11-11T10:00:00Z', decision, char: '鉉', codePoint: 'U+9249', reading: '현',
    evidence: { kind: 'appendix1-image', source: 'court-rule-3151-appendix1', fileSha256: DATA.source.fileSha256, image: 'image6721', officialReading: '현' }, notes: '', machineSuggestion: null, ...o,
  });
  async function importFile(reviews: unknown[]) {
    const file = new File([JSON.stringify({ schemaVersion: 1, source: DATA.source, reviews })], 'x.json', { type: 'application/json' });
    const input = document.querySelector<HTMLInputElement>('#import')!;
    alerts.length = 0; // wait for THIS import's message, never a stale one
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(alerts.length).toBeGreaterThan(0));
  }

  it('conflicting decisions under one id in the same file: whole file rejected, nothing stored', async () => {
    localStorage.setItem(KEY, JSON.stringify([]));
    boot();
    const before = localStorage.getItem(KEY);
    await importFile([rec('exact-match'), rec('ambiguous')]);
    expect(alerts.at(-1)).toMatch(/같은 ID에 다른 내용/);
    expect(alerts.at(-1)).toContain('dup-in-file');
    expect(localStorage.getItem(KEY)).toBe(before); // byte-for-byte unchanged
    expect(document.querySelector('#progress')!.textContent).toContain('검토 기록 0건');
  });

  it('same id with the same decision but different evidence in one file: whole file rejected', async () => {
    boot();
    await importFile([rec('exact-match'), rec('exact-match', { evidence: { ...rec('exact-match').evidence, image: 'image6720' } })]);
    expect(alerts.at(-1)).toMatch(/같은 ID에 다른 내용.*dup-in-file/);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('identical records under one id in the same file: deduplicated to one', async () => {
    boot();
    // same content, different key order (canonical comparison, like the CLI)
    const a = rec('exact-match');
    const b = Object.fromEntries(Object.entries(rec('exact-match')).reverse());
    await importFile([a, b]);
    expect(alerts.at(-1)).toMatch(/^1건 가져와 저장했습니다/);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1);
  });

  it('an incoming id already stored: identical -> skipped; different -> whole file rejected', async () => {
    localStorage.setItem(KEY, JSON.stringify([rec('exact-match')]));
    boot();
    await importFile([rec('exact-match'), rec('exact-match', { id: 'other-1' })]);
    expect(alerts.at(-1)).toMatch(/^1건 가져와 저장했습니다/);
    const stored = localStorage.getItem(KEY);
    await importFile([rec('exact-match', { id: 'other-2' }), rec('ambiguous')]);
    expect(alerts.at(-1)).toMatch(/같은 ID에 다른 내용/);
    expect(localStorage.getItem(KEY)).toBe(stored);
  });

  it('malformed envelopes are rejected before anything changes', async () => {
    boot();
    const input = document.querySelector<HTMLInputElement>('#import')!;
    for (const body of ['{bad', JSON.stringify({ schemaVersion: 2, source: DATA.source, reviews: [] }), JSON.stringify({ schemaVersion: 1, source: { ...DATA.source, fileSha256: 'b'.repeat(64) }, reviews: [] }), JSON.stringify({ schemaVersion: 1, source: DATA.source, reviews: [{ no: 'id' }] })]) {
      alerts.length = 0;
      Object.defineProperty(input, 'files', { value: [new File([body], 'x.json')], configurable: true });
      input.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(alerts.length).toBeGreaterThan(0));
      expect(alerts.at(-1)).toMatch(/아무것도 가져오지 않았습니다|가져오지 않았습니다/);
    }
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
