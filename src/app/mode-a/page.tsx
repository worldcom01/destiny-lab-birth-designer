'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { IMAGE_EFFECT_TEXT, STYLE_EFFECT_TEXT } from '@/lib/scoreComponents';
import { useRouter } from 'next/navigation';
import { Calendar, User, ChevronRight, Sparkles, Info, Layers, ArrowLeft } from 'lucide-react';
import { DesignerInput, Gender, ImageType, IMAGE_LABELS, NameStyle, NAME_STYLE_LABELS, TimeRange } from '@/types';
import { COMMON_SURNAMES } from '@/data/nameChars';
import { getHanjaOptions, type HanjaOption } from '@/data/hanjaDB';
import { HanjaInputRow } from '@/components/HanjaInputRow';
import { SUPPORTED_KST_DATE_RANGE } from '@/lib/calendar';
import { dolrimNotice, validateDesignerInput } from '@/lib/inputValidation';
import { writeStoredInput } from '@/lib/storage';
import { MODE_A_STORAGE_KEY, TIME_PRESETS, hasRange, loadModeAFormInit, scheduleSelectionState, type SelectionStatus } from '@/lib/modeAForm';

const ALL_IMAGES: ImageType[] = [
  '리더형', '학자형', '예술형', '사업가형', '창의형',
  '균형형', '건강중심형', '글로벌형', '대인관계형',
];

