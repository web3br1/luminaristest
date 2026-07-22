/**
 * Receivable domain constants (Contas a Receber — INCR-AR). MIRROR of Payable.model. The Prisma row
 * types (`Receivable`, `ReceivableReceipt`) come from `generated/prisma`; this file owns the
 * enum-like unions, the dual source-type keys, the closed receipt-method → debit-account map, and
 * the rename-on-delete helper.
 */
import { ValidationError } from '../../../lib/errors';

/**
 * Receivable lifecycle. `RECEIVING` is the TRANSIENT DB race-gate of the double-receipt guard (D4):
 * `registerReceipt` flips `OPEN → RECEIVING` atomically before posting, so two concurrent receipts
 * race on this single-row transition and exactly one wins. `RECEIVED` and `CANCELLED` are terminal.
 */
export const RECEIVABLE_STATUSES = ['OPEN', 'RECEIVING', 'RECEIVED', 'CANCELLED'] as const;
export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

/**
 * "Em aberto" statuses for aging / posição (INCR-AGING, F-AG3→a): a receivable is still owed its full
 * `amountCents` while `OPEN` or in-flight `RECEIVING` (the CAS 2-tx window before receipt finalizes).
 * EXCLUDES the terminal `RECEIVED`/`CANCELLED`. Since receipt is full-only there is no partial balance,
 * so outstanding per line is exactly `amountCents` for these statuses. MIRROR of PAYABLE_OUTSTANDING_STATUSES.
 */
export const RECEIVABLE_OUTSTANDING_STATUSES = ['OPEN', 'RECEIVING'] as const;

/** Receipt lifecycle. Cancel is a status flip (+ receipt reversal), never a hard delete. */
export const RECEIPT_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/**
 * Dual fato gerador — two distinct ledger events keyed on DISTINCT source ids (D3):
 *   - recognition posts under `sourceId = receivableId`,
 *   - receipt posts under `sourceId = receiptId` (NEVER receivableId — else a re-receipt after a
 *     reversal would hit the idempotent-return of the reverted entry, T7).
 */
export const AR_RECEIVABLE_SOURCE_TYPE = 'ar.receivable';
export const AR_RECEIPT_SOURCE_TYPE = 'ar.receipt';

/**
 * Closed receipt-method → DEBIT (Asset) account map for the receipt leg (D2): D the account the cash
 * landed in / C `1.1.5 Clientes a Receber`. `Cash` debits Caixa (`1.1.3`), the bank rails debit Banco
 * (`1.1.1`) — so a Pix/TED/Boleto receipt becomes a bank-reconciliation candidate automatically (D9).
 * The map is CLOSED: an unknown method REJECTS (`resolveReceiptMethodAccount`), never defaults
 * silently (param-aceito-e-ignorado-e-bug). The codes are the stable canonical Asset leaves in
 * ChartOfAccountsFixture. (Card → 1.1.4 is OUT of the MVP — AR-avulso is rarely settled by card.)
 */
export const RECEIPT_METHOD_ACCOUNTS: Readonly<Record<string, string>> = {
  Cash: '1.1.3',
  Pix: '1.1.1',
  TED: '1.1.1',
  Boleto: '1.1.1',
};

/** Accepted receipt methods (DTO enum source of truth). */
export const RECEIPT_METHODS = Object.keys(RECEIPT_METHOD_ACCOUNTS) as [string, ...string[]];

/** Resolve the debit account code for a method, or REJECT (closed map, D2). */
export function resolveReceiptMethodAccount(method: string): string {
  const code = RECEIPT_METHOD_ACCOUNTS[method];
  if (!code) {
    throw new ValidationError(
      `Método de recebimento '${method}' não é suportado (use um de: ${RECEIPT_METHODS.join(', ')}).`,
    );
  }
  return code;
}

/**
 * Rename-on-delete transform for the business key (D3): on cancel/soft-delete, the `documentNumber`
 * is rewritten to `deleted:<id>:<documentNumber>` in the SAME tx so the
 * @@unique([userId,unitId,customerName,documentNumber]) frees the original key and a re-create of the
 * same customer×document does not trip P2002 (unique-de-idempotencia-x-soft-delete). A null
 * documentNumber stays null (SQLite already treats NULL as distinct).
 */
export function deletedDocumentNumber(id: string, documentNumber: string | null): string | null {
  if (documentNumber === null) return null;
  return `deleted:${id}:${documentNumber}`;
}
