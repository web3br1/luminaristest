import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { LEAD_STATUS_ORDER } from '../../../crm/constants';

/** Leads grouped by acquisition source (for a pie/donut). */
export const crmSourceProcessor: AnalyticsProcessor = (context) => {
  const counts = new Map<string, number>();
  for (const r of context.rows) {
    const s = String(r.data?.source ?? '').trim() || 'Desconhecida';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const out: ChartDataPoint[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  return out;
};

/** Leads grouped by status (Open / Won / Lost / Disqualified). */
export const crmStatusProcessor: AnalyticsProcessor = (context) => {
  const order: string[] = [...LEAD_STATUS_ORDER];
  const counts = new Map<string, number>();
  for (const r of context.rows) {
    const s = String(r.data?.status ?? 'Open');
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const out: ChartDataPoint[] = [...counts.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([name, value]) => ({ name, value }));
  return out;
};

/** BANT strength — % of leads at the strong level for each BANT dimension (4 bars). */
export const crmBantProcessor: AnalyticsProcessor = (context) => {
  const total = context.rows.length || 1;
  let budget = 0, authority = 0, need = 0, timing = 0;
  for (const r of context.rows) {
    const d = r.data || {};
    if (d.bantBudget === 'High') budget++;
    if (d.bantAuthority === 'High') authority++;
    if (d.bantNeed === 'High') need++;
    if (d.bantTiming === 'Urgent' || d.bantTiming === 'Short') timing++;
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  const out: ChartDataPoint[] = [
    { name: 'Budget', value: pct(budget) },
    { name: 'Authority', value: pct(authority) },
    { name: 'Need', value: pct(need) },
    { name: 'Timing', value: pct(timing) },
  ];
  return out;
};
