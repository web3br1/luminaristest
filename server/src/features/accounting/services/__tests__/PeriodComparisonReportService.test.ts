/**
 * PeriodComparisonReportService — comparative trial balance / monthly variation.
 *
 * Pure service-layer unit tests (no Prisma). AccountingReportService is mocked: its
 * policy-gated balancesAsOf() is routed by the asOf date so we drive the two snapshots
 * independently. All balances in INTEGER CENTS.
 *
 * Invariants tested:
 *   - deltaAbs = current - previous, exact integer (both directions)
 *   - deltaPct === null when previous === 0 (division-by-zero guard, never Infinity/NaN)
 *   - account present only in the current snapshot ⇒ previous = 0
 *   - rows ordered by account code (not by union/insertion order)
 */
import type { AccountingReportService } from '../AccountingReportService';
import type { AccountingScope } from '../../scope/AccountingScope';
import { PeriodComparisonReportService } from '../PeriodComparisonReportService';

type Row = {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
};

function row(accountId: string, code: string, balanceCents: number, name = code): Row {
  return { accountId, code, name, nature: 'Asset', debitCents: 0, creditCents: 0, balanceCents };
}

const scope = { unitId: 'unit1', ownerUserId: 'u1' } as unknown as AccountingScope;

const asOfCurrent = new Date('2026-02-28T00:00:00.000Z');
const asOfPrevious = new Date('2026-01-31T00:00:00.000Z');

function buildService(currentRows: Row[], previousRows: Row[]) {
  const balancesAsOf = jest.fn(async (_scope: AccountingScope, asOf: Date) =>
    asOf.getTime() === asOfCurrent.getTime() ? currentRows : previousRows,
  );
  const reportService = { balancesAsOf } as unknown as AccountingReportService;
  return { svc: new PeriodComparisonReportService(reportService), balancesAsOf };
}

beforeEach(() => jest.clearAllMocks());

describe('PeriodComparisonReportService.comparativeTrialBalance', () => {
  it('computes deltaAbs, deltaPct, handles previous-zero and current-only accounts, sorted by code', async () => {
    // A: present both periods (grows). D: previous exists but nets to 0 → deltaPct null.
    // B: current-only (code sorts AFTER D despite being inserted before it) → previous 0.
    const currentRows = [
      row('A', '1.1.01', 15000),
      row('B', '3.1.01', 5000),
      row('D', '2.1.01', 8000),
    ];
    const previousRows = [row('A', '1.1.01', 10000), row('D', '2.1.01', 0)];

    const { svc } = buildService(currentRows, previousRows);
    const report = await svc.comparativeTrialBalance(scope, asOfCurrent, asOfPrevious);

    expect(report.unitId).toBe('unit1');
    expect(report.asOfCurrent).toBe('2026-02-28');
    expect(report.asOfPrevious).toBe('2026-01-31');

    // Ordered by code: 1.1.01 (A), 2.1.01 (D), 3.1.01 (B) — proves the sort ran.
    expect(report.rows.map((r) => r.code)).toEqual(['1.1.01', '2.1.01', '3.1.01']);

    const [a, d, b] = report.rows;

    // A — delta absoluto e percentual corretos.
    expect(a).toEqual({
      code: '1.1.01',
      name: '1.1.01',
      current: 15000,
      previous: 10000,
      deltaAbs: 5000,
      deltaPct: 50,
    });

    // D — conta existe no anterior mas com saldo 0 ⇒ deltaPct null (guarda div/0), não Infinity/NaN.
    expect(d.current).toBe(8000);
    expect(d.previous).toBe(0);
    expect(d.deltaAbs).toBe(8000);
    expect(d.deltaPct).toBeNull();
    expect(Number.isFinite(d.deltaPct as number | null as number)).toBe(false);

    // B — conta só no período atual ⇒ previous ausente tratado como 0, deltaPct null.
    expect(b.current).toBe(5000);
    expect(b.previous).toBe(0);
    expect(b.deltaAbs).toBe(5000);
    expect(b.deltaPct).toBeNull();
  });

  it('reads both snapshots via balancesAsOf (one call per as-of date)', async () => {
    const { svc, balancesAsOf } = buildService([row('A', '1', 100)], [row('A', '1', 100)]);
    await svc.comparativeTrialBalance(scope, asOfCurrent, asOfPrevious);

    expect(balancesAsOf).toHaveBeenCalledTimes(2);
    expect(balancesAsOf).toHaveBeenCalledWith(scope, asOfCurrent);
    expect(balancesAsOf).toHaveBeenCalledWith(scope, asOfPrevious);
  });

  it('deltaPct is negative when the balance shrinks (sanity on sign)', async () => {
    const { svc } = buildService([row('A', '1', 5000)], [row('A', '1', 10000)]);
    const report = await svc.comparativeTrialBalance(scope, asOfCurrent, asOfPrevious);
    expect(report.rows[0].deltaAbs).toBe(-5000);
    expect(report.rows[0].deltaPct).toBe(-50);
  });
});
