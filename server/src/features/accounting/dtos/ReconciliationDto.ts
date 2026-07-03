import { z } from 'zod';
import { MAX_CENTS } from '../models/money';

/**
 * ReconciliationDto — bank reconciliation inputs (BE-INCR-7 / ADR-INCR7).
 *
 * Operation-style DTOs (like PostingDto/DataExchangeDto — no Create/Update CRUD
 * pair; the module's entities are written by the import/match flows only).
 * Money is INTEGER CENTS (ACC-014): control totals are bounded by MAX_CENTS in
 * BOTH directions (a closing balance can be negative — overdraft). Line amounts
 * are parsed server-side from the file, never accepted from the client.
 */

// cuid charset (alphanumerics, underscore, hyphen) — same guard as DocumentAttachmentDto.
const idLike = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

/** Signed control-total in cents, bounded by the Int32 storage ceiling (ACC-014). */
const signedCents = z.coerce
  .number()
  .int()
  .min(-MAX_CENTS, { message: `valor excede o limite suportado (mín -${MAX_CENTS}).` })
  .max(MAX_CENTS, { message: `valor excede o limite suportado (máx ${MAX_CENTS}).` });

/**
 * Body of a multipart statement import (the file itself is handled server-side;
 * sha256/lines are derived — never accepted from the client). Multipart fields
 * arrive as strings, hence z.coerce on dates/numbers.
 *
 * @openapi
 * components:
 *   schemas:
 *     ImportBankStatement:
 *       type: object
 *       required: [unitId, glAccountId, periodStart, periodEnd]
 *       properties:
 *         unitId: { type: string, minLength: 1 }
 *         glAccountId: { type: string, description: bank GL account id (accounts.id) }
 *         statementRef: { type: string, nullable: true }
 *         periodStart: { type: string, format: date }
 *         periodEnd: { type: string, format: date }
 *         openingBalanceCents: { type: integer, nullable: true }
 *         closingBalanceCents: { type: integer, nullable: true }
 *         file: { type: string, format: binary }
 */
export const ImportBankStatementSchema = z
  .object({
    unitId: idLike,
    glAccountId: idLike,
    statementRef: z.string().min(1).max(120).optional(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    openingBalanceCents: signedCents.optional(),
    closingBalanceCents: signedCents.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.periodEnd < body.periodStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['periodEnd'],
        message: 'periodEnd deve ser >= periodStart.',
      });
    }
  });
export type ImportBankStatementDto = z.infer<typeof ImportBankStatementSchema>;
export function isImportBankStatementInput(v: unknown): v is ImportBankStatementDto {
  return ImportBankStatementSchema.safeParse(v).success;
}

/**
 * Runs the deterministic auto-match over a statement's UNMATCHED lines (D6).
 *
 * @openapi
 * components:
 *   schemas:
 *     AutoMatchStatement:
 *       type: object
 *       required: [unitId, statementId]
 *       properties:
 *         unitId: { type: string }
 *         statementId: { type: string }
 */
export const AutoMatchStatementSchema = z.object({
  unitId: idLike,
  statementId: idLike,
});
export type AutoMatchStatementDto = z.infer<typeof AutoMatchStatementSchema>;
export function isAutoMatchStatementInput(v: unknown): v is AutoMatchStatementDto {
  return AutoMatchStatementSchema.safeParse(v).success;
}

/**
 * Manual match: links ONE statement line to N postings (D3 aggregation —
 * N postings <-> 1 line; the split 1 posting <-> N lines is deferred).
 *
 * @openapi
 * components:
 *   schemas:
 *     ManualMatch:
 *       type: object
 *       required: [unitId, statementLineId, postingIds]
 *       properties:
 *         unitId: { type: string }
 *         statementLineId: { type: string }
 *         postingIds:
 *           type: array
 *           minItems: 1
 *           maxItems: 50
 *           items: { type: string }
 */
export const ManualMatchSchema = z.object({
  unitId: idLike,
  statementLineId: idLike,
  // ponytail: 50 legs per line is far above any real aggregation; raise if a case appears
  postingIds: z.array(idLike).min(1).max(50),
});
export type ManualMatchDto = z.infer<typeof ManualMatchSchema>;
export function isManualMatchInput(v: unknown): v is ManualMatchDto {
  return ManualMatchSchema.safeParse(v).success;
}

/**
 * Soft-undo of an active match (D7) — the link row is preserved.
 *
 * @openapi
 * components:
 *   schemas:
 *     UnmatchReconciliation:
 *       type: object
 *       required: [unitId, matchId]
 *       properties:
 *         unitId: { type: string }
 *         matchId: { type: string }
 *         reason: { type: string, nullable: true }
 */
export const UnmatchSchema = z.object({
  unitId: idLike,
  matchId: idLike,
  reason: z.string().min(1).max(500).optional(),
});
export type UnmatchDto = z.infer<typeof UnmatchSchema>;
export function isUnmatchInput(v: unknown): v is UnmatchDto {
  return UnmatchSchema.safeParse(v).success;
}

/**
 * Marks/unmarks a line as IGNORED (e.g. a bank fee that will be posted as a
 * new entry via /post — outside the reconciliation engine).
 *
 * @openapi
 * components:
 *   schemas:
 *     SetLineIgnored:
 *       type: object
 *       required: [unitId, statementLineId, ignored]
 *       properties:
 *         unitId: { type: string }
 *         statementLineId: { type: string }
 *         ignored: { type: boolean }
 */
export const SetLineIgnoredSchema = z.object({
  unitId: idLike,
  statementLineId: idLike,
  ignored: z.coerce.boolean(),
});
export type SetLineIgnoredDto = z.infer<typeof SetLineIgnoredSchema>;
export function isSetLineIgnoredInput(v: unknown): v is SetLineIgnoredDto {
  return SetLineIgnoredSchema.safeParse(v).success;
}

/** Query for listing statements (paginated). */
export const ListStatementsQuerySchema = z.object({
  unitId: idLike,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListStatementsQueryDto = z.infer<typeof ListStatementsQuerySchema>;

/** Query for listing the lines of a statement (optional status filter). */
export const ListLinesQuerySchema = z.object({
  unitId: idLike,
  status: z.enum(['UNMATCHED', 'MATCHED', 'IGNORED']).optional(),
});
export type ListLinesQueryDto = z.infer<typeof ListLinesQuerySchema>;

/** Scope-only query (suggestions of a line, statement by id — id comes from the path). */
export const ReconciliationScopeQuerySchema = z.object({
  unitId: idLike,
});
export type ReconciliationScopeQueryDto = z.infer<typeof ReconciliationScopeQuerySchema>;

/**
 * Query of the pending report (§4.5): UNMATCHED lines + bank postings with no
 * active match, as-of (ACC-021), optionally windowed.
 *
 * @openapi
 * components:
 *   schemas:
 *     ReconciliationPendingQuery:
 *       type: object
 *       required: [unitId, glAccountId]
 *       properties:
 *         unitId: { type: string }
 *         glAccountId: { type: string }
 *         from: { type: string, format: date, nullable: true }
 *         to: { type: string, format: date, nullable: true }
 */
export const PendingReportQuerySchema = z
  .object({
    unitId: idLike,
    glAccountId: idLike,
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .superRefine((query, ctx) => {
    if (query.from && query.to && query.to < query.from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: "'to' deve ser >= 'from'." });
    }
  });
export type PendingReportQueryDto = z.infer<typeof PendingReportQuerySchema>;
