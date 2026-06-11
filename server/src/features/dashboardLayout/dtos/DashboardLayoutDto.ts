import { z } from 'zod';
import { IDashboardLayout, IDashboardLayoutSummary, LayoutType } from '../models/DashboardLayout.model';

/**
 * Schema base para DashboardLayout
 * @openapi
 * components:
 *   schemas:
 *     DashboardLayout:
 *       type: object
 *       required: [id, userId, name, type, config, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         userId: { type: string, format: cuid }
 *         name: { type: string, minLength: 3, maxLength: 50 }
 *         type: { type: string, enum: ['GRID', 'LIST', 'CUSTOM'] }
 *         config: { type: object }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const DashboardLayoutSchema = z.object({
  id: z.string().cuid({ message: 'dashboardLayout.validation.idInvalidCuid' }),
  userId: z.string().cuid({ message: 'dashboardLayout.validation.userIdInvalidCuid' }),
  name: z.string()
    .min(3, { message: 'dashboardLayout.validation.nameMinLength' })
    .max(50, { message: 'dashboardLayout.validation.nameMaxLength' }),
  type: z.nativeEnum(LayoutType, {
    message: 'dashboardLayout.validation.typeRequired',
  }),
  config: z.object({
    columns: z.number().min(1).max(12),
    widgets: z.array(z.string()),
    positions: z.array(z.object({
      id: z.string(),
      i: z.string(),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      minW: z.number().optional(),
      minH: z.number().optional(),
      type: z.string(),
      widgetConfig: z.any().optional()
    })).optional(),
    theme: z.string().optional(),
    customSettings: z.record(z.string(), z.unknown()).optional()
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Schema para criação de layout
 * @openapi
 * components:
 *   schemas:
 *     CreateDashboardLayout:
 *       type: object
 *       required: [name, type, config]
 *       properties:
 *         name: { type: string, minLength: 3, maxLength: 50 }
 *         type: { type: string, enum: ['GRID', 'LIST', 'CUSTOM'] }
 *         config: { type: object }
 */
export const CreateDashboardLayoutSchema = z.object({
  name: z.string()
    .min(3, { message: 'dashboardLayout.validation.nameMinLength' })
    .max(50, { message: 'dashboardLayout.validation.nameMaxLength' }),
  type: z.nativeEnum(LayoutType, {
    message: 'dashboardLayout.validation.typeRequired',
  }),
  config: z.object({
    columns: z.number().min(1).max(12),
    widgets: z.array(z.string()),
    positions: z.array(z.object({
      id: z.string(),
      i: z.string(),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      minW: z.number().optional(),
      minH: z.number().optional(),
      type: z.string(),
      widgetConfig: z.any().optional()
    })).optional(),
    theme: z.string().optional(),
    customSettings: z.record(z.string(), z.unknown()).optional()
  })
});

/**
 * Schema para atualização de layout
 * @openapi
 * components:
 *   schemas:
 *     UpdateDashboardLayout:
 *       type: object
 *       properties:
 *         name: { type: string, minLength: 3, maxLength: 50 }
 *         type: { type: string, enum: ['GRID', 'LIST', 'CUSTOM'] }
 *         config: { type: object }
 */
export const UpdateDashboardLayoutSchema = CreateDashboardLayoutSchema.partial();

/**
 * Schema para resumo de layout (usado em listagens)
 * @openapi
 * components:
 *   schemas:
 *     DashboardLayoutSummary:
 *       type: object
 *       required: [id, userId, name, type, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         userId: { type: string, format: cuid }
 *         name: { type: string }
 *         type: { type: string, enum: ['GRID', 'LIST', 'CUSTOM'] }
 *         updatedAt: { type: string, format: date-time }
 */
export const DashboardLayoutSummarySchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  name: z.string(),
  type: z.nativeEnum(LayoutType),
  updatedAt: z.date(),
});

// Types derivados dos schemas
export type DashboardLayoutDto = z.infer<typeof DashboardLayoutSchema>;
export type CreateDashboardLayoutDto = z.infer<typeof CreateDashboardLayoutSchema>;
export type UpdateDashboardLayoutDto = z.infer<typeof UpdateDashboardLayoutSchema>;
export type DashboardLayoutSummaryDto = z.infer<typeof DashboardLayoutSummarySchema>;

/**
 * Type guard para DashboardLayoutDto
 * @param obj - Objeto a ser verificado
 * @returns True se o objeto é um DashboardLayoutDto válido
 */
export function isDashboardLayoutDto(obj: unknown): obj is DashboardLayoutDto {
  return DashboardLayoutSchema.safeParse(obj).success;
}

/**
 * Type guard para CreateDashboardLayoutDto
 * @param obj - Objeto a ser verificado
 * @returns True se o objeto é um CreateDashboardLayoutDto válido
 */
export function isCreateDashboardLayoutDto(obj: unknown): obj is CreateDashboardLayoutDto {
  return CreateDashboardLayoutSchema.safeParse(obj).success;
}

/**
 * Type guard para UpdateDashboardLayoutDto
 * @param obj - Objeto a ser verificado
 * @returns True se o objeto é um UpdateDashboardLayoutDto válido
 */
export function isUpdateDashboardLayoutDto(obj: unknown): obj is UpdateDashboardLayoutDto {
  return UpdateDashboardLayoutSchema.safeParse(obj).success;
}

/**
 * Type guard para DashboardLayoutSummaryDto
 * @param obj - Objeto a ser verificado
 * @returns True se o objeto é um DashboardLayoutSummaryDto válido
 */
export function isDashboardLayoutSummaryDto(obj: unknown): obj is DashboardLayoutSummaryDto {
  return DashboardLayoutSummarySchema.safeParse(obj).success;
} 