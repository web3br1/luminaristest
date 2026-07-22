import { z } from 'zod';

/**
 * Boundary (Zod) schemas for the analytics query endpoints.
 * The controller validates `req.query` against these before calling the engine,
 * keeping HTTP parsing/validation at the boundary (per ARCHITECTURE.md §9.3).
 */

// `key` identifies the chart; remaining query keys are forwarded to the resolver as params.
export const ChartDataQuerySchema = z.object({
  key: z.string().trim().min(1, { message: 'Chart key is required.' }),
}).passthrough();
export type ChartDataQuery = z.infer<typeof ChartDataQuerySchema>;

export const ChartDetailsQuerySchema = z.object({
  dataPointName: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ChartDetailsQuery = z.infer<typeof ChartDetailsQuerySchema>;

export const DrillDownQuerySchema = z.object({
  tableId: z.string().trim().min(1, { message: 'Table ID is required.' }),
  recordIds: z.string().optional().default(''),
  fields: z.string().optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});
export type DrillDownQuery = z.infer<typeof DrillDownQuerySchema>;
