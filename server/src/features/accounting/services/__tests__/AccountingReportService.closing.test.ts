import { AccountingReportService } from '../AccountingReportService';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import type { Account } from 'generated/prisma';

/**
 * BE-INCR-SPED-APURACAO D3 — the closing-awareness of the shared reports:
 *   - incomeStatement (DRE) EXCLUDES the closing entry ⇒ shows the operational result;
 *   - balanceSheet is UNCHANGED (closing-inclusive) ⇒ once closed, equity carries the result
 *     and netResultLine auto-zeroes, so `balanced` (A = P) holds BOTH before and after closing.
 */

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function acc(over: Partial<Account>): Account {
  return {
    id: over.code, userId: 'owner-1', unitId: 'unit-1', code: '1', name: 'X', nature: 'Asset',
    acceptsEntries: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as Account;
}

const ACCOUNTS: Account[] = [
  acc({ code: '1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true }),
  acc({ code: '3.1', name: 'Receita', nature: 'Revenue', acceptsEntries: true }),
  acc({ code: '2.3.1', name: 'Lucros Acumulados', nature: 'Equity', acceptsEntries: true }),
];

type Bal = Record<string, number>; // accountId(=code) -> signed balance (debit − credit)

function toTotals(bal: Bal) {
  return Object.entries(bal).map(([accountId, b]) => ({
    accountId,
    debitCents: b > 0 ? b : 0,
    creditCents: b < 0 ? -b : 0,
  }));
}

/** operational = closing-excluded ledger; posted = closing-inclusive ledger. */
function build(operational: Bal, posted: Bal) {
  const groupByAccount = jest.fn(
    async (_s: unknown, _st: string[], opts?: { to?: Date; excludeSourceTypes?: string[] }) => {
      // Prior-year windows (to before 2026) are empty in these fixtures.
      if (opts?.to && opts.to.getUTCFullYear() < 2026) return [];
      const excludesClosing = !!opts?.excludeSourceTypes?.includes('closing');
      return toTotals(excludesClosing ? operational : posted);
    },
  );
  const service = new AccountingReportService(
    { findManyByUnit: jest.fn(async () => ACCOUNTS) } as never,
    { groupByAccount } as never,
    {} as never,
    { canRead: () => true } as never,
  );
  return { service };
}

const asOf = new Date('2026-12-31T00:00:00Z');

describe('AccountingReportService — closing-aware (D3)', () => {
  // A sale of 1000 (Caixa +1000, Receita −1000). Closed: Receita → 0, Retained −1000.
  const OPERATIONAL: Bal = { '1.1': 1000, '3.1': -1000, '2.3.1': 0 };
  const POSTED_CLOSED: Bal = { '1.1': 1000, '3.1': 0, '2.3.1': -1000 };

  it('before closing: DRE shows the result AND balanceSheet is balanced (netResultLine carries it)', async () => {
    // No closing entry exists ⇒ operational == posted.
    const { service } = build(OPERATIONAL, OPERATIONAL);
    const dre = await service.incomeStatement(scope, asOf);
    expect(dre.netResult.amountCents).toBe('1000'); // profit visible

    const bp = await service.balanceSheet(scope, asOf);
    expect(bp.netResultLine.amountCents).toBe('1000'); // result carried on the BP line
    expect(bp.equity.totalCents).toBe('0'); // equity does not yet hold it
    expect(bp.balanced).toBe(true); // 1000 === 0 + 0 + 1000
  });

  it('after closing: DRE STILL shows the operational result (excludes the closing entry)', async () => {
    const { service } = build(OPERATIONAL, POSTED_CLOSED);
    const dre = await service.incomeStatement(scope, asOf);
    expect(dre.netResult.amountCents).toBe('1000'); // NOT zero — exclusion works
  });

  it('after closing: balanceSheet stays balanced with equity carrying the result and netResultLine=0', async () => {
    const { service } = build(OPERATIONAL, POSTED_CLOSED);
    const bp = await service.balanceSheet(scope, asOf);
    expect(bp.equity.totalCents).toBe('1000'); // retained earnings now holds the result
    expect(bp.netResultLine.amountCents).toBe('0'); // no longer double-counted
    expect(bp.balanced).toBe(true); // 1000 === 0 + 1000 + 0
  });
});
