/**
 * Temporal Aggregation Processor
 *
 * Aggregates values by time period (day, week, month, quarter, year).
 * Useful for visualizing trends over time.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';

type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year';

function formatPeriodKey(date: Date, period: PeriodType): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const month = `${m}`.padStart(2, '0');

  switch (period) {
    case 'day':
      return `${y}-${month}-${String(date.getDate()).padStart(2, '0')}`;
    case 'week': {
      const d = new Date(Date.UTC(y, date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${y}-W${String(week).padStart(2, '0')}`;
    }
    case 'month':
      return `${y}-${month}`;
    case 'quarter':
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case 'year':
      return String(y);
    default:
      return `${y}-${month}`;
  }
}

function getPeriodStartDate(date: Date, period: PeriodType, limit: number): Date {
  const start = new Date(date);

  switch (period) {
    case 'day':
      start.setDate(start.getDate() - (limit - 1));
      break;
    case 'week':
      start.setDate(start.getDate() - (limit - 1) * 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - (limit - 1));
      break;
    case 'quarter':
      start.setMonth(start.getMonth() - (limit - 1) * 3);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - (limit - 1));
      break;
  }

  start.setHours(0, 0, 0, 0);
  return start;
}

export const temporalAggregationProcessor: AnalyticsProcessor = (context): ChartDataPoint[] => {
  const { rows, params, table } = context;
  const amountField = (params.amountField as string | undefined) ?? 'totalAmount';
  const dateField = (params.dateField as string | undefined) ?? 'date';
  const period: PeriodType = (params.period as PeriodType | undefined) ?? 'month';
  const excludeStatuses = (params.excludeStatuses as string[] | undefined) ?? [];
  const statusField = params.statusField as string | undefined;
  const limit = (params.limit as number | undefined) ?? 12;

  const now = new Date();
  const startDate = params.startDate ? new Date(params.startDate as string | number | Date) : getPeriodStartDate(now, period, limit);
  const endDate = params.endDate ? new Date(params.endDate as string | number | Date) : now;

  const periodTotals = new Map<string, number>();
  const periodRecordIds = new Map<string, string[]>();

  for (const row of rows) {
    // Check excluded statuses
    if (statusField) {
      const status = String(row.data?.[statusField] || '').trim();
      if (
        excludeStatuses.some(
          (excluded: string) => status.toLowerCase() === String(excluded).toLowerCase()
        )
      ) {
        continue;
      }
    }

    const dateValue = row.data?.[dateField];
    if (!dateValue) continue;

    const rowDate = new Date(dateValue as string | number | Date);
    if (isNaN(rowDate.getTime()) || rowDate < startDate || rowDate > endDate) {
      continue;
    }

    const periodKey = formatPeriodKey(rowDate, period);
    const amount = Number(row.data?.[amountField] || 0);

    if (Number.isFinite(amount) && amount > 0) {
      periodTotals.set(periodKey, (periodTotals.get(periodKey) || 0) + amount);
      if (!periodRecordIds.has(periodKey)) {
        periodRecordIds.set(periodKey, []);
      }
      periodRecordIds.get(periodKey)!.push(row.id);
    }
  }

  // Get table source
  const mainTableSource = table.presetKey || table.internalName || (params.tableId as string | undefined) || 'sales';
  
  return Array.from(periodTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([name, value]) => ({
      name,
      value,
      recordIds: periodRecordIds.get(name),
      tableSource: mainTableSource,
    }));
};

