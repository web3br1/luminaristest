'use client';

import React from 'react';

export function renderBantIcon(value: string, type: 'budget'|'authority'|'need'|'timing') {
  const v = String(value||'').toLowerCase();
  if (!value) return <span className="text-gray-400">—</span>;
  if (type === 'timing') {
    const order = ['long','medium','short','urgent'];
    const idx = Math.max(0, order.findIndex(k => k===v));
    const colors = ['bg-gray-400','bg-amber-400','bg-orange-500','bg-rose-600'];
    return (
      <div className="w-28 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden" title={value}>
        <div className={`h-full transition-all ${colors[idx]}`} style={{ width: `${((idx+1)/4)*100}%` }} />
      </div>
    );
  }
  const level = v==='high'?3 : v==='medium'?2 : 1;
  const palette = ['bg-gray-400','bg-blue-400','bg-emerald-600'];
  return (
    <div className="w-24 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden" title={value}>
      <div className={`h-full transition-all ${palette[level-1]}`} style={{ width: `${(level/3)*100}%` }} />
    </div>
  );
}

export function formatDayLabel(dateIso: string): string {
  const d = new Date(dateIso);
  const today = new Date();
  const dayMs = 24*60*60*1000;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d))/dayMs);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff <= 7) return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}




