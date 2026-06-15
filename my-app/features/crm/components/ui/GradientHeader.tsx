import React, { ReactNode } from 'react';

interface GradientHeaderProps {
  title: string;
  subtitle?: string;
  avatar?: string;
  badges?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}

/** Hero header with gradient avatar + blur blobs — the Luminaris signature header. */
export function GradientHeader({ title, subtitle, avatar, badges, right, children }: GradientHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-neutral-900">
      <div className="pointer-events-none absolute right-0 top-0 -mr-32 -mt-32 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 -mb-24 -ml-24 h-48 w-48 rounded-full bg-purple-500/5 blur-3xl" />

      <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-5">
          {avatar !== undefined ? (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-black text-white shadow-xl shadow-blue-500/20">
              {(avatar || title)[0]?.toUpperCase() || 'L'}
            </div>
          ) : null}
          <div className="min-w-0">
            {badges ? <div className="mb-1 flex items-center gap-2">{badges}</div> : null}
            <h1 className="truncate text-2xl font-black tracking-tight text-gray-900 dark:text-white md:text-3xl">
              {title}
            </h1>
            {subtitle ? <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>
        {right ? <div className="relative shrink-0">{right}</div> : null}
      </div>

      {children ? <div className="relative mt-6">{children}</div> : null}
    </div>
  );
}
