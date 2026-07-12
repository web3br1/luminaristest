/**
 * DailyJournalReportService — Livro Diário (registro cronológico), read-only, FIRST-CLASS PRISMA.
 *
 * What is mocked: the JournalEntry REPOSITORY and the POLICY (the injected collaborators).
 * No prisma client is needed — the report service never opens a transaction; it only reads
 * through the (mocked) repository. DynamicTableService is not involved.
 *
 * These tests pin:
 *  - chronological order (entryDate ASC) and tie-break by entryNumber ASC are honored;
 *  - the date-only range is mapped to inclusive UTC day boundaries and passed verbatim;
 *  - the aggregation uses LEDGER_STATUSES (Posted/Reconciled/Reversed — excludes only Draft);
 *  - each entry carries a per-entry `balanced` flag (Σdebit === Σcredit, EXACT integer);
 *  - scope isolation: the exact scope is threaded to the repository and the Forbidden guard.
 *
 * NOTE (T5): the chronological/tie-break ORDER is the repository's contract
 * (findManyForExport orders by [date asc, entryNumber asc]). The mock returns entries
 * ALREADY ordered — these tests assert the service PRESERVES that order and shape, and
 * that it delegates ordering+scoping to the repo (verified via the call args), rather than
 * re-sorting client-side (which would silently mask a repo regression).
 */
