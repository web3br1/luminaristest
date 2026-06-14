import React, { ReactNode } from 'react';

interface CrmKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'positive' | 'negative';
}

const toneValue: Record<NonNullable<CrmKpiCardProps['tone']>, string> = {
  default: 'text-gray-900 dark:text-white',
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
};

export function CrmKpiCard({ label, value, hint, icon, tone = 'default' }: CrmKpiCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:bg-gray-50/50 dark:border-white/5 dark:bg-neutral-900 dark:hover:bg-neutral-800/60">
      <div className="flex items-center gap-2">
        {icon ? (
          <div className="rounded-lg border border-gray-100 bg-white p-1.5 text-blue-500 shadow-sm dark:border-white/5 dark:bg-neutral-800">
            {icon}
          </div>
        ) : null}
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-black ${toneValue[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs font-semibold text-gray-400 dark:text-gray-500">{hint}</p> : null}
    </div>
  );
}
