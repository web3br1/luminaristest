/**
 * AccountingReportService — read-only ledger reporting, FIRST-CLASS PRISMA.
 *
 * What is mocked: the three REPOSITORIES and the POLICY (the injected collaborators).
 * No prisma client is needed here — the report service never opens a transaction; it
 * only reads through the (mocked) repositories. DynamicTableService is not involved.
 *
 * These tests pin the Contract §2.1 invariants:
 *  - trialBalance aggregates BOTH 'Posted' AND 'Reversed' parent statuses (a reversed
 *    entry + its reversal net to ZERO);
 *  - the `balanced` flag is EXACT integer equality Σdebit === Σcredit (no epsilon);
 *  - all amounts stay INTEGER CENTS (rows + grand totals);
 *  - accountLedger NotFound + Forbidden guards.
 */
import { AccountingReportService } from '../AccountingReportService';
import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

function buildService(over: {
  accountRepo?: any;
  postingRepo?: any;
  journalEntryRepo?: any;
  policy?: any;
} = {}) {
  const accountRepo = {
    findByCode: jest.fn(async () => null),
    create: jest.fn(),
    findManyByUnit: jest.fn(async () => []),
    softDelete: jest.fn(),
    ...over.accountRepo,
  };
  const postingRepo = {
    create: jest.fn(),
    findByEntryId: jest.fn(async () => []),
    findByAccount: jest.fn(async () => []),
    groupByAccount: jest.fn(async () => []),
    ...over.postingRepo,
  };
  const journalEntryRepo = {
    create: jest.fn(),
    findById: jest.fn(async () => null),
    findBySource: jest.fn(async () => null),
    setStatus: jest.fn(),
    setReversedBy: jest.fn(),
    ...over.journalEntryRepo,
  };
  const policy = {
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canRead: jest.fn(() => true),
    ...over.policy,
  };
  const svc = new AccountingReportService(
    accountRepo as any,
    postingRepo as any,
    journalEntryRepo as any,
    policy as any,
  );
  return { svc, accountRepo, postingRepo, journalEntryRepo, policy };
}

