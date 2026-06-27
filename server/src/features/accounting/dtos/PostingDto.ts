import { z } from 'zod';

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
 *         date:        { type: string, description: "ISO date/datetime string" }
 *         description: { type: string }
 *         sourceType:  { type: string, default: manual }
 *         sourceId:    { type: string }
 *         lines:
 *           type: array
 *           minItems: 2
 *           items: { $ref: '#/components/schemas/PostEntryLine' }
 */
export const PostEntryLineSchema = z
  .object({
    accountCode: z.string().min(1),
    // Cap at MAX_SAFE_INTEGER: the balance invariant (Σdébito === Σcrédito) is summed with
    // integer +, which silently loses precision past 2^53-1 cents (~R$90 tri) — the one place
    // float-style imprecision could re-enter the exact-integer money path (Contract §2.1).
    debitCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    creditCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
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
  date: z.string().min(1),
  description: z.string().min(1),
  sourceType: z.string().default('manual'),
  sourceId: z.string().optional(),
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
 *         reversalPostingDate: { type: string, description: "ISO date for the reversal entry (and period gate)" }
 *         reason:              { type: string }
 */
export const ReverseEntrySchema = z.object({
  unitId: z.string().min(1),
  lancamentoId: z.string().min(1),
  reversalPostingDate: z.string().min(1),
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
