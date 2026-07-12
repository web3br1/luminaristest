import { z } from 'zod';

/**
 * ReferentialCatalogDto — RFB referential CATALOG import + lookup inputs (BE-INCR-9B / ADR-INCR9B,
 * Track B). The catalog is GLOBAL reference data (no tenancy — D4); `unitId` here is used ONLY to
 * resolve the AccountingScope for the authorization check (canManage/ReadReferential), never as
 * tenancy of the written rows. `layoutVersion` is a free string (the layout/year the human is
 * importing — D7), NOT an enum. The catalog FILE itself arrives as multipart (field `file`), so it
 * is not part of these body/query schemas. `.strict()` everywhere → an unknown field is a 400.
 */

const idLike = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');
const shortText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Import the official RFB referential layout for one version. The file (CSV/XLSX) is uploaded as
 * multipart `file`; the body carries the target `layoutVersion` and the auth `unitId`.
 *
 * @openapi
 * components:
 *   schemas:
 *     ImportReferentialCatalog:
 *       type: object
 *       required: [unitId, layoutVersion]
 *       properties:
 *         unitId: { type: string, minLength: 1, description: auth scope only (catalog is global) }
 *         layoutVersion: { type: string, description: RFB layout/year id, e.g. "2025" }
 */
export const ImportReferentialCatalogSchema = z
  .object({
    unitId: idLike,
    layoutVersion: shortText(32),
  })
  .strict();
export type ImportReferentialCatalogDto = z.infer<typeof ImportReferentialCatalogSchema>;
export function isImportReferentialCatalogInput(v: unknown): v is ImportReferentialCatalogDto {
  return ImportReferentialCatalogSchema.safeParse(v).success;
}

/**
 * Lookup/picker query over one version's catalog (the analytic-code picker for the mapping UI —
 * D3/D10). `q` filters code/name; `analyticOnly` restricts to valid mapping destinations.
 *
 * @openapi
 * components:
 *   schemas:
 *     ReferentialCatalogQuery:
 *       type: object
 *       required: [unitId, version]
 *       properties:
 *         unitId: { type: string, description: auth scope only (catalog is global) }
 *         version: { type: string, description: layoutVersion, e.g. "2025" }
 *         q: { type: string, description: substring filter on code or name }
 *         analyticOnly: { type: boolean, description: only analytic (leaf) destinations }
 */
export const ReferentialCatalogQuerySchema = z
  .object({
    unitId: idLike,
    version: shortText(32),
    q: z.string().trim().max(120).optional(),
    // query strings arrive as text — coerce "true"/"false" to boolean.
    analyticOnly: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((v) => v === true || v === 'true'),
  })
  .strict();
export type ReferentialCatalogQueryDto = z.infer<typeof ReferentialCatalogQuerySchema>;
export function isReferentialCatalogQueryInput(v: unknown): v is ReferentialCatalogQueryDto {
  return ReferentialCatalogQuerySchema.safeParse(v).success;
}
