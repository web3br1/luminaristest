/**
 * Aggregate Pipeline Processor
 *
 * A powerful, flexible processor that executes declarative pipeline specifications.
 * Supports filters, joins, dimensions, measures, and formulas.
 *
 * This is the most versatile dynamic processor, capable of replacing most
 * simple processors (status distribution, temporal aggregation, etc.).
 */

import type { AnalyticsProcessor, AnalyticsProcessorContext, ChartDataPoint, TableDataRow } from '../../core';
import { logger } from '@/lib/logger';
import type { CompiledPipeline, Dimension, Measure, PipelineSpec, JoinRef } from '../../core/pipeline/Pipeline';
import { compilePipeline } from '../../core/pipeline/Compiler';
import { evaluateExpression } from '../../core/engine/ExpressionEvaluator';
import type { ISchemaField } from '@/features/dynamicTables/models/DynamicTable.model';

// =============================================================================
// HELPERS
// =============================================================================

function getField(obj: Record<string, unknown>, path: string, opts?: { deriveItemType?: boolean }): unknown {
  if (!obj || !path) return undefined;

  // Optional computed "itemType" derived from productId/serviceId
  if (path === 'itemType' && opts?.deriveItemType) {
    // Check for explicit type field first
    if (obj?.type) {
      const typeStr = String(obj.type);
      if (typeStr === 'Product' || typeStr === 'Service') {
        return typeStr;
      }
    }
    // Check for itemType field
    if (obj?.itemType) {
      const itemTypeStr = String(obj.itemType);
      if (itemTypeStr === 'Product' || itemTypeStr === 'Service') {
        return itemTypeStr;
      }
    }
    // Check for productId/serviceId presence
    const hasProductId = obj?.productId != null && obj?.productId !== '';
    const hasServiceId = obj?.serviceId != null && obj?.serviceId !== '';
    if (hasProductId && !hasServiceId) return 'Product';
    if (hasServiceId && !hasProductId) return 'Service';
    // If both or neither, check type field or default to Product
    if (hasProductId) return 'Product';
    if (hasServiceId) return 'Service';
  }

  // Simple field access
  if (path.indexOf('.') === -1) return obj[path];

  // Nested field access (e.g., 'header.date')
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p] as Record<string, unknown>;
  }
  return cur;
}

function formatPeriod(dateStr: string | Date | null | undefined, period: 'day' | 'week' | 'month' | 'quarter' | 'year'): string {
  const d = new Date((dateStr ?? '') as string | Date);
  if (Number.isNaN(d.getTime())) return 'Unknown';

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const month = `${m}`.padStart(2, '0');

  switch (period) {
    case 'year':
      return `${y}`;
    case 'month':
      return `${y}-${month}`;
    case 'day':
      return `${y}-${month}-${`${d.getDate()}`.padStart(2, '0')}`;
    case 'quarter':
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case 'week': {
      const firstJan = new Date(d.getFullYear(), 0, 1);
      const days = Math.floor((d.getTime() - firstJan.getTime()) / 86400000);
      const week = Math.ceil((days + firstJan.getDay() + 1) / 7);
      return `${y}-W${week}`;
    }
    default:
      return `${y}-${month}`;
  }
}

