import { z } from 'zod';

/**
 * Zod DTO for year-end result closing (encerramento do exercício), BE-INCR-SPED-APURACAO.
 * `.strict()` rejects unknown keys. Only the fiscal year + unit are needed — the closing
 * entry is composed entirely from the ledger's pre-closing result balances (no amounts in
 * the request, no fabrication). Mirrors the accounting DTO style (unitId is the tenancy axis).
 */

/** @openapi
 * components:
 *   schemas:
 *     CloseExerciseInput:
 *       type: object
 *       required: [unitId, year]
 *       properties:
 *         unitId: { type: string }
 *         year:   { type: integer, minimum: 2000, maximum: 2100 }
 */
export const CloseExerciseSchema = z
  .object({
    unitId: z.string().min(1),
    year: z.number().int().min(2000).max(2100),
  })
  .strict();

export type CloseExerciseInput = z.infer<typeof CloseExerciseSchema>;
