import { Prisma } from 'generated/prisma';
import { PackageBalanceService } from '../PackageBalanceService';
import type { PackageMovementCommand } from '../PackageBalanceService';
import type { IPackageBalanceRepository } from '../../repositories/IPackageBalanceRepository';
import type { IPackageBalancePolicy } from '../../policies/IPackageBalancePolicy';
import type { AccountingScope } from '../../../accounting/scope/AccountingScope';
import { ValidationError, ForbiddenError } from '../../../../lib/errors';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

const cmd: PackageMovementCommand = {
  customerId: 'cust-1',
  packageId: 'pkg-1',
  saleId: 'sale-1',
  amountCents: 20000,
};

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function buildRepo(over: Partial<Record<keyof IPackageBalanceRepository, jest.Mock>> = {}) {
  const repo = {
    findBalance: jest.fn(async () => null),
    listBalances: jest.fn(async () => []),
    upsertCredit: jest.fn(async () => undefined),
    tryDecrement: jest.fn(async () => true),
    findMovement: jest.fn(async () => null),
    createMovement: jest.fn(async () => ({ id: 'mv-1' })),
    // Execute the callback with a fake tx handle; reject if it throws (mirrors $transaction).
    runTransaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    ...over,
  };
  return repo as unknown as IPackageBalanceRepository & Record<string, jest.Mock>;
}

const allowPolicy: IPackageBalancePolicy = { canMutate: () => true, canRead: () => true };

describe('PackageBalanceService', () => {
  describe('creditFromSale', () => {
    it('applies a credit: appends the movement then increments the balance', async () => {
      const repo = buildRepo();
      const svc = new PackageBalanceService(repo, allowPolicy);
      await svc.creditFromSale(scope, cmd);
      expect(repo.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({ saleId: 'sale-1', kind: 'credit', deltaCents: 20000 }),
        expect.anything(),
      );
      expect(repo.upsertCredit).toHaveBeenCalledWith(scope, 'cust-1', 'pkg-1', 20000, expect.anything());
    });

    it('is idempotent: an existing credit movement skips the transaction entirely', async () => {
      const repo = buildRepo({ findMovement: jest.fn(async () => ({ id: 'mv-existing' })) });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await svc.creditFromSale(scope, cmd);
      expect(repo.runTransaction).not.toHaveBeenCalled();
      expect(repo.upsertCredit).not.toHaveBeenCalled();
    });

    it('treats a P2002 race as an idempotent no-op (no double-credit)', async () => {
      const repo = buildRepo({
        runTransaction: jest.fn(async () => {
          throw p2002();
        }),
      });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await expect(svc.creditFromSale(scope, cmd)).resolves.toBeUndefined();
    });
  });

  describe('debitForConsumption', () => {
    it('debits when the balance is sufficient (atomic decrement succeeds)', async () => {
      const repo = buildRepo({ tryDecrement: jest.fn(async () => true) });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await svc.debitForConsumption(scope, cmd);
      expect(repo.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'debit', deltaCents: 20000 }),
        expect.anything(),
      );
      expect(repo.tryDecrement).toHaveBeenCalledWith(scope, 'cust-1', 'pkg-1', 20000, expect.anything());
    });

    it('blocks (ValidationError) when the balance is insufficient — never goes negative', async () => {
      const repo = buildRepo({ tryDecrement: jest.fn(async () => false) });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await expect(svc.debitForConsumption(scope, cmd)).rejects.toBeInstanceOf(ValidationError);
    });

    it('is idempotent: an existing debit movement skips the transaction', async () => {
      const repo = buildRepo({ findMovement: jest.fn(async () => ({ id: 'mv-existing' })) });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await svc.debitForConsumption(scope, cmd);
      expect(repo.runTransaction).not.toHaveBeenCalled();
      expect(repo.tryDecrement).not.toHaveBeenCalled();
    });
  });

  describe('assertSufficient', () => {
    it('throws when the balance cannot cover the amount', async () => {
      const repo = buildRepo({ findBalance: jest.fn(async () => ({ balanceCents: 100 })) });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await expect(svc.assertSufficient(scope, 'cust-1', 'pkg-1', 200)).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('passes when the balance covers the amount', async () => {
      const repo = buildRepo({ findBalance: jest.fn(async () => ({ balanceCents: 200 })) });
      const svc = new PackageBalanceService(repo, allowPolicy);
      await expect(svc.assertSufficient(scope, 'cust-1', 'pkg-1', 200)).resolves.toBeUndefined();
    });
  });

  describe('money boundary', () => {
    it.each([0, -5, 10.5, NaN])('rejects non-positive / non-integer amount %p', async (bad) => {
      const svc = new PackageBalanceService(buildRepo(), allowPolicy);
      await expect(svc.assertSufficient(scope, 'cust-1', 'pkg-1', bad as number)).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe('getBalanceCents', () => {
    it('returns the stored balance, or 0 when no row exists', async () => {
      const withRow = new PackageBalanceService(
        buildRepo({ findBalance: jest.fn(async () => ({ balanceCents: 350 })) }),
        allowPolicy,
      );
      expect(await withRow.getBalanceCents(scope, 'cust-1', 'pkg-1')).toBe(350);
      const noRow = new PackageBalanceService(buildRepo(), allowPolicy);
      expect(await noRow.getBalanceCents(scope, 'cust-1', 'pkg-1')).toBe(0);
    });
  });

  describe('authorization', () => {
    it('denies mutation when policy.canMutate is false', async () => {
      const denyPolicy: IPackageBalancePolicy = { canMutate: () => false, canRead: () => true };
      const svc = new PackageBalanceService(buildRepo(), denyPolicy);
      await expect(svc.creditFromSale(scope, cmd)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
