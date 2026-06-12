/**
 * KPI Schema Definitions
 *
 * Zod schemas for validating custom KPI definitions, including
 * measure types, filter operators, and field existence checks.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

export const KpiMeasureSchema = z.enum(['sum', 'avg', 'count', 'min', 'max']);

export const KpiFilterSchema = z.object({
  field: z.string().min(1, 'Filter field name must not be empty'),
  operator: z.enum(['eq', 'gt', 'lt', 'gte', 'lte', 'contains']),
  value: z.unknown(),
});

export const KpiDefinitionSchema = z.object({
  name: z.string().min(1, 'KPI name must not be empty').max(100, 'KPI name must not exceed 100 characters'),
  tableId: z.string().min(1, 'tableId must not be empty'),
  measure: KpiMeasureSchema,
  field: z.string().min(1, 'field must not be empty'),
  filters: z.array(KpiFilterSchema).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type KpiMeasure = z.infer<typeof KpiMeasureSchema>;
export type KpiFilter = z.infer<typeof KpiFilterSchema>;
export type KpiDefinition = z.infer<typeof KpiDefinitionSchema>;

// ---------------------------------------------------------------------------
// Column-level validation
// ---------------------------------------------------------------------------

/**
 * Represents a single column/field descriptor from a table schema.
 */
export interface ColumnDescriptor {
  name: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Result of validating a KPI definition against a table's column list.
 */
export interface KpiValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that the `field` (and any filter fields) referenced by a KPI
 * definition actually exist in the provided columns array.
 *
 * @param kpi     - A `KpiDefinition` object (already Zod-parsed).
 * @param columns - Array of column descriptors for the target table.
 * @returns       `{ valid: true, errors: [] }` on success, or
 *                `{ valid: false, errors: [...] }` with descriptive messages.
 */
export function validateKpiDefinition(
  kpi: KpiDefinition,
  columns: ColumnDescriptor[]
): KpiValidationResult {
  const errors: string[] = [];
  const columnNames = new Set(columns.map((c) => c.name));

  // Verify the measure target field exists (not required for 'count', but still
  // validated because the caller must supply a meaningful field name).
  if (!columnNames.has(kpi.field)) {
    errors.push(`Field "${kpi.field}" does not exist in the table schema`);
  }

  // Verify each filter field exists
  if (Array.isArray(kpi.filters)) {
    for (const filter of kpi.filters) {
      if (!columnNames.has(filter.field)) {
        errors.push(`Filter field "${filter.field}" does not exist in the table schema`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
