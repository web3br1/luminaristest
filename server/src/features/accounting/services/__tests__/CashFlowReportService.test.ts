/**
 * CashFlowReportService — DFC (Demonstração do Fluxo de Caixa), MÉTODO INDIRETO,
 * read-only, FIRST-CLASS PRISMA.
 *
 * What is mocked: the two REPOSITORIES (account, posting), the POLICY, and the sibling
 * AccountingReportService (only its incomeStatement is consumed, for the DRE result).
 * No prisma client — the service only reads through the mocked collaborators.
 *
 * These tests pin the Contract §2.1 invariants:
 *  - the ledger identity RECONCILES: openingCash + (operating+investing+financing) ===
 *    closingCash, EXACT integer equality (no epsilon);
 *  - each account variation is CLASSIFIED into the right section by nature/code;
 *  - an EMPTY period is safe (all zeros, reconciles, no NaN);
 *  - SIGNS: an asset increase consumes cash (negative), a liability/equity increase and
 *    revenue are sources (positive), an expense is a use (negative);
 *  - the closing entry (sourceType='closing') is EXCLUDED from the windowed sections.
 */
import { CashFlowReportService } from '../CashFlowReportService';
import { ForbiddenError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

// asOf = 30 Jun 2026 → window is 1 Jan 2026 → 30 Jun 2026; opening boundary = 31 Dec 2025.
const asOf = new Date(Date.UTC(2026, 5, 30));

type Total = { accountId: string; debitCents: number; creditCents: number };
type GroupOpts = { from?: Date; to?: Date; excludeSourceTypes?: string[] };

/**
 * Builds a groupByAccount mock that dispatches by the query window:
 *  - options.from present            → windowed [1 Jan, asOf] (sections)
 *  - options.to in a prior year      → opening cash boundary
 *  - otherwise (to === asOf)         → closing cumulative
 */
function makeGroupByAccount(windowed: Total[], opening: Total[], closing: Total[]) {
  return jest.fn(async (_scope: AccountingScope, _statuses: string[], opts?: GroupOpts) => {
    if (opts?.from) return windowed;
    if (opts?.to && opts.to.getUTCFullYear() < asOf.getUTCFullYear()) return opening;
    return closing;
  });
}

function buildService(over: {
  accounts?: Array<{ id: string; code: string; name: string; nature: string }>;
  groupByAccount?: jest.Mock;
  netResultCents?: string;
  policy?: any;
} = {}) {
  const accountRepo = {
    findManyByUnit: jest.fn(async () => over.accounts ?? []),
    findByCode: jest.fn(async () => null),
    create: jest.fn(),
    softDelete: jest.fn(),
  };
  const postingRepo = {
    groupByAccount: over.groupByAccount ?? jest.fn(async () => []),
    create: jest.fn(),
    findByEntryId: jest.fn(async () => []),
    findByAccount: jest.fn(async () => []),
  };
  const reportService = {
    incomeStatement: jest.fn(async () => ({
      netResult: { amountCents: over.netResultCents ?? '0' },
    })),
  };
  const policy = {
    canRead: jest.fn(() => true),
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    ...over.policy,
  };
  const svc = new CashFlowReportService(
    accountRepo as any,
    postingRepo as any,
    reportService as any,
    policy as any,
  );
  return { svc, accountRepo, postingRepo, reportService, policy };
}

describe('CashFlowReportService.cashFlowStatement — reconciliation (ledger identity)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reconciles: openingCash + sections === closingCash (exact int), starting from the DRE result', async () => {
    // Window ledger:
    //   E1 sale on credit : A Receber D10000 / Receita  C10000
    //   E2 customer pays  : Banco     D6000  / A Receber C6000
    //   E3 pay expense    : Despesa   D2000  / Banco     C2000
    const accounts = [
      { id: 'banco', code: '1.1.1', name: 'Banco', nature: 'Asset' },
      { id: 'arec', code: '1.1.2', name: 'A Receber', nature: 'Asset' },
      { id: 'rec', code: '3.1', name: 'Receita de Serviços', nature: 'Revenue' },
      { id: 'desp', code: '4.1', name: 'Despesas Operacionais', nature: 'Expense' },
    ];
    const windowed: Total[] = [
      { accountId: 'banco', debitCents: 6000, creditCents: 2000 }, // cash, bal +4000
      { accountId: 'arec', debitCents: 10000, creditCents: 6000 }, // bal +4000
      { accountId: 'rec', debitCents: 0, creditCents: 10000 }, // bal -10000
      { accountId: 'desp', debitCents: 2000, creditCents: 0 }, // bal +2000
    ];
    const opening: Total[] = []; // opening cash 0
    const closing: Total[] = [{ accountId: 'banco', debitCents: 6000, creditCents: 2000 }]; // 4000

    const { svc } = buildService({
      accounts,
      groupByAccount: makeGroupByAccount(windowed, opening, closing),
      netResultCents: '8000', // revenue 10000 − expense 2000
    });
    const report = await svc.cashFlowStatement(scope, asOf);

    // sections (operating only here)
    expect(report.operating.totalCents).toBe('4000');
    expect(report.investing.totalCents).toBe('0');
    expect(report.financing.totalCents).toBe('0');
    // operating decomposition: netResult (DRE) + adjustments === total
    expect(report.operating.netResultCents).toBe('8000');
    expect(report.operating.adjustmentsCents).toBe('-4000'); // 4000 − 8000
    // cash position
    expect(report.openingCashCents).toBe('0');
    expect(report.closingCashCents).toBe('4000');
    // INVARIANT — exact
    expect(report.reconciliation.sectionsTotalCents).toBe('4000');
    expect(report.reconciliation.computedClosingCents).toBe('4000');
    expect(report.reconciliation.reconciles).toBe(true);
    expect(report.reportStatus).toBe('OK');
    expect(report.method).toBe('indirect');
    expect(report.fromDate).toBe('2026-01-01');
    expect(report.toDate).toBe('2026-06-30');
    // cash accounts are NEVER a section line
    const allCodes = [
      ...report.operating.accounts,
      ...report.investing.accounts,
      ...report.financing.accounts,
    ].map((l) => l.code);
    expect(allCodes).not.toContain('1.1.1');
    expect(report.operating.accounts.map((l) => l.code)).toEqual(['1.1.2', '3.1', '4.1']);
  });

  it('excludes the closing entry (sourceType=closing) from the windowed sections query', async () => {
    const gba = makeGroupByAccount([], [], []);
    const { svc } = buildService({ groupByAccount: gba });
    await svc.cashFlowStatement(scope, asOf);

    const windowedCall = gba.mock.calls.find((c) => (c[2] as GroupOpts)?.from);
    expect(windowedCall).toBeDefined();
    expect((windowedCall![2] as GroupOpts).excludeSourceTypes).toEqual(['closing']);
    expect((windowedCall![2] as GroupOpts).from).toBeInstanceOf(Date);
  });
});

