import { z } from 'zod';
import { isValidDateOnly } from '../models/dates';

/**
 * aging.dto — contrato de entrada (query) do relatório de aging / posição por contraparte
 * (INCR-AGING), read-only.
 *
 * `kind` seleciona o subrazão (payable/receivable). `asOf` é a data-only da posição (default hoje —
 * OPCIONAL; quando ausente o service usa hoje). Quando fornecida, é validada com isValidDateOnly
 * (regex + round-trip de calendário, models/dates.ts), NUNCA um regex nu: `new Date('2026-02-30')`
 * rola silenciosamente para 03-02, o que deslocaria a data-base e distorceria toda faixa de atraso
 * (date-only-rendering-utc-shift-class-bug).
 *
 * `.strict()` rejeita chaves desconhecidas para que um param com typo falhe alto (400) em vez de ser
 * silenciosamente descartado (param-aceito-e-ignorado-e-bug).
 */

/** @openapi
 * components:
 *   schemas:
 *     AgingReportQueryInput:
 *       type: object
 *       required: [unitId, kind]
 *       properties:
 *         unitId: { type: string }
 *         kind:   { type: string, enum: [payable, receivable], description: "Subrazão: contas a pagar (payable) ou a receber (receivable)" }
 *         asOf:   { type: string, description: "Date-only YYYY-MM-DD — data da posição (default hoje). Vencido = dueDate < as_of" }
 */
export const AgingReportQuerySchema = z
  .object({
    unitId: z.string().min(1),
    kind: z.enum(['payable', 'receivable']),
    asOf: z
      .string()
      .refine(isValidDateOnly, 'asOf deve ser uma data real YYYY-MM-DD')
      .optional(),
  })
  .strict();

export type AgingReportQueryInput = z.infer<typeof AgingReportQuerySchema>;
