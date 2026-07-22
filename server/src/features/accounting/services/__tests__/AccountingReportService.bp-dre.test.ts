/**
 * INCR-4 — balanceSheet + incomeStatement unit tests.
 *
 * All money in INTEGER CENTS. No Prisma — pure service-layer unit tests via mocks.
 * Key invariants tested:
 *   - trialBalance byte-identical after getAccountBalances() refactor (G8)
 *   - BP balanced / unbalanced detection (G1)
 *   - DRE year_to_date window; netResult correct sign (G5)
 *   - Estorno nets to zero when Posted+Reversed both present (G5)
 *   - Deduction (3.2) appears negative in revenueDeductions (sign convention)
 *   - Expense appears negative in expenses
 *   - netResultLine uses same window as DRE (G7)
 *   - hasUnclosedPriorYearResult when prior-year DRE ≠ 0 (Q2.1)
 *   - Unmapped account with balance → INVALID + diagnostics (G6)
 *   - Removed account (nature '?') with balance → WARNING (G6)
 *   - from/to guard tested at controller level; service itself receives asOf
 *   - mappingVersion present in every payload (G4)
 */
import type { IAccountRepository } from '../../repositories/IAccountRepository';
import type { IPostingRepository } from '../../repositories/IPostingRepository';
import type { IJournalEntryRepository } from '../../repositories/IJournalEntryRepository';
import type { IAccountingPolicy } from '../../policies/IAccountingPolicy';
import { AccountingReportService } from '../AccountingReportService';
import { STATEMENT_MAPPING_VERSION } from '../StatementMappingFixture';

// ─── Minimal mock builders ────────────────────────────────────────────────────

