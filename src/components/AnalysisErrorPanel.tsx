'use client';

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { RecoveryError } from '@/lib/resultLoader';

interface Props {
  error: RecoveryError;
  onBack: () => void;
}

export default function AnalysisErrorPanel({ error, onBack }: Props) {
  return (
    <div role="alert" className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 max-w-md w-full">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-slate-800">{error.title}</p>
        </div>
        {error.details.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-slate-600 list-disc pl-5">
            {error.details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-slate-400">저장된 입력은 삭제되지 않았습니다.</p>
        <button
          onClick={onBack}
          className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 입력 화면으로 돌아가기
        </button>
      </div>
    </div>
  );
}
