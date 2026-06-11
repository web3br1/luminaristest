/**
 * KPI Helpers - Utility functions for KPI formatting and display
 *
 * These utilities handle formatting, visual styling, and grouping of KPIs.
 * Groups are now driven by backend metadata (metricAnalysis) rather than hardcoded names.
 */

import type {
  KpiGroup,
  KpiVisualMeta,
  MetricFormat,
  MetricDisplayMode,
  ChartDataPoint,
} from '../types';
import { formatBRL } from './formatters';

// =============================================================================
// FORMATTING
// =============================================================================



/**
 * Format a KPI value based on its format type
 */
export function formatKpiValue(
  value: number,
  format: MetricFormat,
  currency?: string,
  customFormatter?: (val: number) => string
): string {
  switch (format) {
    case 'currency':
      return customFormatter ? customFormatter(value) : formatBRL(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
    default:
      return value.toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
      });
  }
}

/**
 * Format large numbers with abbreviations (K, M, B)
 */
export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

// =============================================================================
// KPI GROUPS - Now driven by processor key, not hardcoded names
// =============================================================================

/**
 * Default KPI groups based on processor type
 * Aligned with backend templates (60 KPIs total)
 */
const KPI_GROUPS_BY_PROCESSOR: Record<string, KpiGroup[]> = {
  // 17 Revenue KPIs
  revenueKpis: [
    { id: 'all', label: 'finance_view:kpi_groups.all_17' },
    { id: 'global', label: 'finance_view:kpi_groups.revenue_global' },
    { id: 'customer', label: 'finance_view:kpi_groups.revenue_customer' },
    { id: 'category', label: 'finance_view:kpi_groups.revenue_category' },
  ],
  // 14 Cost KPIs
  costKpis: [
    { id: 'all', label: 'finance_view:kpi_groups.all_14' },
    { id: 'fixed', label: 'finance_view:kpi_groups.cost_fixed' },
    { id: 'variable', label: 'finance_view:kpi_groups.cost_variable' },
    { id: 'operational', label: 'finance_view:kpi_groups.cost_operational' },
    { id: 'structure', label: 'finance_view:kpi_groups.cost_structure' },
  ],
  // 18 Profit/Margin KPIs
  profitKpis: [
    { id: 'all', label: 'finance_view:kpi_groups.all_18' },
    { id: 'profit', label: 'finance_view:kpi_groups.profit_profits' },
    { id: 'margins', label: 'finance_view:kpi_groups.profit_margins' },
    { id: 'efficiency', label: 'finance_view:kpi_groups.profit_efficiency' },
  ],
  // 11 Cashflow/Solvency KPIs
  cashflowKpis: [
    { id: 'all', label: 'finance_view:kpi_groups.all_11' },
    { id: 'cashflow', label: 'finance_view:kpi_groups.cashflow_flow' },
    { id: 'receivables', label: 'finance_view:kpi_groups.cashflow_receivables' },
    { id: 'payables', label: 'finance_view:kpi_groups.cashflow_payables' },
    { id: 'solvency', label: 'finance_view:kpi_groups.cashflow_solvency' },
  ],
};

/**
 * Get available KPI groups based on processor type
 */
export function getKpiGroups(processor: string): KpiGroup[] {
  return KPI_GROUPS_BY_PROCESSOR[processor] || [{ id: 'all', label: 'finance_view:kpi_groups.all' }];
}

/**
 * Filter KPIs by group using metricAnalysis from backend
 * Falls back to name-based filtering if metricAnalysis not available
 */
export function filterKpisByGroup(
  groupId: string,
  items: ChartDataPoint[],
  metricAnalysis?: Record<string, string>
): ChartDataPoint[] {
  if (!groupId || groupId === 'all') return items;

  // Primary path: metricAnalysis metadata from backend determines group membership.
  if (metricAnalysis && Object.keys(metricAnalysis).length > 0) {
    return items.filter((kpi) => {
      const analysis = metricAnalysis[kpi.name];
      if (!analysis) return true; // Include KPIs not yet categorized by the backend

      // Map backend analysis types to UI group IDs
      const analysisToGroup: Record<string, string[]> = {
        evolution: ['global', 'margins'],
        composition: ['category', 'efficiency'],
        comparison: ['customer', 'variable'],
        snapshot: ['profit', 'fixed', 'operational'],
      };

      const matchingGroups = analysisToGroup[analysis] || [];
      return matchingGroups.includes(groupId);
    });
  }

  // Fallback: no metricAnalysis available — return all items unfiltered.
  return items;
}

