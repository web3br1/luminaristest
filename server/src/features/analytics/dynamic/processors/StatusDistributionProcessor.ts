/**
 * Status Distribution Processor
 *
 * Counts occurrences of values in a select field.
 * Useful for visualizing distribution of status, states, categories, etc.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import type { ISchemaField } from '@/features/dynamicTables/models/DynamicTable.model';

function findStatusField(
  schema: any,
  hints?: { preferFieldNames?: string[]; maxOptions?: number }
): ISchemaField | null {
  const prefer = (hints?.preferFieldNames || ['status']).map((s) => s.toLowerCase());
  const candidates = (schema?.fields || []).filter(
    (f: any) => f.type === 'select' && Array.isArray(f.options) && f.options.length > 0
  );

  // Prefer explicit names
  const preferred = candidates.find(
    (f: any) => prefer.includes(f.name.toLowerCase()) || /status$/i.test(f.name)
  );
  if (preferred) return preferred;

  // Fallback: first reasonable select field
  const maxOpts = hints?.maxOptions ?? 10;
  return candidates.find((f: any) => f.options && f.options.length <= maxOpts) || null;
}

export const statusDistributionProcessor: AnalyticsProcessor = (context): ChartDataPoint[] => {
  const { schema, rows, params, table } = context;
  const hints = params.hints || {};
  const labelMap = params.labelMap || {};

  // Find status field
  let field: ISchemaField | null = null;

  if (params.statusField) {
    const name = String(params.statusField);
    field = (schema?.fields || []).find((f: any) => String(f.name) === name) || null;
    if (!field || field.type !== 'select') {
      field = null;
    }
  }

  if (!field) {
    field = findStatusField(schema, hints);
  }

  if (!field) {
    throw new Error('No status-like select field found in table schema');
  }

  // Count occurrences
  const counts = new Map<string, number>();
  const recordIdsByValue = new Map<string, string[]>();
  for (const opt of field.options || []) {
    counts.set(String(opt), 0);
    recordIdsByValue.set(String(opt), []);
  }

  for (const row of rows) {
    const value = row.data?.[field.name];
    if (value != null) {
      const key = String(value);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!recordIdsByValue.has(key)) {
        recordIdsByValue.set(key, []);
      }
      recordIdsByValue.get(key)!.push(row.id);
    }
  }

  return Array.from(counts.entries()).map(([name, value]) => ({
    name: labelMap[name] || name,
    value,
    recordIds: recordIdsByValue.get(name),
    tableSource: table.presetKey || params.tableId || 'sales',
  }));
};

