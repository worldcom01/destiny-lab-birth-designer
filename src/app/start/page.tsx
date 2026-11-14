'use client';

import Link from 'next/link';
import { Calendar, User2, ClipboardCheck, Sparkles, ArrowRight, Layers, ChevronRight } from 'lucide-react';

const MODES = [
  {
    id: 'A',
    href: '/mode-a',
    icon: Calendar,
    accentIcon: Sparkles,
    title: '출생 설계 모드',
    subtitle: '허용된 날짜 · 시간과 이름을 함께 비교',
    description:
      '의료진이 허용한 기간·시간대 안의 날짜·시간·이름 조합을 모두 분석해 종합 점수 순으로 보여줍니다. 결과는 20개씩 볼 수 있고, PDF에는 상위 20개 조합이 담깁니다.',
    inputs: ['출산 가능 기간', '성씨', '성별', '돌림자', '원하는 이미지'],
    outputs: ['이름 + 출생일 + 출생시 조합 순위 (20개씩 보기)', '오행 분석', '사주·성명학 종합 리포트 (PDF 상위 20개)'],
    from: 'from-indigo-600',
    to: 'to-violet-700',
    lightBg: 'bg-indigo-50',
    border: 'border-indigo-200',
    iconColor: 'text-indigo-500',
    badge: 'bg-indigo-600',
  },
  {
    id: 'B',
    href: '/mode-b',
    icon: User2,
    accentIcon: Layers,
    title: '이름 설계 모드',
    subtitle: '출생일·시간이 이미 확정된 경우',
    description:
      '확정된 출생일·시간의 사주를 기준으로 이름 후보를 생성하고, 생성된 후보 전체를 종합 점수 순으로 보여줍니다. 처음 20개를 보여주고 \'더 보기\'로 20개씩 더 볼 수 있습니다.',
    inputs: ['출생일 (확정)', '출생시간 (확정)', '성씨', '성별', '돌림자'],
    outputs: ['이름 후보 순위 (20개씩 보기, PDF 상위 20개)', '이름별 사주 조화도', '한자 의미 + 오행 분석'],
    from: 'from-violet-600',
    to: 'to-purple-700',
    lightBg: 'bg-violet-50',
    border: 'border-violet-200',
    iconColor: 'text-violet-500',
    badge: 'bg-violet-600',
  },
  {
    id: 'C',
    href: '/mode-c',
    icon: ClipboardCheck,
    accentIcon: ClipboardCheck,
    title: '이름 평가 모드',
    subtitle: '준비한 이름 후보를 비교 평가',
    description:
      '이미 생각해둔 이름 후보들을 입력하면 확정된 사주와의 조화도를 분석하여 순위를 제공합니다.',
    inputs: ['출생일 (확정)', '출생시간 (확정)', '이름 후보 목록'],
    outputs: ['후보 이름 조화도 순위', '이름별 등급 + 추천 사유', '성명학 + 오행 상세 분석'],
    from: 'from-teal-500',
    to: 'to-emerald-600',
    lightBg: 'bg-teal-50',
    border: 'border-teal-200',
    iconColor: 'text-teal-500',
    badge: 'bg-teal-600',
  },
] as const;

export default function ModeSelectPage() {
  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 pb-12 pt-10">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-500/15 border border-indigo-400/25 rounded-full px-3 py-1 text-xs text-indigo-300 mb-5">
            <Sparkles className="w-3 h-3" />
            전통 명리학 · 성명학 기반 분석 플랫폼
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Destiny Lab
            <br />
            <span className="text-indigo-400">Birth Designer</span>
          </h1>
          <p className="mt-4 text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
            이름·날짜·시간 조합을 전통 명리학·성명학 기준으로 계산해, 종합 점수 순으로 나란히 비교할 수 있게 보여줍니다.
          </p>
          <div className="flex justify-center gap-3 mt-5 flex-wrap text-xs text-slate-500">
            <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 text-indigo-400" />이름 자동 생성</span>
            <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 indigo-400" />사주·성명학 분석</span>
            <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 text-indigo-400" />PDF 리포트</span>
          </div>
        </div>
      </div>

      {/* 모드 선택 */}
      <div className="max-w-4xl mx-auto px-4 -mt-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Link key={mode.id} href={mode.href}
                className={`group block bg-white rounded-2xl border-2 ${mode.border} shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden`}>

                {/* 상단 컬러 헤더 */}
                <div className={`bg-gradient-to-br ${mode.from} ${mode.to} px-5 pt-5 pb-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-white/60 tracking-widest">MODE {mode.id}</span>
                    <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <h2 className="text-xl font-black text-white leading-tight">{mode.title}</h2>
                  <p className="text-xs text-white/70 mt-1">{mode.subtitle}</p>
                </div>

                {/* 본문 */}
                <div className="p-5">
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{mode.description}</p>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">입력</p>
                      <ul className="space-y-1">
                        {mode.inputs.map((inp, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span className={`w-1 h-1 rounded-full flex-shrink-0 ${mode.iconColor.replace('text-', 'bg-')}`} />
                            {inp}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">결과</p>
                      <ul className="space-y-1">
                        {mode.outputs.map((out, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span className="w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                            {out}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className={`mx-5 mb-5 flex items-center justify-between ${mode.lightBg} rounded-xl px-4 py-2.5 group-hover:opacity-90 transition-opacity`}>
                  <span className={`text-xs font-bold ${mode.iconColor}`}>분석 시작하기</span>
                  <ChevronRight className={`w-4 h-4 ${mode.iconColor}`} />
                </div>
              </Link>
            );
          })}
        </div>

        {/* 하단 안내 */}
        <p className="text-xs text-center text-slate-400 mt-8">
          본 서비스는 전통 명리학·성명학 기반 참고 분석 자료입니다 · 의료진 판단이 최우선입니다
        </p>
        <p className="text-center text-xs text-indigo-500 font-bold mt-2">Powered by Destiny Lab</p>
      </div>
    </div>
  );
}