// =============================================================================
// VISUAL METADATA
// =============================================================================

/**
 * Get visual metadata for a KPI (trend indicator, colors, styling)
 */
export function getKpiVisualMeta(
  name: string,
  value: number,
  format: MetricFormat,
  displayMode: MetricDisplayMode
): KpiVisualMeta {
  const nameLower = name.toLowerCase();

  // Determine if this is a trend-based metric.
  // Name-based matching is a fallback for cases where backend metricAnalysis is unavailable.
  // Primary signal is `format === 'percent'`; name matches are Portuguese-language heuristics.
  const isTrendMetric =
    format === 'percent' ||
    nameLower.includes('crescimento') ||
    nameLower.includes('margem') ||
    nameLower.includes('sazonal') ||
    nameLower.includes('%');

  // Base card styling - improved with better spacing and colors
  const baseCard = 'rounded-xl border px-4 py-3.5 flex flex-col transition-all duration-200';
  let cardClass = `${baseCard} border-gray-200/60 dark:border-gray-700/60 bg-gradient-to-br from-white to-gray-50/50 dark:from-slate-800/80 dark:to-slate-900/60 shadow-sm hover:shadow-md`;
  let colorClass = 'text-gray-900 dark:text-gray-100';
  let trend: 'up' | 'down' | 'flat' | null = null;

  // Alert mode styling - improved
  if (displayMode === 'alert') {
    cardClass = `${baseCard} border-amber-400/70 dark:border-amber-500/60 bg-gradient-to-br from-amber-50/90 to-amber-100/50 dark:from-amber-900/40 dark:to-amber-950/60 shadow-sm ring-1 ring-amber-200/50 dark:ring-amber-800/30`;
  }

  // Trend-based styling
  if (isTrendMetric) {
    if (value > 0) {
      trend = 'up';
      colorClass = 'text-emerald-600 dark:text-emerald-400';
    } else if (value < 0) {
      trend = 'down';
      colorClass = 'text-red-600 dark:text-red-400';
    } else {
      trend = 'flat';
      colorClass = 'text-gray-500 dark:text-gray-400';
    }
  }

  // Special styling for negative values in currency
  if (format === 'currency' && value < 0) {
    colorClass = 'text-red-600 dark:text-red-400';
  }

  return { trend, colorClass, cardClass };
}

// =============================================================================
// CHART TYPE HELPERS
// =============================================================================

/**
 * Get the preferred chart type for a KPI
 * Uses metricChartTypes from backend, with sensible defaults
 */
export function getPreferredChartType(
  kpiName: string,
  format: MetricFormat,
  metricChartTypes?: Record<string, string>
): 'line' | 'bar' | 'donut' | 'area' {
  // Use backend preference if available
  if (metricChartTypes && metricChartTypes[kpiName]) {
    return metricChartTypes[kpiName] as 'line' | 'bar' | 'donut' | 'area';
  }

  // Smart defaults based on format and name
  if (format === 'percent') {
    return 'donut';
  }

  // Name-based heuristics — fallback when backend metricChartTypes is unavailable.
  const nameLower = kpiName.toLowerCase();
  if (nameLower.includes('crescimento') || nameLower.includes('evolução')) {
    return 'line';
  }
  if (nameLower.includes('acumulado')) {
    return 'area';
  }

  return 'bar';
}

/**
 * Determine if a KPI should be shown as a full chart (not in grid)
 */
export function shouldShowAsChart(
  kpiName: string,
  metricDisplay?: Record<string, string>
): boolean {
  if (!metricDisplay) return false;
  return metricDisplay[kpiName] === 'graph';
}

/**
 * Determine if a KPI is expandable (hybrid mode)
 */
export function isExpandableKpi(
  kpiName: string,
  displayMode: MetricDisplayMode,
  metricHybrid?: Record<string, boolean>
): boolean {
  if (displayMode === 'graph') return true;
  if (displayMode === 'alert') return true;
  if (metricHybrid && metricHybrid[kpiName]) return true;
  return false;
}
