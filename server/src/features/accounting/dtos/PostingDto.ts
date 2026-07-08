import { z } from 'zod';
import { MAX_CENTS } from '../models/money';
import { isValidDateOnly } from '../models/dates';

/**
 * PostingDto — double-entry posting engine inputs (Phase 2).
 *
 * Money is INTEGER CENTS (Contract §2.1): debitCents/creditCents are non-negative
 * integers. The balance invariant (Σdébito === Σcrédito) is enforced in the service
 * with EXACT integer equality (no float/epsilon), not here — the DTO only guarantees
 * each line is well-formed (exactly one side positive).
 */

/** @openapi
 * components:
 *   schemas:
 *     PostEntryLine:
 *       type: object
 *       required: [accountCode, debitCents, creditCents]
 *       properties:
 *         accountCode: { type: string, description: "Code of a leaf account (acceptsEntries=true)" }
 *         debitCents:  { type: integer, minimum: 0 }
 *         creditCents: { type: integer, minimum: 0 }
 *     PostEntryInput:
 *       type: object
 *       required: [date, description, lines]
 *       properties:
 *         date:        { type: string, description: "Date-only string YYYY-MM-DD (parsed as UTC midnight — no time component)" }
 *         description: { type: string }
 *         sourceType:  { type: string, default: manual }
 *         sourceId:    { type: string }
 *         sourceDocument:
 *           type: object
 *           description: "Optional origin descriptor (BE-INCR-8). When present, postEntry records a SourceDocument + JournalEntrySource in the same tx. Absent for manual/reversal. Does NOT affect idempotency (sourceId) — externalRef is the human document reference, separate from the dedup key (D6)."
 *           properties:
 *             externalRef:  { type: string, description: "Human document reference (NF nº X, boleto nº Y) — separate from sourceId/idempotency" }
 *             documentDate: { type: string, description: "Date-only YYYY-MM-DD of the source document, when distinct from the posting date" }
 *             description:  { type: string }
 *             attachmentId: { type: string, description: "DocumentAttachment id of the raw file (INCR-5), when any" }
 *             rawJson:      { type: string, description: "Optional JSON snapshot of the origin" }
 *         lines:
 *           type: array
 *           minItems: 2
 *           items: { $ref: '#/components/schemas/PostEntryLine' }
 */
export const PostEntryLineSchema = z
  .object({
    accountCode: z.string().min(1),
    // Cap at MAX_CENTS (Int32 storage ceiling, shared with the import validators —
    // ACC-HARDEN-POST-CENTS-001): Posting.debitCents/creditCents are Prisma `Int`, so a larger
    // value would pass the DTO but fail late at the repository as an opaque write error. Guard it
    // here so the manual /post path rejects it as a clear 400 before PostingService is called —
    // the same protection the import preview got (ACC-INCR6-J-001). This tighter bound also stays
    // well under 2^53-1, so the Σdébito===Σcrédito integer sum keeps exact precision (Contract §2.1).
    debitCents: z.number().int().min(0).max(MAX_CENTS, { message: `debitCents excede o limite suportado (máx ${MAX_CENTS}).` }),
    creditCents: z.number().int().min(0).max(MAX_CENTS, { message: `creditCents excede o limite suportado (máx ${MAX_CENTS}).` }),
  })
  .superRefine((line, ctx) => {
    // Each leg moves exactly one side: a debit OR a credit, never both, never neither.
    const debited = line.debitCents > 0;
    const credited = line.creditCents > 0;
    if (debited === credited) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cada partida deve ter exatamente um lado positivo (débito OU crédito).',
      });
    }
  });

export const PostEntrySchema = z.object({
  // unitId is the second tenancy axis (Contract §2): the security boundary is userId
  // (from auth), unitId is a user-owned sub-partition supplied by the request.
  unitId: z.string().min(1),
  // Date-only, no time component: fiscalYearFrom/extractYearMonth (PostingService) both
  // parse this as UTC midnight — a datetime string would let the local calendar date and
  // the UTC calendar date disagree, reintroducing the fiscal-year boundary bug this format
  // was tightened to close.
  // isValidDateOnly = regex + round-trip: JS Date rolls '2026-02-30' to 03-02, which
  // would silently shift the fiscal date (class-fix, see models/dates.ts).
  date: z.string().refine(isValidDateOnly, 'date deve ser uma data real YYYY-MM-DD'),
  description: z.string().min(1),
  sourceType: z.string().default('manual'),
  sourceId: z.string().optional(),
  // BE-INCR-8: optional origin descriptor. When present, postEntry creates a SourceDocument +
  // JournalEntrySource in the SAME tx (D5). Absent ⇒ no origin (manual/reversal). `.strict()`
  // rejects unknown descriptor keys so a typo'd field fails loud instead of being silently
  // dropped. externalRef is the human document reference, kept SEPARATE from sourceId (the
  // idempotency key) — this is the whole point of the seam (D6). documentDate is date-only.
  sourceDocument: z
    .object({
      externalRef: z.string().min(1).optional(),
      documentDate: z.string().refine(isValidDateOnly, 'documentDate deve ser uma data real YYYY-MM-DD').optional(),
      description: z.string().min(1).optional(),
      attachmentId: z.string().min(1).optional(),
      rawJson: z.string().optional(),
    })
    .strict()
    .optional(),
  lines: z.array(PostEntryLineSchema).min(2),
});

/** @openapi
 * components:
 *   schemas:
 *     ReverseEntryInput:
 *       type: object
 *       required: [lancamentoId, reversalPostingDate]
 *       properties:
 *         lancamentoId:        { type: string }
 *         reversalPostingDate: { type: string, description: "Date-only string YYYY-MM-DD for the reversal entry (and period gate)" }
 *         reason:              { type: string }
 */
