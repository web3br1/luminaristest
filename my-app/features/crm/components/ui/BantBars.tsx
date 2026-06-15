import React from 'react';

const SCALE: Record<string, number> = { Low: 33, Medium: 66, High: 100, Urgent: 100, Short: 75, Medium2: 50, Long: 25 };

const ITEMS: { label: string; key: string }[] = [
  { label: 'Budget', key: 'bantBudget' },
  { label: 'Authority', key: 'bantAuthority' },
  { label: 'Need', key: 'bantNeed' },
  { label: 'Timing', key: 'bantTiming' },
];

function pctFor(value: string | undefined): number {
  if (!value) return 0;
  return SCALE[value] ?? 0;
}

/** BANT qualification bars (Budget / Authority / Need / Timing). */
export function BantBars({ data }: { data: Record<string, any> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {ITEMS.map((it) => {
        const value = data?.[it.key] as string | undefined;
        const pct = pctFor(value);
        const color =
          pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-neutral-700';
        return (
          <div key={it.key}>
            <div className="mb-1 flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
              <span>{it.label}</span>
              <span>{value ?? '—'}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 shadow-inner dark:bg-neutral-800">
              <div className={`h-2 rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
