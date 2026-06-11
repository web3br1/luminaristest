'use client';

import React, { useMemo } from 'react';

interface SliderDiscreteProps {
  name: string;
  /** Accepts any value — coerced via `String(value)` for comparison. */
  value?: unknown;
  onChange: (name: string, value: unknown) => void;
  /** Ordered options. Objects normalized via `.value`. Empty/undefined disables the slider. */
  options?: Array<string | { label: string; value: string }>;
  className?: string;
}

export default function SliderDiscrete({ name, value, onChange, options, className }: SliderDiscreteProps) {
  // Normalize options once — accept either `'low'` or `{ label, value }`.
  const normalizedOptions = useMemo(
    () => (options ?? []).map(o => (typeof o === 'string' ? o : o.value)),
    [options]
  );

  const index = useMemo(() => {
    const i = normalizedOptions.findIndex(o => String(o) === String(value));
    return i >= 0 ? i : 0;
  }, [normalizedOptions, value]);
  const percent = normalizedOptions.length > 1 ? (index / (normalizedOptions.length - 1)) * 100 : 0;

  return (
    <div className="w-full max-w-[20rem] select-none">
      <div className="relative py-2">
        {/* Track */}
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
        {/* Fill */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-blue-600 dark:bg-blue-500 transition-all"
          style={{ width: `calc(${percent}% + 8px)` }}
        />
        {/* Thumb visual */}
        <div className="absolute top-1/2 -translate-y-1/2 -ml-2" style={{ left: `calc(${percent}% )` }}>
          <span className="block w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-600 shadow" />
        </div>
        {/* Real input (transparent), for accessibility and events */}
        <input
          type="range"
          min={0}
          max={normalizedOptions.length - 1}
          step={1}
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            const v = normalizedOptions[i] ?? normalizedOptions[0];
            onChange(name, v);
          }}
          className={`absolute inset-0 w-full h-6 opacity-0 cursor-pointer ${className || ''}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-600 dark:text-gray-300">
        {normalizedOptions.map((o, i) => (
          <span key={o} className={`uppercase ${i === index ? 'font-semibold text-gray-900 dark:text-gray-100' : ''}`}>{o}</span>
        ))}
      </div>
    </div>
  );
}


