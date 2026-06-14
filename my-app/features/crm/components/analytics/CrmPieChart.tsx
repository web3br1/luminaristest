import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChartPoint } from '../../../../lib/services/crm.service';

const PALETTE = ['#3b82f6', '#14b8a6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#ef4444', '#6366f1'];

export function CrmPieChart({ data, donut = true }: { data: ChartPoint[]; donut?: boolean }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={88} innerRadius={donut ? 52 : 0} dataKey="value" nameKey="name" paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} stroke="none" fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: '#171717', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12, color: '#fff' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="truncate font-semibold text-gray-600 dark:text-gray-300">{d.name}</span>
            </span>
            <span className="shrink-0 font-black text-gray-900 dark:text-white">
              {Math.round((Number(d.value) / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
