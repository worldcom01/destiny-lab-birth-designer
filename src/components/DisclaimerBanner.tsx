'use client';

import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';

export default function DisclaimerBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-slate-50 border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
            <span className="text-xs text-slate-600 font-medium">
              참고 분석 서비스 — 의료진 판단이 최우선입니다
            </span>
          </div>
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {open && (
          <div className="pb-3 text-xs text-slate-500 border-t border-slate-100 pt-2 leading-relaxed space-y-1">
            <p>
              본 서비스는 전통 명리학·성명학을 디지털 방식으로 분석한 <strong>참고 자료</strong>입니다.
              의학적 판단, 투자 조언, 미래 보장 서비스가 아닙니다.
            </p>
            <p>출산일 결정은 반드시 <strong>담당 의료진과 상의</strong>하시기 바랍니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
