import { z } from 'zod';
import { LayoutType } from '../models/DashboardLayout.model';

/**
 * Base schema for DashboardLayout
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
  isActive: z.boolean(),
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
 * Schema for creating a layout
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
 * Schema for updating a layout
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

// Types derived from schemas
export type DashboardLayoutDto = z.infer<typeof DashboardLayoutSchema>;
export type CreateDashboardLayoutDto = z.infer<typeof CreateDashboardLayoutSchema>;
export type UpdateDashboardLayoutDto = z.infer<typeof UpdateDashboardLayoutSchema>; 