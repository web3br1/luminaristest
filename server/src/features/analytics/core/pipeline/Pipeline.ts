/**
 * Declarative Analytics Pipeline Types
 *
 * These types define the structure of a declarative pipeline specification
 * that can be used to create complex analytics queries without code.
 */

/**
 * Reference to a data source
 */
export type DataRef =
  | { kind: 'presetTable'; key: string } // '@@PRESET_TABLE_KEY::sales'
  | { kind: 'tableId'; id: string };

/**
 * Join specification
 */
export type JoinRef = {
  leftField: string;   // e.g., saleId on items
  rightRef: DataRef;   // e.g., sales header table
  rightField: string;  // e.g., id on header
  alias?: string;      // e.g., header
};

/**
 * Filter operations
 */
export type FilterOp = 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte';

/**
 * Filter specification
 */
export type Filter = {
  field: string;
  op: FilterOp;
  value: any;
};

/**
 * Dimension for grouping
 */
export type Dimension =
  | { type: 'field'; field: string; label?: string }
  | { type: 'period'; dateField: string; period: 'day' | 'week' | 'month' | 'quarter' | 'year'; label?: string };

/**
 * Measure for aggregation
 */
export type Measure =
  | { type: 'sum'; field: string; alias?: string }
  | { type: 'count'; field?: string; alias?: string }
  | { type: 'avg'; field: string; alias?: string }
  | { type: 'formula'; expression: string; variables: Record<string, string>; alias?: string };

/**
 * Sort specification
 */
export type Sort = {
  by: 'dimension' | 'measure';
  key?: string;
  dir?: 'asc' | 'desc';
};

/**
 * Complete pipeline specification
 */
export type PipelineSpec = {
  source: DataRef;
  joins?: JoinRef[];
  filters?: Filter[];
  dimensions?: Dimension[];  // 0..n
  measures: Measure[];       // 1..n
  sort?: Sort;
  limit?: number;
};

/**
 * Compiled pipeline (placeholder for future optimizations)
 */
export type CompiledPipeline = PipelineSpec;