function applyFilters(
  row: Record<string, unknown>,
  filters: PipelineSpec['filters'],
  deriveItemType: boolean
): boolean {
  if (!filters || filters.length === 0) return true;

  for (const f of filters) {
    const v = getField(row, f.field, { deriveItemType });
    switch (f.op) {
      case 'eq':
        if (v !== f.value) return false;
        break;
      case 'ne':
        if (v === f.value) return false;
        break;
      case 'in':
        if (!Array.isArray(f.value) || !f.value.some((x: unknown) => x === v)) return false;
        break;
      case 'nin':
        if (Array.isArray(f.value) && f.value.some((x: unknown) => x === v)) return false;
        break;
      case 'gt':
        if (!(Number(v) > Number(f.value))) return false;
        break;
      case 'gte':
        if (!(Number(v) >= Number(f.value))) return false;
        break;
      case 'lt':
        if (!(Number(v) < Number(f.value))) return false;
        break;
      case 'lte':
        if (!(Number(v) <= Number(f.value))) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

function makeGroupKey(
  row: Record<string, unknown>,
  dimensions: Dimension[] | undefined,
  deriveItemType: boolean
): string {
  if (!dimensions || dimensions.length === 0) return '__all__';

  const parts: string[] = [];
  for (const d of dimensions) {
    if (d.type === 'field') {
      parts.push(String(getField(row, d.field, { deriveItemType }) ?? ''));
    } else if (d.type === 'period') {
      parts.push(formatPeriod(getField(row, d.dateField, { deriveItemType }) as string | Date | null | undefined, d.period));
    }
  }
  return parts.join('|');
}

function computeMeasure(row: Record<string, unknown>, m: Measure): number {
  switch (m.type) {
    case 'sum':
      return Number(getField(row, m.field) || 0);
    case 'count':
      return 1;
    case 'avg':
      return Number(getField(row, m.field) || 0); // average handled in finalize
    case 'formula': {
      const vars: Record<string, number> = {};
      for (const [v, fieldName] of Object.entries(m.variables)) {
        const raw = getField(row, fieldName);
        vars[v] = Number.isFinite(Number(raw)) ? Number(raw) : 0;
      }
      return evaluateExpression(m.expression, vars);
    }
    default:
      return 0;
  }
}

// =============================================================================
// PROCESSOR
// =============================================================================

export const aggregatePipelineProcessor: AnalyticsProcessor = async (
  context: AnalyticsProcessorContext
): Promise<ChartDataPoint[]> => {
  const { rows: contextRows, params, fetchByPresetTableKey, fetchByTableId, table, schema } = context;
  const deriveItemType = Boolean(params?.deriveItemType);
  const spec = params.pipeline as PipelineSpec;

  if (!spec || !spec.source) {
    throw new Error('Missing pipeline specification');
  }

  const compiled: CompiledPipeline = compilePipeline(spec);

  // Determine which rows to use based on pipeline source
  let rows: TableDataRow[] = contextRows;
  let sourceTable = table;
  let sourceSchema = schema;
  let sourcePresetKey: string | undefined = undefined;

  // If pipeline specifies a different source, fetch from that source
  if (compiled.source.kind === 'presetTable' && fetchByPresetTableKey) {
    let sourceKey = compiled.source.key;

    // Extract preset key from @@PRESET_TABLE_KEY::expenses format
    if (sourceKey && sourceKey.startsWith('@@PRESET_TABLE_KEY::')) {
      sourceKey = sourceKey.replace('@@PRESET_TABLE_KEY::', '');
    }

    if (sourceKey && sourceKey !== '@@TABLE_SELF@@') {
      try {
        const sourceResult = await fetchByPresetTableKey(sourceKey);
        rows = sourceResult.rows;
        sourceTable = sourceResult.table;
        sourceSchema = sourceResult.schema;
        // Store the preset key (without @@PRESET_TABLE_KEY:: prefix) for tableSource determination
        sourcePresetKey = sourceKey;
      } catch (err) {
        logger.warn('Failed to fetch data from pipeline source, using context rows', { sourceKey, error: err });
        // Fallback to context rows if fetch fails
      }
    }
  } else if (compiled.source.kind === 'tableId' && compiled.source.id && fetchByTableId) {
    try {
      const sourceResult = await fetchByTableId(compiled.source.id);
      rows = sourceResult.rows;
      sourceTable = sourceResult.table;
      sourceSchema = sourceResult.schema;
    } catch (err) {
      logger.warn('Failed to fetch data from pipeline source table, using context rows', { sourceId: compiled.source.id, error: err });
      // Fallback to context rows if fetch fails
    }
  }

  // Build relation lookups for dimension fields
  const relationLookups: Record<string, Map<string, string>> = {};
  if (sourceSchema?.fields && compiled.dimensions) {
    for (const dim of compiled.dimensions) {
      if (dim.type === 'field') {
        const field = sourceSchema.fields.find((f: ISchemaField) => f.name === dim.field);
        if (field?.type === 'relation' && field.relation?.targetTable) {
          try {
            const targetTableRef = String(field.relation.targetTable);
            let relatedRows: TableDataRow[] = [];

            let displayField = 'name';

            // Handle preset table keys
            if (targetTableRef.startsWith('@@PRESET_TABLE_KEY::') && fetchByPresetTableKey) {
              const presetKey = targetTableRef.replace('@@PRESET_TABLE_KEY::', '');
              const result = await fetchByPresetTableKey(presetKey);
              relatedRows = result.rows;
              if (result.schema?.defaultDisplayField) displayField = result.schema.defaultDisplayField;
            }
            // Handle direct table IDs
            else if (fetchByTableId && !targetTableRef.startsWith('@@')) {
              const result = await fetchByTableId(targetTableRef);
              relatedRows = result.rows;
              if (result.schema?.defaultDisplayField) displayField = result.schema.defaultDisplayField;
            }

            if (relatedRows.length > 0) {
              const lookup = new Map<string, string>();
              for (const relRow of relatedRows) {
                const id = String(relRow.id);
                const displayValue = relRow.data?.[displayField] || relRow.data?.name || id;
                lookup.set(id, String(displayValue));
              }
              relationLookups[dim.field] = lookup;
            }
          } catch (err) {
            logger.warn('Failed to load relation lookup', { field: dim.field, error: err });
          }
        }
      }
    }
  }

  // Handle joins
  const rightMaps: Record<string, Map<string, Record<string, unknown>>> = {};
  const joins: JoinRef[] = (compiled.joins || []) as JoinRef[];

  if (joins.length > 0 && fetchByPresetTableKey) {
    for (const j of joins) {
      if (j.rightRef.kind !== 'presetTable') continue;
      const { rows: rightRows } = await fetchByPresetTableKey(j.rightRef.key);
      rightMaps[j.alias || 'right'] = new Map(rightRows.map((r) => [r.id, r.data]));
    }
  }

  // Build denormalized records with original IDs
  const denorm: Array<Record<string, unknown> & { __originalId?: string }> = rows.map((r) => ({
    ...r.data,
    __originalId: r.id,
  }));

  if (joins.length > 0) {
    for (const base of denorm) {
      for (const j of joins) {
        if (j.rightRef.kind !== 'presetTable') continue;
        const alias = j.alias || 'right';
        const map = rightMaps[alias];
        const key = String(getField(base, j.leftField) || '');
        const right = map?.get(key);
        if (right) {
          base[alias] = right;
        }
      }
    }
  }

  // Filter
  const filtered = denorm.filter((r) => applyFilters(r, compiled.filters, deriveItemType));

  // Group
  const groups = new Map<string, { rows: Array<Record<string, unknown> & { __originalId?: string }> }>();
  for (const r of filtered) {
    const gk = makeGroupKey(r, compiled.dimensions, deriveItemType);
    if (!groups.has(gk)) groups.set(gk, { rows: [] });
    groups.get(gk)!.rows.push(r);
  }

  // Aggregate
  const results: ChartDataPoint[] = [];
  for (const [gk, bucket] of groups.entries()) {
    let total = 0;
    const countsForAvg: Record<string, { total: number; count: number }> = {};

    // Initialize avg accumulators
    for (const m of compiled.measures) {
      if (m.type === 'avg' && m.field) {
        countsForAvg[m.field] = { total: 0, count: 0 };
      }
    }

    // Process rows
    for (const row of bucket.rows) {
      for (const m of compiled.measures) {
        const val = computeMeasure(row, m);
        if (m.type === 'avg' && m.field) {
          countsForAvg[m.field].total += val;
          countsForAvg[m.field].count += 1;
        } else {
          total += val;
        }
      }
    }

    // Finalize averages
    for (const m of compiled.measures) {
      if (m.type === 'avg' && m.field) {
        const s = countsForAvg[m.field];
        if (s && s.count > 0) {
          total += s.total / s.count;
        }
      }
    }

    // Resolve relation field names
    let displayName = gk === '__all__' ? 'Total' : gk;
    if (gk !== '__all__' && compiled.dimensions && compiled.dimensions.length > 0) {
      const parts = gk.split('|');
      const resolvedParts: string[] = [];
      for (let i = 0; i < parts.length && i < compiled.dimensions.length; i++) {
        const dim = compiled.dimensions[i];
        const rawValue = parts[i];
        if (dim.type === 'field' && relationLookups[dim.field]) {
          const lookup = relationLookups[dim.field];
          resolvedParts.push(lookup.get(rawValue) || rawValue);
        } else {
          resolvedParts.push(rawValue);
        }
      }
      displayName = resolvedParts.join(' | ');
    }

    // Apply labelMap transformations if present (handles true/false, status codes, etc.)
    const labelMap = (params.labelMap ?? (params.options as Record<string, unknown> | undefined)?.labelMap) as Record<string, unknown> | undefined;
    if (labelMap && typeof labelMap === 'object') {
      // Check for direct match of display name
      if (labelMap[displayName] !== undefined) {
        displayName = String(labelMap[displayName]);
      }
      // Check for match of parts if it was a multi-dimension key
      else if (displayName.includes(' | ')) {
        displayName = displayName.split(' | ')
          .map(part => labelMap[part] !== undefined ? String(labelMap[part]) : part)
          .join(' | ');
      }
    }

    // Collect record IDs for this group
    const recordIds = bucket.rows
      .map((r) => r.__originalId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // Determine table source - prioritize sourcePresetKey, then source table's presetKey/internalName, then fallback
    const mainTableSource = sourcePresetKey || sourceTable?.presetKey || sourceTable?.internalName || (params.tableId as string | undefined) || 'sales';

    results.push({
      name: displayName,
      value: total,
      recordIds: recordIds.length > 0 ? recordIds : undefined,
      tableSource: mainTableSource,
    });
  }

  // Inject missing categories defined in labelMap with value 0
  const labelMap2 = (params.labelMap ?? (params.options as Record<string, unknown> | undefined)?.labelMap) as Record<string, unknown> | undefined;
  if (labelMap2 && typeof labelMap2 === 'object') {
    const existingNames = new Set(results.map((r) => r.name));
    // Iterate over the translated labels to ensure the chart has them
    for (const label of Object.values(labelMap2)) {
      const labelStr = String(label);
      if (!existingNames.has(labelStr)) {
        results.push({
          name: labelStr,
          value: 0,
          tableSource: (params.tableId as string | undefined) ?? 'sales',
        });
      }
    }
  }

  // Sort
  results.sort((a, b) => a.name.localeCompare(b.name));
  if (compiled.sort?.dir === 'desc') {
    results.reverse();
  }

  // Limit
  if (compiled.limit && compiled.limit > 0) {
    return results.slice(0, compiled.limit);
  }

  return results;
};

