import type { CustomerPackageBalance, PackageBalanceMovement, Prisma } from 'generated/prisma';
// Increment G reuses the accounting tenancy scope (ADR-G01 §7.1): same (userId, unitId)
// security axes, no need for a near-duplicate PackageScope.
import type { AccountingScope } from '../../accounting/scope/AccountingScope';

/** A balance movement is exactly one credit (package-sale origin) or one debit (consumption). */
export type PackageMovementKind = 'credit' | 'debit';

/** Input for appending one balance movement (idempotency key is userId+unitId+saleId+kind). */
export interface CreateMovementInput {
  userId: string;
  unitId: string;
  customerId: string;
  packageId: string;
  saleId: string;
  kind: PackageMovementKind;
  deltaCents: number;
}

/**
 * Contract for prepaid-package balance data access. First-class Prisma. Money is
 * INTEGER CENTS. The balanceCents >= 0 invariant is enforced at the DB layer by
 * `tryDecrement` (a conditional `gte` updateMany), so a debit can never drive the
 * balance negative even under concurrency — no read-modify-write race window.
 */
export interface IPackageBalanceRepository {
  /** The live balance for one customer × package, or null if none exists yet. */
  findBalance(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CustomerPackageBalance | null>;

  /** All live balances under the scope, optionally filtered to one customer. */
  listBalances(scope: AccountingScope, customerId?: string): Promise<CustomerPackageBalance[]>;

  /** Creates the balance row at `amountCents` if absent, else atomically increments it. */
  upsertCredit(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    amountCents: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Atomically decrements the balance ONLY if it currently holds at least `amountCents`
   * (conditional `gte` guard). Returns true when applied, false when the balance is
   * missing or insufficient — the caller turns false into a domain error.
   */
  tryDecrement(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    amountCents: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;

  /** Looks up an existing movement by its idempotency key, or null. */
  findMovement(
    scope: AccountingScope,
    saleId: string,
    kind: PackageMovementKind,
    tx?: Prisma.TransactionClient,
  ): Promise<PackageBalanceMovement | null>;

  /** Appends one movement (throws P2002 if the idempotency key already exists). */
  createMovement(
    data: CreateMovementInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PackageBalanceMovement>;

  /**
   * Runs `fn` inside a Prisma transaction. Services compose the movement insert and the
   * balance change atomically through this, without importing the prisma singleton
   * (layer boundary: only repositories touch it).
   */
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