import { DailyJournalReportService } from '../DailyJournalReportService';
import { ForbiddenError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

/** Minimal JournalEntryWithFullPostings-shaped fixture. */
function entry(over: {
  entryNumber: number;
  date: string;
  description?: string;
  postings: Array<{ code: string; name: string; debitCents: number; creditCents: number }>;
}) {
  return {
    id: `e-${over.entryNumber}`,
    entryNumber: over.entryNumber,
    date: new Date(`${over.date}T00:00:00.000Z`),
    description: over.description ?? `lançamento ${over.entryNumber}`,
    postings: over.postings.map((p, i) => ({
      id: `p-${over.entryNumber}-${i}`,
      debitCents: p.debitCents,
      creditCents: p.creditCents,
      account: { code: p.code, name: p.name },
    })),
  };
}

function buildService(over: { journalEntryRepo?: any; policy?: any } = {}) {
  const journalEntryRepo = {
    findManyForExport: jest.fn(async () => []),
    ...over.journalEntryRepo,
  };
  const policy = {
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canRead: jest.fn(() => true),
    canClosePeriod: jest.fn(() => true),
    canReconcile: jest.fn(() => true),
    canReadReferential: jest.fn(() => true),
    canManageReferential: jest.fn(() => true),
    ...over.policy,
  };
  const svc = new DailyJournalReportService(journalEntryRepo as any, policy as any);
  return { svc, journalEntryRepo, policy };
}

describe('DailyJournalReportService.dailyJournal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aggregates over LEDGER_STATUSES (Posted, Reconciled, Reversed — excludes only Draft)', async () => {
    const { svc, journalEntryRepo } = buildService();
    await svc.dailyJournal(scope, { from: '2026-01-01', to: '2026-01-31' });
    expect(journalEntryRepo.findManyForExport).toHaveBeenCalledWith(
      scope,
      ['Posted', 'Reconciled', 'Reversed'],
      expect.anything(),
    );
  });

  it('maps the date-only range to inclusive UTC day boundaries and passes the exact scope', async () => {
    const { svc, journalEntryRepo } = buildService();
    await svc.dailyJournal(scope, { from: '2026-03-01', to: '2026-03-31' });
    const [passedScope, , window] = journalEntryRepo.findManyForExport.mock.calls[0];
    // scope isolation: the exact tenant scope object is threaded to the repository verbatim
    expect(passedScope).toBe(scope);
    expect(window.from.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    // the whole `to` day is included (23:59:59.999), never truncated to midnight
    expect(window.to.toISOString()).toBe('2026-03-31T23:59:59.999Z');
  });

  it('preserves the repository chronological order (date ASC, tie-break entryNumber ASC)', async () => {
    // The repo contract returns entries pre-ordered; two share a date so the tie-break shows.
    const ordered = [
      entry({
        entryNumber: 5,
        date: '2026-01-01',
        postings: [
          { code: '1.1.1', name: 'Banco', debitCents: 10000, creditCents: 0 },
          { code: '3.1', name: 'Receita', debitCents: 0, creditCents: 10000 },
        ],
      }),
      // same date as the next — entryNumber 7 comes before 9 (tie-break asc)
      entry({
        entryNumber: 7,
        date: '2026-01-10',
        postings: [
          { code: '1.1.1', name: 'Banco', debitCents: 5000, creditCents: 0 },
          { code: '3.1', name: 'Receita', debitCents: 0, creditCents: 5000 },
        ],
      }),
      entry({
        entryNumber: 9,
        date: '2026-01-10',
        postings: [
          { code: '1.1.1', name: 'Banco', debitCents: 2000, creditCents: 0 },
          { code: '3.1', name: 'Receita', debitCents: 0, creditCents: 2000 },
        ],
      }),
    ];
    const { svc } = buildService({
      journalEntryRepo: { findManyForExport: jest.fn(async () => ordered) },
    });
    const report = await svc.dailyJournal(scope, { from: '2026-01-01', to: '2026-01-31' });

    expect(report.entries.map((e) => e.entryNumber)).toEqual([5, 7, 9]);
    expect(report.entries.map((e) => e.date)).toEqual(['2026-01-01', '2026-01-10', '2026-01-10']);
    // range echoed back on the report
    expect(report).toMatchObject({ unitId: 'unit-1', from: '2026-01-01', to: '2026-01-31' });
  });

  it('renders each entry with legible lines (accountCode/accountName, debit/credit in cents)', async () => {
    const { svc } = buildService({
      journalEntryRepo: {
        findManyForExport: jest.fn(async () => [
          entry({
            entryNumber: 1,
            date: '2026-02-05',
            description: 'Venda à vista',
            postings: [
              { code: '1.1.1', name: 'Caixa', debitCents: 15000, creditCents: 0 },
              { code: '3.1', name: 'Receita de Serviços', debitCents: 0, creditCents: 15000 },
            ],
          }),
        ]),
      },
    });
    const report = await svc.dailyJournal(scope, { from: '2026-02-01', to: '2026-02-28' });
    const e = report.entries[0];
    expect(e).toMatchObject({ entryNumber: 1, date: '2026-02-05', description: 'Venda à vista' });
    expect(e.lines).toEqual([
      { accountCode: '1.1.1', accountName: 'Caixa', debitCents: 15000, creditCents: 0 },
      { accountCode: '3.1', accountName: 'Receita de Serviços', debitCents: 0, creditCents: 15000 },
    ]);
    for (const l of e.lines) {
      expect(Number.isInteger(l.debitCents)).toBe(true);
      expect(Number.isInteger(l.creditCents)).toBe(true);
    }
  });

  it('flags balanced=true when Σdebit === Σcredit (exact) and balanced=false when it does not', async () => {
    const { svc } = buildService({
      journalEntryRepo: {
        findManyForExport: jest.fn(async () => [
          // balanced: 10000 debit == 10000 credit
          entry({
            entryNumber: 1,
            date: '2026-01-01',
            postings: [
              { code: '1.1.1', name: 'Banco', debitCents: 10000, creditCents: 0 },
              { code: '3.1', name: 'Receita', debitCents: 0, creditCents: 10000 },
            ],
          }),
          // malformed: 10001 debit != 10000 credit — off by ONE cent (exact, no epsilon)
          entry({
            entryNumber: 2,
            date: '2026-01-02',
            postings: [
              { code: '1.1.1', name: 'Banco', debitCents: 10001, creditCents: 0 },
              { code: '3.1', name: 'Receita', debitCents: 0, creditCents: 10000 },
            ],
          }),
        ]),
      },
    });
    const report = await svc.dailyJournal(scope, { from: '2026-01-01', to: '2026-01-31' });
    expect(report.entries[0].balanced).toBe(true);
    expect(report.entries[1].balanced).toBe(false);
  });

  it('handles a multi-line balanced entry (Σ over many legs, not just a 2-leg pair)', async () => {
    const { svc } = buildService({
      journalEntryRepo: {
        findManyForExport: jest.fn(async () => [
          entry({
            entryNumber: 1,
            date: '2026-01-01',
            postings: [
              { code: '1.1.1', name: 'Banco', debitCents: 7000, creditCents: 0 },
              { code: '1.1.2', name: 'Caixa', debitCents: 3000, creditCents: 0 },
              { code: '3.1', name: 'Receita', debitCents: 0, creditCents: 10000 },
            ],
          }),
        ]),
      },
    });
    const report = await svc.dailyJournal(scope, { from: '2026-01-01', to: '2026-01-31' });
    expect(report.entries[0].balanced).toBe(true);
    expect(report.entries[0].lines).toHaveLength(3);
  });

  it('returns an empty entries array when the window has no entries (not undefined/null)', async () => {
    const { svc } = buildService({
      journalEntryRepo: { findManyForExport: jest.fn(async () => []) },
    });
    const report = await svc.dailyJournal(scope, { from: '2026-01-01', to: '2026-01-31' });
    expect(report.entries).toEqual([]);
  });

  it('throws ForbiddenError when policy.canRead is false and never reads the ledger', async () => {
    const { svc, journalEntryRepo } = buildService({ policy: { canRead: jest.fn(() => false) } });
    await expect(
      svc.dailyJournal(scope, { from: '2026-01-01', to: '2026-01-31' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(journalEntryRepo.findManyForExport).not.toHaveBeenCalled();
  });
});
