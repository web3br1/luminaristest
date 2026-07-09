import { z } from 'zod';

/**
 * ReferentialMappingDto — versioned chart-of-accounts → RFB referential mapping
 * inputs (BE-INCR-9 / ADR-INCR9).
 *
 * Operation-style DTOs (like ReconciliationDto/PostingDto — no Create/Update CRUD
 * pair): the mapping is written by set/unset only. `.strict()` on every object so
 * an unknown field is a 400, never silently dropped. `referentialCode`/`label` are
 * free strings (no official RFB catalog in the MVP — D6); `mappingVersion` is a
 * free string, the calendar-year layout axis (D1) — NOT an enum.
 */

// cuid charset (alphanumerics, underscore, hyphen) — same guard as ReconciliationDto.
const idLike = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

/** Trimmed, non-empty, bounded free-text (referentialCode, label, mappingVersion). */
const shortText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

/**
 * Set (upsert) a referential mapping for one leaf account in one version.
 *
 * @openapi
 * components:
 *   schemas:
 *     SetReferentialMapping:
 *       type: object
 *       required: [unitId, accountId, referentialCode, label, mappingVersion]
 *       properties:
 *         unitId: { type: string, minLength: 1 }
 *         accountId: { type: string, description: leaf account id (accounts.id) }
 *         referentialCode: { type: string, description: RFB referential account code }
 *         label: { type: string, description: referential account name (denormalized snapshot) }
 *         mappingVersion: { type: string, description: calendar-year layout id, e.g. "2025" }
 */
export const SetReferentialMappingSchema = z
  .object({
    unitId: idLike,
    accountId: idLike,
    referentialCode: shortText(60),
    label: shortText(255),
    mappingVersion: shortText(32),
  })
  .strict();
export type SetReferentialMappingDto = z.infer<typeof SetReferentialMappingSchema>;
export function isSetReferentialMappingInput(v: unknown): v is SetReferentialMappingDto {
  return SetReferentialMappingSchema.safeParse(v).success;
}

/**
 * Unset (hard-delete) the mapping of one account in one version.
 *
 * @openapi
 * components:
 *   schemas:
 *     UnsetReferentialMapping:
 *       type: object
 *       required: [unitId, accountId, mappingVersion]
 *       properties:
 *         unitId: { type: string }
 *         accountId: { type: string }
 *         mappingVersion: { type: string }
 */
export const UnsetReferentialMappingSchema = z
  .object({
    unitId: idLike,
    accountId: idLike,
    mappingVersion: shortText(32),
  })
  .strict();
export type UnsetReferentialMappingDto = z.infer<typeof UnsetReferentialMappingSchema>;
export function isUnsetReferentialMappingInput(v: unknown): v is UnsetReferentialMappingDto {
  return UnsetReferentialMappingSchema.safeParse(v).success;
}

/**
 * Query for listing a version's mappings, or the coverage diagnostic of a version.
 *
 * @openapi
 * components:
 *   schemas:
 *     ReferentialVersionQuery:
 *       type: object
 *       required: [unitId, version]
 *       properties:
 *         unitId: { type: string }
 *         version: { type: string, description: mappingVersion, e.g. "2025" }
 */
export const ReferentialVersionQuerySchema = z
  .object({
    unitId: idLike,
    version: shortText(32),
  })
  .strict();
export type ReferentialVersionQueryDto = z.infer<typeof ReferentialVersionQuerySchema>;
export function isReferentialVersionQueryInput(v: unknown): v is ReferentialVersionQueryDto {
  return ReferentialVersionQuerySchema.safeParse(v).success;
}
