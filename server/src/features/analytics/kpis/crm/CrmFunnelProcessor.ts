import type { AnalyticsProcessor, ChartDataPoint } from '../../core';

/**
 * CRM conversion funnel — number of leads per pipeline stage, ordered.
 * Stages are fetched from `leadStages` to resolve name + order; counts are
 * merged by stage name (so multiple pipelines sharing stage names collapse
 * into one clean funnel).
 */
export const crmFunnelProcessor: AnalyticsProcessor = async (context) => {
  const { rows } = context;

  const stagesRes = context.fetchByPresetTableKey
    ? await context.fetchByPresetTableKey('leadStages').catch(() => null)
    : null;
  const stageMeta = new Map<string, { name: string; order: number }>();
  for (const s of stagesRes?.rows ?? []) {
    stageMeta.set(s.id, { name: String(s.data?.name ?? 'Etapa'), order: Number(s.data?.order ?? 0) });
  }

  const countByStageId = new Map<string, number>();
  for (const r of rows) {
    const sid = String(r.data?.stageId ?? '');
    if (!sid) continue;
    countByStageId.set(sid, (countByStageId.get(sid) ?? 0) + 1);
  }

  const byName = new Map<string, { value: number; order: number }>();
  for (const [sid, c] of countByStageId) {
    const meta = stageMeta.get(sid);
    const name = meta?.name ?? 'Sem etapa';
    const order = meta?.order ?? 999;
    const cur = byName.get(name) ?? { value: 0, order };
    cur.value += c;
    cur.order = Math.min(cur.order, order);
    byName.set(name, cur);
  }

  const out: ChartDataPoint[] = [...byName.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, v]) => ({ name, value: v.value }));
  return out;
};
