import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import {
  STATEMENT_MAPPING_VERSION,
  findMappingRule,
  applySign,
} from './StatementMappingFixture';

// ─── Trial balance ────────────────────────────────────────────────────────────

/** One trial-balance row, all money in INTEGER CENTS. */
export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
}

/** Trial-balance report shape: rows + grand total + an audit flag. */
export interface TrialBalanceReport {
  unitId: string;
  rows: TrialBalanceRow[];
  totals: { debitCents: number; creditCents: number; balanceCents: number };
  /** Audit flag: Σdebit === Σcredit across all rows (exact integer equality). */
  balanced: boolean;
}

// ─── Account ledger ───────────────────────────────────────────────────────────

/** One ledger row for a single account, with running balance (INTEGER CENTS). */
export interface AccountLedgerRow {
  postingId: string;
  entryId: string;
  date: Date;
  description: string;
  status: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

/** Account-ledger report shape. */
export interface AccountLedgerReport {
  unitId: string;
  account: { accountId: string; code: string; name: string; nature: string };
  rows: AccountLedgerRow[];
  closingBalanceCents: number;
}

// ─── BP / DRE shared types ────────────────────────────────────────────────────

interface BpDreLine {
  accountId: string;
  code: string;
  name: string;
  /** Signed cents, serialised as string (ADR-INCR4 §"Tudo em centavos"). */
  amountCents: string;
}

interface StatementSection {
  accounts: BpDreLine[];
  totalCents: string;
}

interface DiagnosticsShape {
  mappingVersion: string;
  unmappedAccounts: Array<{
    accountId: string;
    code: string;
    name: string;
    nature: string;
    balanceCents: number;
  }>;
  removedAccountsReferenced: Array<{ accountId: string; balanceCents: number }>;
  hasUnclosedPriorYearResult: boolean;
  priorYearResultCents: number;
  warnings: string[];
}

// ─── Balance sheet ────────────────────────────────────────────────────────────

export interface BalanceSheetReport {
  unitId: string;
  periodSemantics: 'as_of';
  asOf: string;
  mappingVersion: string;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  /** Net income injected into PL; computed from DRE with the same window as toDate. */
  netResultLine: {
    amountCents: string;
    isComputed: true;
    computation: 'income_statement_net_result';
    fromDate: string;
    toDate: string;
  };
  /** assets.totalCents === liabilities.totalCents + equity.totalCents + netResultCents (exact int). */
  balanced: boolean;
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: DiagnosticsShape;
}

// ─── Income statement ─────────────────────────────────────────────────────────

export interface IncomeStatementReport {
  unitId: string;
  periodSemantics: 'year_to_date';
  fromDate: string;
  toDate: string;
  mappingVersion: string;
  grossRevenue: StatementSection;
  revenueDeductions: StatementSection;
  expenses: StatementSection;
  netResult: {
    amountCents: string;
    isComputed: true;
    computation: 'income_statement_net_result';
  };
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: DiagnosticsShape;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * AccountingReportService — read-only ledger reporting, FIRST-CLASS PRISMA.
 *
 * CRITICAL (Contract §2.1): aggregates include BOTH 'Posted' AND 'Reversed' parent
 * statuses (exclude only 'Draft'), so a reversed entry + its reversal net to zero —
 * summing only 'Posted' would count just the reversal and break the ledger.
 */
export class AccountingReportService {
  /** Statuses that contribute to the ledger: everything except Draft. */
  private static readonly LEDGER_STATUSES = ['Posted', 'Reversed'];

  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Core balance aggregation. When `from`/`to` are omitted the query is identical to
   * the pre-INCR-4 groupByAccount call, preserving trialBalance byte-identical output.
   */
  private async getAccountBalances(
    scope: AccountingScope,
    from?: Date,
    to?: Date,
  ): Promise<TrialBalanceRow[]> {
    const totals = await this.postingRepo.groupByAccount(
      scope,
      AccountingReportService.LEDGER_STATUSES,
      from || to ? { from, to } : undefined,
    );
    const accounts = await this.accountRepo.findManyByUnit(scope);
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    return totals
      .map((t) => {
        const account = accountById.get(t.accountId);
        return {
          accountId: t.accountId,
          code: account?.code ?? '?',
          name: account?.name ?? '(conta removida)',
          nature: account?.nature ?? '?',
          debitCents: t.debitCents,
          creditCents: t.creditCents,
          balanceCents: t.debitCents - t.creditCents,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Computes the DRE net result (grossRevenue - deductions - expenses) from a set of
   * already-fetched balance rows. Used internally by both balanceSheet and
   * incomeStatement to guarantee they share the same window.
   */
  private computeDreNet(rows: TrialBalanceRow[]): {
    grossRevenueCents: number;
    deductionsCents: number;
    expensesCents: number;
    netCents: number;
  } {
    let grossRevenueCents = 0;
    let deductionsCents = 0;
    let expensesCents = 0;

    for (const row of rows) {
      const rule = findMappingRule(row.nature, row.code, 'DRE');
      if (!rule) continue;
      const signed = applySign(row.balanceCents, rule.sign);
      if (rule.section === 'grossRevenue') grossRevenueCents += signed;
      else if (rule.section === 'revenueDeductions') deductionsCents += signed;
      else if (rule.section === 'expenses') expensesCents += signed;
    }

    return {
      grossRevenueCents,
      deductionsCents,
      expensesCents,
      netCents: grossRevenueCents + deductionsCents + expensesCents,
    };
  }

  /** Builds a StatementSection from rows that matched a given section name. */
  private buildSection(
    rows: TrialBalanceRow[],
    statement: 'BP' | 'DRE',
    sectionName: string,
  ): StatementSection {
    let total = 0;
    const accounts: BpDreLine[] = [];
    for (const row of rows) {
      const rule = findMappingRule(row.nature, row.code, statement);
      if (!rule || rule.section !== sectionName) continue;
      const signed = applySign(row.balanceCents, rule.sign);
      total += signed;
      accounts.push({
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        amountCents: String(signed),
      });
    }
    return { accounts, totalCents: String(total) };
  }

  /** Builds diagnostics for a set of rows classified under `statement`. */
  private buildDiagnostics(
    rows: TrialBalanceRow[],
    statement: 'BP' | 'DRE',
    priorYearResultCents: number,
  ): { diagnostics: DiagnosticsShape; reportStatus: 'OK' | 'WARNING' | 'INVALID' } {
    const unmappedAccounts: DiagnosticsShape['unmappedAccounts'] = [];
    const removedAccountsReferenced: DiagnosticsShape['removedAccountsReferenced'] = [];

    for (const row of rows) {
      if (row.nature === '?') {
        if (row.balanceCents !== 0) {
          removedAccountsReferenced.push({ accountId: row.accountId, balanceCents: row.balanceCents });
        }
        continue;
      }
      const rule = findMappingRule(row.nature, row.code, statement);
      if (!rule && row.balanceCents !== 0) {
        // For BP diagnostics: Revenue/Expense accounts are DRE accounts represented via
        // netResultLine — they are not "unmapped", they just live on the other statement.
        if (statement === 'BP' && findMappingRule(row.nature, row.code, 'DRE')) continue;
        // For DRE diagnostics: Asset/Liability/Equity accounts are BP accounts representing
        // patrimonial position — they are not "unmapped", they just live on the other statement.
        if (statement === 'DRE' && findMappingRule(row.nature, row.code, 'BP')) continue;
        unmappedAccounts.push({
          accountId: row.accountId,
          code: row.code,
          name: row.name,
          nature: row.nature,
          balanceCents: row.balanceCents,
        });
      }
    }

    const hasUnclosedPriorYearResult = priorYearResultCents !== 0;
    const warnings: string[] = [];
    if (hasUnclosedPriorYearResult) {
      warnings.push(
        `Resultado do exercício anterior não encerrado: ${priorYearResultCents} centavos.`,
      );
    }
    if (removedAccountsReferenced.length > 0) {
      warnings.push(
        `${removedAccountsReferenced.length} conta(s) removida(s) com saldo não-zero referenciada(s).`,
      );
    }

    let reportStatus: 'OK' | 'WARNING' | 'INVALID' = 'OK';
    if (unmappedAccounts.length > 0) reportStatus = 'INVALID';
    else if (warnings.length > 0) reportStatus = 'WARNING';

    return {
      diagnostics: {
        mappingVersion: STATEMENT_MAPPING_VERSION,
        unmappedAccounts,
        removedAccountsReferenced,
        hasUnclosedPriorYearResult,
        priorYearResultCents,
        warnings,
      },
      reportStatus,
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Trial balance for a scope unit: per-account debit/credit totals (cents) joined to
   * the chart, plus a grand total and a `balanced` audit flag (Σdebit === Σcredit exact).
   */
  async trialBalance(scope: AccountingScope): Promise<TrialBalanceReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o balancete.');
    }

    const rows = await this.getAccountBalances(scope);

    const grandDebit = rows.reduce((acc, r) => acc + r.debitCents, 0);
    const grandCredit = rows.reduce((acc, r) => acc + r.creditCents, 0);

    return {
      unitId: scope.unitId,
      rows,
      totals: {
        debitCents: grandDebit,
        creditCents: grandCredit,
        balanceCents: grandDebit - grandCredit,
      },
      // EXACT integer equality (Contract §2.1) — never float/epsilon.
      balanced: grandDebit === grandCredit,
    };
  }

  /**
   * Ledger of a single account (by code) for the scope: each leg with a running balance.
   * Includes Posted + Reversed legs (excludes only Draft) so reversals net to zero.
   */
  async accountLedger(scope: AccountingScope, accountCode: string): Promise<AccountLedgerReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o razão.');
    }

    const account = await this.accountRepo.findByCode(scope, accountCode);
    if (!account) {
      throw new NotFoundError(`Conta '${accountCode}' não foi encontrada.`);
    }

    // This account's raw legs (tenant+unit scoped), then hydrate each parent entry for
    // date/description/status and drop Draft entries (keep Posted + Reversed so reversals net).
    const postings = await this.postingRepo.findByAccount(scope, account.id);
    const entryCache = new Map<string, { date: Date; description: string; status: string }>();

    const hydrated: Array<{
      postingId: string;
      entryId: string;
      date: Date;
      description: string;
      status: string;
      debitCents: number;
      creditCents: number;
    }> = [];
    for (const p of postings) {
      let entry = entryCache.get(p.entryId);
      if (!entry) {
        const head = await this.journalEntryRepo.findById(scope, p.entryId);
        if (!head || !AccountingReportService.LEDGER_STATUSES.includes(head.status)) continue;
        entry = { date: head.date, description: head.description, status: head.status };
        entryCache.set(p.entryId, entry);
      }
      hydrated.push({
        postingId: p.id,
        entryId: p.entryId,
        date: entry.date,
        description: entry.description,
        status: entry.status,
        debitCents: p.debitCents,
        creditCents: p.creditCents,
      });
    }

    hydrated.sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = 0;
    const rows: AccountLedgerRow[] = hydrated.map((leg) => {
      running += leg.debitCents - leg.creditCents;
      return { ...leg, runningBalanceCents: running };
    });

    return {
      unitId: scope.unitId,
      account: {
        accountId: account.id,
        code: account.code,
        name: account.name,
        nature: account.nature,
      },
      rows,
      closingBalanceCents: running,
    };
  }

  /**
   * Balanço Patrimonial — snapshot posição `as_of` (toda a história de postagens até
   * `asOf` inclusive). DRE window = 1 Jan do ano de `asOf` até `asOf` (year_to_date);
   * a linha Resultado do Exercício usa a MESMA janela da DRE exibida (ADR-INCR4 Q2/Q7).
   */
  async balanceSheet(scope: AccountingScope, asOf: Date): Promise<BalanceSheetReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o balanço patrimonial.');
    }

    const asOfIso = asOf.toISOString().slice(0, 10);
    const dreFromDate = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)); // 1 Jan UTC
    const dreFromIso = dreFromDate.toISOString().slice(0, 10);