export const ReverseEntrySchema = z.object({
  unitId: z.string().min(1),
  lancamentoId: z.string().min(1),
  reversalPostingDate: z.string().refine(isValidDateOnly, 'reversalPostingDate deve ser uma data real YYYY-MM-DD'),
  reason: z.string().optional(),
});

/** @openapi
 * components:
 *   schemas:
 *     ReportQueryInput:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 *         from:   { type: string, description: "ISO date string — inclusive lower bound" }
 *         to:     { type: string, description: "ISO date string — inclusive upper bound" }
 */
export const ReportQuerySchema = z.object({
  unitId: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Query DTO for list-accounts and list-entries endpoints — unitId required. */
export const ListAccountsQuerySchema = z.object({
  unitId: z.string().min(1),
});

/** Paginated query DTO for list-entries endpoint. */
export const ListEntriesQuerySchema = z.object({
  unitId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * DTO for creating a user-defined account (chart-of-accounts management).
 * `nature` matches the AccountNature union from the fixture/schema (string column).
 */
/** @openapi
 * components:
 *   schemas:
 *     CreateAccountInput:
 *       type: object
 *       required: [code, name, nature, unitId]
 *       properties:
 *         code:           { type: string }
 *         name:           { type: string }
 *         nature:         { type: string, enum: [Asset, Liability, Equity, Revenue, Expense] }
 *         acceptsEntries: { type: boolean, default: true }
 *         unitId:         { type: string }
 */
export const CreateAccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nature: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
  acceptsEntries: z.boolean().optional().default(true),
  unitId: z.string().min(1),
});

/**
 * Query DTO for delete-account. unitId is REQUIRED so the delete is unit-scoped like
 * every other accounting endpoint (Contract §2 tenancy): the account is looked up by
 * (ownerUserId + unitId + id), closing the cross-unit-by-id deletion gap.
 */
export const DeleteAccountQuerySchema = z.object({
  unitId: z.string().min(1),
});

export type PostEntryInput = z.infer<typeof PostEntrySchema>;
export type ReverseEntryInput = z.infer<typeof ReverseEntrySchema>;
export type ReportQueryInput = z.infer<typeof ReportQuerySchema>;
export type ListAccountsQueryInput = z.infer<typeof ListAccountsQuerySchema>;
export type ListEntriesQueryInput = z.infer<typeof ListEntriesQuerySchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type DeleteAccountQueryInput = z.infer<typeof DeleteAccountQuerySchema>;

/** Type guard for PostEntryInput. */
export function isPostEntryInput(obj: unknown): obj is PostEntryInput {
  return PostEntrySchema.safeParse(obj).success;
}

/** Type guard for ReverseEntryInput. */
export function isReverseEntryInput(obj: unknown): obj is ReverseEntryInput {
  return ReverseEntrySchema.safeParse(obj).success;
}

// ---------------------------------------------------------------------------
// Period management DTOs (INCR-1)
// ---------------------------------------------------------------------------

export const PeriodStatusEnum = z.enum(['FUTURE', 'OPEN', 'SOFT_CLOSED', 'HARD_CLOSED']);

/** @openapi
 * components:
 *   schemas:
 *     SeedYearInput:
 *       type: object
 *       required: [unitId, year]
 *       properties:
 *         unitId: { type: string }
 *         year:   { type: integer, minimum: 2000, maximum: 2100 }
 */
export const SeedYearSchema = z
  .object({
    unitId: z.string().min(1),
    year: z.number().int().min(2000).max(2100),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ClosePeriodInput:
 *       type: object
 *       required: [unitId, year, month]
 *       properties:
 *         unitId: { type: string }
 *         year:   { type: integer }
 *         month:  { type: integer, minimum: 1, maximum: 12 }
 *         reason: { type: string }
 */
export const ClosePeriodSchema = z
  .object({
    unitId: z.string().min(1),
    reason: z.string().optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ReopenPeriodInput:
 *       type: object
 *       required: [unitId, periodId]
 *       properties:
 *         unitId:   { type: string }
 *         periodId: { type: string }
 *         reason:   { type: string }
 */
export const ReopenPeriodSchema = z
  .object({
    unitId: z.string().min(1),
    periodId: z.string().min(1),
    reason: z.string().optional(),
  })
  .strict();

export type SeedYearInput = z.infer<typeof SeedYearSchema>;
export type ClosePeriodInput = z.infer<typeof ClosePeriodSchema>;
export type ReopenPeriodInput = z.infer<typeof ReopenPeriodSchema>;

// ---------------------------------------------------------------------------
// Financial statement DTOs (INCR-4)
// ---------------------------------------------------------------------------

/** Query DTO for GET /balance-sheet?unitId=&asOf=YYYY-MM-DD */
export const BalanceSheetQuerySchema = z.object({
  unitId: z.string().min(1),
  asOf: z.string().refine(isValidDateOnly, 'asOf deve ser uma data real YYYY-MM-DD'),
});

/** Query DTO for GET /income-statement?unitId=&asOf=YYYY-MM-DD */
export const IncomeStatementQuerySchema = z.object({
  unitId: z.string().min(1),
  asOf: z.string().refine(isValidDateOnly, 'asOf deve ser uma data real YYYY-MM-DD'),
});

export type BalanceSheetQueryInput = z.infer<typeof BalanceSheetQuerySchema>;
export type IncomeStatementQueryInput = z.infer<typeof IncomeStatementQuerySchema>;
