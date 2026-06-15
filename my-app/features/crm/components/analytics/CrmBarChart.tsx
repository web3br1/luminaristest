import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ChartDataPoint } from '../../../../lib/services/crm.service';

const PALETTE = ['#3b82f6', '#14b8a6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#ef4444', '#6366f1'];

interface CrmBarChartProps {
  data: ChartDataPoint[];
  color?: string;
  multicolor?: boolean;
  formatValue?: (v: number) => string;
}

export function CrmBarChart({ data, color = '#3b82f6', multicolor = false, formatValue }: CrmBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={0} />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => (formatValue ? formatValue(Number(v)) : String(v))}
        />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          contentStyle={{ background: '#171717', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12, color: '#fff' }}
          formatter={(v: any) => (formatValue ? formatValue(Number(v)) : v)}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={multicolor ? PALETTE[i % PALETTE.length] : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
