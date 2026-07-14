/**
 * Payable domain constants (Contas a Pagar — INCR-AP). Small const/helper file in the style of
 * `ledgerStatus.ts` / `closing.ts`: the Prisma row types (`Payable`, `PayablePayment`) come from
 * `generated/prisma`; this file owns the enum-like unions, the dual source-type keys, the closed
 * payment-method → credit-account map, and the rename-on-delete helper.
 */
import { ValidationError } from '../../../lib/errors';

/**
 * Payable lifecycle. `PAYING` is the TRANSIENT DB race-gate of the double-payment guard (D4):
 * `registerPayment` flips `OPEN → PAYING` atomically before posting, so two concurrent payments
 * race on this single-row transition and exactly one wins. `PAID` and `CANCELLED` are terminal.
 */
export const PAYABLE_STATUSES = ['OPEN', 'PAYING', 'PAID', 'CANCELLED'] as const;
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];

/** Payment lifecycle. Cancel is a status flip (+ settlement reversal), never a hard delete. */
export const PAYMENT_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Dual fato gerador — two distinct ledger events keyed on DISTINCT source ids (D3):
 *   - recognition posts under `sourceId = payableId`,
 *   - settlement posts under `sourceId = paymentId` (NEVER payableId — else a re-payment after a
 *     reversal would hit the idempotent-return of the reverted entry, T7).
 */
export const AP_PAYABLE_SOURCE_TYPE = 'ap.payable';
export const AP_PAYMENT_SOURCE_TYPE = 'ap.payment';

/**
 * Closed payment-method → CREDIT (Asset) account map for the settlement leg (D2):
 * D `2.1.2 Fornecedores a Pagar` / C the account the cash left from. `Cash` credits Caixa
 * (`1.1.3`), the bank rails credit Banco (`1.1.1`) — so a Pix/TED/Boleto settlement becomes a
 * bank-reconciliation candidate automatically (D9). The map is CLOSED: an unknown method
 * REJECTS (`resolvePaymentMethodAccount`), never defaults silently (param-aceito-e-ignorado-e-bug).
 * The codes are the stable canonical Asset leaves in ChartOfAccountsFixture.
 */
export const PAYMENT_METHOD_ACCOUNTS: Readonly<Record<string, string>> = {
  Cash: '1.1.3',
  Pix: '1.1.1',
  TED: '1.1.1',
  Boleto: '1.1.1',
};

/** Accepted payment methods (DTO enum source of truth). */
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_ACCOUNTS) as [string, ...string[]];

/** Resolve the credit account code for a method, or REJECT (closed map, D2). */
export function resolvePaymentMethodAccount(method: string): string {
  const code = PAYMENT_METHOD_ACCOUNTS[method];
  if (!code) {
    throw new ValidationError(
      `Método de pagamento '${method}' não é suportado (use um de: ${PAYMENT_METHODS.join(', ')}).`,
    );
  }
  return code;
}

/**
 * Rename-on-delete transform for the business key (D3): on cancel/soft-delete, the
 * `documentNumber` is rewritten to `deleted:<id>:<documentNumber>` in the SAME tx so the
 * @@unique([userId,unitId,supplierName,documentNumber]) frees the original key and a re-create
 * of the same supplier×document does not trip P2002 (unique-de-idempotencia-x-soft-delete).
 * A null documentNumber stays null (SQLite already treats NULL as distinct).
 */
export function deletedDocumentNumber(id: string, documentNumber: string | null): string | null {
  if (documentNumber === null) return null;
  return `deleted:${id}:${documentNumber}`;
}
