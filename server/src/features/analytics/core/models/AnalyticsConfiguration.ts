/**
 * Analytics Configuration System
 *
 * Configurations define how to use an analytics template in a specific preset.
 * They map generic template field requirements to actual table fields.
 */

import type { ChartType } from './ChartPreset';

/**
 * Configuration for using an analytics template in a system preset.
 * This is what gets defined in the preset's `analytics` array.
 */
export interface AnalyticsConfiguration {
  /**
   * Key of the analytics template to use (must exist in templates registry).
   */
  templateKey: string;

  /**
   * Unique key for this specific analysis instance.
   * Example: 'sales.statusDistribution', 'appointments.statusDistribution'
   */
  key: string;

  /**
   * Display title for the chart.
   */
  title: string;

  /**
   * Optional description of this specific analysis.
   */
  description?: string;

  /**
   * Chart type to render.
   */
  type: ChartType;

  /**
   * Table key from the preset (e.g., '@@PRESET_TABLE_KEY::sales').
   * Will be resolved to actual table ID at runtime.
   */
  tableKey: string;

  /**
   * Maps template field requirements to actual table field names.
   *
   * Example:
   * - Template requires: { key: 'statusField', types: ['select'] }
   * - Configuration maps: { statusField: 'status' }
   * - Result: processor receives params.statusField = 'status'
   */
  fieldMapping: Record<string, string>;

  /**
   * Chart display options (colors, currency, labels, etc.).
   * Merged with template's defaultOptions.
   */
  options?: Record<string, unknown>;

  /**
   * Additional parameters to pass to the processor.
   * Merged with template's defaultParams and fieldMapping.
   */
  params?: Record<string, unknown>;
}