function getDays(s: string, e: string) {
  if (!s || !e) return 0;
  return Math.max(0, Math.floor((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1);
}

const subscribeNoop = () => () => {};

const STATUS_CHIP: Record<SelectionStatus, { label: string; className: string }> = {
  none: { label: '미선택', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  complete: { label: '선택 완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  error: { label: '입력 오류', className: 'bg-red-50 text-red-600 border-red-200' },
};

function RequiredBadge() {
  return <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">필수 입력</span>;
}

export default function ModeAPage() {
  // Defaults depend on today's date (Asia/Seoul) and a previous input in
  // localStorage, so the form renders on the client only: no build-time date
  // and no hydration mismatch.
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  return isClient
    ? <ModeAForm />
    : <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center text-sm text-slate-400" aria-busy="true">입력 화면을 준비하는 중…</div>;
}

function ModeAForm() {
  const router = useRouter();
  const [init] = useState(() => loadModeAFormInit(new Date()));

  const [startDate, setStartDate] = useState(init.startDate);
  const [endDate, setEndDate] = useState(init.endDate);
  const [surname, setSurname] = useState(init.surname);
  const [gender, setGender] = useState<Gender>(init.gender);
  const [dolrimChar, setDolrimChar] = useState(init.dolrimChar);
  const [dolrimPosition, setDolrimPosition] = useState<'first' | 'second' | 'auto'>(init.dolrimPosition);
  const [dolrimHanja, setDolrimHanja] = useState<HanjaOption | null>(
    () => (init.dolrimHanja && getHanjaOptions(init.dolrimChar).find(o => o.hanja === init.dolrimHanja)) || null,
  );
  const [nameStyles, setNameStyles] = useState<NameStyle[]>(init.nameStyles);
  const [images, setImages] = useState<ImageType[]>(init.images);
  const [providerConfirmed, setProviderConfirmed] = useState(false);
  // No default availability: a new input starts with zero permitted times.
  const [timeRanges, setTimeRanges] = useState<TimeRange[]>(init.timeRanges);
  const [exactTimes, setExactTimes] = useState<string[]>(init.exactTimes);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selection = scheduleSelectionState(timeRanges, exactTimes);
  const customRangeCount = timeRanges.filter(r => !TIME_PRESETS.some(p => p.range.start === r.start && p.range.end === r.end)).length;

  const togglePreset = (range: TimeRange) => {
    setTimeRanges(p => hasRange(p, range)
      ? p.filter(r => !(r.start === range.start && r.end === range.end))
      : [...p, { ...range }]);
    setErrors(p => ({ ...p, time: '' }));
  };
  const addCustomRange = () => {
    setTimeRanges(p => [...p, { start: '', end: '' }]);
    setErrors(p => ({ ...p, time: '' }));
  };

  const updateRange = (i: number, key: keyof TimeRange, v: string) => {
    setTimeRanges(p => p.map((r, j) => j === i ? { ...r, [key]: v } : r));
    setErrors(p => ({ ...p, time: '' }));
  };
  const updateExact = (i: number, v: string) => {
    setExactTimes(p => p.map((t, j) => j === i ? v : t));
    setErrors(p => ({ ...p, time: '' }));
  };

  const toggleNameStyle = useCallback((s: NameStyle) => {
    setNameStyles(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  }, []);

  const toggleImage = useCallback((img: ImageType) => {
    setImages(p => p.includes(img) ? p.filter(i => i !== img) : [...p, img]);
  }, []);

  const handleStart = () => {
    const input: DesignerInput = {
      startDate, endDate, surname: surname.trim(), gender,
      dolrimChar: dolrimChar.trim(), dolrimPosition,
      dolrimHanja: dolrimHanja?.hanja,
      nameStyles, images,
      schedule: {
        providerConfirmed,
        // Blank rows are ignored; partially filled rows are reported by validation.
        timeRanges: timeRanges.filter(r => r.start || r.end),
        exactTimes: exactTimes.filter(t => t),
      },
    };
    const result = validateDesignerInput(input);
    if (!result.ok) {
      const e: Record<string, string> = {};
      for (const issue of result.issues) e[issue.field] = e[issue.field] ? `${e[issue.field]} / ${issue.message}` : issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    const saved = writeStoredInput(MODE_A_STORAGE_KEY, result.value);
    if (!saved.ok) { setErrors({ storage: saved.message }); return; }
    router.push('/mode-a/results');
  };

  const days = getDays(startDate, endDate);
  const requiredMissing = [
    !(startDate && endDate) && '출산 기간',
    selection.status !== 'complete' && '허용 시간',
    !providerConfirmed && '의료진 확인',
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 모드 선택으로
          </button>
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-indigo-200 mb-3">
            <Sparkles className="w-3 h-3" /> MODE A · 출생 설계 모드
          </div>
          <h1 className="text-2xl font-black text-white">출생 설계 모드</h1>
          <p className="text-sm text-indigo-300 mt-1.5">날짜 · 시간 · 이름을 함께 설계합니다</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* 1. 출산 가능 기간 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">1</span>
            <Calendar className="w-4 h-4 text-slate-400" /> 의료진이 허용한 출산 일정 <RequiredBadge />
          </h2>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              담당 의료진이 허용한 날짜·시간만 입력해주세요. 이 앱은 의료적 안전성을 판단할 수 없으며,
              입력한 범위 밖의 날짜·시간은 계산하거나 추천하지 않습니다. 전통 사주 점수는 건강·발달·의학적 결과를 예측하지 않습니다.
            </p>
          </div>
          {init.restoreNotice && (
            <p role="status" className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">{init.restoreNotice}</p>
          )}
          {init.dateNotice && (
            <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{init.dateNotice}</p>
          )}

          {/* 시작일 · 종료일 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mode-a-start" className="text-sm text-slate-700 font-semibold block mb-1.5">시작일</label>
              <input id="mode-a-start" type="date" required value={startDate}
                min={SUPPORTED_KST_DATE_RANGE.first} max={SUPPORTED_KST_DATE_RANGE.last}
                onChange={e => { setStartDate(e.target.value); setErrors(p => ({ ...p, date: '' })); }}
                className="w-full min-h-[44px] px-3 py-2.5 border border-slate-200 rounded-xl text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label htmlFor="mode-a-end" className="text-sm text-slate-700 font-semibold block mb-1.5">종료일</label>
              <input id="mode-a-end" type="date" required value={endDate}
                min={startDate || SUPPORTED_KST_DATE_RANGE.first} max={SUPPORTED_KST_DATE_RANGE.last}
                onChange={e => { setEndDate(e.target.value); setErrors(p => ({ ...p, date: '' })); }}
                className="w-full min-h-[44px] px-3 py-2.5 border border-slate-200 rounded-xl text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          {errors.date && <p className="text-xs text-red-500 mt-2">{errors.date}</p>}
          {days > 0 && <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-3">총 <strong>{days}일</strong> 범위 선택됨 (최대 30일)</p>}

          {/* 허용 시간 */}
          {/* min-w-0: fieldsets default to min-width:min-content and would overflow on narrow screens */}
          <fieldset className="mt-5 min-w-0 border-t border-slate-100 pt-4">
            <legend className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
              의료진이 허용한 시간 <RequiredBadge />
              <span data-testid="time-status" className={`text-[11px] font-bold border rounded-full px-2 py-0.5 ${STATUS_CHIP[selection.status].className}`}>
                {STATUS_CHIP[selection.status].label}
              </span>
            </legend>
            <p className="text-xs text-slate-500 mt-1.5 mb-3 leading-relaxed">
              담당 의료진이 허용한 시간대를 직접 선택하세요. 오전·오후 버튼은 입력 편의를 위한 예시일 뿐 권장 시간이 아니며,
              선택한 시간은 모든 날짜에 동일하게 적용됩니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="허용 시간 선택">
              {TIME_PRESETS.map(p => {
                const on = hasRange(timeRanges, p.range);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => togglePreset(p.range)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                    {on ? '✓ ' : ''}{p.label} ({p.range.start}–{p.range.end})
                  </button>
                );
              })}
              <button type="button" aria-pressed={customRangeCount > 0} onClick={addCustomRange}
                className={`min-h-[44px] px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${customRangeCount > 0 ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                {customRangeCount > 0 ? '✓ ' : ''}직접 지정
              </button>
            </div>

            {(timeRanges.length > 0 || exactTimes.length > 0) && (
              <div className="space-y-2 mt-3">
                {timeRanges.map((r, i) => (
                  // On narrow screens the delete button wraps below so both time inputs keep a readable width.
                  <div key={`r${i}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1">
                    <div className="flex basis-full sm:basis-auto sm:flex-1 items-center gap-2 min-w-0">
                    <input type="time" aria-label={`허용 구간 ${i + 1} 시작`} value={r.start} onChange={e => updateRange(i, 'start', e.target.value)}
                      className="flex-1 min-w-0 min-h-[44px] px-2 py-2 border border-slate-200 rounded-xl text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <span className="text-sm text-slate-400">~</span>
                    <input type="time" aria-label={`허용 구간 ${i + 1} 종료`} value={r.end} onChange={e => updateRange(i, 'end', e.target.value)}
                      className="flex-1 min-w-0 min-h-[44px] px-2 py-2 border border-slate-200 rounded-xl text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <button type="button" aria-label={`허용 구간 ${i + 1} 삭제`} onClick={() => setTimeRanges(p => p.filter((_, j) => j !== i))}
                      className="ml-auto sm:ml-0 min-h-[44px] text-xs text-slate-500 hover:text-red-500 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">삭제</button>
                  </div>
                ))}
                {exactTimes.map((t, i) => (
                  <div key={`t${i}`} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16 flex-shrink-0">특정 시각</span>
                    <input type="time" aria-label={`특정 시각 ${i + 1}`} value={t} onChange={e => updateExact(i, e.target.value)}
                      className="flex-1 min-w-0 min-h-[44px] px-2 py-2 border border-slate-200 rounded-xl text-base bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <button type="button" aria-label={`특정 시각 ${i + 1} 삭제`} onClick={() => setExactTimes(p => p.filter((_, j) => j !== i))}
                      className="min-h-[44px] text-xs text-slate-500 hover:text-red-500 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">삭제</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setExactTimes(p => [...p, ''])}
              className="mt-2.5 min-h-[44px] text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">+ 특정 시각 추가</button>
            <p className="text-xs text-slate-400 mt-2.5">시작 시각 포함, 종료 시각 제외 · 종료 00:00은 자정(24:00) · 자정을 넘기는 구간은 두 개로 나눠 입력</p>
            {errors.time && <p className="text-xs text-red-500 mt-2">{errors.time}</p>}
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              시간 기준: 한국 표준시(KST, UTC+9) · 진태양시 보정 없음 · 23:00~23:59는 같은 날짜의 자시로 계산 ·
              분석 가능 기간 {SUPPORTED_KST_DATE_RANGE.first} ~ {SUPPORTED_KST_DATE_RANGE.last}
            </p>
          </fieldset>

          {/* 선택한 일정 요약 */}
          <div id="mode-a-schedule-summary" role="status" aria-live="polite"
            className={`mt-4 rounded-xl border p-3 text-sm ${selection.status === 'complete' ? 'border-emerald-200 bg-emerald-50/60' : selection.status === 'error' ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-xs font-bold text-slate-700 mb-1">선택한 일정</p>
            <p className="text-slate-700">날짜: {startDate && endDate ? `${startDate} ~ ${endDate}${days > 0 ? ` (${days}일)` : ''}` : '미선택'}</p>
            <p className="text-slate-700">
              허용 시간: {selection.status === 'complete'
                ? `${selection.summary.join(', ')} (매일, KST)`
                : selection.status === 'error' ? '입력 오류 — 아래 내용을 확인해주세요' : '미선택 — 허용 시간을 선택해주세요'}
            </p>
            {selection.status === 'error' && (
              <ul className="mt-1 text-xs text-red-600 list-disc pl-5">{selection.issues.map((m, i) => <li key={i}>{m}</li>)}</ul>
            )}
          </div>

          {/* 의료진 확인 (시간 선택과 별도) */}
          <label className="flex items-start gap-2.5 mt-4 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={providerConfirmed}
              onChange={e => { setProviderConfirmed(e.target.checked); setErrors(p => ({ ...p, confirm: '' })); }}
              className="mt-0.5 w-5 h-5 accent-indigo-600 flex-shrink-0" />
            <span className="text-sm text-slate-700">
              위 날짜·시간 범위는 담당 의료진이 허용한 범위임을 확인합니다 <RequiredBadge />
              <span className="block text-xs text-slate-400 mt-0.5">시간을 선택하는 것만으로는 의료진 확인으로 간주하지 않습니다.</span>
            </span>
          </label>
          {errors.confirm && <p className="text-xs text-red-500 mt-1.5">{errors.confirm}</p>}
        </section>

        {/* 2. 성씨 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">2</span>
            <User className="w-4 h-4 text-slate-400" /> 성씨
          </h2>
          <div className="flex items-center gap-3 mb-3">
            <input type="text" value={surname} onChange={e => { setSurname(e.target.value); setErrors(p => ({ ...p, surname: '' })); }}
              placeholder="예) 김, 이, 남궁" maxLength={3}
              className="w-24 px-3 py-2.5 border border-slate-200 rounded-xl text-base sm:text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center font-bold" />
            <span className="text-xs text-slate-500">단성 또는 복성</span>
          </div>
          {errors.surname && <p className="text-xs text-red-500 mb-2">{errors.surname}</p>}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.keys(COMMON_SURNAMES).slice(0, 12).map(s => (
              <button key={s} onClick={() => setSurname(s)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${surname === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-100 hover:border-slate-300'}`}>
                {s}
              </button>
            ))}
          </div>
          {/* 성씨 한자 정보 */}
          {surname && (
            <HanjaInputRow
              label={`성씨 '${surname}'`}
              hangul={surname}
              selected={null}
              onSelect={() => {}}
              onClear={() => {}}
              isSurname
            />
          )}
        </section>

        {/* 3. 성별 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">3</span>
            성별
          </h2>
          <div className="flex gap-3">
            {(['남', '여'] as Gender[]).map(g => (
              <button key={g} onClick={() => setGender(g)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${gender === g ? (g === '남' ? 'bg-blue-600 text-white shadow-sm' : 'bg-pink-500 text-white shadow-sm') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {g === '남' ? '남아 👦' : '여아 👧'}
              </button>
            ))}
          </div>
        </section>

        {/* 4. 돌림자 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">4</span>
            <Layers className="w-4 h-4 text-slate-400" /> 돌림자 <span className="text-slate-400 font-normal">(선택)</span>
          </h2>
          <div className="flex items-center gap-3">
            <input type="text" value={dolrimChar} onChange={e => { setDolrimChar(e.target.value.slice(0, 1)); setDolrimHanja(null); setErrors(p => ({ ...p, dolrim: '' })); }}
              placeholder="예) 민" maxLength={1}
              className="w-16 px-3 py-2.5 border border-slate-200 rounded-xl text-lg font-black bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center" />
            {dolrimChar && (
              <div className="flex gap-2">
                {([['auto', '자동'], ['first', `${dolrimChar}○`], ['second', `○${dolrimChar}`]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setDolrimPosition(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all ${dolrimPosition === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-100'}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 돌림자 한자 선택 */}
          {dolrimChar && (
            <div className="mt-3">
              <HanjaInputRow
                label={`돌림자 '${dolrimChar}' 한자 선택`}
                hangul={dolrimChar}
                selected={dolrimHanja}
                onSelect={setDolrimHanja}
                onClear={() => setDolrimHanja(null)}
              />
            </div>
          )}
          {errors.dolrim && <p className="text-xs text-red-500 mt-2">{errors.dolrim}</p>}
          {!errors.dolrim && dolrimNotice(dolrimChar) && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">{dolrimNotice(dolrimChar)}</p>
          )}
        </section>

        {/* 5. 이름 스타일 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-1">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">5</span>
            <Sparkles className="w-4 h-4 text-slate-400" /> 원하는 이름 스타일 <span className="text-slate-400 font-normal">(선택·복수)</span>
          </h2>
          <p className="text-[11px] text-slate-400 mb-4 ml-8">
            {STYLE_EFFECT_TEXT}
          </p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(Object.keys(NAME_STYLE_LABELS) as NameStyle[]).map(style => {
              const { icon, desc } = NAME_STYLE_LABELS[style];
              const sel = nameStyles.includes(style);
              return (
                <button key={style} onClick={() => toggleNameStyle(style)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 text-center transition-all ${sel ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                  <span className="text-base">{icon}</span>
                  <span className={`text-[10px] font-bold leading-tight ${sel ? 'text-indigo-700' : 'text-slate-700'}`}>{style}</span>
                  <span className="text-[9px] text-slate-400 leading-tight">{desc}</span>
                </button>
              );
            })}
          </div>
          {nameStyles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {nameStyles.map(s => (
                <span key={s} className="text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                  {NAME_STYLE_LABELS[s].icon} {s}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 6. 이미지 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">6</span>
            <Sparkles className="w-4 h-4 text-slate-400" /> 원하는 이미지 <span className="text-slate-400 font-normal">(선택·복수)</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {ALL_IMAGES.map(img => {
              const { icon, desc } = IMAGE_LABELS[img];
              const sel = images.includes(img);
              return (
                <button key={img} onClick={() => toggleImage(img)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 transition-all ${sel ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                  <span className="text-lg">{icon}</span>
                  <span className={`text-[11px] font-bold ${sel ? 'text-indigo-700' : 'text-slate-700'}`}>{img}</span>
                  <span className="text-[9px] text-slate-400">{desc}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-2 mt-3 bg-slate-50 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-500">{IMAGE_EFFECT_TEXT}</p>
          </div>
        </section>

        {errors.other && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{errors.other}</p>
        )}
        {Object.values(errors).some(Boolean) && (
          <p className="text-xs text-red-500 text-center">입력 내용을 확인해주세요. 오류가 있으면 분석을 시작하지 않습니다.</p>
        )}

        {errors.storage && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{errors.storage}</p>
        )}
        <p id="mode-a-required" role="status" aria-live="polite"
          className={`text-sm text-center ${requiredMissing.length === 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
          {requiredMissing.length === 0 ? '필수 입력이 모두 완료되었습니다' : `필수 입력 미완료: ${requiredMissing.join(', ')}`}
        </p>
        <button onClick={handleStart} aria-describedby="mode-a-required"
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 active:scale-[0.99] transition-all">
          <Sparkles className="w-5 h-5" /> 출생 설계 분석 시작 <ChevronRight className="w-5 h-5" />
        </button>
        <p className="text-xs text-center text-slate-400 pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