describe('AccountingReportService.trialBalance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aggregates over BOTH Posted AND Reversed statuses (excludes only Draft)', async () => {
    const groupByAccount = jest.fn(async () => []);
    const { svc } = buildService({ postingRepo: { groupByAccount } });
    await svc.trialBalance(scope);
    expect(groupByAccount).toHaveBeenCalledWith(scope, ['Posted', 'Reversed']);
  });

  it('builds rows in INTEGER CENTS, joined to the chart, sorted by code asc', async () => {
    const { svc } = buildService({
      postingRepo: {
        groupByAccount: jest.fn(async () => [
          { accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
          { accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 0 },
        ]),
      },
      accountRepo: {
        findManyByUnit: jest.fn(async () => [
          { id: 'acc-1.1.1', code: '1.1.1', name: 'Banco', nature: 'Asset' },
          { id: 'acc-3.1', code: '3.1', name: 'Receita de Vendas', nature: 'Revenue' },
        ]),
      },
    });
    const report = await svc.trialBalance(scope);

    expect(report.rows.map((r) => r.code)).toEqual(['1.1.1', '3.1']); // sorted asc
    const bank = report.rows.find((r) => r.code === '1.1.1')!;
    expect(bank).toMatchObject({
      accountId: 'acc-1.1.1',
      name: 'Banco',
      nature: 'Asset',
      debitCents: 10000,
      creditCents: 0,
      balanceCents: 10000, // debit - credit
    });
    const rev = report.rows.find((r) => r.code === '3.1')!;
    expect(rev.balanceCents).toBe(-10000); // 0 - 10000
    // every amount is an integer (cents), never a float
    for (const r of report.rows) {
      expect(Number.isInteger(r.debitCents)).toBe(true);
      expect(Number.isInteger(r.creditCents)).toBe(true);
      expect(Number.isInteger(r.balanceCents)).toBe(true);
    }
  });

  it('balanced=true with exact integer equality; grand totals are integer cents', async () => {
    const { svc } = buildService({
      postingRepo: {
        groupByAccount: jest.fn(async () => [
          { accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 0 },
          { accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
        ]),
      },
      accountRepo: {
        findManyByUnit: jest.fn(async () => [
          { id: 'acc-1.1.1', code: '1.1.1', name: 'Banco', nature: 'Asset' },
          { id: 'acc-3.1', code: '3.1', name: 'Receita', nature: 'Revenue' },
        ]),
      },
    });
    const report = await svc.trialBalance(scope);
    expect(report.totals).toEqual({ debitCents: 10000, creditCents: 10000, balanceCents: 0 });
    expect(report.balanced).toBe(true);
    expect(Number.isInteger(report.totals.debitCents)).toBe(true);
    expect(Number.isInteger(report.totals.creditCents)).toBe(true);
  });

  it('a reversed entry + its reversal net to ZERO across Posted+Reversed totals (balanced)', async () => {
    // Original (Reversed) bank-debit + its reversal (Posted) bank-credit cancel per account.
    const { svc } = buildService({
      postingRepo: {
        groupByAccount: jest.fn(async () => [
          // bank: 10000 debit (original, now Reversed) + 10000 credit (reversal, Posted)
          { accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 10000 },
          // revenue: 10000 credit (original) + 10000 debit (reversal)
          { accountId: 'acc-3.1', debitCents: 10000, creditCents: 10000 },
        ]),
      },
      accountRepo: {
        findManyByUnit: jest.fn(async () => [
          { id: 'acc-1.1.1', code: '1.1.1', name: 'Banco', nature: 'Asset' },
          { id: 'acc-3.1', code: '3.1', name: 'Receita', nature: 'Revenue' },
        ]),
      },
    });
    const report = await svc.trialBalance(scope);
    // each account nets to zero, and the grand total is balanced
    expect(report.rows.every((r) => r.balanceCents === 0)).toBe(true);
    expect(report.totals).toEqual({ debitCents: 20000, creditCents: 20000, balanceCents: 0 });
    expect(report.balanced).toBe(true);
  });

  it('balanced=false when Σdebit !== Σcredit (exact, no epsilon)', async () => {
    const { svc } = buildService({
      postingRepo: {
        groupByAccount: jest.fn(async () => [
          { accountId: 'acc-1.1.1', debitCents: 10001, creditCents: 0 },
          { accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
        ]),
      },
      accountRepo: {
        findManyByUnit: jest.fn(async () => [
          { id: 'acc-1.1.1', code: '1.1.1', name: 'Banco', nature: 'Asset' },
          { id: 'acc-3.1', code: '3.1', name: 'Receita', nature: 'Revenue' },
        ]),
      },
    });
    const report = await svc.trialBalance(scope);
    expect(report.balanced).toBe(false);
    expect(report.totals.balanceCents).toBe(1);
  });

  it('marks an orphan total (account removed from chart) with code "?" / "(conta removida)"', async () => {
    const { svc } = buildService({
      postingRepo: {
        groupByAccount: jest.fn(async () => [
          { accountId: 'acc-gone', debitCents: 5000, creditCents: 0 },
        ]),
      },
      accountRepo: { findManyByUnit: jest.fn(async () => []) }, // chart has no such account
    });
    const report = await svc.trialBalance(scope);
    expect(report.rows[0]).toMatchObject({ code: '?', name: '(conta removida)', nature: '?' });
  });

  it('throws ForbiddenError when policy.canRead is false', async () => {
    const { svc, postingRepo } = buildService({ policy: { canRead: jest.fn(() => false) } });
    await expect(svc.trialBalance(scope)).rejects.toBeInstanceOf(ForbiddenError);
    expect(postingRepo.groupByAccount).not.toHaveBeenCalled();
  });

  // Incremento D / D2-Q5a: account 3.2 (Devoluções de Vendas) is Revenue-nature but carries a
  // DEBIT balance from returns, so net revenue (Σ crédito − débito over Revenue accounts) is
  // REDUCED by it. If 3.2 ever raised net revenue, the contra-revenue treatment would be a bug.
  it('a 3.2 (Devoluções) debit balance REDUCES net revenue (crédito − débito over Revenue accounts)', async () => {
    const { svc } = buildService({
      postingRepo: {
        groupByAccount: jest.fn(async () => [
          // Sale revenue recognized: 3.1 credit 10000.
          { accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
          // A return: 3.2 debit 3000 (contra-revenue).
          { accountId: 'acc-3.2', debitCents: 3000, creditCents: 0 },
        ]),
      },
      accountRepo: {
        findManyByUnit: jest.fn(async () => [
          { id: 'acc-3.1', code: '3.1', name: 'Receita de Vendas', nature: 'Revenue' },
          { id: 'acc-3.2', code: '3.2', name: 'Devoluções de Vendas', nature: 'Revenue' },
        ]),
      },
    });
    const report = await svc.trialBalance(scope);

    const netRevenueCents = report.rows
      .filter((r) => r.nature === 'Revenue')
      .reduce((acc, r) => acc + (r.creditCents - r.debitCents), 0);

    // Gross 10000 minus the 3000 return = 7000 net — strictly less than the gross.
    expect(netRevenueCents).toBe(7000);
    const grossRevenueCents = report.rows
      .filter((r) => r.code === '3.1')
      .reduce((acc, r) => acc + (r.creditCents - r.debitCents), 0);
    expect(netRevenueCents).toBeLessThan(grossRevenueCents);

    const devolucoes = report.rows.find((r) => r.code === '3.2')!;
    expect(devolucoes.balanceCents).toBe(3000); // debit − credit > 0 (debit balance)
  });
});

describe('AccountingReportService.accountLedger', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundError when the account code is not found in the unit', async () => {
    const { svc } = buildService({
      accountRepo: { findByCode: jest.fn(async () => null) },
    });
    await expect(svc.accountLedger(scope, '9.9.9')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when policy.canRead is false', async () => {
    const { svc, accountRepo } = buildService({ policy: { canRead: jest.fn(() => false) } });
    await expect(svc.accountLedger(scope, '1.1.1')).rejects.toBeInstanceOf(ForbiddenError);
    expect(accountRepo.findByCode).not.toHaveBeenCalled();
  });

  it('hydrates Posted+Reversed legs only, sorted by entry date, with a running balance in cents', async () => {
    const account = { id: 'acc-1.1.1', code: '1.1.1', name: 'Banco', nature: 'Asset' };
    const findById = jest.fn(async (_scope: AccountingScope, id: string) => {
      if (id === 'e-draft') return { status: 'Draft', date: new Date('2026-01-03'), description: 'd' };
      if (id === 'e1') return { status: 'Posted', date: new Date('2026-01-01'), description: 'a' };
      if (id === 'e2') return { status: 'Reversed', date: new Date('2026-01-02'), description: 'b' };
      return null;
    });
    const { svc } = buildService({
      accountRepo: { findByCode: jest.fn(async () => account) },
      postingRepo: {
        findByAccount: jest.fn(async () => [
          // intentionally out of date order; Draft leg must be dropped
          { id: 'p2', entryId: 'e2', debitCents: 0, creditCents: 3000 },
          { id: 'pd', entryId: 'e-draft', debitCents: 9999, creditCents: 0 },
          { id: 'p1', entryId: 'e1', debitCents: 10000, creditCents: 0 },
        ]),
      },
      journalEntryRepo: { findById },
    });
    const report = await svc.accountLedger(scope, '1.1.1');

    // Draft dropped; two rows remain, sorted by entry date asc
    expect(report.rows.map((r) => r.postingId)).toEqual(['p1', 'p2']);
    expect(report.rows[0].runningBalanceCents).toBe(10000); // +10000
    expect(report.rows[1].runningBalanceCents).toBe(7000); // 10000 - 3000
    expect(report.closingBalanceCents).toBe(7000);
    expect(report.account).toMatchObject({ accountId: 'acc-1.1.1', code: '1.1.1' });
    for (const r of report.rows) {
      expect(Number.isInteger(r.runningBalanceCents)).toBe(true);
    }
  });
});
