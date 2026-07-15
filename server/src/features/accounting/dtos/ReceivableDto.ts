import { z } from 'zod';
import { MAX_CENTS } from '../models/money';
import { isValidDateOnly } from '../models/dates';
import { RECEIPT_METHODS } from '../models/Receivable.model';

/**
 * ReceivableDto — Contas a Receber (INCR-AR) request schemas. MIRROR of PayableDto. Money is INTEGER
 * CENTS guarded by `MAX_CENTS` (ACC-014); dates are date-only validated by `isValidDateOnly`
 * (regex + round-trip — class-fix `date-only-regex-nao-valida-calendario`). Every schema is
 * `.strict()` so a typo'd field fails loud instead of being silently dropped.
 */

const cents = z
  .number()
  .int()
  .positive()
  .max(MAX_CENTS, { message: `amountCents excede o limite suportado (máx ${MAX_CENTS}).` });

const dateOnly = (field: string) =>
  z.string().refine(isValidDateOnly, `${field} deve ser uma data real YYYY-MM-DD`);

/** @openapi
 * components:
 *   schemas:
 *     CreateReceivableInput:
 *       type: object
 *       required: [unitId, customerName, description, issueDate, dueDate, amountCents, revenueAccountId]
 *       properties:
 *         unitId:           { type: string }
 *         customerName:     { type: string, description: "Snapshot do nome do cliente (F1)" }
 *         customerRef:      { type: string, description: "Ref escopada a uma linha de cliente em DynamicTable (F1 rota c) — não é FK" }
 *         documentNumber:   { type: string, description: "Nº da fatura/duplicata; parte da chave de negócio" }
 *         description:      { type: string }
 *         issueDate:        { type: string, description: "Data-only YYYY-MM-DD — competência do reconhecimento" }
 *         dueDate:          { type: string, description: "Data-only YYYY-MM-DD — vencimento" }
 *         amountCents:      { type: integer, minimum: 1 }
 *         revenueAccountId: { type: string, description: "Id de uma conta-folha nature=Revenue (contrapartida do reconhecimento)" }
 *         attachmentId:     { type: string, description: "Id de um DocumentAttachment já enviado, anexado ao lançamento de reconhecimento (F4)" }
 */
export const CreateReceivableSchema = z
  .object({
    unitId: z.string().min(1),
    customerName: z.string().min(1),
    customerRef: z.string().min(1).optional(),
    documentNumber: z.string().min(1).optional(),
    description: z.string().min(1),
    issueDate: dateOnly('issueDate'),
    dueDate: dateOnly('dueDate'),
    amountCents: cents,
    revenueAccountId: z.string().min(1),
    attachmentId: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     RegisterReceiptInput:
 *       type: object
 *       required: [unitId, method, receivedAt, amountCents]
 *       properties:
 *         unitId:      { type: string }
 *         method:      { type: string, enum: [Cash, Pix, TED, Boleto] }
 *         receivedAt:  { type: string, description: "Data-only YYYY-MM-DD — data EFETIVA do crédito bancário (D9), não a data do clique" }
 *         amountCents: { type: integer, minimum: 1, description: "MVP: deve igualar o saldo do receivable (recebimento integral único)" }
 */
export const RegisterReceiptSchema = z
  .object({
    unitId: z.string().min(1),
    method: z.enum(RECEIPT_METHODS),
    receivedAt: dateOnly('receivedAt'),
    amountCents: cents,
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     CancelReceivableInput:
 *       type: object
 *       required: [unitId, reversalDate]
 *       properties:
 *         unitId:       { type: string }
 *         reversalDate: { type: string, description: "Data-only YYYY-MM-DD do estorno do reconhecimento (gate de período na data do estorno, T5)" }
 *         reason:       { type: string }
 */
export const CancelReceivableSchema = z
  .object({
    unitId: z.string().min(1),
    reversalDate: dateOnly('reversalDate'),
    reason: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     CancelReceiptInput:
 *       type: object
 *       required: [unitId, reversalDate]
 *       properties:
 *         unitId:       { type: string }
 *         reversalDate: { type: string, description: "Data-only YYYY-MM-DD do estorno do recebimento" }
 *         reason:       { type: string }
 */
export const CancelReceiptSchema = z
  .object({
    unitId: z.string().min(1),
    reversalDate: dateOnly('reversalDate'),
    reason: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ListReceivablesQuery:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 *         status: { type: string, enum: [OPEN, RECEIVING, RECEIVED, CANCELLED] }
 *         page:   { type: integer, minimum: 1 }
 *         limit:  { type: integer, minimum: 1, maximum: 200 }
 */
export const ListReceivablesQuerySchema = z.object({
  unitId: z.string().min(1),
  status: z.enum(['OPEN', 'RECEIVING', 'RECEIVED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Query DTO for GET /receivables/:id and the reconcile pass — unitId required. */
export const ReceivableScopeQuerySchema = z.object({
  unitId: z.string().min(1),
});

export type CreateReceivableInput = z.infer<typeof CreateReceivableSchema>;
export type RegisterReceiptInput = z.infer<typeof RegisterReceiptSchema>;
export type CancelReceivableInput = z.infer<typeof CancelReceivableSchema>;
export type CancelReceiptInput = z.infer<typeof CancelReceiptSchema>;
export type ListReceivablesQueryInput = z.infer<typeof ListReceivablesQuerySchema>;
export type ReceivableScopeQueryInput = z.infer<typeof ReceivableScopeQuerySchema>;

/** Type guard for CreateReceivableInput. */
export function isCreateReceivableInput(obj: unknown): obj is CreateReceivableInput {
  return CreateReceivableSchema.safeParse(obj).success;
}
