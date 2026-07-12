import { z } from 'zod';
import { isValidDateOnly } from '../models/dates';

/**
 * PeriodComparisonDto — inputs for the comparative trial balance / monthly variation
 * report (read-only, no persisted entity). Operation-style DTO (no Create/Update CRUD
 * pair): the report writes nothing, it only reads two as-of balance snapshots.
 *
 * Both boundaries are date-only (YYYY-MM-DD) validated via the canonical
 * models/dates.ts::isValidDateOnly round-trip — a regex alone lets an invalid
 * calendar date (e.g. 2026-02-30) roll forward silently and distort the window.
 * Each is transformed to UTC midnight, matching the as-of semantics the report
 * service and balanceSheet already use (entry.date <= asOf, inclusive).
 *
 * `.strict()` rejects unknown keys so a typo'd/extra query field surfaces as a 400
 * instead of being silently accepted-and-ignored.
 */

/** Date-only (YYYY-MM-DD) → UTC midnight; same tightening as PostingDto/ReconciliationDto. */
const dateOnly = z
  .string()
  .refine(isValidDateOnly, 'data deve ser uma data real YYYY-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

/**
 * @openapi
 * components:
 *   schemas:
 *     PeriodComparisonQuery:
 *       type: object
 *       required: [asOfCurrent, asOfPrevious]
 *       properties:
 *         asOfCurrent: { type: string, format: date, description: as-of date of the current period }
 *         asOfPrevious: { type: string, format: date, description: as-of date of the comparison period }
 */
export const PeriodComparisonSchema = z
  .object({
    asOfCurrent: dateOnly,
    asOfPrevious: dateOnly,
  })
  .strict();

export type PeriodComparisonDto = z.infer<typeof PeriodComparisonSchema>;

export function isPeriodComparisonInput(v: unknown): v is PeriodComparisonDto {
  return PeriodComparisonSchema.safeParse(v).success;
}
