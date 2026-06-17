import { z } from 'zod';

/**
 * Saved view config schema — no z.any(). fieldFilters is a string→string map;
 * sortConfig is a {field,direction} object that may be explicitly null.
 * @openapi
 * components:
 *   schemas:
 *     SavedTableViewConfig:
 *       type: object
 *       properties:
 *         query: { type: string }
 *         fieldFilters:
 *           type: object
 *           additionalProperties: { type: string }
 *         sortConfig:
 *           nullable: true
 *           type: object
 *           required: [field, direction]
 *           properties:
 *             field: { type: string }
 *             direction: { type: string, enum: ['asc', 'desc'] }
 */
export const SavedTableViewConfigSchema = z.object({
  query: z.string().optional(),
  fieldFilters: z.record(z.string(), z.string()).optional(),
  sortConfig: z
    .object({
      field: z.string(),
      direction: z.enum(['asc', 'desc']),
    })
    .nullable()
    .optional(),
});

/**
 * Schema for creating a saved table view.
 * @openapi
 * components:
 *   schemas:
 *     CreateSavedTableView:
 *       type: object
 *       required: [tableId, name, config]
 *       properties:
 *         tableId: { type: string, minLength: 1 }
 *         name: { type: string, minLength: 1, maxLength: 120 }
 *         config: { $ref: '#/components/schemas/SavedTableViewConfig' }
 */
export const CreateSavedTableViewSchema = z.object({
  tableId: z.string().min(1, { message: 'savedView.validation.tableIdRequired' }),
  name: z
    .string()
    .min(1, { message: 'savedView.validation.nameRequired' })
    .max(120, { message: 'savedView.validation.nameMaxLength' }),
  config: SavedTableViewConfigSchema,
});

/**
 * Schema for partially updating a saved table view.
 * @openapi
 * components:
 *   schemas:
 *     UpdateSavedTableView:
 *       type: object
 *       properties:
 *         tableId: { type: string, minLength: 1 }
 *         name: { type: string, minLength: 1, maxLength: 120 }
 *         config: { $ref: '#/components/schemas/SavedTableViewConfig' }
 */
export const UpdateSavedTableViewSchema = CreateSavedTableViewSchema.partial();

/**
 * Response schema for a saved table view.
 * @openapi
 * components:
 *   schemas:
 *     SavedTableView:
 *       type: object
 *       required: [id, userId, tableId, name, config, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         userId: { type: string, format: cuid }
 *         tableId: { type: string }
 *         name: { type: string }
 *         config: { $ref: '#/components/schemas/SavedTableViewConfig' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const SavedTableViewSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  tableId: z.string(),
  name: z.string(),
  config: SavedTableViewConfigSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Types derived from schemas
export type SavedTableViewConfigDto = z.infer<typeof SavedTableViewConfigSchema>;
export type CreateSavedTableViewDto = z.infer<typeof CreateSavedTableViewSchema>;
export type UpdateSavedTableViewDto = z.infer<typeof UpdateSavedTableViewSchema>;
export type SavedTableViewDto = z.infer<typeof SavedTableViewSchema>;

/** Type guard for CreateSavedTableViewDto. */
export function isCreateSavedTableViewDto(obj: unknown): obj is CreateSavedTableViewDto {
  return CreateSavedTableViewSchema.safeParse(obj).success;
}

/** Type guard for UpdateSavedTableViewDto. */
export function isUpdateSavedTableViewDto(obj: unknown): obj is UpdateSavedTableViewDto {
  return UpdateSavedTableViewSchema.safeParse(obj).success;
}

/** Type guard for SavedTableViewDto. */
export function isSavedTableViewDto(obj: unknown): obj is SavedTableViewDto {
  return SavedTableViewSchema.safeParse(obj).success;
}
