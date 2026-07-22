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
 * Query for listing a version's mappings, the coverage diagnostic, or the authoring
 * SKELETON (BE-INCR-9B Track A). The skeleton reuses this exact query shape — it is
 * `coverage().unmappedAccounts` re-exposed as an authoring payload, chart-driven (D5).
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

/**
 * One (accountId → referentialCode/label) pair inside a batch authoring request
 * (BE-INCR-9B Track A). `referentialCode`/`label` are the HUMAN-supplied values (the
 * accountant/official layout — D1/D10: code is NEVER invented by the product); the
 * account-liveness + leaf gate is re-checked per item INSIDE the tx (ACC-011).
 */
const BatchReferentialMappingItemSchema = z
  .object({
    accountId: idLike,
    referentialCode: shortText(60),
    label: shortText(255),
  })
  .strict();

/**
 * Batch (upsert) referential mappings for many leaf accounts in ONE version, applied
 * atomically (all-or-nothing, D8). `mappingVersion` is shared by every item; each item
 * carries its own account + human-supplied code/label. Duplicate accountId within the
 * batch is rejected so the atomic write has no ambiguous last-wins.
 *
 * @openapi
 * components:
 *   schemas:
 *     BatchSetReferentialMapping:
 *       type: object
 *       required: [unitId, mappingVersion, items]
 *       properties:
 *         unitId: { type: string, minLength: 1 }
 *         mappingVersion: { type: string, description: calendar-year layout id, e.g. "2025" }
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             type: object
 *             required: [accountId, referentialCode, label]
 *             properties:
 *               accountId: { type: string, description: leaf account id (accounts.id) }
 *               referentialCode: { type: string, description: RFB referential account code (human-supplied) }
 *               label: { type: string, description: referential account name (denormalized snapshot) }
 */
export const BatchSetReferentialMappingSchema = z
  .object({
    unitId: idLike,
    mappingVersion: shortText(32),
    items: z.array(BatchReferentialMappingItemSchema).min(1).max(1000),
  })
  .strict()
  .refine(
    (d) => new Set(d.items.map((i) => i.accountId)).size === d.items.length,
    { message: 'accountId duplicado no lote', path: ['items'] },
  );
export type BatchSetReferentialMappingDto = z.infer<typeof BatchSetReferentialMappingSchema>;
export function isBatchSetReferentialMappingInput(
  v: unknown,
): v is BatchSetReferentialMappingDto {
  return BatchSetReferentialMappingSchema.safeParse(v).success;
}

/**
 * Copy every mapping of `fromVersion` into `toVersion` (BE-INCR-9B Track A — "year
 * inheritance", D6). Pure reuse of the per-item set gate in one tx; `label` is
 * re-snapshotted (copied literally in Track A, since the catalog is Track B — D9).
 * `fromVersion` must differ from `toVersion` (a same-version copy is a no-op error).
 *
 * @openapi
 * components:
 *   schemas:
 *     CopyReferentialMapping:
 *       type: object
 *       required: [unitId, fromVersion, toVersion]
 *       properties:
 *         unitId: { type: string, minLength: 1 }
 *         fromVersion: { type: string, description: source mappingVersion, e.g. "2025" }
 *         toVersion: { type: string, description: destination mappingVersion, e.g. "2026" }
 */
export const CopyReferentialMappingSchema = z
  .object({
    unitId: idLike,
    fromVersion: shortText(32),
    toVersion: shortText(32),
  })
  .strict()
  .refine((d) => d.fromVersion !== d.toVersion, {
    message: 'fromVersion e toVersion devem ser diferentes',
    path: ['toVersion'],
  });
export type CopyReferentialMappingDto = z.infer<typeof CopyReferentialMappingSchema>;
export function isCopyReferentialMappingInput(v: unknown): v is CopyReferentialMappingDto {
  return CopyReferentialMappingSchema.safeParse(v).success;
}