describe('CashFlowReportService.cashFlowStatement — section classification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('classifies by nature/code: operating (WC), investing (1.2 asset), financing (2.2 liab + equity)', async () => {
    const accounts = [
      { id: 'arec', code: '1.1.2', name: 'A Receber', nature: 'Asset' }, // operating (current asset)
      { id: 'imob', code: '1.2.1', name: 'Imobilizado', nature: 'Asset' }, // investing (non-current)
      { id: 'forn', code: '2.1.1', name: 'Fornecedores', nature: 'Liability' }, // operating (current)
      { id: 'emp', code: '2.2.1', name: 'Empréstimos', nature: 'Liability' }, // financing
      { id: 'cap', code: '2.3.1', name: 'Capital', nature: 'Equity' }, // financing
    ];
    const windowed: Total[] = [
      { accountId: 'arec', debitCents: 5000, creditCents: 0 }, // bal +5000 → operating −5000
      { accountId: 'imob', debitCents: 30000, creditCents: 0 }, // bal +30000 → investing −30000
      { accountId: 'forn', debitCents: 0, creditCents: 3000 }, // bal −3000 → operating +3000
      { accountId: 'emp', debitCents: 0, creditCents: 20000 }, // bal −20000 → financing +20000
      { accountId: 'cap', debitCents: 0, creditCents: 40000 }, // bal −40000 → financing +40000
    ];
    const { svc } = buildService({
      accounts,
      groupByAccount: makeGroupByAccount(windowed, [], []),
    });
    const report = await svc.cashFlowStatement(scope, asOf);

    expect(report.investing.accounts).toEqual([
      { accountId: 'imob', code: '1.2.1', name: 'Imobilizado', nature: 'Asset', amountCents: '-30000' },
    ]);
    expect(report.investing.totalCents).toBe('-30000');

    const finCodes = report.financing.accounts.map((l) => `${l.code}:${l.amountCents}`);
    expect(finCodes).toEqual(['2.2.1:20000', '2.3.1:40000']);
    expect(report.financing.totalCents).toBe('60000');

    const opCodes = report.operating.accounts.map((l) => `${l.code}:${l.amountCents}`);
    expect(opCodes).toEqual(['1.1.2:-5000', '2.1.1:3000']);
    expect(report.operating.totalCents).toBe('-2000'); // −5000 + 3000
  });
});

