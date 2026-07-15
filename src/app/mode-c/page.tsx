'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ChevronRight, Sparkles, ArrowLeft, Calendar, Plus, Trash2, Info } from 'lucide-react';
import { ModeCInput, Gender } from '@/types';
import TimeSelector from '@/components/TimeSelector';

export default function ModeCPage() {
  const router = useRouter();

  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const defDate = nextYear.toISOString().split('T')[0];

  const [birthDate, setBirthDate] = useState(defDate);
  const [birthHour, setBirthHour] = useState(9);
  const [gender, setGender] = useState<Gender>('남');
  const [names, setNames] = useState<string[]>(['', '']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateName = (i: number, v: string) => {
    const n = [...names]; n[i] = v; setNames(n);
  };
  const addName = () => { if (names.length < 10) setNames([...names, '']); };
  const removeName = (i: number) => { if (names.length > 1) setNames(names.filter((_, j) => j !== i)); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!birthDate) e.date = '출생일을 선택해주세요';
    const validNames = names.filter(n => n.trim().length >= 2);
    if (validNames.length === 0) e.names = '이름을 최소 1개 입력해주세요 (성+이름 2자 이상)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleStart = () => {
    if (!validate()) return;
    const input: ModeCInput = {
      birthDate, birthHour, gender,
      names: names.filter(n => n.trim().length >= 2),
    };
    localStorage.setItem('dlbd_mode_c', JSON.stringify(input));
    router.push('/mode-c/results');
  };

  const validCount = names.filter(n => n.trim().length >= 2).length;

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-gradient-to-br from-teal-900 via-emerald-800 to-teal-900">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-teal-300 hover:text-white text-sm mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 모드 선택으로
          </button>
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-teal-200 mb-3">
            <ClipboardCheck className="w-3 h-3" /> MODE C · 이름 평가 모드
          </div>
          <h1 className="text-2xl font-black text-white">이름 평가 모드</h1>
          <p className="text-sm text-teal-300 mt-1.5">후보 이름들을 사주와 비교하여 조화도를 평가합니다</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* 1. 출생일 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black">1</span>
            <Calendar className="w-4 h-4 text-slate-400" /> 출생일 (확정)
          </h2>
          <input type="date" value={birthDate} onChange={e => { setBirthDate(e.target.value); setErrors(p => ({ ...p, date: '' })); }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          {errors.date && <p className="text-xs text-red-500 mt-2">{errors.date}</p>}
        </section>

        {/* 2. 출생 시간 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black">2</span>
            출생 시간 (확정)
          </h2>
          <TimeSelector value={birthHour} onChange={setBirthHour} />
        </section>

        {/* 3. 성별 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black">3</span>
            성별
          </h2>
          <div className="flex gap-3">
            {(['남', '여'] as Gender[]).map(g => (
              <button key={g} onClick={() => setGender(g)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${gender === g ? (g === '남' ? 'bg-blue-600 text-white' : 'bg-pink-500 text-white') : 'bg-slate-100 text-slate-600'}`}>
                {g === '남' ? '남아 👦' : '여아 👧'}
              </button>
            ))}
          </div>
        </section>

        {/* 4. 이름 후보 */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4">
            <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-black">4</span>
            이름 후보 <span className="text-slate-400 font-normal">(최대 10개)</span>
          </h2>

          <div className="space-y-2.5">
            {names.map((name, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => updateName(i, e.target.value)}
                  placeholder={`이름 ${i + 1} (예: 김민준)`}
                  maxLength={6}
                  className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-slate-300"
                />
                {names.length > 1 && (
                  <button onClick={() => removeName(i)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {errors.names && <p className="text-xs text-red-500 mt-2">{errors.names}</p>}

          {names.length < 10 && (
            <button onClick={addName}
              className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-2 rounded-lg transition-colors mt-3">
              <Plus className="w-3.5 h-3.5" /> 이름 추가
            </button>
          )}

          <div className="flex items-start gap-2 mt-3 bg-slate-50 rounded-lg p-3">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 space-y-0.5">
              <p>성씨 포함 전체 이름을 입력해주세요 (예: 김민준, 이서아)</p>
              <p>이름 데이터베이스에 없는 글자는 발음오행으로 기본 분석합니다</p>
            </div>
          </div>
        </section>

        {/* 분석 미리보기 */}
        {validCount > 0 && (
          <div className="bg-teal-900 rounded-2xl p-4 text-white">
            <p className="text-xs text-teal-400">분석 예정</p>
            <p className="text-xl font-black text-teal-300 mt-0.5">{validCount}개 이름</p>
            <p className="text-xs text-teal-500 mt-0.5">각 이름의 사주 조화도를 분석하여 순위를 제공합니다</p>
          </div>
        )}

        <button onClick={handleStart}
          className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-all">
          <Sparkles className="w-5 h-5" /> 이름 평가 시작 <ChevronRight className="w-5 h-5" />
        </button>
        <p className="text-xs text-center text-slate-400 pb-4">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
