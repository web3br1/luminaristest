import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';

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

  /**
   * Trial balance for a scope unit: per-account debit/credit totals (cents) joined to
   * the chart, plus a grand total and a `balanced` audit flag (Σdebit === Σcredit exact).
   */
  async trialBalance(scope: AccountingScope): Promise<TrialBalanceReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o balancete.');
    }

    const totals = await this.postingRepo.groupByAccount(
      scope,
      AccountingReportService.LEDGER_STATUSES,
    );
    const accounts = await this.accountRepo.findManyByUnit(scope);
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rows: TrialBalanceRow[] = totals
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
}
