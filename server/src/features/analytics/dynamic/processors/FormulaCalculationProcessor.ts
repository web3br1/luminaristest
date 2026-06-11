/**
 * Formula Calculation Processor
 *
 * Computes a numeric result for each row using a formula string,
 * then aggregates results by period, status, or as a single total.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { evaluateExpression } from '../../core/engine/ExpressionEvaluator';

type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year';

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function periodKey(date: Date, period: PeriodType): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const month = `${m}`.padStart(2, '0');

  switch (period) {
    case 'day':
      return `${y}-${month}-${String(date.getDate()).padStart(2, '0')}`;
    case 'week':
      return `${y}-W${String(getISOWeek(date)).padStart(2, '0')}`;
    case 'month':
      return `${y}-${month}`;
    case 'quarter':
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case 'year':
      return `${y}`;
    default:
      return `${y}-${month}`;
  }
}

export const formulaCalculationProcessor: AnalyticsProcessor = (context): ChartDataPoint[] => {
  const { rows, schema, params, table } = context;

  const formula = String(params.formula || '').trim();
  if (!formula) {
    throw new Error('Missing required param: formula');
  }

  const fieldMapping: Record<string, string> = params.fieldMapping || params.variables || {};
  if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
    throw new Error('Missing required param: fieldMapping');
  }

  const groupBy: 'none' | 'period' | 'status' = params.groupBy || 'none';
  const period: PeriodType = params.period || 'month';
  const dateField: string | undefined = params.dateField;
  const statusField: string | undefined = params.statusField;
  const excludeStatuses: string[] = Array.isArray(params.excludeStatuses)
    ? params.excludeStatuses
    : [];

  if (groupBy === 'period' && !dateField) {
    throw new Error('Missing required param: dateField (when groupBy="period")');
  }
  if (groupBy === 'status' && !statusField) {
    throw new Error('Missing required param: statusField (when groupBy="status")');
  }

  // Validate mapped fields exist
  const schemaFields = new Set((schema?.fields || []).map((f) => String(f.name)));
  for (const mappedFieldName of Object.values(fieldMapping)) {
    if (!schemaFields.has(String(mappedFieldName))) {
      throw new Error(`Mapped field '${mappedFieldName}' does not exist in table schema`);
    }
  }

  const totals = new Map<string, number>();
  const recordIdsByKey = new Map<string, string[]>();

  for (const row of rows) {
    // Exclude by status
    if (statusField && excludeStatuses.length > 0) {
      const st = String(row.data?.[statusField] || '').toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
        continue;
      }
    }

    // Build variables
    const variables: Record<string, number> = {};
    for (const [varName, fieldName] of Object.entries(fieldMapping)) {
      const raw = row.data?.[fieldName];
      const value = Number(raw);
      variables[varName] = isFinite(value) ? value : 0;
    }

    // Evaluate formula
    const value = evaluateExpression(formula, variables);
    if (!isFinite(value)) continue;

    // Determine bucket key
    let key = 'Total';
    if (groupBy === 'status' && statusField) {
      key = String(row.data?.[statusField] || '—');
    } else if (groupBy === 'period' && dateField) {
      const dv = row.data?.[dateField];
      if (!dv) continue;
      const d = new Date(dv);
      if (isNaN(d.getTime())) continue;
      key = periodKey(d, period);
    }

    totals.set(key, (totals.get(key) || 0) + value);
    if (!recordIdsByKey.has(key)) {
      recordIdsByKey.set(key, []);
    }
    recordIdsByKey.get(key)!.push(row.id);
  }

  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({
      name,
      value,
      recordIds: recordIdsByKey.get(name),
    }));
};

