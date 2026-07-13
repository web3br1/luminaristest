import { z } from 'zod';
import { isValidDateOnly } from '../models/dates';

/**
 * cashFlowReport.dto — input contract for the DFC (Demonstração do Fluxo de Caixa,
 * método indireto), read-only report.
 *
 * Same period shape as BP/DRE (INCR-4): a single `asOf` date-only marker. The window
 * is year_to_date (1 Jan of asOf.year → asOf, inclusive), derived in the service — the
 * client never sends `from`. `asOf` is validated with isValidDateOnly (regex + calendar
 * round-trip, models/dates.ts), NEVER a bare regex: `new Date('2026-02-30')` silently
 * rolls to 03-02, which would shift the fiscal window and distort every dated figure.
 *
 * `.strict()` rejects unknown keys so a typo'd param fails loud (400) instead of being
 * silently dropped.
 */

/** @openapi
 * components:
 *   schemas:
 *     CashFlowStatementQueryInput:
 *       type: object
 *       required: [unitId, asOf]
 *       properties:
 *         unitId: { type: string }
 *         asOf:   { type: string, description: "Date-only YYYY-MM-DD — inclusive upper bound; window is 1 Jan of that year → asOf" }
 */
export const CashFlowStatementQuerySchema = z
  .object({
    unitId: z.string().min(1),
    asOf: z.string().refine(isValidDateOnly, 'asOf deve ser uma data real YYYY-MM-DD'),
  })
  .strict();

export type CashFlowStatementQueryInput = z.infer<typeof CashFlowStatementQuerySchema>;
