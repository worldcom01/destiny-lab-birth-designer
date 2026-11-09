import { BookOpenText } from 'lucide-react';

interface Props {
  dayMaster?: string;
  distribution?: string;
  nameRelation?: string;
  disclaimer?: string;
  compact?: boolean;
}

/** Short Saju reading (up to four lines). Lines that are not passed are omitted. */
export default function SajuReadingBlock({ dayMaster, distribution, nameRelation, disclaimer, compact = false }: Props) {
  const lines = [
    dayMaster && { label: '사주 구성', text: dayMaster },
    distribution && { label: '오행 분포', text: distribution },
    nameRelation && { label: '이름과의 관계', text: nameRelation },
  ].filter(Boolean) as { label: string; text: string }[];

  return (
    <div data-testid="saju-reading" className={`rounded-xl border border-indigo-100 bg-indigo-50/50 ${compact ? 'p-3 mt-3' : 'p-4 mt-4'}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-2">
        <BookOpenText className="w-3.5 h-3.5" /> 짧은 사주풀이
      </p>
      <ul className="space-y-1.5">
        {lines.map(l => (
          <li key={l.label} className={`${compact ? 'text-[11px]' : 'text-xs'} text-slate-700 leading-relaxed`}>
            <span className="font-semibold text-indigo-800">{l.label}</span> · {l.text}
          </li>
        ))}
      </ul>
      {disclaimer && <p className="text-[10px] text-slate-400 mt-2">{disclaimer}</p>}
    </div>
  );
}
