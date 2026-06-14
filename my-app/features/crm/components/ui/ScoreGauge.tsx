import React from 'react';

/** Circular score gauge (0-100) — mirrors the legacy LeadsView gauge. */
export function ScoreGauge({ score, size = 44 }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const color = s >= 80 ? 'text-emerald-500' : s >= 50 ? 'text-amber-500' : 'text-gray-400 dark:text-neutral-500';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" className="-rotate-90 h-full w-full">
        <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-200 dark:text-neutral-800" />
        <circle
          cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" strokeLinecap="round"
          strokeDasharray={100} strokeDashoffset={100 - s}
          className={`${color} transition-all duration-700`}
        />
      </svg>
      <span className={`absolute text-[11px] font-black ${color}`}>{s}</span>
    </div>
  );
}
