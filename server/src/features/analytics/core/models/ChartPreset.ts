/**
 * Chart Preset Types
 *
 * Backend-defined chart presets that use analytics processors (functions) to calculate data.
 * Each preset specifies a processor function and parameters to pass to it.
 */

/**
 * Supported chart types
 */
export type ChartType = 'pie' | 'donut' | 'bar' | 'line' | 'area' | 'card';

/**
 * Chart preset configuration
 */
export interface ChartPreset {
  key: string;
  title: string;
  description?: string;
  type: ChartType;
  /**
   * Processor function key (e.g., 'statusDistribution', 'revenueKpis').
   * The processor receives table data and returns chart data points.
   */
  processor: string;
  /**
   * Parameters to pass to the processor function.
   * Common params:
   * - tableId: ID of the table to analyze (required for most processors)
   * - amountField: Field name for amount/total calculations
   * - dateField: Field name for date calculations
   * - statusField: Field name for status filtering
   * - excludeStatuses: Array of statuses to exclude
   */
  params?: Record<string, unknown>;
  /**
   * Chart display options (colors, currency, etc.)
   */
  options?: {
    // Display options
    colors?: string[];
    currency?: string;
    isTemporal?: boolean;
    layout?: string;
    labelMap?: Record<string, string>;
    metricLabel?: string;
    analysisKind?: string;
    // Important fields configuration
    importantFields?: Record<string, string[]>; // KPI name -> array de campos importantes
    defaultImportantFields?: string[]; // Campos padrão para todos os KPIs deste chart
    [key: string]: unknown; // Allow other options
  };
}

/**
 * Group of related chart presets
 */
export interface AnalyticsPresetGroup {
  key: string;
  title: string;
  charts: ChartPreset[];
}

