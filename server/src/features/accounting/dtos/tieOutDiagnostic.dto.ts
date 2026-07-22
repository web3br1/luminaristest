import { z } from 'zod';

/**
 * tieOutDiagnostic.dto — contrato de entrada (query) do diagnóstico de tie-out
 * subrazão ↔ razão (FIX-TIEOUT, Council 1.3), read-only.
 *
 * Só `unitId`: a posição é SEMPRE a corrente. Um `asOf` seria aceito-e-ignorado no lado
 * do subrazão — `findOutstanding` lê o STATUS atual das linhas (OPEN/RECEIVING/PAYING) e
 * não tem semântica histórica — então oferecer o parâmetro criaria exatamente o bug de
 * classe param-aceito-e-ignorado-e-bug (metade do tie-out em asOf, metade em "agora").
 *
 * `.strict()` rejeita chaves desconhecidas para que um param com typo falhe alto (400)
 * em vez de ser silenciosamente descartado.
 */

/** @openapi
 * components:
 *   schemas:
 *     TieOutDiagnosticQueryInput:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 */
export const TieOutDiagnosticQuerySchema = z
  .object({
    unitId: z.string().min(1),
  })
  .strict();

export type TieOutDiagnosticQueryInput = z.infer<typeof TieOutDiagnosticQuerySchema>;
