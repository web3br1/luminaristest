/**
 * Custom KPI Executor
 *
 * Executes an array of custom KPI definitions against provided row data.
 * Each KPI is wrapped in its own try/catch so a single broken calculation
 * cannot crash the entire dashboard.
 */

import type { KpiDefinition, KpiFilter } from '../schemas/KpiSchema';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Successful KPI result */
export interface KpiSuccessResult {
  kpiName: string;
  value: number;
  error: null;
}

/** Failed KPI result — the calculation errored but execution continued */
export interface KpiErrorResult {
  kpiName: string;
  value: null;
  error: 'Calculation failed';
}

export type KpiResult = KpiSuccessResult | KpiErrorResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the given row passes all filters.
 */
function rowMatchesFilters(
  data: Record<string, unknown>,
  filters: KpiFilter[] | undefined
): boolean {
  if (!filters || filters.length === 0) return true;

  for (const f of filters) {
    const raw = data[f.field];

    switch (f.operator) {
      case 'eq':
        if (raw !== f.value) return false;
        break;

      case 'gt':
        if (!(Number(raw) > Number(f.value))) return false;
        break;

      case 'lt':
        if (!(Number(raw) < Number(f.value))) return false;
        break;

      case 'gte':
        if (!(Number(raw) >= Number(f.value))) return false;
        break;

      case 'lte':
        if (!(Number(raw) <= Number(f.value))) return false;
        break;

      case 'contains': {
        const haystack = String(raw ?? '').toLowerCase();
        const needle = String(f.value ?? '').toLowerCase();
        if (!haystack.includes(needle)) return false;
        break;
      }

      default:
        // Unknown operator — conservatively exclude the row
        return false;
    }
  }

  return true;
}

/**
 * Computes the result of a single KPI over a set of (already-filtered) rows.
 * Throws if the data is unusable (e.g. no rows for avg).
 */
function computeKpi(
  kpi: KpiDefinition,
  rows: Array<{ id: string; data: Record<string, unknown> }>
): number {
  const matchingRows = rows.filter((r) => rowMatchesFilters(r.data, kpi.filters));

  switch (kpi.measure) {
    case 'count':
      return matchingRows.length;

    case 'sum': {
      let total = 0;
      for (const row of matchingRows) {
        const v = Number(row.data[kpi.field]);
        if (Number.isFinite(v)) total += v;
      }
      return total;
    }

    case 'avg': {
      if (matchingRows.length === 0) return 0;
      let sum = 0;
      let count = 0;
      for (const row of matchingRows) {
        const v = Number(row.data[kpi.field]);
        if (Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      return count === 0 ? 0 : sum / count;
    }

    case 'min': {
      let min = Infinity;
      for (const row of matchingRows) {
        const v = Number(row.data[kpi.field]);
        if (Number.isFinite(v) && v < min) min = v;
      }
      return min === Infinity ? 0 : min;
    }

    case 'max': {
      let max = -Infinity;
      for (const row of matchingRows) {
        const v = Number(row.data[kpi.field]);
        if (Number.isFinite(v) && v > max) max = v;
      }
      return max === -Infinity ? 0 : max;
    }

    default:
      throw new Error(`Unknown measure type: ${(kpi as KpiDefinition).measure}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Executes multiple KPI definitions over the provided rows in a safe pipeline.
 *
 * Each KPI runs in its own try/catch block. If an individual KPI throws,
 * the result for that KPI will be `{ kpiName, value: null, error: 'Calculation failed' }`
 * and execution continues for remaining KPIs.
 *
 * @param kpis - Array of validated `KpiDefinition` objects.
 * @param rows - Raw data rows from the target table.
 * @returns    Array of `KpiResult` — one entry per input KPI, in order.
 */
export function executeCustomKpis(
  kpis: KpiDefinition[],
  rows: Array<{ id: string; data: Record<string, unknown> }>
): KpiResult[] {
  const results: KpiResult[] = [];

  for (const kpi of kpis) {
    try {
      const value = computeKpi(kpi, rows);
      results.push({ kpiName: kpi.name, value, error: null });
    } catch {
      results.push({ kpiName: kpi.name, value: null, error: 'Calculation failed' });
    }
  }

  return results;
}
