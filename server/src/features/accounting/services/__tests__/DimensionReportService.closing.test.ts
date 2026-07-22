import { DimensionReportService } from '../DimensionReportService';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { CLOSING_SOURCE_TYPE } from '../../models/closing';
import type { Account, DimensionDefinition, DimensionValue } from 'generated/prisma';
import type { AccountDimensionTotals } from '../../repositories/IPostingRepository';

/**
 * FIX-DRE-DIM (Council N5) — closing-awareness of the dimension reports:
 *   - resultByDimension (DRE por dimensão) EXCLUDES the closing entry (sourceType='closing'),
 *     mirroring AccountingReportService.incomeStatement (BE-INCR-SPED-APURACAO D3). Without the
 *     exclusion, a year-end closing zeroes every result account in the window: the report totals
 *     self-cancel and the untagged closing legs surface as a phantom "(Não alocado)" bucket.
 *   - balanceByDimension stays closing-INCLUSIVE, like the canonical trialBalance, so the
 *     ACC-024 tie-out (Σ buckets == trial balance for the same window) keeps holding after close.
 *
 * Fixture MIXES natures (Revenue credit-normal AND Expense debit-normal both closed) — a
 * same-nature fixture would let a one-directional exclusion guard ship broken
 * (memory: bp-dre-diagnostics-test-must-mix-natures).
 */

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

const ACCOUNTS: Account[] = [
  acc('a-cash', '1.1', 'Asset'),
  acc('a-ret', '2.3.1', 'Equity'),
  acc('a-rev', '3.1', 'Revenue'),
  acc('a-exp', '4.1', 'Expense'),
];

// OPERATIONAL = the year's activity, result legs tagged on v1/v2 (closing EXCLUDED).
const OPERATIONAL: AccountDimensionTotals[] = [
  { accountId: 'a-rev', valueId: 'v1', debitCents: 0, creditCents: 20000 },
  { accountId: 'a-exp', valueId: 'v1', debitCents: 8000, creditCents: 0 },
  { accountId: 'a-rev', valueId: 'v2', debitCents: 0, creditCents: 5000 },
  { accountId: 'a-exp', valueId: 'v2', debitCents: 2000, creditCents: 0 },
  { accountId: 'a-cash', valueId: null, debitCents: 15000, creditCents: 0 },
];

// The closing entry's legs: UNTAGGED (ExerciseClosingService posts no dimension tags) —
// zero each result account and move the 15000 profit into retained earnings.
const CLOSING_LEGS: AccountDimensionTotals[] = [
  { accountId: 'a-rev', valueId: null, debitCents: 25000, creditCents: 0 },
  { accountId: 'a-exp', valueId: null, debitCents: 0, creditCents: 10000 },
  { accountId: 'a-ret', valueId: null, debitCents: 0, creditCents: 15000 },
];

// POSTED = closing-INCLUSIVE ledger (what the repo returns with no exclusion).
const POSTED_CLOSED: AccountDimensionTotals[] = [...OPERATIONAL, ...CLOSING_LEGS];

/** Repo mock keyed on excludeSourceTypes — same technique as AccountingReportService.closing.test. */
function build() {
  const groupByAccountAndDimension = jest.fn(
    async (
      _s: unknown,
      _st: string[],
      opts: { definitionId: string; excludeSourceTypes?: string[] },
    ) => {
      const excludesClosing = !!opts.excludeSourceTypes?.includes(CLOSING_SOURCE_TYPE);
      return excludesClosing ? OPERATIONAL : POSTED_CLOSED;
    },
  );
  const service = new DimensionReportService(
    { groupByAccountAndDimension } as never,
    { findManyByUnit: jest.fn(async () => ACCOUNTS) } as never,
    {
      findDefinitionById: jest.fn(async () => definition),
      findManyValues: jest.fn(async () => [val('v1'), val('v2')]),
    } as never,
    { canReadDimension: () => true } as never,
  );
  return { service, groupByAccountAndDimension };
}

const query = { unitId: 'unit-1', definitionId: 'def-cc' };

