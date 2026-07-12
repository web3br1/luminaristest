import type { AccountingScope } from '../scope/AccountingScope';
import type { AccountingReportService } from './AccountingReportService';

/**
 * One comparative row: an account's as-of balance in the current vs the previous
 * period, plus the absolute and percentage variation. All balances/deltas are in
 * INTEGER CENTS (Contract §2.1); `deltaPct` is the ONLY float — a display ratio,
 * never money.
 */
export interface PeriodComparisonRow {
  code: string;
  name: string;
  /** Balance (debit - credit) as-of asOfCurrent, integer cents. 0 if the account had no postings. */
  current: number;
  /** Balance as-of asOfPrevious, integer cents. 0 if the account did not yet exist / had no postings. */
  previous: number;
  /** current - previous, integer cents (exact). */
  deltaAbs: number;
  /**
   * Percentage variation = (deltaAbs / previous) * 100. `null` when previous === 0
   * (division-by-zero guard) — never Infinity/NaN. A raw float percentage (not rounded,
   * not cents); consumers format for display.
   */
  deltaPct: number | null;
}

/** Comparative trial balance report shape. Dates echoed as YYYY-MM-DD. */
export interface PeriodComparisonReport {
  unitId: string;
  asOfCurrent: string;
  asOfPrevious: string;
  rows: PeriodComparisonRow[];
}

/**
 * PeriodComparisonReportService — read-only comparative trial balance ("balancete
 * comparativo" / monthly variation). FIRST-CLASS PRISMA read report.
 *
 * Reuses AccountingReportService.balancesAsOf() (which itself is policy-gated and wraps
 * the shared per-account aggregation) for BOTH snapshots, so the balance math is derived
 * in exactly one place. This service only diffs the two snapshots — it holds no ledger
 * logic of its own and touches no choke point (composition happens above the plugin
 * engine, at the service layer — Contract §2.1).
 *
 * An account present in only one snapshot is treated as 0 in the other (a brand-new
 * account has no `previous`; a fully-reversed/dormant one may drop out of `current`).
 */
export class PeriodComparisonReportService {
  constructor(private readonly reportService: AccountingReportService) {}

  async comparativeTrialBalance(
    scope: AccountingScope,
    asOfCurrent: Date,
    asOfPrevious: Date,
  ): Promise<PeriodComparisonReport> {
    // balancesAsOf enforces policy.canRead on each call — the authorization gate.
    const [currentRows, previousRows] = await Promise.all([
      this.reportService.balancesAsOf(scope, asOfCurrent),
      this.reportService.balancesAsOf(scope, asOfPrevious),
    ]);

    const previousByAccount = new Map(previousRows.map((r) => [r.accountId, r]));
    const currentByAccount = new Map(currentRows.map((r) => [r.accountId, r]));

    // Union of accounts across both snapshots, keyed by accountId (code/name are
    // display fields; accountId is the stable identity).
    const accountIds = new Set<string>([...currentByAccount.keys(), ...previousByAccount.keys()]);

    const rows: PeriodComparisonRow[] = [];
    for (const accountId of accountIds) {
      const cur = currentByAccount.get(accountId);
      const prev = previousByAccount.get(accountId);
      const current = cur?.balanceCents ?? 0;
      const previous = prev?.balanceCents ?? 0;
      const deltaAbs = current - previous;

      rows.push({
        // Prefer the current snapshot's code/name; fall back to the previous snapshot
        // for an account that dropped out of the current window.
        code: cur?.code ?? prev?.code ?? '?',
        name: cur?.name ?? prev?.name ?? '(conta removida)',
        current,
        previous,
        deltaAbs,
        // Division-by-zero guard: no baseline ⇒ percentage is undefined, not Infinity/NaN.
        deltaPct: previous === 0 ? null : (deltaAbs / previous) * 100,
      });
    }

    rows.sort((a, b) => a.code.localeCompare(b.code));

    return {
      unitId: scope.unitId,
      asOfCurrent: asOfCurrent.toISOString().slice(0, 10),
      asOfPrevious: asOfPrevious.toISOString().slice(0, 10),
      rows,
    };
  }
}
