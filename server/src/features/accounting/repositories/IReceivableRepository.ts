import type { Receivable, ReceivableReceipt, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** A Receivable with its receipt children eagerly loaded (used by the cancel/remaining guards). */
export type ReceivableWithReceipts = Receivable & { receipts: ReceivableReceipt[] };

/** Data to create a Receivable row. Scalars only (no relation objects). */
export interface CreateReceivableData {
  userId: string;
  unitId: string;
  customerName: string;
  customerRef: string | null;
  counterpartyId: string | null;
  documentNumber: string | null;
  description: string;
  issueDate: Date;
  dueDate: Date;
  amountCents: number;
  revenueAccountId: string;
  status: string;
  createdById: string | null;
}

/** Data to create a ReceivableReceipt row. */
export interface CreateReceiptData {
  userId: string;
  unitId: string;
  receivableId: string;
  amountCents: number;
  method: string;
  receivedAt: Date;
  receivedByUserId: string | null;
  status: string;
}

/**
 * Repository contract for Contas a Receber (`receivables` + `receivable_receipts`). Two-level tenancy
 * via AccountingScope (ownerUserId + unitId). Every method takes an optional `tx` so the service can
 * propagate the transaction (ACC-012). `claimForReceipt` is the atomic double-receipt race gate (D4)
 * — the ONLY correct place to serialize concurrent receipts, since PostingService.postEntry opens its
 * own root tx and cannot enclose this transition. MIRROR of IPayableRepository.
 */
export interface IReceivableRepository {
  create(data: CreateReceivableData, tx?: Prisma.TransactionClient): Promise<Receivable>;

  findById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<Receivable | null>;

  findByIdWithReceipts(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableWithReceipts | null>;

  findManyByUnit(
    scope: AccountingScope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ receivables: ReceivableWithReceipts[]; total: number }>;

  /** All non-deleted receivables in scope (reconcile re-drive input). */
  findAllActive(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<Receivable[]>;

  /**
   * Idempotency finder for externally-keyed receivables (CRM seam, ADR-CRM-AR-SEAM): every row
   * whose documentNumber matches EXACTLY or in rename-on-delete tombstone form
   * (`deleted:<id>:<doc>`), deliberately NOT filtering deletedAt. The CALLER classifies the rows
   * (live / human cancel / machine compensation) — a user cancel must never be resurrected while
   * a compensated FAILED creation must stay retryable (review H1).
   */
  findAllByDocumentNumber(
    scope: AccountingScope,
    documentNumber: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Receivable[]>;

  /**
   * All "em aberto" receivables in scope for the aging report (INCR-AGING): non-deleted rows whose
   * status ∈ RECEIVABLE_OUTSTANDING_STATUSES (`OPEN`/`RECEIVING`). Read-only; excludes RECEIVED/CANCELLED
   * and soft-deleted. Ordered by dueDate ASC for a deterministic drill. MIRROR of findOutstanding (AP).
   */
  findOutstanding(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<Receivable[]>;

  /**
   * Atomically claim a receivable for receipt: `updateMany` where status='OPEN' → 'RECEIVING'.
   * Returns the row count (1 = won the race, 0 = lost / not open). This is the TOCTOU gate.
   */
  claimForReceipt(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<number>;

  /**
   * Atomically finalize a receipt: `updateMany` where status='RECEIVING' → 'RECEIVED'. Returns the
   * row count (1 = this caller performed the transition, 0 = someone already finalized it). The
   * exactly-once gate for the `receivable.receipt_registered` domain audit — both registerReceipt and
   * reconcile emit ONLY when this returns 1 (authoritative-gate-inside-tx). Must run inside the tx.
   */
  markReceivedIfReceiving(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<number>;

  updateReceivable(
    scope: AccountingScope,
    id: string,
    data: Prisma.ReceivableUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Receivable>;

  createReceipt(data: CreateReceiptData, tx?: Prisma.TransactionClient): Promise<ReceivableReceipt>;

  findReceiptById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt | null>;

  /** The single ACTIVE receipt of a receivable, if any (cancel guard + reconcile). */
  findActiveReceipt(
    scope: AccountingScope,
    receivableId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt | null>;

  /** All ACTIVE receipts in scope (reconcile re-drive input). */
  findAllActiveReceipts(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<ReceivableReceipt[]>;

  updateReceipt(
    scope: AccountingScope,
    id: string,
    data: Prisma.ReceivableReceiptUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt>;

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
