import { getCookie } from 'cookies-next';
import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * Accounting service — thin typed client over the deterministic double-entry
 * endpoints (`/api/accounting/*`). All business logic (balance invariant,
 * idempotency, reversal) lives on the backend (PostingService / AccountingReportService);
 * this only shapes requests/responses. Money is INTEGER CENTS end to end — the UI formats.
 */

// ── Requests ──────────────────────────────────────────────────────────────────
export interface PostingLineInput {
  accountCode: string;
  debitCents: number;
  creditCents: number;
  /** Optional dimension VALUE ids tagging this leg (INCR-DIM). Metadata only — never enters
   *  Σdébito=Σcrédito (ACC-024). At most one value per axis (backend rejects duplicates). */
  dimensions?: string[];
}

export interface PostEntryPayload {
  /** Business unit (second tenancy axis); required. */
  unitId: string;
  /** ISO date/datetime string. */
  date: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  /** At least 2 legs; each leg moves exactly one side (debit XOR credit). */
  lines: PostingLineInput[];
}

export interface ReverseEntryPayload {
  unitId: string;
  lancamentoId: string;
  /** ISO date for the reversal entry — gates on the period that date belongs to. */
  reversalPostingDate: string;
  reason?: string;
}

export interface TrialBalanceQuery {
  unitId: string;
  from?: string;
  to?: string;
}

export interface AccountLedgerQuery extends TrialBalanceQuery {
  accountCode: string;
}

// ── Responses ─────────────────────────────────────────────────────────────────
export type JournalEntryStatus = 'Draft' | 'Posted' | 'Reconciled' | 'Reversed';

export interface Posting {
  id: string;
  userId: string;
  unitId: string;
  entryId: string;
  accountId: string;
  debitCents: number;
  creditCents: number;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  unitId: string;
  date: string;
  description: string;
  status: JournalEntryStatus;
  sourceType: string;
  sourceId: string | null;
  reversedById: string | null;
  /** Fiscal year of the entry (added INCR-3). Null for pre-INCR-3 entries. */
  fiscalYear: number | null;
  /** Sequential entry number within the fiscal year (added INCR-3). Null for legacy. */
  entryNumber: number | null;
  createdAt: string;
  updatedAt: string;
  postings: Posting[];
}

export interface ReverseResult {
  reversal: JournalEntry;
  original: JournalEntry;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  debitCents: number;
  creditCents: number;
  /** debitCents - creditCents */
  balanceCents: number;
}

export interface TrialBalanceReport {
  unitId: string;
  rows: TrialBalanceRow[];
  totals: { debitCents: number; creditCents: number; balanceCents: number };
  /** grandDebit === grandCredit (exact integer equality). */
  balanced: boolean;
}

