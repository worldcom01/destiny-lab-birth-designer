'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { User2, ChevronRight, Sparkles, Layers, ArrowLeft, Calendar } from 'lucide-react';
import { ModeBInput, Gender, ImageType, IMAGE_LABELS, NameStyle, NAME_STYLE_LABELS, SIJIN_VERSION } from '@/types';
import { COMMON_SURNAMES } from '@/data/nameChars';
import { getHanjaOptions, type HanjaOption } from '@/data/hanjaDB';
import TimeSelector from '@/components/TimeSelector';
import { HanjaInputRow } from '@/components/HanjaInputRow';
import { dolrimNotice, validateModeBInput } from '@/lib/inputValidation';
import { writeStoredInput } from '@/lib/storage';
import { MODE_B_STORAGE_KEY, loadModeBFormInit } from '@/lib/formRestore';

const ALL_IMAGES: ImageType[] = [
  '리더형', '학자형', '예술형', '사업가형', '창의형',
  '균형형', '건강중심형', '글로벌형', '대인관계형',
];

const subscribeNoop = () => () => {};

export default function ModeBPage() {
  // The previous input lives in localStorage and the default date depends on
  // today (Asia/Seoul), so the form renders on the client only (no hydration mismatch).
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  return isClient
    ? <ModeBForm />
    : <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center text-sm text-slate-400" aria-busy="true">입력 화면을 준비하는 중…</div>;
}

