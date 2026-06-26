import { Prisma } from 'generated/prisma';
import type { CustomerPackageBalance } from 'generated/prisma';
import { ForbiddenError, ValidationError } from '../../../lib/errors';
import type { AccountingScope } from '../../accounting/scope/AccountingScope';
import type { IPackageBalanceRepository } from '../repositories/IPackageBalanceRepository';
import type { IPackageBalancePolicy } from '../policies/IPackageBalancePolicy';

/** One balance mutation tied to a sale (origin credit or consumption debit). */
export interface PackageMovementCommand {
  customerId: string;
  packageId: string;
  saleId: string;
  amountCents: number;
}

/**
 * PackageBalanceService — prepaid-package balance orchestration (Incremento G).
 *
 * Lives ABOVE the DynamicTable engine (never injected into it). Two write paths:
 *  - creditFromSale: package-sale origin grants balance (paired with the C 2.1.1 posting).
 *  - debitForConsumption: Package Balance consumption draws balance down.
 * Both are idempotent per (saleId, kind): the append-only movement is the gate — its
 * unique key turns a reconcile re-drive (or a race) into a no-op. The balanceCents >= 0
 * invariant is enforced atomically by the repository's conditional decrement, so a debit
 * never produces a negative balance. Money is INTEGER CENTS at every boundary.
 */
export class PackageBalanceService {
  constructor(
    private readonly repo: IPackageBalanceRepository,
    private readonly policy: IPackageBalancePolicy,
  ) {}

  /**
   * Grants balance from a finalized package sale. Idempotent: a second call for the same
   * saleId is a no-op (movement gate), whether from a retry or reconcile.
   */
  public async creditFromSale(scope: AccountingScope, cmd: PackageMovementCommand): Promise<void> {
    if (!this.policy.canMutate(scope)) {
      throw new ForbiddenError('Sem permissão para creditar saldo de pacote.');
    }
    this.assertAmount(cmd.amountCents);

    // Fast path: already applied — skip the transaction entirely.
    const existing = await this.repo.findMovement(scope, cmd.saleId, 'credit');
    if (existing) return;

    try {
      await this.repo.runTransaction(async (tx) => {
        // Movement-first: its unique (userId,unitId,saleId,kind) is the idempotency gate.
        // If a concurrent credit already won, this throws P2002 and the tx rolls back —
        // the balance is then never double-incremented.
        await this.repo.createMovement(
          {
            userId: scope.ownerUserId,
            unitId: scope.unitId,
            customerId: cmd.customerId,
            packageId: cmd.packageId,
            saleId: cmd.saleId,
            kind: 'credit',
            deltaCents: cmd.amountCents,
          },
          tx,
        );
        await this.repo.upsertCredit(scope, cmd.customerId, cmd.packageId, cmd.amountCents, tx);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return; // concurrent credit already applied
      throw error;
    }
  }

  /**
   * Draws balance down for a Package Balance consumption. Idempotent per saleId. Throws
   * ValidationError (insufficient) if the balance cannot cover the amount — in which case
   * the transaction rolls back and no movement is recorded.
   */
  public async debitForConsumption(
    scope: AccountingScope,
    cmd: PackageMovementCommand,
  ): Promise<void> {
    if (!this.policy.canMutate(scope)) {
      throw new ForbiddenError('Sem permissão para debitar saldo de pacote.');
    }
    this.assertAmount(cmd.amountCents);

    const existing = await this.repo.findMovement(scope, cmd.saleId, 'debit');
    if (existing) return;

    try {
      await this.repo.runTransaction(async (tx) => {
        await this.repo.createMovement(
          {
            userId: scope.ownerUserId,
            unitId: scope.unitId,
            customerId: cmd.customerId,
            packageId: cmd.packageId,
            saleId: cmd.saleId,
            kind: 'debit',
            deltaCents: cmd.amountCents,
          },
          tx,
        );
        const applied = await this.repo.tryDecrement(
          scope,
          cmd.customerId,
          cmd.packageId,
          cmd.amountCents,
          tx,
        );
        if (!applied) {
          throw new ValidationError(
            `Saldo de pacote insuficiente para consumo (cliente ${cmd.customerId}, pacote ${cmd.packageId}).`,
          );
        }
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) return; // concurrent debit already applied
      throw error; // insufficient-balance ValidationError propagates (tx rolled back)
    }
  }

  /**
   * Pre-write sufficiency check for the consumption path (fast user feedback before the
   * sale is marked Paid). The authoritative guard is still the atomic debit.
   */
  public async assertSufficient(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    amountCents: number,
  ): Promise<void> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Sem permissão para ler saldo de pacote.');
    }
    this.assertAmount(amountCents);
    const balance = await this.repo.findBalance(scope, customerId, packageId);
    const current = balance?.balanceCents ?? 0;
    if (current < amountCents) {
      throw new ValidationError(
        `Saldo de pacote insuficiente: disponível ${current}, requerido ${amountCents} (cliente ${customerId}, pacote ${packageId}).`,
      );
    }
  }

  /** Current balance in cents for a customer × package (0 when no row exists). */
  public async getBalanceCents(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
  ): Promise<number> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Sem permissão para ler saldo de pacote.');
    }
    const balance = await this.repo.findBalance(scope, customerId, packageId);
    return balance?.balanceCents ?? 0;
  }

  /** Lists balances under the scope, optionally filtered to one customer. */
  public async listBalances(
    scope: AccountingScope,
    customerId?: string,
  ): Promise<CustomerPackageBalance[]> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Sem permissão para ler saldo de pacote.');
    }
    return this.repo.listBalances(scope, customerId);
  }

  /** Money boundary: cents must be a positive, safe integer — never a float. */
  private assertAmount(amountCents: number): void {
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) {
      throw new ValidationError('Valor de saldo inválido (não-numérico).');
    }
    if (!Number.isInteger(amountCents) || !Number.isSafeInteger(amountCents)) {
      throw new ValidationError('Valor de saldo deve ser um inteiro de centavos seguro.');
    }
    if (amountCents <= 0) {
      throw new ValidationError('Valor de saldo deve ser maior que zero.');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
