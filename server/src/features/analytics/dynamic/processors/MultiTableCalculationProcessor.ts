/**
 * Multi-Table Calculation Processor
 *
 * Generic processor for calculations across multiple dynamic tables.
 * Allows formulas like "sales - expenses" to calculate net profit.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { evaluateExpression } from '../../core/engine/ExpressionEvaluator';

interface MultiTableParams {
  tables: Record<string, string>;
  formula: string;
  groupBy: 'period' | 'status';
  period?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  dateFields?: Record<string, string>;
  amountFields: Record<string, string>;
  statusField?: string;
}

function formatDateByPeriod(
  date: Date,
  period: 'day' | 'week' | 'month' | 'quarter' | 'year'
): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  switch (period) {
    case 'day':
      return date.toISOString().split('T')[0];
    case 'week': {
      const weekStart = new Date(date);
      weekStart.setDate(day - date.getDay());
      return `Semana de ${weekStart.toISOString().split('T')[0]}`;
    }
    case 'month':
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    case 'quarter':
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case 'year':
      return String(year);
    default:
      return date.toISOString().split('T')[0];
  }
}

export const multiTableCalculationProcessor: AnalyticsProcessor = async (context) => {
  const { params, fetchByPresetTableKey, fetchByTableId, table } = context;

  if (!params) {
    throw new Error('MultiTableCalculationProcessor requires params');
  }

  const {
    tables,
    formula,
    groupBy = 'period',
    period = 'month',
    dateFields = {},
    amountFields,
    statusField,
  } = params as MultiTableParams;

  if (!tables || Object.keys(tables).length === 0) {
    throw new Error('MultiTableCalculationProcessor requires at least one table');
  }

  if (!formula) {
    throw new Error('MultiTableCalculationProcessor requires params.formula');
  }

  if (!amountFields) {
    throw new Error('MultiTableCalculationProcessor requires params.amountFields');
  }

  // Fetch data from all tables with IDs
  const tableData: Record<string, Array<Record<string, any> & { __originalId?: string }>> = {};
  const tableRowMaps: Record<string, Map<string, string>> = {}; // Map row index to original ID

  for (const [alias, tableKey] of Object.entries(tables)) {
    let rows: any[] = [];

    if (tableKey.startsWith('@@PRESET_TABLE_KEY::')) {
      if (!fetchByPresetTableKey) {
        throw new Error('Context does not provide fetchByPresetTableKey');
      }
      const key = tableKey.replace('@@PRESET_TABLE_KEY::', '');
      const result = await fetchByPresetTableKey(key);
      rows = result?.rows || [];
    } else {
      if (!fetchByTableId) {
        throw new Error('Context does not provide fetchByTableId');
      }
      const result = await fetchByTableId(tableKey);
      rows = result?.rows || [];
    }

    const rowMap = new Map<string, string>();
    tableData[alias] = rows.map((r, idx) => {
      const data = r.data || r;
      const rowId = r.id || `row_${idx}`;
      rowMap.set(`${alias}_${idx}`, rowId);
      return { ...data, __originalId: rowId };
    });
    tableRowMaps[alias] = rowMap;
  }

  // Group and aggregate
  const aggregated: Record<string, Record<string, number>> = {};
  const recordIdsByGroup: Record<string, string[]> = {};

  for (const [alias, rows] of Object.entries(tableData)) {
    const amountField = amountFields[alias];
    if (!amountField) {
      throw new Error(`Missing amountField for table alias "${alias}"`);
    }

    for (const row of rows) {
      const amount = Number(row[amountField]) || 0;

      let groupKey: string;

      if (groupBy === 'period') {
        const dateField = dateFields[alias] || 'date';
        const dateValue = row[dateField];
        if (!dateValue) continue;

        const date = new Date(dateValue);
        if (isNaN(date.getTime())) continue;

        groupKey = formatDateByPeriod(date, period);
      } else if (groupBy === 'status') {
        groupKey = String(row[statusField!] || 'Unknown');
      } else {
        groupKey = 'all';
      }

      if (!aggregated[groupKey]) {
        aggregated[groupKey] = {};
        recordIdsByGroup[groupKey] = [];
      }

      if (!aggregated[groupKey][alias]) {
        aggregated[groupKey][alias] = 0;
      }

      aggregated[groupKey][alias] += amount;
      
      // Collect record ID
      if (row.__originalId) {
        recordIdsByGroup[groupKey].push(row.__originalId);
      }
    }
  }

  // Calculate formula for each group
  const results: ChartDataPoint[] = [];

  for (const [groupKey, values] of Object.entries(aggregated)) {
    try {
      const result = evaluateExpression(formula, values);
      const recordIds = recordIdsByGroup[groupKey] || [];
      // For multi-table, use 'mixed' as tableSource
      results.push({
        name: groupKey,
        value: result,
        recordIds: recordIds.length > 0 ? recordIds : undefined,
        tableSource: 'mixed',
      });
    } catch (error) {
      console.error(`Error evaluating formula for group "${groupKey}":`, error);
      results.push({ name: groupKey, value: 0 });
    }
  }

  // Sort
  if (groupBy === 'period') {
    results.sort((a, b) => {
      const dateA = new Date(a.name);
      const dateB = new Date(b.name);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.name.localeCompare(b.name);
    });
  } else {
    results.sort((a, b) => a.name.localeCompare(b.name));
  }

  return results;
};

