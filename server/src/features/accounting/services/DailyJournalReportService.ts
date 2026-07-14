import { ForbiddenError } from '../../../lib/errors';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import { LEDGER_STATUSES } from '../models/ledgerStatus';

// ─── Report shapes (money in INTEGER CENTS) ────────────────────────────────────

/** One ledger leg (partida) as it appears in the Livro Diário. */
export interface DailyJournalLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
}

/** One journal entry (lançamento) in chronological order. */
export interface DailyJournalEntry {
  entryNumber: number;
  date: string;
  description: string;
  lines: DailyJournalLine[];
  /**
   * Per-entry double-entry invariant flag: Σ debits === Σ credits across the legs
   * (EXACT integer equality — never float/epsilon, Contract §2.1). A false here would
   * mean a malformed entry reached the ledger; the report surfaces it, never hides it.
   */
  balanced: boolean;
}

/** Livro Diário report shape: entries in chronological order + range echo. */
export interface DailyJournalReport {
  unitId: string;
  from: string;
  to: string;
  entries: DailyJournalEntry[];
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * DailyJournalReportService — Livro Diário (registro cronológico), read-only,
 * FIRST-CLASS PRISMA, ZERO migration.
 *
 * This is the human-readable contrapartida of the SPED ECD I200/I250 blocks: the same
 * "entries + legs by date window, LEDGER_STATUSES, ordered (date, entryNumber)" read
 * that backs the export (IJournalEntryRepository.findManyForExport), but rendered as a
 * legible chronological journal instead of a SPED file. It generates NO file.
 *
 * CRITICAL (Contract §2.1): the window is aggregated over LEDGER_STATUSES
 * ('Posted', 'Reconciled', 'Reversed' — excludes only 'Draft'), so a reversed entry and
 * its reversal both appear (they net to zero economically but each remains a real,
 * numbered line of the Diário — a gapless chronological book must show both).
 *
 * The chronological ordering (entryDate ASC, tie-break entryNumber ASC) and the tenant
 * isolation (AccountingScope) are BOTH the repository's responsibility — findManyForExport
 * filters by scope and orders deterministically. The service adds only the per-entry
 * balanced flag and the read-only shape mapping.
 */
export class DailyJournalReportService {
  constructor(
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  /**
   * Livro Diário for a scope unit over a date-only range [from, to] (inclusive bounds).
   * `from`/`to` are validated as real calendar dates at the DTO boundary; the service
   * maps them to UTC day boundaries (from at 00:00:00.000, to at 23:59:59.999) so the
   * whole `to` day is included.
   */
  async dailyJournal(
    scope: AccountingScope,
    range: { from: string; to: string },
  ): Promise<DailyJournalReport> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o Livro Diário.');
    }

    const window = {
      from: new Date(`${range.from}T00:00:00.000Z`),
      to: new Date(`${range.to}T23:59:59.999Z`),
    };

    // Entries come back scope-filtered and ordered (date ASC, entryNumber ASC) by the
    // repository — the chronological/tie-break contract lives there, not here.
    const rawEntries = await this.journalEntryRepo.findManyForExport(
      scope,
      LEDGER_STATUSES,
      window,
    );

    const entries: DailyJournalEntry[] = rawEntries.map((e) => {
      const lines: DailyJournalLine[] = e.postings.map((p) => ({
        accountCode: p.account.code,
        accountName: p.account.name,
        debitCents: p.debitCents,
        creditCents: p.creditCents,
      }));

      let debitTotal = 0;
      let creditTotal = 0;
      for (const l of lines) {
        debitTotal += l.debitCents;
        creditTotal += l.creditCents;
      }

      return {
        // LEDGER_STATUSES (Posted/Reconciled/Reversed) are always numbered — a Draft/PendingApproval
        // entry (nullable entryNumber, ADR-INCR-APPROVAL) can never reach this filtered read.
        entryNumber: e.entryNumber ?? 0,
        date: e.date.toISOString().slice(0, 10),
        description: e.description,
        lines,
        // EXACT integer equality (Contract §2.1) — never float/epsilon.
        balanced: debitTotal === creditTotal,
      };
    });

    return {
      unitId: scope.unitId,
      from: range.from,
      to: range.to,
      entries,
    };
  }
}
