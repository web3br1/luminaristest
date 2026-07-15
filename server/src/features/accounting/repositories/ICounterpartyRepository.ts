import type { Counterparty, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Data to create a Counterparty row. Scalars only (no relation objects). */
export interface CreateCounterpartyData {
  userId: string;
  unitId: string;
  type: string;
  name: string;
  ref: string | null;
  createdById: string | null;
}

/**
 * Repository contract for the counterparty catalog (`counterparties`). Two-level tenancy via
 * AccountingScope (ownerUserId + unitId). `findById` is the SCOPED resolver the AP/AR create paths
 * call to re-scope a body-supplied counterpartyId (SEC-A1-1 — the DTO can't know the scope, so the
 * service, not Zod, proves the counterparty belongs to this tenant). Soft-archive: reads default to
 * `deletedAt: null` unless includeArchived. Every write accepts an optional tx so the audit + write
 * commit atomically (T8).
 */
export interface ICounterpartyRepository {
  create(data: CreateCounterpartyData, tx?: Prisma.TransactionClient): Promise<Counterparty>;

  /** Scoped point lookup — returns null when the id is not in this scope (cross-tenant → null). */
  findById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<Counterparty | null>;

  findManyByUnit(
    scope: AccountingScope,
    params: { type?: string; includeArchived: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<Counterparty[]>;

  update(
    scope: AccountingScope,
    id: string,
    data: Prisma.CounterpartyUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Counterparty>;

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