    // BP = toda a história até asOf; DRE = year_to_date com mesma janela
    const [allRows, dreRows, priorRows] = await Promise.all([
      this.getAccountBalances(scope, undefined, asOf),
      this.getAccountBalances(scope, dreFromDate, asOf),
      this.getAccountBalances(
        scope,
        undefined,
        new Date(Date.UTC(asOf.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999)),
      ),
    ]);

    const assets = this.buildSection(allRows, 'BP', 'assets');
    const liabilities = this.buildSection(allRows, 'BP', 'liabilities');
    const equity = this.buildSection(allRows, 'BP', 'equity');

    const { netCents: dreNetCents } = this.computeDreNet(dreRows);
    const { netCents: priorNetCents } = this.computeDreNet(priorRows);

    const assetsCents = parseInt(assets.totalCents, 10);
    const liabilitiesCents = parseInt(liabilities.totalCents, 10);
    const equityCents = parseInt(equity.totalCents, 10);
    // balanced: A = P + PL + Resultado do Exercício (inteiro exato)
    const balanced = assetsCents === liabilitiesCents + equityCents + dreNetCents;

    const { diagnostics, reportStatus } = this.buildDiagnostics(allRows, 'BP', priorNetCents);

    return {
      unitId: scope.unitId,
      periodSemantics: 'as_of',
      asOf: asOfIso,
      mappingVersion: STATEMENT_MAPPING_VERSION,
      assets,
      liabilities,
      equity,
      netResultLine: {
        amountCents: String(dreNetCents),
        isComputed: true,
        computation: 'income_statement_net_result',
        fromDate: dreFromIso,
        toDate: asOfIso,
      },
      balanced,
      reportStatus,
      diagnostics,
    };
  }

