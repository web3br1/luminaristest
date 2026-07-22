/**
 * Analytics Processor Registry
 *
 * Central registry for all analytics processors (both dynamic and KPI-specific).
 * Processors receive raw table data and return formatted chart data.
 */

import type { IDynamicTable, ITableSchema } from '@/features/dynamicTables/models/DynamicTable.model';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Single row of table data
 */
export interface TableDataRow {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Single data point for charts
 */
export interface ChartDataPoint {
  name: string;
  value: number;
  previousValue?: number; // Optional previous period value for comparative trend calculation
  recordIds?: string[]; // IDs dos registros que compõem este ponto
  tableSource?: string; // Identificador da tabela de origem (preset key ou tableId). Ex: 'sales', 'expenses', '@@PRESET_TABLE_KEY::expenses', 'mixed' para múltiplas tabelas
  // Dados completos para KPIs pequenos (< 200 registros ou < 500KB)
  fullRecords?: {
    records: TableDataRow[];
    timestamp: number; // Timestamp de quando foram coletados
  };
}

/**
 * Context passed to processors
 */
export interface AnalyticsProcessorContext {
  table: IDynamicTable;
  schema: ITableSchema;
  rows: TableDataRow[];
  streamRows?: () => AsyncGenerator<TableDataRow[]>;
  params: Record<string, unknown>;
  /**
   * Fetch data from another table by preset key.
   * Use for multi-table analytics (e.g., '@@PRESET_TABLE_KEY::expenses').
   */
  fetchByPresetTableKey?: (presetTableKey: string) => Promise<{
    table: IDynamicTable;
    schema: ITableSchema;
    rows: TableDataRow[];
  }>;
  /**
   * Fetch data from another table by ID.
   */
  fetchByTableId?: (tableId: string) => Promise<{
    table: IDynamicTable;
    schema: ITableSchema;
    rows: TableDataRow[];
  }>;
}

/**
 * Processor function signature
 */
export type AnalyticsProcessor = (
  context: AnalyticsProcessorContext
) => ChartDataPoint[] | Promise<ChartDataPoint[]>;

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * Registry of all available analytics processors.
 */
const processorRegistry: Record<string, AnalyticsProcessor> = {};

/**
 * Register a new analytics processor.
 *
 * @param key Unique identifier for the processor
 * @param processor The processor function
 */
export function registerProcessor(key: string, processor: AnalyticsProcessor): void {
  if (processorRegistry[key]) {
    logger.warn('[Analytics] Processor already registered. Overwriting.', { key });
  }
  processorRegistry[key] = processor;
}

/**
 * Get a processor by key.
 *
 * @param key The processor key
 * @returns The processor function or null if not found
 */
export function getProcessor(key: string): AnalyticsProcessor | null {
  return processorRegistry[key] || null;
}

/**
 * Get all registered processor keys.
 *
 * @returns Array of registered processor keys
 */
export function getRegisteredProcessors(): string[] {
  return Object.keys(processorRegistry);
}

/**
 * Check if a processor is registered.
 *
 * @param key The processor key
 * @returns True if registered
 */
export function hasProcessor(key: string): boolean {
  return key in processorRegistry;
}

