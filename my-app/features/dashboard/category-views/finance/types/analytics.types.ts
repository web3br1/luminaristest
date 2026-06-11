/**
 * Analytics Types - Centralized type definitions for the analytics feature
 *
 * This file contains all shared types used across the analytics components,
 * hooks, and utilities. Centralizing types improves maintainability and
 * ensures consistency across the codebase.
 */

// Re-export ITableSchema from shared components
import type { IDynamicTable, ITableSchema, ISchemaField, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';

export type { IDynamicTable, ITableSchema, ISchemaField };

// =============================================================================
// CHART TYPES
// =============================================================================

export type DatePreset = 'today' | 'thisWeek' | 'thisMonth' | 'last30Days' | 'lastMonth' | 'thisYear';

/**
 * Supported chart types for rendering
 */
export type ChartType = 'pie' | 'donut' | 'bar' | 'line' | 'area';

/**
 * Display modes for KPIs
 * - card: Small card with value
 * - graph: Full chart display
 * - alert: Warning/alert style card
 */
export type MetricDisplayMode = 'card' | 'graph' | 'alert';

/**
 * Format types for metric values
 */
export type MetricFormat = 'currency' | 'percent' | 'number';

/**
 * Analysis types for KPIs
 * - evolution: Time-based trends
 * - composition: Part of whole
 * - comparison: Side by side comparison
 * - snapshot: Point in time value
 */
export type MetricAnalysisType = 'evolution' | 'composition' | 'comparison' | 'snapshot';

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/**
 * Single data point for charts
 */
export interface ChartDataPoint {
  name: string;
  value: number;
  label?: string; // Alias for name in some contexts
  previousValue?: number; // Previous period value for comparison
  count?: number; // Count of items (for pie charts)
  recordIds?: string[]; // IDs dos registros que compõem este ponto
  tableSource?: string; // Identificador da tabela de origem
  // Dados completos para KPIs pequenos (< 200 registros ou < 500KB)
  fullRecords?: {
    records: TableDataRow[];
    timestamp: number; // Timestamp de quando foram coletados
  };
}

/**
 * Chart preset configuration from backend
 */
export interface ChartPreset {
  key: string;
  title: string;
  description?: string;
  type: ChartType;
  processor: string;
  params?: ChartParams;
  options?: ChartOptions;
}

/**
 * Parameters passed to processors
 */
export interface ChartParams {
  tableId?: string;
  period?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  limit?: number;
  excludeStatuses?: string[];
  [key: string]: unknown;
}

/**
 * Display options for charts
 */
export interface ChartOptions {
  currency?: string;
  layout?: 'standard' | 'kpiGrid';
  isTemporal?: boolean;
  labelMap?: Record<string, string>;
  colors?: string[];
  metricLabel?: string;
  metricFormats?: Record<string, MetricFormat>;
  metricDisplay?: Record<string, MetricDisplayMode>;
  metricChartTypes?: Record<string, ChartType>;
  metricAnalysis?: Record<string, MetricAnalysisType>;
  metricHybrid?: Record<string, boolean>;
  [key: string]: unknown;
}

/**
 * Chart data with metadata
 */
export interface ChartData {
  chart: ChartPreset | null;
  data: ChartDataPoint[];
  error?: string;
  // Flag indicando se dados completos foram incluídos
  includeFullData?: boolean;
}

/**
 * Group of related charts
 */
export interface AnalyticsPresetGroup {
  key: string;
  title: string;
  charts: ChartPreset[];
}

// =============================================================================
// SESSION & FILTER TYPES
// =============================================================================

/**
 * Session/table grouping for UI
 */
export interface AnalyticsSession {
  key: string;
  label: string;
  charts: Array<{
    chart: ChartPreset;
    group: AnalyticsPresetGroup;
  }>;
}

/**
 * Time range filter options
 */
export type TimeRange = 'auto' | '3m' | '6m' | '12m';

// =============================================================================
// KPI TYPES
// =============================================================================

/**
 * KPI group for filtering
 */
export interface KpiGroup {
  id: string;
  label: string;
}

/**
 * Visual metadata for KPI display
 */
export interface KpiVisualMeta {
  trend: 'up' | 'down' | 'flat' | null;
  colorClass: string;
  cardClass: string;
}

// =============================================================================
// HOOK TYPES
// =============================================================================

/**
 * Options for useAnalyticsData hook
 */
export interface UseAnalyticsDataOptions {
  presetKey?: string;
}

/**
 * Return type for useAnalyticsData hook
 */
export interface UseAnalyticsDataReturn {
  presetGroups: AnalyticsPresetGroup[];
  chartData: Record<string, ChartData>;
  loading: boolean;
  errors: Record<string, string>;
  refetchChart: (chartKey: string, params?: Record<string, string>) => Promise<void>;
  discoverKPIs: (tableId: string) => Promise<AnalyticsPresetGroup[]>;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Props for ChartRenderer component
 */
export interface ChartRendererProps {
  chart: ChartPreset;
  data: ChartData;
  timeRange?: TimeRange;
  onPeriodChange?: (chartKey: string, period: string) => Promise<void>;
  highlightMetric?: string;
}

/**
 * Props for KpiGridLayout component
 */
export interface KpiGridLayoutProps {
  chart: ChartPreset;
  data: ChartDataPoint[];
  useCurrency?: string;
  highlightMetric?: string;
}

/**
 * Props for SessionFilter component
 */
export interface SessionFilterProps {
  sessions: AnalyticsSession[];
  activeSession: string;
  timeRange: TimeRange;
  showEmptyAnalyses: boolean;
  onSessionChange: (key: string) => void;
  onTimeRangeChange: (range: TimeRange) => void;
  onShowEmptyAnalysesChange: (show: boolean) => void;
}

/**
 * Props for NoDataCard component
 */
export interface NoDataCardProps {
  chart: ChartPreset;
  data: ChartData;
}

/**
 * Props for AnalyticsView component
 */
export interface AnalyticsViewProps {
  presetKey?: string;
  defaultMetric?: string;
  tables?: IDynamicTable[];
}

// =============================================================================
// DETAILS MODAL TYPES
// =============================================================================

/**
 * Single row of table data — canonical alias of IDynamicTableData.
 * Kept as a named alias for semantic clarity in analytics API responses.
 */
export type TableDataRow = IDynamicTableData;

/**
 * Group of records from a specific table
 */
export interface TableRecordsGroup {
  tableName: string;
  tableKey: string;
  records: TableDataRow[];
  total: number;
}

/**
 * Response from chart details endpoint
 */
export interface ChartDetailsResponse {
  recordsByTable: Record<string, TableRecordsGroup>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  tableSchemas?: Record<string, unknown>;
}
