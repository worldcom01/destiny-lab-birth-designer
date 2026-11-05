'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, User, ChevronRight, Sparkles, Info, Layers, ArrowLeft } from 'lucide-react';
import { DesignerInput, Gender, ImageType, IMAGE_LABELS, NameStyle, NAME_STYLE_LABELS, TimeRange } from '@/types';
import { COMMON_SURNAMES } from '@/data/nameChars';
import type { HanjaOption } from '@/data/hanjaDB';
import { HanjaInputRow } from '@/components/HanjaInputRow';
import { SUPPORTED_KST_DATE_RANGE } from '@/lib/calendar';
import { dolrimNotice, validateDesignerInput } from '@/lib/inputValidation';
import { writeStoredInput } from '@/lib/storage';

const ALL_IMAGES: ImageType[] = [
  '리더형', '학자형', '예술형', '사업가형', '창의형',
  '균형형', '건강중심형', '글로벌형', '대인관계형',
];

function getDays(s: string, e: string) {
  if (!s || !e) return 0;
  return Math.max(0, Math.floor((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1);
}

export default function ModeAPage() {
  const router = useRouter();
  const base = new Date();
  base.setFullYear(base.getFullYear() + 1);
  const defStart = base.toISOString().split('T')[0];
  const defEnd = new Date(base.getTime() + 6 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(defStart);
  const [endDate, setEndDate] = useState(defEnd);
  const [surname, setSurname] = useState('김');
  const [gender, setGender] = useState<Gender>('남');
  const [dolrimChar, setDolrimChar] = useState('');
  const [dolrimPosition, setDolrimPosition] = useState<'first' | 'second' | 'auto'>('auto');
  const [dolrimHanja, setDolrimHanja] = useState<HanjaOption | null>(null);
  const [nameStyles, setNameStyles] = useState<NameStyle[]>([]);
  const [images, setImages] = useState<ImageType[]>([]);
  const [providerConfirmed, setProviderConfirmed] = useState(false);
  // No default availability: every permitted time must come from the user.
  const [timeRanges, setTimeRanges] = useState<TimeRange[]>([{ start: '', end: '' }]);
  const [exactTimes, setExactTimes] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    const saved = writeStoredInput('dlbd_mode_a', result.value);
    if (!saved.ok) { setErrors({ storage: saved.message }); return; }
    router.push('/mode-a/results');
  };

  const days = getDays(startDate, endDate);

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
            <Calendar className="w-4 h-4 text-slate-400" /> 의료진이 허용한 출산 기간
          </h2>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              담당 의료진이 허용한 날짜·시간만 입력해주세요. 이 앱은 의료적 안전성을 판단할 수 없으며,
              입력한 범위 밖의 날짜·시간은 계산하거나 추천하지 않습니다. 전통 사주 점수는 건강·발달·의학적 결과를 예측하지 않습니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">시작일</label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setErrors(p => ({ ...p, date: '' })); }}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">종료일</label>
              <input type="date" value={endDate} min={startDate} onChange={e => { setEndDate(e.target.value); setErrors(p => ({ ...p, date: '' })); }}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          {errors.date && <p className="text-xs text-red-500 mt-2">{errors.date}</p>}
          {days > 0 && <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-3">총 <strong>{days}일</strong> 범위 선택됨</p>}

          {/* 허용 시간대 */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-700 mb-1">허용 시간대 <span className="font-normal text-slate-400">(매일 동일하게 적용)</span></p>
            <p className="text-[11px] text-slate-400 mb-2.5">시작 시각 포함, 종료 시각 제외 · 종료 00:00은 자정(24:00) · 자정을 넘기는 구간은 두 개로 나눠 입력</p>
            <div className="space-y-2">
              {timeRanges.map((r, i) => (
                <div key={`r${i}`} className="flex items-center gap-2">
                  <input type="time" aria-label={`허용 구간 ${i + 1} 시작`} value={r.start} onChange={e => updateRange(i, 'start', e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="text-xs text-slate-400">~</span>
                  <input type="time" aria-label={`허용 구간 ${i + 1} 종료`} value={r.end} onChange={e => updateRange(i, 'end', e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button type="button" onClick={() => setTimeRanges(p => p.filter((_, j) => j !== i))}
                    className="text-[11px] text-slate-400 hover:text-red-400 px-1.5">삭제</button>
                </div>
              ))}
              {exactTimes.map((t, i) => (
                <div key={`t${i}`} className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 w-16">특정 시각</span>
                  <input type="time" aria-label={`특정 시각 ${i + 1}`} value={t} onChange={e => updateExact(i, e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button type="button" onClick={() => setExactTimes(p => p.filter((_, j) => j !== i))}
                    className="text-[11px] text-slate-400 hover:text-red-400 px-1.5">삭제</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2.5">
              <button type="button" onClick={() => setTimeRanges(p => [...p, { start: '', end: '' }])}
                className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">+ 시간 구간</button>
              <button type="button" onClick={() => setExactTimes(p => [...p, ''])}
                className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">+ 특정 시각</button>
            </div>
            {errors.time && <p className="text-xs text-red-500 mt-2">{errors.time}</p>}
            <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
              시간 기준: 한국 표준시(KST, UTC+9) · 진태양시 보정 없음 · 23:00~23:59는 같은 날짜의 자시로 계산 ·
              분석 가능 기간 {SUPPORTED_KST_DATE_RANGE.first} ~ {SUPPORTED_KST_DATE_RANGE.last}
            </p>
          </div>

          <label className="flex items-start gap-2 mt-4 cursor-pointer">
            <input type="checkbox" checked={providerConfirmed}
              onChange={e => { setProviderConfirmed(e.target.checked); setErrors(p => ({ ...p, confirm: '' })); }}
              className="mt-0.5 w-4 h-4 accent-indigo-600" />
            <span className="text-xs text-slate-700">위 날짜·시간 범위는 담당 의료진이 허용한 범위임을 확인합니다</span>
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
              className="w-24 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-center font-bold" />
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
            선택 시 현대 이름 선호도 점수에 20% 가산됩니다 · 전통 명리학과 함께 반영
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
          {images.length === 0 && (
            <div className="flex items-start gap-2 mt-3 bg-slate-50 rounded-lg p-2.5">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-500">선택하지 않으면 균형잡힌 조합을 우선 추천합니다</p>
            </div>
          )}
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
        <button onClick={handleStart}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 active:scale-[0.99] transition-all">
          <Sparkles className="w-5 h-5" /> 출생 설계 분석 시작 <ChevronRight className="w-5 h-5" />
        </button>
        <p className="text-xs text-center text-slate-400 pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
