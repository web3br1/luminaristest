import type { Payable, PayablePayment, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** A Payable with its payment children eagerly loaded (used by the cancel/remaining guards). */
export type PayableWithPayments = Payable & { payments: PayablePayment[] };

/** Data to create a Payable row. Scalars only (no relation objects). */
export interface CreatePayableData {
  userId: string;
  unitId: string;
  supplierName: string;
  supplierRef: string | null;
  counterpartyId: string | null;
  documentNumber: string | null;
  description: string;
  issueDate: Date;
  dueDate: Date;
  amountCents: number;
  expenseAccountId: string;
  status: string;
  createdById: string | null;
}

/** Data to create a PayablePayment row. */
export interface CreatePaymentData {
  userId: string;
  unitId: string;
  payableId: string;
  amountCents: number;
  method: string;
  paidAt: Date;
  paidByUserId: string | null;
  status: string;
}

/**
 * Repository contract for Contas a Pagar (`payables` + `payable_payments`). Two-level tenancy via
 * AccountingScope (ownerUserId + unitId). Every method takes an optional `tx` so the service can
 * propagate the transaction (ACC-012). `claimForPayment` is the atomic double-payment race gate
 * (D4) — the ONLY correct place to serialize concurrent payments, since PostingService.postEntry
 * opens its own root tx and cannot enclose this transition.
 */
export interface IPayableRepository {
  create(data: CreatePayableData, tx?: Prisma.TransactionClient): Promise<Payable>;

  findById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<Payable | null>;

  findByIdWithPayments(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PayableWithPayments | null>;

  findManyByUnit(
    scope: AccountingScope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ payables: PayableWithPayments[]; total: number }>;

  /** All non-deleted payables in scope (reconcile re-drive input). */
  findAllActive(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<Payable[]>;

  /**
   * Atomically claim a payable for payment: `updateMany` where status='OPEN' → 'PAYING'.
   * Returns the row count (1 = won the race, 0 = lost / not open). This is the TOCTOU gate.
   */
  claimForPayment(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<number>;

  /**
   * Atomically finalize a payment: `updateMany` where status='PAYING' → 'PAID'. Returns the row
   * count (1 = this caller performed the transition, 0 = someone already finalized it). The
   * exactly-once gate for the `payable.payment_registered` domain audit — both registerPayment and
   * reconcile emit ONLY when this returns 1 (authoritative-gate-inside-tx). Must run inside the tx.
   */
  markPaidIfPaying(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<number>;

  updatePayable(
    scope: AccountingScope,
    id: string,
    data: Prisma.PayableUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Payable>;

  createPayment(data: CreatePaymentData, tx?: Prisma.TransactionClient): Promise<PayablePayment>;

  findPaymentById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment | null>;

  /** The single ACTIVE payment of a payable, if any (cancel guard + reconcile). */
  findActivePayment(
    scope: AccountingScope,
    payableId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment | null>;

  /** All ACTIVE payments in scope (reconcile re-drive input). */
  findAllActivePayments(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<PayablePayment[]>;

  updatePayment(
    scope: AccountingScope,
    id: string,
    data: Prisma.PayablePaymentUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment>;

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
