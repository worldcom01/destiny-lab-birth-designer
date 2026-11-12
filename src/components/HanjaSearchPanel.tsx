'use client';

// R4.2: search inside the result-card Hanja picker. Finds characters by exact character,
// Hangul reading or meaning in the source-traceable dictionary (loaded on first use).
// Only eligible characters can be selected; every other result explains why not.
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { HanjaDictionary, MeaningRecord } from '@/lib/hanjaDictionary';
import { LEGAL_LABEL, NOT_CONFIRMED_NOTICE, SearchMode, SearchResult, searchHanja, unavailableReason } from '@/lib/hanjaSearch';
import { LEGACY_GLOSS_LABEL } from '@/lib/hanjaModel';

const MODES: { value: SearchMode; label: string }[] = [
  { value: 'auto', label: '자동' }, { value: 'character', label: '한자' }, { value: 'reading', label: '음' }, { value: 'meaning', label: '뜻' },
];
const ELIGIBILITY_LABEL: Record<string, string> = {
  'legacy-offered': '선택 가능 · 기존 목록',
  'verified-reading': '선택 가능 · 인명용 확인',
  'reading-mismatch': '선택 불가 · 다른 음',
  'unknown-reading': '선택 불가 · 확인 필요',
  invalid: '선택 불가',
};

let dictionaryPromise: Promise<HanjaDictionary> | null = null;
/**
 * Loads the dictionary chunk once (it is not part of the initial page bundle). A failed load
 * is NOT cached (R4 audit A2): the next explicit retry starts a fresh import.
 */
export function loadHanjaDictionary(): Promise<HanjaDictionary> {
  if (!dictionaryPromise) {
    const p = import('@/lib/hanjaDictionary').then(m => m.getHanjaDictionary());
    dictionaryPromise = p;
    p.catch(() => { if (dictionaryPromise === p) dictionaryPromise = null; });
  }
  return dictionaryPromise;
}

function SourceLine({ m, sources }: { m: MeaningRecord; sources: HanjaDictionary['dataset']['sources'] }) {
  const s = sources.filter(x => m.evidence.some(e => e.source === x.id));
  return (
    <span className="block text-[10px] text-slate-500">
      출처: {s.map(x => `${x.title} (${x.version}; ${x.license})`).join(' / ') || '없음'}
    </span>
  );
}

