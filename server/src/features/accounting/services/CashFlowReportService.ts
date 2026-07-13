import { ForbiddenError } from '../../../lib/errors';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import { LEDGER_STATUSES } from '../models/ledgerStatus';
import { CLOSING_SOURCE_TYPE } from '../models/closing';
import { STATEMENT_MAPPING_VERSION } from './StatementMappingFixture';
import type { AccountingReportService } from './AccountingReportService';

// ─── Cash-flow classification (por natureza/code de conta) ──────────────────────

/**
 * Cash & equivalents leaves ("Disponibilidades") of the canonical chart
 * (ChartOfAccountsFixture): Banco (1.1.1) and Caixa (1.1.3). NOT 1.1.2 (A Receber)
 * nor 1.1.4 (A Receber Cartão) — those are receivables (working capital), not cash.
 * A prefix match also catches analytic sub-accounts (e.g. '1.1.1.01').
 *
 * These accounts DEFINE the cash position: their variation IS the ΔCash the three
 * sections reconcile to — so they are excluded from Operating/Investing/Financing.
 */
export const CASH_ACCOUNT_CODE_PREFIXES: readonly string[] = ['1.1.1', '1.1.3'];

/** Non-current / investment asset prefixes → Investing (buying/selling long-term assets). */
export const INVESTING_ASSET_CODE_PREFIXES: readonly string[] = ['1.2'];

/** Financing-liability prefixes (empréstimos/financiamentos, Passivo Não Circulante) → Financing. */
export const FINANCING_LIABILITY_CODE_PREFIXES: readonly string[] = ['2.2'];

export type CashFlowSectionId = 'operating' | 'investing' | 'financing';

/** True iff `code` is (or is a sub-account of) one of the given prefixes. */
function matchesPrefix(code: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => code === p || code.startsWith(`${p}.`));
}

/** True iff `code` is a cash & equivalents leaf. */
export function isCashAccount(code: string): boolean {
  return matchesPrefix(code, CASH_ACCOUNT_CODE_PREFIXES);
}

/**
 * Classifies a NON-CASH account into one of the three cash-flow sections by
 * nature + code. Revenue/Expense are the operating result component; current
 * assets/liabilities are operating working capital; non-current assets are
 * investing; equity and financing liabilities are financing. Unknown nature
 * ('?' — an orphan/removed account) defaults to operating and is flagged in
 * diagnostics so the identity below still assigns EVERY account to a section.
 */
export function classifyCashFlowSection(nature: string, code: string): CashFlowSectionId {
  if (nature === 'Revenue' || nature === 'Expense') return 'operating';
  if (nature === 'Equity') return 'financing';
  if (nature === 'Asset') {
    return matchesPrefix(code, INVESTING_ASSET_CODE_PREFIXES) ? 'investing' : 'operating';
  }
  if (nature === 'Liability') {
    return matchesPrefix(code, FINANCING_LIABILITY_CODE_PREFIXES) ? 'financing' : 'operating';
  }
  return 'operating';
}

// ─── Report shape (all money INTEGER CENTS, signed, serialised as string) ───────

/** One line: an account's cash contribution = −(debit − credit) balance for the window. */
export interface CashFlowLine {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  /** Signed cents (string, ADR-INCR4 convention). Positive = source of cash. */
  amountCents: string;
}

/** Investing / Financing section: just lines + total. */
export interface CashFlowSection {
  accounts: CashFlowLine[];
  totalCents: string;
}

/**
 * Operating section (método indireto): the DRE result is the STARTING point,
 * `adjustmentsCents` folds working-capital variations (and any contra-revenue sign
 * reconciliation between the DRE display convention and the raw ledger identity), so
 * netResultCents + adjustmentsCents === totalCents by construction.
 */
export interface CashFlowOperatingSection {
  accounts: CashFlowLine[];
  /** Resultado do período reused from the DRE (income statement). */
  netResultCents: string;
  /** totalCents − netResultCents (working-capital & non-cash adjustments). */
  adjustmentsCents: string;
  totalCents: string;
}

export interface CashFlowStatementReport {
  unitId: string;
  method: 'indirect';
  periodSemantics: 'year_to_date';
  fromDate: string;
  toDate: string;
  mappingVersion: string;
  operating: CashFlowOperatingSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  openingCashCents: string;
  closingCashCents: string;
  reconciliation: {
    /** operating + investing + financing (net cash generated in the window). */
    sectionsTotalCents: string;
    /** openingCash + sectionsTotal — must equal closingCash for a valid statement. */
    computedClosingCents: string;
    /** EXACT integer equality (Contract §2.1) — computedClosing === closingCash. */
    reconciles: boolean;
  };
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  warnings: string[];
}

// ─── Internal balance row ───────────────────────────────────────────────────────

interface CashBalanceRow {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  /** debitCents − creditCents (raw ledger balance for the queried window). */
  balanceCents: number;
}

// ─── Service ────────────────────────────────────────────────────────────────────

/**
 * CashFlowReportService — DFC (Demonstração do Fluxo de Caixa), MÉTODO INDIRETO,
 * read-only, FIRST-CLASS PRISMA (Contract §2.1). Zero migration: reads existing
 * ledger via the injected repositories, reuses AccountingReportService.incomeStatement
 * for the DRE result.
 *
 * INVARIANT (exact integer, no epsilon): openingCash + (operating + investing +
 * financing) === closingCash. It holds by the trial-balance identity: every posted
 * entry is internally balanced (Σdebit = Σcredit), so across ALL accounts Σbalance = 0
 * for any window ⇒ Σ(cash balance) = −Σ(non-cash balance). Defining each non-cash
 * account's cash contribution as −balanceCents and summing them therefore equals the
 * cash movement, which equals closingCash − openingCash. The closing entry
 * (sourceType='closing') is excluded from the windowed sections (it touches no cash
 * leg, so ΔCash is unaffected, and excluding a fully-balanced entry keeps Σ = 0) so the
 * operating result component stays aligned with the (closing-exclusive) DRE.
 */