  /**
   * Demonstração do Resultado do Exercício — year_to_date: de 1 Jan do ano de `asOf`
   * até `asOf` inclusive. Não aceita `from`/`to` externos (ADR-INCR4 Q3).
   */
  async incomeStatement(scope: AccountingScope, asOf: Date): Promise<IncomeStatementReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler a DRE.');
    }

    const asOfIso = asOf.toISOString().slice(0, 10);
    const dreFromDate = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
    const dreFromIso = dreFromDate.toISOString().slice(0, 10);

    const [dreRows, priorRows] = await Promise.all([
      this.getAccountBalances(scope, dreFromDate, asOf),
      this.getAccountBalances(
        scope,
        undefined,
        new Date(Date.UTC(asOf.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999)),
      ),
    ]);

    const grossRevenue = this.buildSection(dreRows, 'DRE', 'grossRevenue');
    const revenueDeductions = this.buildSection(dreRows, 'DRE', 'revenueDeductions');
    const expenses = this.buildSection(dreRows, 'DRE', 'expenses');

    const { netCents: dreNetCents } = this.computeDreNet(dreRows);
    const { netCents: priorNetCents } = this.computeDreNet(priorRows);

    const { diagnostics, reportStatus } = this.buildDiagnostics(dreRows, 'DRE', priorNetCents);

    return {
      unitId: scope.unitId,
      periodSemantics: 'year_to_date',
      fromDate: dreFromIso,
      toDate: asOfIso,
      mappingVersion: STATEMENT_MAPPING_VERSION,
      grossRevenue,
      revenueDeductions,
      expenses,
      netResult: {
        amountCents: String(dreNetCents),
        isComputed: true,
        computation: 'income_statement_net_result',
      },
      reportStatus,
      diagnostics,
    };
  }
}
