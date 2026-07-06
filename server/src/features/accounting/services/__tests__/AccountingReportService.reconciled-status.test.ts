/**
 * Emenda INCR4-A (ADR-INCR7 D5) — 'Reconciled' is economically identical to 'Posted'.
 *
 * These tests pin the amended ledger-status class across EVERY official report
 * surface (balancete/razão/BP/DRE all flow through LEDGER_STATUSES):
 *  - a Reconciled entry appears in reports exactly as it did while Posted;
 *  - Draft is still the only excluded status;
 *  - pre-reconciliation regression: with Posted/Reversed-only data the output is
 *    identical to the pre-amendment behavior (nothing is Reconciled until the
 *    first match, so the amendment is a no-op on existing data).
 *
 * Mocked: the three repositories + policy (same convention as the sibling suite).
 */
import { AccountingReportService } from '../AccountingReportService';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

const AMENDED_STATUSES = ['Posted', 'Reconciled', 'Reversed'];

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

describe('Emenda INCR4-A — Reconciled counts as ledger status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trialBalance queries the amended status class', async () => {
    const groupByAccount = jest.fn(async () => []);
    const { svc } = buildService({ postingRepo: { groupByAccount } });
    await svc.trialBalance(scope);
    expect(groupByAccount).toHaveBeenCalledWith(scope, AMENDED_STATUSES, undefined);
  });

  it('balanceSheet and incomeStatement query the amended status class', async () => {
    const asOf = new Date('2026-06-30T23:59:59Z');
    const groupByAccount = jest.fn(async (..._args: unknown[]) => []);
    const { svc } = buildService({ postingRepo: { groupByAccount } });
    await svc.balanceSheet(scope, asOf);
    await svc.incomeStatement(scope, asOf);
    for (const call of groupByAccount.mock.calls) {
      expect(call[1]).toEqual(AMENDED_STATUSES);
    }
    expect(groupByAccount).toHaveBeenCalled();
  });

  it('accountLedger includes a Reconciled entry exactly like a Posted one and still excludes Draft', async () => {
    const entries: Record<string, { date: Date; description: string; status: string }> = {
      'je-posted': { date: new Date('2026-06-01'), description: 'venda', status: 'Posted' },
      'je-reconciled': { date: new Date('2026-06-02'), description: 'pix', status: 'Reconciled' },
      'je-draft': { date: new Date('2026-06-03'), description: 'rascunho', status: 'Draft' },
    };
    const { svc } = buildService({
      accountRepo: {
        findByCode: jest.fn(async () => ({
          id: 'acc-bank',
          code: '1.1.1',
          name: 'Banco',
          nature: 'Asset',
          acceptsEntries: true,
        })),
      },
      postingRepo: {
        findByAccount: jest.fn(async () => [
          { id: 'p1', entryId: 'je-posted', debitCents: 10000, creditCents: 0 },
          { id: 'p2', entryId: 'je-reconciled', debitCents: 5000, creditCents: 0 },
          { id: 'p3', entryId: 'je-draft', debitCents: 999, creditCents: 0 },
        ]),
      },
      journalEntryRepo: {
        findById: jest.fn(async (_scope: AccountingScope, id: string) => {
          const entry = entries[id];
          return entry ? { id, ...entry } : null;
        }),
      },
    });

    const report = await svc.accountLedger(scope, '1.1.1');
    const entryIds = report.rows.map((r) => r.entryId);

    expect(entryIds).toContain('je-posted');
    expect(entryIds).toContain('je-reconciled'); // the amendment: no longer vanishes
    expect(entryIds).not.toContain('je-draft'); // Draft is still the only exclusion

    const posted = report.rows.find((r) => r.entryId === 'je-posted')!;
    const reconciled = report.rows.find((r) => r.entryId === 'je-reconciled')!;
    // Economically identical: same row shape, integer cents, only the status label differs.
    expect(reconciled.debitCents).toBe(5000);
    expect(reconciled.status).toBe('Reconciled');
    expect(posted.status).toBe('Posted');
    expect(Number.isInteger(reconciled.debitCents)).toBe(true);
  });

  it('pre-reconciliation regression: Posted/Reversed-only data yields the same balancete as before the amendment', async () => {
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

    // Same rows, same integer-cent values, same balanced flag as the pre-amendment
    // suite pins — adding 'Reconciled' to the queried class changes nothing when no
    // row carries that status.
    expect(report.rows.map((r) => ({ code: r.code, balanceCents: r.balanceCents }))).toEqual([
      { code: '1.1.1', balanceCents: 10000 },
      { code: '3.1', balanceCents: -10000 },
    ]);
    expect(report.totals).toMatchObject({ debitCents: 10000, creditCents: 10000 });
    expect(report.balanced).toBe(true);
  });
});