beforeEach(() => jest.clearAllMocks());

describe('DimensionReportService — closing-aware (FIX-DRE-DIM)', () => {
  it('after closing: resultByDimension does NOT zero — both natures survive the exclusion', async () => {
    const { service, groupByAccountAndDimension } = build();
    const rep = await service.resultByDimension(scope, query);

    // The repo was asked to EXCLUDE the closing entry (the D3 mechanism).
    expect(groupByAccountAndDimension).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ excludeSourceTypes: [CLOSING_SOURCE_TYPE] }),
    );

    // Cross-nature check: BOTH directions kept (a one-way guard would fail one of these).
    const v1 = rep.buckets.find((b) => b.valueId === 'v1')!;
    expect(v1.ownRevenueCents).toBe(20000);
    expect(v1.ownExpenseCents).toBe(8000);
    expect(v1.ownResultCents).toBe(12000);
    const v2 = rep.buckets.find((b) => b.valueId === 'v2')!;
    expect(v2.ownResultCents).toBe(3000);

    // Totals = the operational DRE, NOT zero.
    expect(rep.totals).toEqual({ revenueCents: 25000, expenseCents: 10000, resultCents: 15000 });

    // No phantom "(Não alocado)" bucket built from the untagged closing legs.
    expect(rep.buckets.find((b) => b.valueId === null)).toBeUndefined();
  });

  it('pre-fix regression shape (documenting the bug): closing-INCLUSIVE totals self-cancel to zero', async () => {
    // Sanity on the fixture itself: had resultByDimension read POSTED_CLOSED, revenue
    // (25000c − 25000d) and expense (10000d − 10000c) would both net to 0 — the exact
    // failure this fix removes. Keeps the fixture honest (it truly encodes a closing).
    let rev = 0;
    let exp = 0;
    for (const t of POSTED_CLOSED) {
      if (t.accountId === 'a-rev') rev += t.creditCents - t.debitCents;
      if (t.accountId === 'a-exp') exp += t.debitCents - t.creditCents;
    }
    expect(rev).toBe(0);
    expect(exp).toBe(0);
  });

  it('after closing: balanceByDimension stays closing-INCLUSIVE (canonical trialBalance parity, ACC-024)', async () => {
    const { service, groupByAccountAndDimension } = build();
    const rep = await service.balanceByDimension(scope, query);

    // The repo was called WITHOUT any sourceType exclusion.
    const opts = groupByAccountAndDimension.mock.calls[0][2];
    expect(opts.excludeSourceTypes).toBeUndefined();

    // Grand total includes the closing legs — Σdebit == Σcredit like the closed trial balance.
    expect(rep.totals.debitCents).toBe(50000);
    expect(rep.totals.creditCents).toBe(50000);
    // Retained earnings (posted only by the closing entry) IS visible in the balancete cut.
    const none = rep.buckets.find((b) => b.valueId === null)!;
    expect(none.accounts.some((a) => a.accountId === 'a-ret' && a.creditCents === 15000)).toBe(true);
    // Σ every bucket's OWN == grand total (nothing lost, nothing double-counted).
    const sumOwnDebit = rep.buckets.reduce((s, b) => s + b.ownDebitCents, 0);
    expect(sumOwnDebit).toBe(50000);
  });

  it('before closing: resultByDimension is unchanged (no closing legs to exclude)', async () => {
    const groupByAccountAndDimension = jest.fn(async () => OPERATIONAL);
    const service = new DimensionReportService(
      { groupByAccountAndDimension } as never,
      { findManyByUnit: jest.fn(async () => ACCOUNTS) } as never,
      {
        findDefinitionById: jest.fn(async () => definition),
        findManyValues: jest.fn(async () => [val('v1'), val('v2')]),
      } as never,
      { canReadDimension: () => true } as never,
    );
    const rep = await service.resultByDimension(scope, query);
    expect(rep.totals).toEqual({ revenueCents: 25000, expenseCents: 10000, resultCents: 15000 });
  });
});