export interface AccountLedgerRow {
  postingId: string;
  entryId: string;
  date: string;
  description: string;
  status: JournalEntryStatus;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

export interface AccountLedgerReport {
  unitId: string;
  account: { accountId: string; code: string; name: string; nature: string };
  rows: AccountLedgerRow[];
  closingBalanceCents: number;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  nature: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  acceptsEntries: boolean;
  /** INCR-DIM-COMPLETENESS — when true, every leg posted to this account must carry ≥1 dimension
   *  tag (any axis). Only meaningful on leaf accounts (acceptsEntries === true). Default false. */
  requiresDimension?: boolean;
  isDefault?: boolean;
  deletedAt?: string | null;
}

/** A Posting with its parent account's code and name (returned by listEntries). */
export interface PostingWithAccount extends Posting {
  account: { code: string; name: string };
}

/** A JournalEntry with full postings (account included) returned by listEntries. */
export interface JournalEntryWithFullPostings extends JournalEntry {
  postings: PostingWithAccount[];
}

export interface ListEntriesQuery {
  unitId: string;
  page?: number;
  limit?: number;
}

export interface ListEntriesResult {
  entries: JournalEntryWithFullPostings[];
  total: number;
}

// ── Accounting periods ─────────────────────────────────────────────────────────

export type PeriodStatus = 'FUTURE' | 'OPEN' | 'SOFT_CLOSED' | 'HARD_CLOSED';

export interface AccountingPeriod {
  id: string;
  userId: string;
  unitId: string;
  year: number;
  month: number;
  status: PeriodStatus;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Financial statements ───────────────────────────────────────────────────────

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  /** Signed cents as string (serialised by backend). */
  amountCents: string;
}

export interface StatementSection {
  accounts: StatementLine[];
  totalCents: string;
}

export interface StatementDiagnostics {
  mappingVersion: string;
  unmappedAccounts: Array<{ accountId: string; code: string; name: string; nature: string; balanceCents: number }>;
  removedAccountsReferenced: Array<{ accountId: string; balanceCents: number }>;
  hasUnclosedPriorYearResult: boolean;
  priorYearResultCents: number;
  warnings: string[];
}

export interface BalanceSheetReport {
  unitId: string;
  periodSemantics: 'as_of';
  asOf: string;
  mappingVersion: string;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  netResultLine: { amountCents: string; isComputed: true; computation: string; fromDate: string; toDate: string };
  balanced: boolean;
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: StatementDiagnostics;
}

export interface IncomeStatementReport {
  unitId: string;
  periodSemantics: 'year_to_date';
  fromDate: string;
  toDate: string;
  mappingVersion: string;
  grossRevenue: StatementSection;
  revenueDeductions: StatementSection;
  // INCR-INVENTORY — CMV (conta 4.2), between deductions and operating expenses in the DRE.
  // Backend always returns it (empty section when there is no cost booked yet).
  costOfGoodsSold: StatementSection;
  expenses: StatementSection;
  netResult: { amountCents: string; isComputed: true; computation: string };
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: StatementDiagnostics;
}

// ── Bank reconciliation (BE-INCR-7 / FE-INCR-7) ─────────────────────────────────
// First-class Prisma module: links imported bank-statement lines to existing
// postings. Changes NO ledger money value — the only ledger write is the derived,
// reversible JournalEntry.status flip Posted<->Reconciled (D5). Money is INTEGER
// CENTS; statement line amounts are SIGNED (>0 inflow, <0 outflow).

export type BankStatementLineStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED';
export type ReconciliationMatchType = 'AUTO' | 'MANUAL';

/** An imported bank statement file for one GL bank account (dates are ISO strings). */
export interface BankStatement {
  id: string;
  userId: string;
  unitId: string;
  glAccountId: string;
  statementRef: string | null;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  sha256: string;
  attachmentId: string | null;
  importedById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** One parsed statement line (staging; immutable — status covers IGNORED). */
export interface BankStatementLine {
  id: string;
  userId: string;
  unitId: string;
  statementId: string;
  lineNumber: number;
  date: string;
  /** SIGNED integer cents: >0 inflow (statement credit), <0 outflow. */
  amountCents: number;
  description: string;
  externalRef: string | null;
  status: BankStatementLineStatus;
  rawJson: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One ACTIVE match of a statement line, projected onto the line read so UNMATCH is
 * actionable (D7). `id` is the matchId the unmatch endpoint needs; `entry` labels
 * what is being undone (a line may have N active matches — D3 aggregation).
 */
export interface ActiveMatchSummary {
  id: string;
  postingId: string;
  matchType: ReconciliationMatchType;
  /** entry.date is an ISO string over JSON. */
  entry: { id: string; date: string; description: string };
}

/** A statement line with its ACTIVE matches attached (returned by listStatementLines). */
export interface BankStatementLineWithActiveMatches extends BankStatementLine {
  activeMatches: ActiveMatchSummary[];
}

/** A candidate posting with its parent entry summary (suggestions + pending report). */
export interface ReconciliationCandidatePosting {
  id: string;
  userId: string;
  unitId: string;
  entryId: string;
  accountId: string;
  debitCents: number;
  creditCents: number;
  createdAt: string;
  updatedAt: string | null;
  entry: { id: string; date: string; description: string; status: string };
}

/** One ranked match suggestion for a line (|Δdays| asc, postingId asc — D6). */
export interface RankedSuggestion {
  posting: ReconciliationCandidatePosting;
  /** |entry.date - line.date| in whole days. */
  deltaDays: number;
}

/** Result of a statement import — `created: false` = idempotent re-import (nothing written). */
export interface ImportStatementResult {
  statement: BankStatement;
  created: boolean;
  lineCount: number;
}

export interface ListStatementsResult {
  statements: BankStatement[];
  total: number;
}

export interface ListStatementLinesResult {
  statement: BankStatement;
  lines: BankStatementLineWithActiveMatches[];
}

/** Deterministic auto-match run summary (D6). */
export interface AutoMatchSummary {
  processed: number;
  matched: number;
  /** 0 candidates — stays UNMATCHED, shows in the pending report. */
  zeroCandidates: number;
  /** >1 candidates — D6 abstains; resolve via manual match. */
  ambiguous: number;
}

/** Pending report (§4.5): UNMATCHED lines + bank postings with no active match, as-of. */
export interface PendingReport {
  account: { id: string; code: string; name: string };
  unmatchedLines: BankStatementLine[];
  unmatchedPostings: ReconciliationCandidatePosting[];
  totals: { lineCount: number; lineTotalCents: number; postingCount: number };
}

/** Multipart import fields (the file itself is passed separately). Dates are YYYY-MM-DD. */
export interface ImportStatementParams {
  unitId: string;
  glAccountId: string;
  periodStart: string;
  periodEnd: string;
  statementRef?: string;
  openingBalanceCents?: number;
  closingBalanceCents?: number;
}

/** The standard server response envelope: { success, data }. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

// ── Cash flow / DFC (indirect) — money is STRING cents (ADR-INCR4, like BP/DRE) ──
export interface CashFlowLine {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  amountCents: string; // signed; positive = cash source
}
export interface CashFlowSection {
  accounts: CashFlowLine[];
  totalCents: string;
}
export interface CashFlowOperatingSection {
  accounts: CashFlowLine[];
  netResultCents: string; // DRE result (starting point)
  adjustmentsCents: string; // totalCents − netResultCents
  totalCents: string;
}
export interface CashFlowStatementReport {
  unitId: string;
  method: 'indirect';
  periodSemantics: 'year_to_date';
  fromDate: string; // YYYY-MM-DD (Jan 1)
  toDate: string; // YYYY-MM-DD (= asOf)
  mappingVersion: string;
  operating: CashFlowOperatingSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  openingCashCents: string;
  closingCashCents: string;
  reconciliation: {
    sectionsTotalCents: string;
    computedClosingCents: string;
    reconciles: boolean;
  };
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  warnings: string[];
}

// ── Period comparison / balancete comparativo — money is NUMBER cents ──
export interface PeriodComparisonRow {
  code: string;
  name: string;
  current: number; // as-of-current balance, cents (0 if none)
  previous: number; // as-of-previous balance, cents
  deltaAbs: number; // current − previous, cents
  deltaPct: number | null; // null when previous === 0 (never Inf/NaN)
}
export interface PeriodComparisonReport {
  unitId: string;
  asOfCurrent: string;
  asOfPrevious: string;
  rows: PeriodComparisonRow[];
}

// ── Daily journal / Livro Diário — money is NUMBER cents ──
export interface DailyJournalLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
}
export interface DailyJournalEntry {
  entryNumber: number;
  date: string; // YYYY-MM-DD
  description: string;
  lines: DailyJournalLine[];
  balanced: boolean; // Σdebit === Σcredit
}
export interface DailyJournalReport {
  unitId: string;
  from: string;
  to: string;
  entries: DailyJournalEntry[]; // chronological (date ASC, entryNumber ASC)
}

// Multipart import bypasses apiClient (which forces application/json) — same
// direct-fetch pattern as dataExchange.service.importFile.
function reconBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';
}
function reconAuthHeaders(): Record<string, string> {
  const token = getCookie('auth_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${String(token)}`;
  return headers;
}
async function reconParseError(response: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!body.error && !body.message) {
    body.error = `Erro ${response.status}: ${response.statusText}`;
  }
  body.status = response.status;
  return body;
}

/** Build a `?a=x&b=y` query string, dropping undefined/empty values and encoding. */
function buildQuery(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const accountingService = {
  /** Post a balanced double-entry journal entry (Σdébito === Σcrédito). */
  async postEntry(payload: PostEntryPayload): Promise<JournalEntry> {
    const res = await apiClient.post<ApiEnvelope<JournalEntry>>('/accounting/post', payload);
    notify('Lançamento postado com sucesso.', 'success', 'Contabilidade');
    return res.data;
  },

  /** Reverse (estorno) a posted entry; returns the reversal and the now-Reversed original. */
  async reverseEntry(payload: ReverseEntryPayload): Promise<ReverseResult> {
    const res = await apiClient.post<ApiEnvelope<ReverseResult>>('/accounting/reverse', payload);
    notify('Lançamento estornado com sucesso.', 'success', 'Contabilidade');
    return res.data;
  },

  /** Trial balance (balancete) for a unit — read-only, no notification. */
  async getTrialBalance(query: TrialBalanceQuery): Promise<TrialBalanceReport> {
    const qs = buildQuery({ unitId: query.unitId, from: query.from, to: query.to });
    const res = await apiClient.get<ApiEnvelope<TrialBalanceReport>>(`/accounting/trial-balance${qs}`);
    return res.data;
  },

  /** Account ledger (razão) for one account code in a unit — read-only. */
  async getAccountLedger(query: AccountLedgerQuery): Promise<AccountLedgerReport> {
    const qs = buildQuery({
      unitId: query.unitId,
      accountCode: query.accountCode,
      from: query.from,
      to: query.to,
    });
    const res = await apiClient.get<ApiEnvelope<AccountLedgerReport>>(`/accounting/ledger${qs}`);
    return res.data;
  },

  /** List journal entries (lançamentos) for a unit, paginated, postings included. */
  async listEntries(query: ListEntriesQuery): Promise<ListEntriesResult> {
    const qs = buildQuery({
      unitId: query.unitId,
      page: query.page !== undefined ? String(query.page) : undefined,
      limit: query.limit !== undefined ? String(query.limit) : undefined,
    });
    const res = await apiClient.get<ApiEnvelope<ListEntriesResult>>(`/accounting/entries${qs}`);
    return res.data;
  },

  /** List accounts (plano de contas) for a unit. */
  async getAccounts(unitId: string): Promise<{ accounts: Account[] }> {
    const qs = buildQuery({ unitId });
    return (await apiClient.get<ApiEnvelope<{ accounts: Account[] }>>(`/accounting/accounts${qs}`)).data;
  },

  /** List journal entries (lançamentos) for a unit — raw paginated list. */
  async getEntries(unitId: string): Promise<{ entries: JournalEntry[]; total: number }> {
    const qs = buildQuery({ unitId });
    return (await apiClient.get<ApiEnvelope<{ entries: JournalEntry[]; total: number }>>(`/accounting/entries${qs}`)).data;
  },

  /** Create a new account in the chart of accounts for a unit. */
  async createAccount(data: {
    code: string;
    name: string;
    nature: string;
    acceptsEntries: boolean;
    unitId: string;
  }): Promise<{ account: Account }> {
    const res = await apiClient.post<ApiEnvelope<{ account: Account }>>('/accounting/accounts', data);
    notify('Conta criada com sucesso.', 'success', 'Contabilidade');
    return res.data;
  },

  /**
   * Toggle an account's mandatory-dimension flag (INCR-DIM-COMPLETENESS SEC-B1-4).
   * Behind `canManage` on the backend + every flip is audited. Only meaningful on
   * leaf accounts (acceptsEntries === true). Returns the updated account.
   */
  async setAccountRequiresDimension(
    id: string,
    unitId: string,
    requiresDimension: boolean,
  ): Promise<{ account: Account }> {
    const res = await apiClient.patch<ApiEnvelope<{ account: Account }>>(
      `/accounting/accounts/${encodeURIComponent(id)}/requires-dimension`,
      { unitId, requiresDimension },
    );
    notify(
      requiresDimension
        ? 'Conta agora exige dimensão nos lançamentos.'
        : 'Conta não exige mais dimensão nos lançamentos.',
      'success',
      'Contabilidade',
    );
    return res.data;
  },

  /** Soft-delete an account from the chart of accounts (unit-scoped). */
  async deleteAccount(id: string, unitId: string): Promise<{ success: boolean }> {
    const qs = buildQuery({ unitId });
    const res = await apiClient.delete<{ success: boolean }>(`/accounting/accounts/${id}${qs}`);
    notify('Conta excluída com sucesso.', 'success', 'Contabilidade');
    return res;
  },

  // ── Accounting periods ──────────────────────────────────────────────────────

  /** List accounting periods for a unit and year. */
  async listPeriods(unitId: string, year: number): Promise<AccountingPeriod[]> {
    const qs = buildQuery({ year: String(year) });
    const res = await apiClient.get<ApiEnvelope<AccountingPeriod[]>>(`/accounting/${encodeURIComponent(unitId)}/periods${qs}`);
    return res.data;
  },

  /** Seed 12 FUTURE periods for the given year in a unit. */
  async seedYear(unitId: string, year: number): Promise<AccountingPeriod[]> {
    const res = await apiClient.post<ApiEnvelope<AccountingPeriod[]>>(`/accounting/${encodeURIComponent(unitId)}/periods/seed-year`, { unitId, year });
    notify('Períodos do exercício criados.', 'success', 'Contabilidade');
    return res.data;
  },

  /** Transition a period to OPEN. */
  async openPeriod(periodId: string, unitId: string): Promise<AccountingPeriod> {
    const res = await apiClient.post<ApiEnvelope<AccountingPeriod>>(`/accounting/periods/${periodId}/open`, { unitId });
    notify('Período aberto.', 'success', 'Contabilidade');
    return res.data;
  },

  /** Transition a period to SOFT_CLOSED. */
  async softClosePeriod(periodId: string, unitId: string, reason?: string): Promise<AccountingPeriod> {
    const res = await apiClient.post<ApiEnvelope<AccountingPeriod>>(`/accounting/periods/${periodId}/soft-close`, { unitId, reason });
    notify('Período fechado (parcial).', 'success', 'Contabilidade');
    return res.data;
  },

  /** Transition a period to HARD_CLOSED (terminal). */
  async hardClosePeriod(periodId: string, unitId: string, reason?: string): Promise<AccountingPeriod> {
    const res = await apiClient.post<ApiEnvelope<AccountingPeriod>>(`/accounting/periods/${periodId}/hard-close`, { unitId, reason });
    notify('Período fechado definitivamente.', 'success', 'Contabilidade');
    return res.data;
  },

  /** Transition a SOFT_CLOSED period back to OPEN. */
  async reopenPeriod(periodId: string, unitId: string, reason?: string): Promise<AccountingPeriod> {
    const res = await apiClient.post<ApiEnvelope<AccountingPeriod>>(`/accounting/periods/${periodId}/reopen`, { unitId, periodId, reason });
    notify('Período reaberto.', 'success', 'Contabilidade');
    return res.data;
  },

  // ── Financial statements (INCR-4) ───────────────────────────────────────────

  /** Balance sheet (Balanço Patrimonial) as of a given date. */
  async getBalanceSheet(unitId: string, asOf: string): Promise<BalanceSheetReport> {
    const qs = buildQuery({ unitId, asOf });
    const res = await apiClient.get<ApiEnvelope<BalanceSheetReport>>(`/accounting/balance-sheet${qs}`);
    return res.data;
  },

  /** Income statement (DRE) year-to-date as of a given date. */
  async getIncomeStatement(unitId: string, asOf: string): Promise<IncomeStatementReport> {
    const qs = buildQuery({ unitId, asOf });
    const res = await apiClient.get<ApiEnvelope<IncomeStatementReport>>(`/accounting/income-statement${qs}`);
    return res.data;
  },

  /** Cash flow statement (DFC, indirect method) year-to-date as of a given date. */
  async getCashFlow(unitId: string, asOf: string): Promise<CashFlowStatementReport> {
    const qs = buildQuery({ unitId, asOf });
    const res = await apiClient.get<ApiEnvelope<CashFlowStatementReport>>(`/accounting/reports/cash-flow${qs}`);
    return res.data;
  },

  /** Comparative trial balance (balancete comparativo) between two as-of dates. */
  async getPeriodComparison(
    unitId: string,
    asOfCurrent: string,
    asOfPrevious: string,
  ): Promise<PeriodComparisonReport> {
    const qs = buildQuery({ unitId, asOfCurrent, asOfPrevious });
    const res = await apiClient.get<ApiEnvelope<PeriodComparisonReport>>(`/accounting/reports/period-comparison${qs}`);
    return res.data;
  },

  /** Daily journal (Livro Diário) — chronological entries within a date range. */
  async getDailyJournal(unitId: string, from: string, to: string): Promise<DailyJournalReport> {
    const qs = buildQuery({ unitId, from, to });
    const res = await apiClient.get<ApiEnvelope<DailyJournalReport>>(`/accounting/reports/daily-journal${qs}`);
    return res.data;
  },

  // ── Bank reconciliation (BE-INCR-7 / FE-INCR-7) ─────────────────────────────

  /**
   * Import a bank statement (CSV/XLSX) for a bank GL account. Multipart —
   * bypasses apiClient (JSON-only). ALL-OR-NOTHING parse; re-import of the same
   * file (sha256) is idempotent (`created: false`, nothing written).
   */
  async importBankStatement(params: ImportStatementParams, file: File): Promise<ImportStatementResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('unitId', params.unitId);
    form.append('glAccountId', params.glAccountId);
    form.append('periodStart', params.periodStart);
    form.append('periodEnd', params.periodEnd);
    if (params.statementRef) form.append('statementRef', params.statementRef);
    if (params.openingBalanceCents !== undefined) {
      form.append('openingBalanceCents', String(params.openingBalanceCents));
    }
    if (params.closingBalanceCents !== undefined) {
      form.append('closingBalanceCents', String(params.closingBalanceCents));
    }
    const response = await fetch(`${reconBaseUrl()}/accounting/reconciliation/statements`, {
      method: 'POST',
      headers: reconAuthHeaders(), // no Content-Type — browser sets the multipart boundary
      body: form,
    });
    if (!response.ok) throw await reconParseError(response);
    const res = (await response.json()) as ApiEnvelope<ImportStatementResult>;
    return res.data;
  },

  /** List imported bank statements for a unit (paginated, newest first). */
  async listBankStatements(unitId: string, page = 1, limit = 10): Promise<ListStatementsResult> {
    const qs = buildQuery({ unitId, page: String(page), limit: String(limit) });
    const res = await apiClient.get<ApiEnvelope<ListStatementsResult>>(`/accounting/reconciliation/statements${qs}`);
    return res.data;
  },

  /** List the lines of a statement (optional status filter), ordered by lineNumber asc. */
  async listStatementLines(
    statementId: string,
    unitId: string,
    status?: BankStatementLineStatus,
  ): Promise<ListStatementLinesResult> {
    const qs = buildQuery({ unitId, status });
    const res = await apiClient.get<ApiEnvelope<ListStatementLinesResult>>(
      `/accounting/reconciliation/statements/${encodeURIComponent(statementId)}/lines${qs}`,
    );
    return res.data;
  },

  /** Soft-delete a statement — blocked by the backend while any match is active. */
  async deleteBankStatement(statementId: string, unitId: string): Promise<{ id: string }> {
    const qs = buildQuery({ unitId });
    const res = await apiClient.delete<ApiEnvelope<{ id: string }>>(
      `/accounting/reconciliation/statements/${encodeURIComponent(statementId)}${qs}`,
    );
    notify('Extrato excluído.', 'success', 'Conciliação');
    return res.data;
  },

  /** Run the deterministic auto-match over a statement's UNMATCHED lines (D6). */
  async autoMatchStatement(statementId: string, unitId: string): Promise<AutoMatchSummary> {
    const res = await apiClient.post<ApiEnvelope<AutoMatchSummary>>(
      `/accounting/reconciliation/statements/${encodeURIComponent(statementId)}/auto-match`,
      { unitId },
    );
    return res.data;
  },

  /** Ranked match suggestions for one UNMATCHED line (D6). */
  async getLineSuggestions(lineId: string, unitId: string): Promise<RankedSuggestion[]> {
    const qs = buildQuery({ unitId });
    const res = await apiClient.get<ApiEnvelope<RankedSuggestion[]>>(
      `/accounting/reconciliation/lines/${encodeURIComponent(lineId)}/suggestions${qs}`,
    );
    return res.data;
  },

  /** Mark/unmark a line as IGNORED (e.g. a fee to be posted separately via /post). */
  async setLineIgnored(lineId: string, unitId: string, ignored: boolean): Promise<{ id: string }> {
    const res = await apiClient.post<ApiEnvelope<{ id: string }>>(
      `/accounting/reconciliation/lines/${encodeURIComponent(lineId)}/ignore`,
      { unitId, ignored },
    );
    return res.data;
  },

  /** Manual match — link N postings to 1 statement line (D3 aggregation). */
  async createMatch(payload: {
    unitId: string;
    statementLineId: string;
    postingIds: string[];
  }): Promise<{ matchedPostings: number }> {
    const res = await apiClient.post<ApiEnvelope<{ matchedPostings: number }>>(
      '/accounting/reconciliation/matches',
      payload,
    );
    notify('Conciliação registrada.', 'success', 'Conciliação');
    return res.data;
  },

  /** Soft-undo of an active match (D7) — reverts Reconciled->Posted; trail preserved. */
  async unmatch(matchId: string, unitId: string, reason?: string): Promise<{ id: string }> {
    const res = await apiClient.post<ApiEnvelope<{ id: string }>>(
      `/accounting/reconciliation/matches/${encodeURIComponent(matchId)}/unmatch`,
      reason ? { unitId, reason } : { unitId },
    );
    notify('Vínculo desfeito.', 'success', 'Conciliação');
    return res.data;
  },

  /** Pending report: UNMATCHED lines + bank postings with no active match (as-of). */
  async getPendingReport(query: {
    unitId: string;
    glAccountId: string;
    from?: string;
    to?: string;
  }): Promise<PendingReport> {
    const qs = buildQuery({
      unitId: query.unitId,
      glAccountId: query.glAccountId,
      from: query.from,
      to: query.to,
    });
    const res = await apiClient.get<ApiEnvelope<PendingReport>>(`/accounting/reconciliation/pending${qs}`);
    return res.data;
  },
};
