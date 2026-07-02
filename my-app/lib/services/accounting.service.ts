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
  expenses: StatementSection;
  netResult: { amountCents: string; isComputed: true; computation: string };
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: StatementDiagnostics;
}

/** The standard server response envelope: { success, data }. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
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
};
