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
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
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
    const res = await apiClient.get<ListEntriesResult>(`/accounting/entries${qs}`);
    return res;
  },

  /** List accounts (plano de contas) for a unit. */
  async getAccounts(unitId: string): Promise<{ accounts: Account[] }> {
    const qs = buildQuery({ unitId });
    return apiClient.get<{ accounts: Account[] }>(`/accounting/accounts${qs}`);
  },

  /** List journal entries (lançamentos) for a unit — raw paginated list. */
  async getEntries(unitId: string): Promise<{ entries: JournalEntry[]; total: number }> {
    const qs = buildQuery({ unitId });
    return apiClient.get<{ entries: JournalEntry[]; total: number }>(`/accounting/entries${qs}`);
  },

  /** Create a new account in the chart of accounts for a unit. */
  async createAccount(data: {
    code: string;
    name: string;
    type: string;
    acceptsEntries: boolean;
    unitId: string;
  }): Promise<{ account: Account }> {
    const res = await apiClient.post<{ account: Account }>('/accounting/accounts', data);
    notify('Conta criada com sucesso.', 'success', 'Contabilidade');
    return res;
  },

  /** Soft-delete an account from the chart of accounts. */
  async deleteAccount(id: string): Promise<{ success: boolean }> {
    const res = await apiClient.delete<{ success: boolean }>(`/accounting/accounts/${id}`);
    notify('Conta excluída com sucesso.', 'success', 'Contabilidade');
    return res;
  },
};