export class CashFlowReportService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly reportService: AccountingReportService,
    private readonly policy: IAccountingPolicy,
  ) {}

  /** Sums the cash & equivalents balance across a set of rows (INTEGER CENTS). */
  private sumCash(rows: CashBalanceRow[]): number {
    return rows.reduce((acc, r) => (isCashAccount(r.code) ? acc + r.balanceCents : acc), 0);
  }

  /**
   * Demonstração do Fluxo de Caixa (método indireto), year_to_date: 1 Jan of asOf.year
   * → asOf inclusive. Reconciles the period result and patrimonial variations into
   * Operational / Investing / Financing sections.
   */
  async cashFlowStatement(scope: AccountingScope, asOf: Date): Promise<CashFlowStatementReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o fluxo de caixa.');
    }

    const asOfIso = asOf.toISOString().slice(0, 10);
    const fromDate = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)); // 1 Jan UTC
    const fromIso = fromDate.toISOString().slice(0, 10);
    // Prior year-end (opening cash boundary) — same shape as balanceSheet.priorRows.
    const priorYearEnd = new Date(Date.UTC(asOf.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999));

    // Chart is fetched ONCE and joined to each aggregate (nature '?' marks an orphan).
    const accounts = await this.accountRepo.findManyByUnit(scope);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const toRows = (
      totals: { accountId: string; debitCents: number; creditCents: number }[],
    ): CashBalanceRow[] =>
      totals.map((t) => {
        const a = accountById.get(t.accountId);
        return {
          accountId: t.accountId,
          code: a?.code ?? '?',
          name: a?.name ?? '(conta removida)',
          nature: a?.nature ?? '?',
          balanceCents: t.debitCents - t.creditCents,
        };
      });

    const [windowedTotals, openingTotals, closingTotals, incomeStatement] = await Promise.all([
      // Windowed sections: exclude the closing entry (operational, DRE-aligned).
      this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, {
        from: fromDate,
        to: asOf,
        excludeSourceTypes: [CLOSING_SOURCE_TYPE],
      }),
      // Opening / closing cash: cumulative, full history (closing entry has no cash leg).
      this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, { to: priorYearEnd }),
      this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, { to: asOf }),
      this.reportService.incomeStatement(scope, asOf),
    ]);

    const windowedRows = toRows(windowedTotals);
    const openingCashCents = this.sumCash(toRows(openingTotals));
    const closingCashCents = this.sumCash(toRows(closingTotals));

    // Classify every NON-CASH account's cash contribution (−balanceCents) into a section.
    const section: Record<CashFlowSectionId, { accounts: CashFlowLine[]; total: number }> = {
      operating: { accounts: [], total: 0 },
      investing: { accounts: [], total: 0 },
      financing: { accounts: [], total: 0 },
    };
    const warnings: string[] = [];
    let orphanNonZero = 0;

    for (const row of windowedRows) {
      if (isCashAccount(row.code)) continue; // cash IS the reconciliation target
      if (row.balanceCents === 0) continue; // no movement → no line
      if (row.nature === '?') orphanNonZero += 1;
      const contributionCents = -row.balanceCents;
      const target = section[classifyCashFlowSection(row.nature, row.code)];
      target.accounts.push({
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        nature: row.nature,
        amountCents: String(contributionCents),
      });
      target.total += contributionCents;
    }

    // Deterministic order within each section (by account code).
    for (const id of ['operating', 'investing', 'financing'] as CashFlowSectionId[]) {
      section[id].accounts.sort((a, b) => a.code.localeCompare(b.code));
    }

    const netResultCents = parseInt(incomeStatement.netResult.amountCents, 10);
    const operatingTotal = section.operating.total;
    const sectionsTotalCents = operatingTotal + section.investing.total + section.financing.total;
    const computedClosingCents = openingCashCents + sectionsTotalCents;
    const reconciles = computedClosingCents === closingCashCents; // EXACT integer equality

    if (orphanNonZero > 0) {
      warnings.push(`${orphanNonZero} conta(s) removida(s) com saldo não-zero classificada(s) em Operacional.`);
    }

    let reportStatus: CashFlowStatementReport['reportStatus'] = 'OK';
    if (!reconciles) reportStatus = 'INVALID';
    else if (warnings.length > 0) reportStatus = 'WARNING';

    return {
      unitId: scope.unitId,
      method: 'indirect',
      periodSemantics: 'year_to_date',
      fromDate: fromIso,
      toDate: asOfIso,
      mappingVersion: STATEMENT_MAPPING_VERSION,
      operating: {
        accounts: section.operating.accounts,
        netResultCents: String(netResultCents),
        adjustmentsCents: String(operatingTotal - netResultCents),
        totalCents: String(operatingTotal),
      },
      investing: {
        accounts: section.investing.accounts,
        totalCents: String(section.investing.total),
      },
      financing: {
        accounts: section.financing.accounts,
        totalCents: String(section.financing.total),
      },
      openingCashCents: String(openingCashCents),
      closingCashCents: String(closingCashCents),
      reconciliation: {
        sectionsTotalCents: String(sectionsTotalCents),
        computedClosingCents: String(computedClosingCents),
        reconciles,
      },
      reportStatus,
      warnings,
    };
  }
}
