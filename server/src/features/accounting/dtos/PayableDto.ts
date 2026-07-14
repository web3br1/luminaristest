import { z } from 'zod';
import { MAX_CENTS } from '../models/money';
import { isValidDateOnly } from '../models/dates';
import { PAYMENT_METHODS } from '../models/Payable.model';

/**
 * PayableDto — Contas a Pagar (INCR-AP) request schemas. Money is INTEGER CENTS guarded by
 * `MAX_CENTS` (the Int32 persistence ceiling shared with the ledger, ACC-014); dates are
 * date-only validated by `isValidDateOnly` (regex + round-trip — `new Date('2026-02-30')`
 * silently rolls to 03-02, class-fix `date-only-regex-nao-valida-calendario`). Every schema is
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
 *     CreatePayableInput:
 *       type: object
 *       required: [unitId, supplierName, description, issueDate, dueDate, amountCents, expenseAccountId]
 *       properties:
 *         unitId:           { type: string }
 *         supplierName:     { type: string, description: "Snapshot do nome do fornecedor (F1)" }
 *         supplierRef:      { type: string, description: "Ref escopada a uma linha de fornecedor em DynamicTable (F1 rota c) — não é FK" }
 *         documentNumber:   { type: string, description: "Nº da NF/documento; parte da chave de negócio" }
 *         description:      { type: string }
 *         issueDate:        { type: string, description: "Data-only YYYY-MM-DD — competência do reconhecimento" }
 *         dueDate:          { type: string, description: "Data-only YYYY-MM-DD — vencimento" }
 *         amountCents:      { type: integer, minimum: 1 }
 *         expenseAccountId: { type: string, description: "Id de uma conta-folha nature=Expense (contrapartida do reconhecimento)" }
 *         attachmentId:     { type: string, description: "Id de um DocumentAttachment já enviado, anexado ao lançamento de reconhecimento (F4)" }
 */
export const CreatePayableSchema = z
  .object({
    unitId: z.string().min(1),
    supplierName: z.string().min(1),
    supplierRef: z.string().min(1).optional(),
    documentNumber: z.string().min(1).optional(),
    description: z.string().min(1),
    issueDate: dateOnly('issueDate'),
    dueDate: dateOnly('dueDate'),
    amountCents: cents,
    expenseAccountId: z.string().min(1),
    attachmentId: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     RegisterPaymentInput:
 *       type: object
 *       required: [unitId, method, paidAt, amountCents]
 *       properties:
 *         unitId:      { type: string }
 *         method:      { type: string, enum: [Cash, Pix, TED, Boleto] }
 *         paidAt:      { type: string, description: "Data-only YYYY-MM-DD — data EFETIVA do débito bancário (D9), não a data do clique" }
 *         amountCents: { type: integer, minimum: 1, description: "MVP: deve igualar o saldo do payable (pagamento integral único)" }
 */
export const RegisterPaymentSchema = z
  .object({
    unitId: z.string().min(1),
    method: z.enum(PAYMENT_METHODS),
    paidAt: dateOnly('paidAt'),
    amountCents: cents,
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     CancelPayableInput:
 *       type: object
 *       required: [unitId, reversalDate]
 *       properties:
 *         unitId:       { type: string }
 *         reversalDate: { type: string, description: "Data-only YYYY-MM-DD do estorno do reconhecimento (gate de período na data do estorno, T5)" }
 *         reason:       { type: string }
 */
export const CancelPayableSchema = z
  .object({
    unitId: z.string().min(1),
    reversalDate: dateOnly('reversalDate'),
    reason: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     CancelPaymentInput:
 *       type: object
 *       required: [unitId, reversalDate]
 *       properties:
 *         unitId:       { type: string }
 *         reversalDate: { type: string, description: "Data-only YYYY-MM-DD do estorno da liquidação" }
 *         reason:       { type: string }
 */
export const CancelPaymentSchema = z
  .object({
    unitId: z.string().min(1),
    reversalDate: dateOnly('reversalDate'),
    reason: z.string().min(1).optional(),
  })
  .strict();

/** @openapi
 * components:
 *   schemas:
 *     ListPayablesQuery:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId: { type: string }
 *         status: { type: string, enum: [OPEN, PAYING, PAID, CANCELLED] }
 *         page:   { type: integer, minimum: 1 }
 *         limit:  { type: integer, minimum: 1, maximum: 200 }
 */
export const ListPayablesQuerySchema = z.object({
  unitId: z.string().min(1),
  status: z.enum(['OPEN', 'PAYING', 'PAID', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Query DTO for GET /payables/:id and the reconcile pass — unitId required. */
export const PayableScopeQuerySchema = z.object({
  unitId: z.string().min(1),
});

export type CreatePayableInput = z.infer<typeof CreatePayableSchema>;
export type RegisterPaymentInput = z.infer<typeof RegisterPaymentSchema>;
export type CancelPayableInput = z.infer<typeof CancelPayableSchema>;
export type CancelPaymentInput = z.infer<typeof CancelPaymentSchema>;
export type ListPayablesQueryInput = z.infer<typeof ListPayablesQuerySchema>;
export type PayableScopeQueryInput = z.infer<typeof PayableScopeQuerySchema>;

/** Type guard for CreatePayableInput. */
export function isCreatePayableInput(obj: unknown): obj is CreatePayableInput {
  return CreatePayableSchema.safeParse(obj).success;
}
