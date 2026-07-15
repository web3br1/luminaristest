import { z } from 'zod';

/**
 * DimensionDto — Dimensões (INCR-DIM) request schemas. Catalog management (definitions + values) and
 * the report-query shapes. Every schema is `.strict()` so a typo'd field fails loud instead of being
 * silently dropped. A dimension carries NO money and NO dates — it is a classification label, so there
 * is no MAX_CENTS / date-only concern here (ACC-024: the tag is not a ledger value).
 *
 * `code` is a stable machine key (uppercase-ish, no spaces enforced softly by min-length only — the
 * uniqueness is `[userId,unitId,code]` for a definition, `[...,definitionId,code]` for a value).
 */

/** @openapi
 * components:
 *   schemas:
 *     CreateDimensionDefinitionInput:
 *       type: object
 *       required: [unitId, code, name]
 *       properties:
 *         unitId: { type: string }
 *         code:   { type: string, description: "Stable axis key, e.g. COST_CENTER | PROJECT (unique per unit)" }
 *         name:   { type: string, description: "Display label, e.g. Centro de Custo" }
 */
export const CreateDimensionDefinitionSchema = z
  .object({
    unitId: z.string().min(1),
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     CreateDimensionValueInput:
 *       type: object
 *       required: [unitId, definitionId, code, name]
 *       properties:
 *         unitId:       { type: string }
 *         definitionId: { type: string, description: "The axis this value belongs to" }
 *         code:         { type: string, description: "Stable value key within the axis, unique per axis" }
 *         name:         { type: string, description: "Display label, e.g. Loja Centro" }
 *         parentId:     { type: string, description: "Optional rollup parent — MUST belong to the same axis (ACC-026)" }
 */
export const CreateDimensionValueSchema = z
  .object({
    unitId: z.string().min(1),
    definitionId: z.string().min(1),
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    parentId: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ArchiveDimensionInput:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 */
export const ArchiveDimensionSchema = z
  .object({
    unitId: z.string().min(1),
  })
  .strict();

/** Query DTO for listing the catalog — unitId required; includeArchived optional. */
export const ListDimensionsQuerySchema = z.object({
  unitId: z.string().min(1),
  includeArchived: z.coerce.boolean().optional().default(false),
});

/** @openapi
 * components:
 *   schemas:
 *     DimensionReportQuery:
 *       type: object
 *       required: [unitId, definitionId]
 *       properties:
 *         unitId:       { type: string }
 *         definitionId: { type: string, description: "The dimension axis to slice by" }
 *         from:         { type: string, description: "ISO date — inclusive lower bound on the entry date" }
 *         to:           { type: string, description: "ISO date — inclusive upper bound on the entry date" }
 */
export const DimensionReportQuerySchema = z.object({
  unitId: z.string().min(1),
  definitionId: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type DimensionReportQueryInput = z.infer<typeof DimensionReportQuerySchema>;

export type CreateDimensionDefinitionInput = z.infer<typeof CreateDimensionDefinitionSchema>;
export type CreateDimensionValueInput = z.infer<typeof CreateDimensionValueSchema>;
export type ArchiveDimensionInput = z.infer<typeof ArchiveDimensionSchema>;
export type ListDimensionsQueryInput = z.infer<typeof ListDimensionsQuerySchema>;

/** Type guard for CreateDimensionDefinitionInput. */
export function isCreateDimensionDefinitionInput(obj: unknown): obj is CreateDimensionDefinitionInput {
  return CreateDimensionDefinitionSchema.safeParse(obj).success;
}
