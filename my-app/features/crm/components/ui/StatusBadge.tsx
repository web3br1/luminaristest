import React from 'react';

const TONES: Record<string, string> = {
  Won: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  Accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  Lost: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  Disqualified: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  Rejected: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  Open: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  Sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  Draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-500/20',
  Expired: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

/** Status pill — color/10 fill + color/20 border, the Luminaris badge signature. */
export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status] ?? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${tone}`}>
      {status}
    </span>
  );
}