function makeAccount(overrides: {
  id?: string;
  code: string;
  name?: string;
  nature: string;
  acceptsEntries?: boolean;
}) {
  return {
    id: overrides.id ?? overrides.code,
    code: overrides.code,
    name: overrides.name ?? overrides.code,
    nature: overrides.nature,
    userId: 'u1',
    unitId: 'unit1',
    acceptsEntries: overrides.acceptsEntries ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

function makePosting(accountId: string, debitCents: number, creditCents: number) {
  return { accountId, debitCents, creditCents };
}

type MockGroupByResult = { accountId: string; debitCents: number; creditCents: number };

function buildService(
  accounts: ReturnType<typeof makeAccount>[],
  groupByResult: MockGroupByResult | MockGroupByResult[] | ((options?: { from?: Date; to?: Date }) => MockGroupByResult[]),
) {
  // Support: single object, array, or function for date-based routing
  const accountRepo = {
    findManyByUnit: jest.fn(async () => accounts),
    findByCode: jest.fn(async () => null),
  } as unknown as IAccountRepository;

  const postingRepo = {
    groupByAccount: jest.fn(async (_scope: unknown, _statuses: unknown, options?: { from?: Date; to?: Date }) => {
      if (typeof groupByResult === 'function') return groupByResult(options);
      return Array.isArray(groupByResult) ? groupByResult : [groupByResult];
    }),
    findByAccount: jest.fn(async () => []),
    create: jest.fn(),
    findByEntryId: jest.fn(async () => []),
    nextEntryNumber: jest.fn(async () => 1),
    runTransaction: jest.fn(),
  } as unknown as IPostingRepository;

  const journalEntryRepo = {
    findById: jest.fn(async () => null),
    create: jest.fn(),
    findBySource: jest.fn(async () => null),
    setStatus: jest.fn(),
    setReversedBy: jest.fn(),
    findManyByUnit: jest.fn(async () => ({ entries: [], total: 0 })),
  } as unknown as IJournalEntryRepository;

  const policy = { canRead: jest.fn(() => true), canPost: jest.fn(() => true) } as unknown as IAccountingPolicy;

  const svc = new AccountingReportService(accountRepo, postingRepo, journalEntryRepo, policy);
  return { svc, accountRepo, postingRepo, journalEntryRepo, policy };
}

const SCOPE = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit1',
  ledgerCode: 'DEFAULT' as const,
  baseCurrencyCode: 'BRL' as const,
  timeZone: 'America/Sao_Paulo' as const,
};
const AS_OF = new Date('2026-06-30T23:59:59.999Z');

// ─── trialBalance — byte-identical after refactor ────────────────────────────

describe('trialBalance — byte-identical after getAccountBalances() refactor', () => {
  it('returns rows sorted by code, grand totals and balanced flag', async () => {
    const accounts = [
      makeAccount({ code: '1.1', name: 'Caixa', nature: 'Asset' }),
      makeAccount({ code: '3.1.01', name: 'Receita', nature: 'Revenue' }),
    ];
    const raw: MockGroupByResult[] = [
      { accountId: '1.1', debitCents: 10000, creditCents: 0 },
      { accountId: '3.1.01', debitCents: 0, creditCents: 10000 },
    ];
    const { svc } = buildService(accounts, raw);

    const report = await svc.trialBalance(SCOPE);

    expect(report.unitId).toBe('unit1');
    expect(report.balanced).toBe(true);
    expect(report.totals.debitCents).toBe(10000);
    expect(report.totals.creditCents).toBe(10000);
    // rows sorted by code: 1.1 before 3.1.01
    expect(report.rows[0].code).toBe('1.1');
    expect(report.rows[0].balanceCents).toBe(10000);   // debit - credit
    expect(report.rows[1].code).toBe('3.1.01');
    expect(report.rows[1].balanceCents).toBe(-10000);  // 0 - 10000
  });

  it('groupByAccount called without date options for trialBalance', async () => {
    const accounts = [makeAccount({ code: '1.1', nature: 'Asset' })];
    const { svc, postingRepo } = buildService(accounts, [{ accountId: '1.1', debitCents: 0, creditCents: 0 }]);

    await svc.trialBalance(SCOPE);

    // Third arg (options) must be undefined — no date filter added
    expect(postingRepo.groupByAccount).toHaveBeenCalledWith(
      SCOPE,
      ['Posted', 'Reconciled', 'Reversed'], // emenda INCR4-A (ADR-INCR7 D5)
      undefined,
    );
  });
});

// ─── balanceSheet ─────────────────────────────────────────────────────────────

describe('balanceSheet', () => {
  it('returns mappingVersion in payload', async () => {
    const accounts = [makeAccount({ code: '1.1', nature: 'Asset' })];
    const { svc } = buildService(accounts, []);
    const report = await svc.balanceSheet(SCOPE, AS_OF);
    expect(report.mappingVersion).toBe(STATEMENT_MAPPING_VERSION);
  });

  it('periodSemantics is as_of', async () => {
    const { svc } = buildService([], []);
    const report = await svc.balanceSheet(SCOPE, AS_OF);
    expect(report.periodSemantics).toBe('as_of');
  });

  it('balanced: Ativo = Passivo + PL + Resultado (receita simples)', async () => {
    // Ativo Caixa D 10000 / Receita 3.1.01 C 10000
    // BP: assets=10000, liabilities=0, equity=0, DRE net=10000 → 10000===0+0+10000
    // Prior year is clean (no activity) so hasUnclosedPriorYearResult=false → OK.
    const accounts = [
      makeAccount({ code: '1.1', nature: 'Asset' }),
      makeAccount({ code: '3.1.01', nature: 'Revenue' }),
    ];
    const currentYearRaw: MockGroupByResult[] = [
      { accountId: '1.1', debitCents: 10000, creditCents: 0 },
      { accountId: '3.1.01', debitCents: 0, creditCents: 10000 },
    ];
    // Route by date: prior-year query (to < 2026) → empty; all other queries → current data.
    const groupByFn = (opts?: { from?: Date; to?: Date }): MockGroupByResult[] => {
      if (opts?.to && opts.to.getUTCFullYear() < 2026) return [];
      return currentYearRaw;
    };
    const { svc } = buildService(accounts, groupByFn);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    expect(report.balanced).toBe(true);
    expect(report.reportStatus).toBe('OK');
    expect(report.assets.totalCents).toBe('10000');
    expect(report.liabilities.totalCents).toBe('0');
    expect(report.equity.totalCents).toBe('0');
    expect(report.netResultLine.amountCents).toBe('10000');
  });

  it('balanced=false when classification is wrong (forces divergence)', async () => {
    // An Equity account that has debit balance — amountCents will be negative (credit_positive sign)
    // but we fabricate a scenario where the equation fails
    const accounts = [
      makeAccount({ code: '1.1', nature: 'Asset' }),   // assets 10000
      makeAccount({ code: '2.1', nature: 'Liability' }), // liabilities 3000 → equation: 10000===3000+0+5000=8000 → false
    ];
    // groupByResult: Asset 10000D, Liability 3000C, no Revenue/Expense → DRE net=0
    const raw: MockGroupByResult[] = [
      { accountId: '1.1', debitCents: 10000, creditCents: 0 },
      { accountId: '2.1', debitCents: 0, creditCents: 3000 },
    ];
    const { svc } = buildService(accounts, raw);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    // assets=10000, liabilities=3000, equity=0, DRE=0 → 10000 !== 3000+0+0 → false
    expect(report.balanced).toBe(false);
  });

  it('correctly classifies Asset as positive, Liability as positive in their sections', async () => {
    const accounts = [
      makeAccount({ id: 'a', code: '1.1', nature: 'Asset' }),
      makeAccount({ id: 'l', code: '2.1', nature: 'Liability' }),
      makeAccount({ id: 'e', code: '3.1.01', nature: 'Revenue' }),
    ];
    const raw: MockGroupByResult[] = [
      { accountId: 'a', debitCents: 5000, creditCents: 0 },    // Asset debit=5000, rawBalance=5000
      { accountId: 'l', debitCents: 0, creditCents: 3000 },    // Liability credit=3000, rawBalance=-3000
      { accountId: 'e', debitCents: 0, creditCents: 2000 },    // Revenue credit=2000 → DRE=2000
    ];
    const { svc } = buildService(accounts, raw);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    // Asset: sign=debit_positive → amountCents = rawBalance = +5000
    expect(report.assets.accounts[0].amountCents).toBe('5000');
    // Liability: sign=credit_positive → amountCents = -rawBalance = -(-3000) = +3000
    expect(report.liabilities.accounts[0].amountCents).toBe('3000');
    // balanced: 5000 === 3000 + 0 + 2000 → true
    expect(report.balanced).toBe(true);
  });

  it('netResultLine.fromDate is 1 Jan of asOf.year', async () => {
    const { svc } = buildService([], []);
    const report = await svc.balanceSheet(SCOPE, new Date('2026-06-30T23:59:59.999Z'));
    expect(report.netResultLine.fromDate).toBe('2026-01-01');
    expect(report.netResultLine.toDate).toBe('2026-06-30');
  });

  it('unmapped account with balance → INVALID + in diagnostics', async () => {
    const accounts = [
      makeAccount({ code: '9.9', nature: 'CustomNature' }), // no rule matches
    ];
    const raw: MockGroupByResult[] = [{ accountId: '9.9', debitCents: 500, creditCents: 0 }];
    const { svc } = buildService(accounts, raw);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    expect(report.reportStatus).toBe('INVALID');
    expect(report.diagnostics.unmappedAccounts).toHaveLength(1);
    expect(report.diagnostics.unmappedAccounts[0].code).toBe('9.9');
  });

  it('removed account (nature="?") with balance → WARNING + removedAccountsReferenced', async () => {
    const accounts: ReturnType<typeof makeAccount>[] = []; // account deleted from chart
    const raw: MockGroupByResult[] = [{ accountId: 'ghost', debitCents: 200, creditCents: 0 }];
    const { svc } = buildService(accounts, raw);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    expect(report.reportStatus).toBe('WARNING');
    expect(report.diagnostics.removedAccountsReferenced).toHaveLength(1);
    expect(report.diagnostics.removedAccountsReferenced[0].accountId).toBe('ghost');
  });

  it('hasUnclosedPriorYearResult when prior-year DRE net ≠ 0', async () => {
    // prior year has Revenue with credit 1000
    const accounts = [
      makeAccount({ code: '3.1.01', nature: 'Revenue' }),
    ];
    // Date-routing: current year window → empty; prior year window → revenue 1000
    const groupByFn = (opts?: { from?: Date; to?: Date }): MockGroupByResult[] => {
      // prior year: to = Dec 31 of year-1 (no from → from is undefined)
      if (opts?.to && opts.to.getUTCFullYear() < 2026) {
        return [{ accountId: '3.1.01', debitCents: 0, creditCents: 1000 }];
      }
      return [];
    };
    const { svc } = buildService(accounts, groupByFn);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    expect(report.diagnostics.hasUnclosedPriorYearResult).toBe(true);
    expect(report.diagnostics.priorYearResultCents).toBe(1000);
  });
});

// ─── incomeStatement ─────────────────────────────────────────────────────────

describe('incomeStatement', () => {
  it('returns mappingVersion in payload', async () => {
    const { svc } = buildService([], []);
    const report = await svc.incomeStatement(SCOPE, AS_OF);
    expect(report.mappingVersion).toBe(STATEMENT_MAPPING_VERSION);
  });

  it('periodSemantics is year_to_date', async () => {
    const { svc } = buildService([], []);
    const report = await svc.incomeStatement(SCOPE, AS_OF);
    expect(report.periodSemantics).toBe('year_to_date');
  });

  it('fromDate is 1 Jan of asOf.year', async () => {
    const { svc } = buildService([], []);
    const report = await svc.incomeStatement(SCOPE, new Date('2026-09-15T23:59:59.999Z'));
    expect(report.fromDate).toBe('2026-01-01');
    expect(report.toDate).toBe('2026-09-15');
  });

  it('grossRevenue is credit_positive (credit 5000 → amountCents +5000)', async () => {
    const accounts = [makeAccount({ code: '3.1.01', nature: 'Revenue' })];
    const { svc } = buildService(accounts, [
      { accountId: '3.1.01', debitCents: 0, creditCents: 5000 },
    ]);
    const report = await svc.incomeStatement(SCOPE, AS_OF);
    expect(report.grossRevenue.accounts[0].amountCents).toBe('5000');
    expect(report.grossRevenue.totalCents).toBe('5000');
  });

  it('revenueDeductions (3.2) is credit_negative (credit 1000 → amountCents -1000)', async () => {
    const accounts = [makeAccount({ code: '3.2.01', nature: 'Revenue' })];
    const { svc } = buildService(accounts, [
      { accountId: '3.2.01', debitCents: 0, creditCents: 1000 },
    ]);
    const report = await svc.incomeStatement(SCOPE, AS_OF);
    // rawBalance = 0 - 1000 = -1000; sign=credit_negative → amountCents = rawBalance = -1000
    expect(report.revenueDeductions.accounts[0].amountCents).toBe('-1000');
    expect(report.revenueDeductions.totalCents).toBe('-1000');
  });

  it('resale revenue (3.3, ADR-INCR-REVENUE-SPLIT) lands in grossRevenue, combined with 3.1', async () => {
    // Would FAIL before the dre.gross_rev_resale rule: 3.3 matched no rule → dropped by
    // `if (!rule) continue`, so grossRevenue underreported and J150 diverged from I355.
    const accounts = [
      makeAccount({ code: '3.1', name: 'Receita de Serviços', nature: 'Revenue' }),
      makeAccount({ code: '3.3', name: 'Receita de Revenda de Mercadorias', nature: 'Revenue' }),
    ];
    const raw: MockGroupByResult[] = [
      { accountId: '3.1', debitCents: 0, creditCents: 7000 }, // serviço
      { accountId: '3.3', debitCents: 0, creditCents: 3000 }, // revenda
    ];
    const { svc } = buildService(accounts, raw);
    const report = await svc.incomeStatement(SCOPE, AS_OF);
    // both credit_positive → gross = 7000 + 3000, nothing dropped
    expect(report.grossRevenue.totalCents).toBe('10000');
    expect(report.grossRevenue.accounts.map((a) => a.code).sort()).toEqual(['3.1', '3.3']);
    expect(report.reportStatus).not.toBe('INVALID'); // 3.3 is mapped, not an unmapped account
  });

  it('expenses is debit_negative (debit 2000 → amountCents -2000)', async () => {
    const accounts = [makeAccount({ code: '4.1', nature: 'Expense' })];
    const { svc } = buildService(accounts, [
      { accountId: '4.1', debitCents: 2000, creditCents: 0 },
    ]);
    const report = await svc.incomeStatement(SCOPE, AS_OF);
    // rawBalance = 2000; sign=debit_negative → amountCents = -2000
    expect(report.expenses.accounts[0].amountCents).toBe('-2000');
    expect(report.expenses.totalCents).toBe('-2000');
  });

  it('netResult: grossRevenue + deductions + expenses', async () => {
    // grossRevenue 5000, deductions -1000, expenses -2000 → net = 2000
    const accounts = [
      makeAccount({ code: '3.1.01', nature: 'Revenue' }),
      makeAccount({ code: '3.2.01', nature: 'Revenue' }),
      makeAccount({ code: '4.1', nature: 'Expense' }),
    ];
    const raw: MockGroupByResult[] = [
      { accountId: '3.1.01', debitCents: 0, creditCents: 5000 },
      { accountId: '3.2.01', debitCents: 0, creditCents: 1000 },
      { accountId: '4.1', debitCents: 2000, creditCents: 0 },
    ];
    const { svc } = buildService(accounts, raw);
    const report = await svc.incomeStatement(SCOPE, AS_OF);

    // grossRevenue credit_positive: credit 5000 → rawBalance=-5000 → amountCents=-(-5000)=5000
    // deductions credit_negative: credit 1000 → rawBalance=-1000 → amountCents=rawBalance=-1000
    // expenses debit_negative: debit 2000 → rawBalance=2000 → amountCents=-2000
    // net = 5000 + (-1000) + (-2000) = 2000
    expect(report.netResult.amountCents).toBe('2000');
    expect(report.netResult.isComputed).toBe(true);
    expect(report.netResult.computation).toBe('income_statement_net_result');
  });

  it('estorno neta zero: Posted entry + Reversed entry both aggregated → amountCents 0', async () => {
    // groupByAccount includes both Posted AND Reversed entries.
    // A posting of credit 5000 + its reversal debit 5000 → creditCents=5000, debitCents=5000 → rawBalance=0.
    // This test proves that the aggregate includes BOTH legs.
    const accounts = [makeAccount({ code: '3.1.01', nature: 'Revenue' })];
    const raw: MockGroupByResult[] = [
      // Represents the sum of Posted entry (credit 5000) + Reversed entry (debit 5000)
      { accountId: '3.1.01', debitCents: 5000, creditCents: 5000 },
    ];
    const { svc } = buildService(accounts, raw);
    const report = await svc.incomeStatement(SCOPE, AS_OF);

    // rawBalance = 5000 - 5000 = 0; credit_positive → amountCents = 0
    expect(report.grossRevenue.accounts[0].amountCents).toBe('0');
    expect(report.grossRevenue.totalCents).toBe('0');
    expect(report.netResult.amountCents).toBe('0');
  });

  it('unmapped Revenue account with balance → INVALID', async () => {
    // Revenue without 3.1 or 3.2 prefix — no DRE rule matches
    const accounts = [makeAccount({ code: '3.9.01', nature: 'Revenue' })];
    const raw: MockGroupByResult[] = [{ accountId: '3.9.01', debitCents: 0, creditCents: 500 }];
    const { svc } = buildService(accounts, raw);
    const report = await svc.incomeStatement(SCOPE, AS_OF);

    expect(report.reportStatus).toBe('INVALID');
    expect(report.diagnostics.unmappedAccounts[0].code).toBe('3.9.01');
  });

  // ── FIX-FE-INCR1-M1M2 — T1: Asset (BP) accounts must not be flagged as
  // "unmapped" in DRE diagnostics. Regression for the guard added at
  // buildDiagnostics() mirroring the existing BP→DRE guard. ─────────────────
  it('T1 — Caixa(Asset,D) + Receita(Revenue,C) → reportStatus OK, unmappedAccounts empty', async () => {
    const accounts = [
      makeAccount({ code: '1.1', nature: 'Asset' }),
      makeAccount({ code: '3.1.01', nature: 'Revenue' }),
    ];
    const currentYearRaw: MockGroupByResult[] = [
      { accountId: '1.1', debitCents: 10000, creditCents: 0 },
      { accountId: '3.1.01', debitCents: 0, creditCents: 10000 },
    ];
    // Route by date: prior-year query (to < 2026) → empty (clean prior year, no WARNING noise).
    const groupByFn = (opts?: { from?: Date; to?: Date }): MockGroupByResult[] => {
      if (opts?.to && opts.to.getUTCFullYear() < 2026) return [];
      return currentYearRaw;
    };
    const { svc } = buildService(accounts, groupByFn);
    const report = await svc.incomeStatement(SCOPE, AS_OF);

    expect(report.reportStatus).toBe('OK');
    expect(report.diagnostics.unmappedAccounts).toEqual([]);
    expect(report.grossRevenue.totalCents).toBe('10000');
    expect(report.netResult.amountCents).toBe('10000');
  });

  // T2 — anti-over-silence: a genuinely orphan account (no rule in BP nor DRE)
  // with balance must still flag INVALID. The BP-guard must not swallow it.
  it('T2 — account unmapped in both BP and DRE, with balance → INVALID in unmappedAccounts', async () => {
    const accounts = [makeAccount({ code: '9.9', nature: 'CustomNature' })];
    const raw: MockGroupByResult[] = [{ accountId: '9.9', debitCents: 500, creditCents: 0 }];
    const { svc } = buildService(accounts, raw);
    const report = await svc.incomeStatement(SCOPE, AS_OF);

    expect(report.reportStatus).toBe('INVALID');
    expect(report.diagnostics.unmappedAccounts).toHaveLength(1);
    expect(report.diagnostics.unmappedAccounts[0].code).toBe('9.9');
  });

  // ── INCR-INVENTORY Body 2 (B-2b/B-2c) — CMV (4.2) must land in its own
  // costOfGoodsSold section, NOT in the generic expenses bucket, and must pull
  // netResult down. Cross-nature fixture (Revenue 3.1 + CMV 4.2 + Expense 4.1)
  // proves the first-match routing separates 4.2 from 4.1. ──────────────────
  it('CMV — D 4.2 / C 1.1.6 lands in costOfGoodsSold, NOT expenses, and reduces netResult', async () => {
    const accounts = [
      makeAccount({ id: 'rev', code: '3.1', name: 'Receita de Serviços', nature: 'Revenue' }),
      makeAccount({ id: 'cogs', code: '4.2', name: 'Custo das Mercadorias Vendidas', nature: 'Expense' }),
      makeAccount({ id: 'exp', code: '4.1', name: 'Despesas Gerais', nature: 'Expense' }),
      makeAccount({ id: 'stock', code: '1.1.6', name: 'Estoques', nature: 'Asset' }),
    ];
    // The CMV posting is D 4.2 3000 / C 1.1.6 3000; plus revenue C 3.1 10000 and expense D 4.1 2000.
    const currentYearRaw: MockGroupByResult[] = [
      { accountId: 'rev', debitCents: 0, creditCents: 10000 },
      { accountId: 'cogs', debitCents: 3000, creditCents: 0 },
      { accountId: 'exp', debitCents: 2000, creditCents: 0 },
      { accountId: 'stock', debitCents: 0, creditCents: 3000 },
    ];
    const groupByFn = (opts?: { from?: Date; to?: Date }): MockGroupByResult[] => {
      if (opts?.to && opts.to.getUTCFullYear() < 2026) return [];
      return currentYearRaw;
    };
    const { svc } = buildService(accounts, groupByFn);
    const report = await svc.incomeStatement(SCOPE, AS_OF);

    // 4.2 routes to costOfGoodsSold (debit_negative): rawBalance=3000 → amountCents=-3000.
    expect(report.costOfGoodsSold.accounts.map((a) => a.code)).toEqual(['4.2']);
    expect(report.costOfGoodsSold.accounts[0].amountCents).toBe('-3000');
    expect(report.costOfGoodsSold.totalCents).toBe('-3000');
    // 4.2 must NOT leak into expenses — only 4.1 remains there.
    expect(report.expenses.accounts.map((a) => a.code)).toEqual(['4.1']);
    expect(report.expenses.totalCents).toBe('-2000');
    // net = grossRevenue 10000 − CMV 3000 − expenses 2000 = 5000 (netResult dropped by the CMV).
    expect(report.netResult.amountCents).toBe('5000');
    // 1.1.6 is an Asset (BP account) — guarded, so the DRE stays valid (not flagged unmapped).
    expect(report.reportStatus).not.toBe('INVALID');
  });

  // T3 — symmetry preserved: same mixed Asset+Revenue scenario as T1 must keep
  // balanceSheet reportStatus OK (the pre-existing BP→DRE guard is untouched).
  it('T3 — same Caixa(Asset,D) + Receita(Revenue,C) scenario → balanceSheet stays OK', async () => {
    const accounts = [
      makeAccount({ code: '1.1', nature: 'Asset' }),
      makeAccount({ code: '3.1.01', nature: 'Revenue' }),
    ];
    const currentYearRaw: MockGroupByResult[] = [
      { accountId: '1.1', debitCents: 10000, creditCents: 0 },
      { accountId: '3.1.01', debitCents: 0, creditCents: 10000 },
    ];
    const groupByFn = (opts?: { from?: Date; to?: Date }): MockGroupByResult[] => {
      if (opts?.to && opts.to.getUTCFullYear() < 2026) return [];
      return currentYearRaw;
    };
    const { svc } = buildService(accounts, groupByFn);
    const report = await svc.balanceSheet(SCOPE, AS_OF);

    expect(report.reportStatus).toBe('OK');
    expect(report.diagnostics.unmappedAccounts).toEqual([]);
  });
});

// ─── StatementMappingFixture standalone ──────────────────────────────────────

describe('findMappingRule', () => {
  const { findMappingRule: find } = require('../StatementMappingFixture');

  it('3.1.xx Revenue → dre.gross_rev', () => {
    const r = find('Revenue', '3.1.01', 'DRE');
    expect(r?.id).toBe('dre.gross_rev');
  });

  it('3.2.xx Revenue → dre.deductions', () => {
    const r = find('Revenue', '3.2.01', 'DRE');
    expect(r?.id).toBe('dre.deductions');
  });

  it('Revenue without known prefix → undefined (no rule)', () => {
    const r = find('Revenue', '3.9.01', 'DRE');
    expect(r).toBeUndefined();
  });

  it('Asset → bp.assets', () => {
    const r = find('Asset', '1.1', 'BP');
    expect(r?.id).toBe('bp.assets');
  });

  it('Expense → dre.expenses', () => {
    const r = find('Expense', '4.1', 'DRE');
    expect(r?.id).toBe('dre.expenses');
  });

  it('4.2 Expense (CMV) → dre.cogs, not dre.expenses (first-match precedence)', () => {
    const r = find('Expense', '4.2', 'DRE');
    expect(r?.id).toBe('dre.cogs');
    expect(r?.section).toBe('costOfGoodsSold');
  });

  it('unknown nature → undefined', () => {
    expect(find('CustomNature', '9.9', 'BP')).toBeUndefined();
    expect(find('CustomNature', '9.9', 'DRE')).toBeUndefined();
  });
});
