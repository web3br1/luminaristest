/**
 * Status Comparison Processor
 *
 * Compares values grouped by status.
 * Useful for comparing values received vs pending, approved vs rejected, etc.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';

export const statusComparisonProcessor: AnalyticsProcessor = (context): ChartDataPoint[] => {
  const { rows, params, table } = context;
  const amountField = (params.amountField as string | undefined) ?? 'totalAmount';
  const statusField = (params.statusField as string | undefined) ?? 'status';
  const excludeStatuses = (params.excludeStatuses as string[] | undefined) ?? [];
  const excludeStatusField = params.excludeStatusField as string | undefined;
  const statusGroups = (params.statusGroups as Record<string, string> | undefined) ?? {};
  const labelMap = (params.labelMap as Record<string, string> | undefined) ?? {};

  const totals = new Map<string, number>();
  const recordIdsByStatus = new Map<string, string[]>();

  for (const row of rows) {
    // Check excluded statuses from a different field if specified
    if (excludeStatusField) {
      const excludeStatus = String(row.data?.[excludeStatusField] || '').trim();
      if (
        excludeStatuses.some(
          (excluded: string) => excludeStatus.toLowerCase() === String(excluded).toLowerCase()
        )
      ) {
        continue;
      }
    }

    const status = String(row.data?.[statusField] || '').trim();

    // Skip excluded statuses
    if (
      excludeStatuses.some(
        (excluded: string) => status.toLowerCase() === String(excluded).toLowerCase()
      )
    ) {
      continue;
    }

    const amount = Number(row.data?.[amountField] || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    // Use status group if provided
    const groupKey = statusGroups[status] || status;
    totals.set(groupKey, (totals.get(groupKey) || 0) + amount);
    if (!recordIdsByStatus.has(groupKey)) {
      recordIdsByStatus.set(groupKey, []);
    }
    recordIdsByStatus.get(groupKey)!.push(row.id);
  }

  return Array.from(totals.entries())
    .map(([name, value]) => ({
      name: labelMap[name] || name,
      value,
      recordIds: recordIdsByStatus.get(name),
    }))
    .sort((a, b) => b.value - a.value);
};