function ModeBForm() {
  const router = useRouter();
  const [init] = useState(() => loadModeBFormInit(new Date()));

  const [birthDate, setBirthDate] = useState(init.birthDate);
  const [birthHour, setBirthHour] = useState(init.birthHour);
  const [surname, setSurname] = useState(init.surname);
  const [gender, setGender] = useState<Gender>(init.gender);
  const [dolrimChar, setDolrimChar] = useState(init.dolrimChar);
  const [dolrimPosition, setDolrimPosition] = useState<'first' | 'second' | 'auto'>(init.dolrimPosition);
  const [dolrimHanja, setDolrimHanja] = useState<HanjaOption | null>(
    () => (init.dolrimHanja && getHanjaOptions(init.dolrimChar).find(o => o.hanja === init.dolrimHanja)) || null,
  );
  const [nameStyles, setNameStyles] = useState<NameStyle[]>(init.nameStyles);
  const [images, setImages] = useState<ImageType[]>(init.images);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleNameStyle = useCallback((s: NameStyle) => {
    setNameStyles(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  }, []);

  const toggleImage = useCallback((img: ImageType) => {
    setImages(p => p.includes(img) ? p.filter(i => i !== img) : [...p, img]);
  }, []);

  const handleStart = () => {
    if (birthHour === null) { setErrors({ time: '출생 시간을 선택해주세요' }); return; }
    const input: ModeBInput = {
      birthDate, birthHour, sijinVersion: SIJIN_VERSION, surname: surname.trim(), gender,
      dolrimChar: dolrimChar.trim(), dolrimPosition,
      dolrimHanja: dolrimHanja?.hanja,
      nameStyles, images,
    };
    const result = validateModeBInput(input);
    if (!result.ok) {
      const e: Record<string, string> = {};
      for (const issue of result.issues) e[issue.field] = e[issue.field] ? `${e[issue.field]} / ${issue.message}` : issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    const saved = writeStoredInput(MODE_B_STORAGE_KEY, result.value);
    if (!saved.ok) { setErrors({ storage: saved.message }); return; }
    router.push('/mode-b/results');
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-gradient-to-br from-violet-900 via-purple-800 to-indigo-900">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-violet-300 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 모드 선택으로
          </button>
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-violet-200 mb-3">
            <User2 className="w-3 h-3" /> MODE B · 이름 설계 모드
          </div>
          <h1 className="text-2xl font-black text-white">이름 설계 모드</h1>
          <p className="text-sm text-violet-300 mt-1.5">확정된 사주에 어울리는 이름을 설계합니다</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {init.restoreNotice && (
          <p role="status" className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">{init.restoreNotice}</p>
        )}

        {/* 1. 출생일 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">1</span>
            <Calendar className="w-4 h-4 text-slate-400" /> 출생일 (확정)
          </h2>
          <input type="date" value={birthDate} onChange={e => { setBirthDate(e.target.value); setErrors(p => ({ ...p, date: '' })); }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          {errors.date && <p className="text-xs text-red-500 mt-2">{errors.date}</p>}
        </section>

        {/* 2. 출생 시간 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">2</span>
            출생 시간 (확정)
          </h2>
          <TimeSelector value={birthHour} onChange={h => { setBirthHour(h); setErrors(p => ({ ...p, time: '' })); }} />
          <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
            시간 기준: 한국 표준시(KST, UTC+9) · 진태양시 보정 없음 · 조자시(00:00~01:00)·야자시(23:00~24:00)는 모두 선택한 날짜의 일주로 계산 ·
            선택한 시진 안에 절기 전환이 있으면 정확한 시각이 필요해 분석하지 않습니다
          </p>
          {errors.time && <p className="text-xs text-red-500 mt-2">{errors.time}</p>}
        </section>

        {/* 3. 성씨 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">3</span>
            성씨
          </h2>
          <div className="flex items-center gap-3 mb-3">
            <input type="text" value={surname} onChange={e => { setSurname(e.target.value); setErrors(p => ({ ...p, surname: '' })); }}
              placeholder="예) 김, 이, 남궁" maxLength={3}
              className="w-24 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400 text-center font-bold" />
          </div>
          {errors.surname && <p className="text-xs text-red-500 mb-2">{errors.surname}</p>}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.keys(COMMON_SURNAMES).slice(0, 12).map(s => (
              <button key={s} onClick={() => setSurname(s)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${surname === s ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-100 text-slate-600 border-slate-100 hover:border-slate-300'}`}>
                {s}
              </button>
            ))}
          </div>
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

        {/* 4. 성별 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">4</span>
            성별
          </h2>
          <div className="flex gap-3">
            {(['남', '여'] as Gender[]).map(g => (
              <button key={g} onClick={() => setGender(g)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${gender === g ? (g === '남' ? 'bg-blue-600 text-white' : 'bg-pink-500 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {g === '남' ? '남아 👦' : '여아 👧'}
              </button>
            ))}
          </div>
        </section>

        {/* 5. 돌림자 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">5</span>
            <Layers className="w-4 h-4 text-slate-400" /> 돌림자 <span className="text-slate-400 font-normal">(선택)</span>
          </h2>
          <div className="flex items-center gap-3">
            <input type="text" value={dolrimChar} onChange={e => { setDolrimChar(e.target.value.slice(0, 1)); setDolrimHanja(null); setErrors(p => ({ ...p, dolrim: '' })); }}
              placeholder="예) 민" maxLength={1}
              className="w-16 px-3 py-2.5 border border-slate-200 rounded-xl text-lg font-black bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400 text-center" />
            {dolrimChar && (
              <div className="flex gap-2">
                {([['auto', '자동'], ['first', `${dolrimChar}○`], ['second', `○${dolrimChar}`]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setDolrimPosition(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all ${dolrimPosition === v ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-100 text-slate-600'}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
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

        {/* 6. 이미지 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black">6</span>
            <Sparkles className="w-4 h-4 text-slate-400" /> 원하는 이미지 <span className="text-slate-400 font-normal">(선택)</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {ALL_IMAGES.map(img => {
              const { icon, desc } = IMAGE_LABELS[img];
              const sel = images.includes(img);
              return (
                <button key={img} onClick={() => toggleImage(img)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 transition-all ${sel ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                  <span className="text-lg">{icon}</span>
                  <span className={`text-[11px] font-bold ${sel ? 'text-violet-700' : 'text-slate-700'}`}>{img}</span>
                  <span className="text-[9px] text-slate-400">{desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {errors.other && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{errors.other}</p>
        )}
        {errors.storage && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{errors.storage}</p>
        )}
        <button onClick={handleStart}
          className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-all">
          <Sparkles className="w-5 h-5" /> 이름 설계 시작 <ChevronRight className="w-5 h-5" />
        </button>
        <p className="text-xs text-center text-slate-400 pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
