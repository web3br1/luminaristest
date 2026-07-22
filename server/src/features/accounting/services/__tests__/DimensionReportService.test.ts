import { DimensionReportService } from '../DimensionReportService';
import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import type { Account, DimensionDefinition, DimensionValue } from 'generated/prisma';
import type { AccountDimensionTotals } from '../../repositories/IPostingRepository';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function acc(id: string, code: string, nature: string): Account {
  return {
    id, userId: 'owner-1', unitId: 'unit-1', code, name: code, nature,
    acceptsEntries: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  } as Account;
}
function val(id: string, over: Partial<DimensionValue> = {}): DimensionValue {
  return {
    id, userId: 'owner-1', unitId: 'unit-1', definitionId: 'def-cc', code: id, name: id,
    parentId: null, status: 'ACTIVE', createdById: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as DimensionValue;
}
const definition = { id: 'def-cc', userId: 'owner-1', unitId: 'unit-1', code: 'COST_CENTER', name: 'Centro de Custo', status: 'ACTIVE', createdById: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null } as DimensionDefinition;

function build(opts: { totals: AccountDimensionTotals[]; accounts: Account[]; values: DimensionValue[]; definition?: DimensionDefinition | null; canRead?: boolean }) {
  const postingRepo = { groupByAccountAndDimension: jest.fn(async () => opts.totals) };
  const accountRepo = { findManyByUnit: jest.fn(async () => opts.accounts) };
  const dimensionRepo = {
    findDefinitionById: jest.fn(async () => (opts.definition === undefined ? definition : opts.definition)),
    findManyValues: jest.fn(async () => opts.values),
  };
  const policy = { canReadDimension: () => opts.canRead ?? true };
  const service = new DimensionReportService(postingRepo as never, accountRepo as never, dimensionRepo as never, policy as never);
  return { service };
}

const query = { unitId: 'unit-1', definitionId: 'def-cc' };

describe('DimensionReportService.balanceByDimension', () => {
  it('buckets per value + a (sem dimensão) bucket; grand total equals the sum of all legs (ACC-024)', async () => {
    const totals: AccountDimensionTotals[] = [
      { accountId: 'a-exp', valueId: 'v1', debitCents: 10000, creditCents: 0 },
      { accountId: 'a-exp', valueId: 'v2', debitCents: 4000, creditCents: 0 },
      { accountId: 'a-exp', valueId: null, debitCents: 1000, creditCents: 0 }, // untagged
    ];
    const { service } = build({ totals, accounts: [acc('a-exp', '4.1', 'Expense')], values: [val('v1'), val('v2')] });
    const rep = await service.balanceByDimension(scope, query);

    // grand total = 15000 debit — identical to what a trial balance would sum for the window.
    expect(rep.totals.debitCents).toBe(15000);
    const v1 = rep.buckets.find((b) => b.valueId === 'v1')!;
    expect(v1.ownDebitCents).toBe(10000);
    expect(v1.accounts).toHaveLength(1);
    const none = rep.buckets.find((b) => b.valueId === null)!;
    expect(none.valueName).toBe('(sem dimensão)');
    expect(none.ownDebitCents).toBe(1000);
    // Σ every bucket's OWN == grand total (nothing lost, nothing double-counted).
    const sumOwn = rep.buckets.reduce((s, b) => s + b.ownDebitCents, 0);
    expect(sumOwn).toBe(15000);
  });

  it('rolls a child value up into its parent', async () => {
    const totals: AccountDimensionTotals[] = [
      { accountId: 'a-exp', valueId: 'parent', debitCents: 3000, creditCents: 0 },
      { accountId: 'a-exp', valueId: 'child', debitCents: 7000, creditCents: 0 },
    ];
    const values = [val('parent'), val('child', { parentId: 'parent' })];
    const { service } = build({ totals, accounts: [acc('a-exp', '4.1', 'Expense')], values });
    const rep = await service.balanceByDimension(scope, query);

    const parent = rep.buckets.find((b) => b.valueId === 'parent')!;
    const child = rep.buckets.find((b) => b.valueId === 'child')!;
    expect(parent.ownDebitCents).toBe(3000);
    expect(parent.rollupDebitCents).toBe(10000); // own 3000 + child 7000
    expect(child.rollupDebitCents).toBe(7000);
  });

  it('404 when the axis is not found', async () => {
    const { service } = build({ totals: [], accounts: [], values: [], definition: null });
    await expect(service.balanceByDimension(scope, query)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids without canReadDimension', async () => {
    const { service } = build({ totals: [], accounts: [], values: [], canRead: false });
    await expect(service.balanceByDimension(scope, query)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('DimensionReportService.resultByDimension', () => {
  it('nets Revenue (credit-normal) minus Expense (debit-normal) per value, with rollup', async () => {
    const totals: AccountDimensionTotals[] = [
      { accountId: 'a-rev', valueId: 'v1', debitCents: 0, creditCents: 20000 }, // revenue 20000
      { accountId: 'a-exp', valueId: 'v1', debitCents: 8000, creditCents: 0 },  // expense 8000
      { accountId: 'a-exp', valueId: null, debitCents: 500, creditCents: 0 },   // untagged expense
    ];
    const accounts = [acc('a-rev', '3.1', 'Revenue'), acc('a-exp', '4.1', 'Expense')];
    const { service } = build({ totals, accounts, values: [val('v1')] });
    const rep = await service.resultByDimension(scope, query);

    const v1 = rep.buckets.find((b) => b.valueId === 'v1')!;
    expect(v1.ownRevenueCents).toBe(20000);
    expect(v1.ownExpenseCents).toBe(8000);
    expect(v1.ownResultCents).toBe(12000); // 20000 - 8000
    const none = rep.buckets.find((b) => b.valueId === null)!;
    expect(none.ownExpenseCents).toBe(500);
    // totals reconcile: revenue 20000, expense 8500, result 11500 — matches a DRE for the window.
    expect(rep.totals).toEqual({ revenueCents: 20000, expenseCents: 8500, resultCents: 11500 });
  });

  it('B0 (INCR-DIM-COMPLETENESS): untagged result legs form a "(Não alocado)" bucket and Σ(recortes)+Não-alocado == DRE total', async () => {
    const totals: AccountDimensionTotals[] = [
      { accountId: 'a-rev', valueId: 'v1', debitCents: 0, creditCents: 20000 },   // tagged revenue
      { accountId: 'a-exp', valueId: 'v1', debitCents: 8000, creditCents: 0 },    // tagged expense
      { accountId: 'a-rev', valueId: null, debitCents: 0, creditCents: 5000 },    // UNTAGGED revenue
      { accountId: 'a-exp', valueId: null, debitCents: 1500, creditCents: 0 },    // UNTAGGED expense
    ];
    const accounts = [acc('a-rev', '3.1', 'Revenue'), acc('a-exp', '4.1', 'Expense')];
    const { service } = build({ totals, accounts, values: [val('v1')] });
    const rep = await service.resultByDimension(scope, query);

    const none = rep.buckets.find((b) => b.valueId === null)!;
    expect(none.valueName).toBe('(Não alocado)');
    expect(none.ownResultCents).toBe(5000 - 1500); // untagged net = 3500

    // Σ over every bucket's OWN result == the report total (nothing lost, nothing double-counted).
    const sumOwn = rep.buckets.reduce((acc, b) => acc + b.ownResultCents, 0);
    expect(sumOwn).toBe(rep.totals.resultCents);
    // and the total equals the full-window DRE: revenue 25000 - expense 9500 = 15500.
    expect(rep.totals).toEqual({ revenueCents: 25000, expenseCents: 9500, resultCents: 15500 });
  });

  it('ignores non-result (Asset/Liability) accounts', async () => {
    const totals: AccountDimensionTotals[] = [
      { accountId: 'a-asset', valueId: 'v1', debitCents: 9999, creditCents: 0 },
    ];
    const { service } = build({ totals, accounts: [acc('a-asset', '1.1.1', 'Asset')], values: [val('v1')] });
    const rep = await service.resultByDimension(scope, query);
    expect(rep.totals).toEqual({ revenueCents: 0, expenseCents: 0, resultCents: 0 });
    expect(rep.buckets).toHaveLength(0);
  });
});
