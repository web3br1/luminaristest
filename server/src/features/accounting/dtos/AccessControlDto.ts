import { z } from 'zod';
import { PERMISSION_KEYS } from '../models/AccessControl.model';

/**
 * AccessControlDto — RBAC (LGPD Fatia A) request schemas. Role authoring + permission grants +
 * assignments. Every schema is `.strict()` so a typo'd field fails loud instead of being silently
 * dropped. RBAC carries NO money and NO dates — no MAX_CENTS / date-only concern here.
 *
 * `permissions` is validated against the closed PERMISSION_KEYS catalog via `z.enum` — an unknown key
 * fails the parse (closed set, never a silent accept).
 */

const permissionEnum = z.enum(PERMISSION_KEYS);

/** @openapi
 * components:
 *   schemas:
 *     CreateAccessRoleInput:
 *       type: object
 *       required: [unitId, code, name]
 *       properties:
 *         unitId:      { type: string }
 *         code:        { type: string, description: "Stable role key, e.g. APPROVER (unique per unit)" }
 *         name:        { type: string, description: "Display label, e.g. Aprovador" }
 *         permissions: { type: array, items: { type: string }, description: "Optional initial permission keys (catalog)" }
 */
export const CreateAccessRoleSchema = z
  .object({
    unitId: z.string().min(1),
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    permissions: z.array(permissionEnum).optional().default([]),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     SetRolePermissionsInput:
 *       type: object
 *       required: [unitId, permissions]
 *       properties:
 *         unitId:      { type: string }
 *         permissions: { type: array, items: { type: string }, description: "The FULL desired permission set (replaces the current set)" }
 */
export const SetRolePermissionsSchema = z
  .object({
    unitId: z.string().min(1),
    permissions: z.array(permissionEnum),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ArchiveAccessRoleInput:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 */
export const ArchiveAccessRoleSchema = z
  .object({
    unitId: z.string().min(1),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     AssignRoleInput:
 *       type: object
 *       required: [unitId, subjectUserId, roleId]
 *       properties:
 *         unitId:        { type: string }
 *         subjectUserId: { type: string, description: "The member being granted the role" }
 *         roleId:        { type: string }
 */
export const AssignRoleSchema = z
  .object({
    unitId: z.string().min(1),
    subjectUserId: z.string().min(1),
    roleId: z.string().min(1),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     RevokeAssignmentInput:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 */
export const RevokeAssignmentSchema = z
  .object({
    unitId: z.string().min(1),
  })
  .strict();

/** Query DTO for listing roles — unitId required; includeArchived optional. */
export const ListAccessRolesQuerySchema = z.object({
  unitId: z.string().min(1),
  includeArchived: z.coerce.boolean().optional().default(false),
});

/** Query DTO for listing assignments — unitId required; subjectUserId optional filter. */
export const ListAssignmentsQuerySchema = z.object({
  unitId: z.string().min(1),
  subjectUserId: z.string().min(1).optional(),
});

export type CreateAccessRoleInput = z.infer<typeof CreateAccessRoleSchema>;
export type SetRolePermissionsInput = z.infer<typeof SetRolePermissionsSchema>;
export type ArchiveAccessRoleInput = z.infer<typeof ArchiveAccessRoleSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
export type RevokeAssignmentInput = z.infer<typeof RevokeAssignmentSchema>;
export type ListAccessRolesQueryInput = z.infer<typeof ListAccessRolesQuerySchema>;
export type ListAssignmentsQueryInput = z.infer<typeof ListAssignmentsQuerySchema>;

/** Type guard for CreateAccessRoleInput. */
export function isCreateAccessRoleInput(obj: unknown): obj is CreateAccessRoleInput {
  return CreateAccessRoleSchema.safeParse(obj).success;
}
