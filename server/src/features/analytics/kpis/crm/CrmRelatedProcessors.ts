import type { AnalyticsProcessor, ChartDataPoint } from '../../core';

/** Proposals grouped by status (cross-fetch from `leadProposals`). */
export const crmProposalsByStatusProcessor: AnalyticsProcessor = async (context) => {
  const res = context.fetchByPresetTableKey
    ? await context.fetchByPresetTableKey('leadProposals').catch(() => null)
    : null;
  const order = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];
  const counts = new Map<string, number>();
  for (const r of res?.rows ?? []) {
    const s = String(r.data?.status ?? 'Draft');
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const out: ChartDataPoint[] = [...counts.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([name, value]) => ({ name, value }));
  return out;
};

/** Activities grouped by type (cross-fetch from `leadActivities`). */
export const crmActivitiesByTypeProcessor: AnalyticsProcessor = async (context) => {
  const res = context.fetchByPresetTableKey
    ? await context.fetchByPresetTableKey('leadActivities').catch(() => null)
    : null;
  const counts = new Map<string, number>();
  for (const r of res?.rows ?? []) {
    const t = String(r.data?.type ?? 'note');
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const out: ChartDataPoint[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  return out;
};