describe('CashFlowReportService.cashFlowStatement — empty period & signs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('empty period → all sections zero, reconciles (0+0===0), no NaN', async () => {
    const { svc } = buildService({ groupByAccount: makeGroupByAccount([], [], []) });
    const report = await svc.cashFlowStatement(scope, asOf);

    expect(report.operating.accounts).toEqual([]);
    expect(report.operating.totalCents).toBe('0');
    expect(report.operating.netResultCents).toBe('0');
    expect(report.operating.adjustmentsCents).toBe('0');
    expect(report.investing.totalCents).toBe('0');
    expect(report.financing.totalCents).toBe('0');
    expect(report.openingCashCents).toBe('0');
    expect(report.closingCashCents).toBe('0');
    expect(report.reconciliation.reconciles).toBe(true);
    expect(report.reportStatus).toBe('OK');
    for (const v of [
      report.operating.totalCents,
      report.reconciliation.computedClosingCents,
      report.closingCashCents,
    ]) {
      expect(Number.isNaN(parseInt(v, 10))).toBe(false);
    }
  });

  it('signs: asset↑ = −cash, liability↑ = +cash, revenue = +cash, expense = −cash', async () => {
    const accounts = [
      { id: 'arec', code: '1.1.2', name: 'A Receber', nature: 'Asset' },
      { id: 'forn', code: '2.1.1', name: 'Fornecedores', nature: 'Liability' },
      { id: 'rec', code: '3.1', name: 'Receita', nature: 'Revenue' },
      { id: 'desp', code: '4.1', name: 'Despesa', nature: 'Expense' },
    ];
    const windowed: Total[] = [
      { accountId: 'arec', debitCents: 1000, creditCents: 0 }, // asset ↑ (debit)
      { accountId: 'forn', debitCents: 0, creditCents: 1000 }, // liability ↑ (credit)
      { accountId: 'rec', debitCents: 0, creditCents: 1000 }, // revenue (credit)
      { accountId: 'desp', debitCents: 1000, creditCents: 0 }, // expense (debit)
    ];
    const { svc } = buildService({
      accounts,
      groupByAccount: makeGroupByAccount(windowed, [], []),
    });
    const report = await svc.cashFlowStatement(scope, asOf);

    const byCode = new Map(report.operating.accounts.map((l) => [l.code, l.amountCents]));
    expect(byCode.get('1.1.2')).toBe('-1000'); // asset increase consumes cash
    expect(byCode.get('2.1.1')).toBe('1000'); // liability increase is a source
    expect(byCode.get('3.1')).toBe('1000'); // revenue is a source
    expect(byCode.get('4.1')).toBe('-1000'); // expense is a use
  });

  it('throws ForbiddenError when policy.canRead is false (before any query)', async () => {
    const gba = makeGroupByAccount([], [], []);
    const { svc, reportService } = buildService({
      groupByAccount: gba,
      policy: { canRead: jest.fn(() => false) },
    });
    await expect(svc.cashFlowStatement(scope, asOf)).rejects.toBeInstanceOf(ForbiddenError);
    expect(gba).not.toHaveBeenCalled();
    expect(reportService.incomeStatement).not.toHaveBeenCalled();
  });
});