export default function HanjaSearchPanel({ hangul, onChoose, onSearchingChange }: {
  hangul: string;
  /** called with the exact character; the picker decides how it is saved */
  onChoose: (hanja: string, result: SearchResult) => void;
  onSearchingChange?: (searching: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('auto');
  const [dict, setDict] = useState<HanjaDictionary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const backTo = useRef<string | null>(null);
  const searching = query.trim().length > 0;

  useEffect(() => { onSearchingChange?.(searching); }, [searching, onSearchingChange]);
  useEffect(() => {
    if (!searching || dict || loadError) return;
    let alive = true;
    loadHanjaDictionary().then(d => { if (alive) setDict(d); }, () => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [searching, dict, loadError]);

  const outcome = useMemo(() => (dict && searching ? searchHanja(dict, hangul, query, mode) : null), [dict, searching, hangul, query, mode]);
  const results = outcome?.results ?? [];
  const selectableCount = results.filter(r => r.selectable).length;
  const current = detail ? results.find(r => r.char === detail) ?? null : null;

  // R4 audit A1: opening a result's detail unmounts the row; focus moves to the detail heading
  // (only when it was lost — a deliberate move elsewhere is left alone). Leaving the detail
  // returns focus to the same row, or to the search box when that row no longer exists.
  const focusLost = () => { const a = document.activeElement; return !a || a === document.body || !a.isConnected; };
  useEffect(() => {
    if (detail !== null) { if (focusLost()) detailHeadingRef.current?.focus(); return; }
    if (backTo.current) {
      const row = rowRefs.current.get(backTo.current);
      backTo.current = null;
      if (focusLost()) (row?.isConnected ? row : inputRef.current)?.focus();
    }
  }, [detail]);

  const order = results.map(r => r.char);
  const onListKey = (e: KeyboardEvent<HTMLElement>, char?: string) => {
    const i = char ? order.indexOf(char) : -1;
    const go = (j: number) => { const c = order[Math.max(0, Math.min(order.length - 1, j))]; if (c) { e.preventDefault(); rowRefs.current.get(c)?.focus(); } };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') { if (i <= 0) { e.preventDefault(); inputRef.current?.focus(); } else go(i - 1); }
    else if (e.key === 'Home' && char) go(0);
    else if (e.key === 'End' && char) go(order.length - 1);
  };

  return (
    <div data-testid="hanja-search">
      <div className="sticky top-0 z-10 bg-white px-5 pt-3 pb-2 border-b border-slate-100">
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`hanja-search-${hangul}`}>한자 검색</label>
          <input
            ref={inputRef} id={`hanja-search-${hangul}`} type="search" value={query}
            onChange={e => { setQuery(e.target.value); setDetail(null); }}
            onKeyDown={e => onListKey(e)}
            placeholder="한자·음·뜻으로 찾기 (예: 鉉, 현)"
            aria-describedby={`hanja-search-status-${hangul}`}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
          <select aria-label="검색 기준" value={mode} onChange={e => { setMode(e.target.value as SearchMode); setDetail(null); }}
            className="shrink-0 rounded-lg border border-slate-300 px-2 text-base sm:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <p id={`hanja-search-status-${hangul}`} role="status" className="mt-1 text-[11px] text-slate-500" data-testid="hanja-search-status">
          {!searching ? `'${hangul}' 목록에 없는 한자도 찾을 수 있습니다. 공식 확인되지 않은 한자는 선택할 수 없습니다.`
            : loadError ? '한자 사전을 불러오지 못했습니다. 다시 시도하거나 검색어를 지우고 기존 목록에서 선택해 주세요.'
              : !dict ? '한자 사전을 불러오는 중입니다…'
                : `검색 결과 ${results.length}건 · 선택 가능 ${selectableCount}건${outcome?.notInDictionary.length ? ` · 사전에 없음: ${outcome.notInDictionary.join(' ')}` : ''}`}
        </p>
        {searching && loadError && (
          <button type="button" data-testid="hanja-search-retry" onClick={() => setLoadError(false)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            다시 시도
          </button>
        )}
      </div>

      {searching && dict && !current && (
        <ul className="px-5 py-3 space-y-2" aria-label="검색 결과" data-testid="hanja-search-results">
          {results.length === 0 && <li className="text-sm text-slate-500" data-testid="hanja-search-empty">일치하는 한자가 없습니다.</li>}
          {results.map(r => (
            <li key={r.char}>
              <button
                type="button" data-result={r.char} data-eligibility={r.eligibility} data-legal={r.legal.status}
                ref={el => { if (el) rowRefs.current.set(r.char, el); else rowRefs.current.delete(r.char); }}
                onKeyDown={e => onListKey(e, r.char)}
                onClick={() => { backTo.current = r.char; setDetail(r.char); }}
                aria-label={`${r.char} ${r.codePoint} · ${ELIGIBILITY_LABEL[r.eligibility]} · ${LEGAL_LABEL[r.legal.status]} · 자세히 보기`}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <span className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-3xl font-black text-slate-800">{r.char}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-mono text-slate-500 wrap-break-word">{r.codePoint} · 음 {r.readings.map(x => x.hangul).join('·') || '기록 없음'}</span>
                  <span className="block text-sm text-slate-800 wrap-break-word" data-testid="hanja-result-meaning">
                    {r.meanings.primary ? r.meanings.primary.text : r.meanings.legacy[0] ? `${r.meanings.legacy[0].text} (${LEGACY_GLOSS_LABEL})` : '확인된 뜻 없음'}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.selectable ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{ELIGIBILITY_LABEL[r.eligibility]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.legal.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : r.legal.status === 'INELIGIBLE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{LEGAL_LABEL[r.legal.status]}</span>
                    {r.matchedBy === 'legacy-meaning' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">출처 미확인 뜻에서 찾음</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && dict && (
        <section className="px-5 py-3 space-y-3 wrap-break-word" aria-labelledby={`hanja-detail-${current.codePoint}`} data-testid="hanja-search-detail" data-char={current.char}>
          <h4 id={`hanja-detail-${current.codePoint}`} ref={detailHeadingRef} tabIndex={-1} className="text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            {current.char} ({current.codePoint}) 상세 정보
          </h4>
          <div className="flex items-center gap-4">
            <span className="w-20 h-20 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-5xl font-black text-slate-900">{current.char}</span>
            <div className="min-w-0 flex-1 text-xs text-slate-600 space-y-0.5 wrap-break-word">
              <p className="font-mono">{current.codePoint}</p>
              <p>음: {current.readings.length ? current.readings.map(x => `${x.hangul}${x.legal ? '(인명용 확인)' : x.legacy && !x.unihan ? '(기존 목록만)' : ''}`).join(', ') : '기록 없음'}</p>
              {!current.inDictionary && <p className="text-amber-800">사전에 없는 글자입니다.</p>}
            </div>
          </div>

          <div data-testid="hanja-meanings">
            <h4 className="text-xs font-bold text-slate-700">뜻</h4>
            {current.meanings.verifiedKorean.length ? (
              <ul className="mt-1 space-y-1">
                {current.meanings.verifiedKorean.map(m => (
                  <li key={m.id} className="text-sm text-slate-800" data-meaning={m.id}>
                    {m.primary && <span className="mr-1 rounded bg-indigo-100 px-1 text-[10px] font-bold text-indigo-700">대표</span>}{m.text}
                    <SourceLine m={m} sources={dict.dataset.sources} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-600" data-testid="hanja-meaning-missing">확인된 한국어 뜻이 없습니다 (사용 허락된 출처 없음).</p>
            )}
            {current.meanings.english.length > 0 && (
              <div className="mt-2 text-xs text-slate-600" data-testid="hanja-meaning-english">
                참고 영문 정의: {current.meanings.english.map(m => m.text).join('; ')}
                <span className="block text-[10px] text-slate-500">Unicode Unihan (Unicode License v3) · 한국어 뜻이 아닙니다</span>
              </div>
            )}
            {current.meanings.legacy.length > 0 && (
              <div className="mt-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-600" data-testid="hanja-meaning-legacy">
                이전 데이터 뜻 ({LEGACY_GLOSS_LABEL}): {current.meanings.legacy.map(m => m.text).join(', ')}
                <span className="block text-[10px] text-slate-500">근거 출처가 없는 기존 앱 데이터입니다. 확인된 뜻으로 보지 마세요.</span>
              </div>
            )}
          </div>

          <div data-testid="hanja-legal" data-legal={current.legal.status}>
            <h4 className="text-xs font-bold text-slate-700">{`인명용 여부 ('${hangul}' 음)`}</h4>
            <p className="text-sm">{LEGAL_LABEL[current.legal.status]}</p>
            {current.legal.status === 'NOT_CONFIRMED' && <p className="text-[11px] text-amber-800">{NOT_CONFIRMED_NOTICE}</p>}
          </div>

          {(() => { const reason = unavailableReason(current, hangul); return reason ? <p className="text-[11px] text-slate-600" data-testid="hanja-unavailable">{reason}</p> : null; })()}
          <div className="flex gap-2">
            <button type="button" onClick={() => setDetail(null)}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">목록으로</button>
            <button type="button" disabled={!current.selectable} onClick={() => onChoose(current.char, current)}
              className="min-w-0 flex-1 rounded-xl bg-indigo-600 px-2 py-2 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              {current.selectable ? `${current.char}(으)로 선택` : '선택할 수 없음'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
