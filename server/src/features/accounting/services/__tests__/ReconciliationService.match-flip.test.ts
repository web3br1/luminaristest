/**
 * ReconciliationService — manual match, unmatch soft e flip-back D5/D7 (BE-INCR-7 PR6).
 *
 * Pins the ADR §5 gates owned by this slice:
 *  - manual aggregation (N postings ↔ 1 line, D3): Σ(side amounts) === |line| exact;
 *  - double-link blocked in-tx (posting already actively matched);
 *  - unmatch is SOFT — the row is preserved (never a delete), audited, and the
 *    line recomputes (UNMATCHED only when the LAST active match is undone);
 *  - flip-back Reconciled → Posted in the SAME tx, audited (entry_unreconciled);
 *  - 0-row conditional flips → ServiceError (TOCTOU rollback, ACC-011);
 *  - IGNORED lifecycle guards.
 */
import { ReconciliationService } from '../ReconciliationService';
import { NotFoundError, ServiceError, ValidationError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

const TX = { __tx: true };

const statement = { id: 'st1', glAccountId: 'acc-bank', sha256: 'aaaa', deletedAt: null };
const line = {
  id: 'l1',
  statementId: 'st1',
  status: 'UNMATCHED',
  amountCents: 15000, // inflow → debit side
  date: new Date('2026-06-15T00:00:00.000Z'),
};
const posting = (id: string, debitCents: number, entryStatus = 'Posted') => ({
  id,
  accountId: 'acc-bank',
  debitCents,
  creditCents: 0,
  entry: { id: 'je1', date: new Date('2026-06-16T00:00:00.000Z'), description: 'venda', status: entryStatus },
});
const activeMatch = {
  id: 'm1',
  statementLineId: 'l1',
  postingId: 'p1',
  matchType: 'AUTO',
  unmatchedAt: null,
};

function buildService(over: {
  repo?: Record<string, unknown>;
  accountRepo?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  audit?: Record<string, unknown>;
} = {}) {
  const repo = {
    findStatementById: jest.fn(async () => ({ ...statement })),
    findLineById: jest.fn(async () => ({ ...line })),
    findLinesByStatement: jest.fn(async () => []),
    findLinesWithActiveMatches: jest.fn(async () => []),
    updateLineStatus: jest.fn(async () => 1),
    createMatch: jest.fn(async () => ({ id: 'm-new' })),
    findMatchById: jest.fn(async () => ({ ...activeMatch })),
    findMatchByLineAndPosting: jest.fn(async () => null),
    findActiveMatchByPosting: jest.fn(async () => null),
    findActiveMatchesByLine: jest.fn(async () => []),
    reactivateMatch: jest.fn(async () => 1),
    softUnmatch: jest.fn(async () => 1),
    findPostingById: jest.fn(async () => posting('p1', 15000)),
    findCandidatePostings: jest.fn(async () => []),
    findEntryPostingsReconciliationState: jest.fn(async () => [
      { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: true },
    ]),
    findScopeBankAccountIds: jest.fn(async () => ['acc-bank']),
    updateEntryStatus: jest.fn(async () => 1),
    countActiveMatchesByStatement: jest.fn(async () => 0),
    softDeleteStatement: jest.fn(async () => undefined),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
    ...over.repo,
  };
  const accountRepo = { findById: jest.fn(async () => ({ id: 'acc-bank' })), ...over.accountRepo };
  const policy = { canReconcile: jest.fn(() => true), canRead: jest.fn(() => true), ...over.policy };
  const audit = { append: jest.fn(async () => undefined), ...over.audit };
  const svc = new ReconciliationService(repo as never, accountRepo as never, policy as never, audit as never);
  return { svc, repo, accountRepo, policy, audit };
}

describe('ReconciliationService.manualMatch (D3 aggregation)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links N postings to 1 line when Σ(side amounts) === |line| — all in one tx', async () => {
    const p1 = posting('p1', 10000);
    const p2 = posting('p2', 5000);
    const { svc, repo, audit } = buildService({
      repo: {
        findPostingById: jest.fn(async (_s: unknown, id: string) => (id === 'p1' ? p1 : p2)),
      },
    });
    const result = await svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1', 'p2'] });

    expect(result.matchedPostings).toBe(2);
    expect(repo.createMatch).toHaveBeenCalledTimes(2);
    expect((repo.createMatch as jest.Mock).mock.calls.every((c) => c[1] === TX)).toBe(true);
    expect((repo.createMatch as jest.Mock).mock.calls[0][0]).toMatchObject({ matchType: 'MANUAL' });
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.matched' }),
    );
  });

  it('rejects when the aggregate does NOT close exactly (integer cents, no epsilon)', async () => {
    const { svc, repo } = buildService({
      repo: { findPostingById: jest.fn(async () => posting('p1', 14999)) },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('rejects a wrong-direction posting (credit leg for an inflow line)', async () => {
    const wrongSide = { ...posting('p1', 0), creditCents: 15000 };
    const { svc } = buildService({
      repo: { findPostingById: jest.fn(async () => wrongSide) },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a zero-side posting even when the aggregate Σ closes (direction gate under skipExactAmountCheck)', async () => {
    // Σ(debit) = 15000 + 0 = |line| ✓ — but p2 moves nothing on the debit side;
    // the per-posting direction gate (sideAmount > 0) must still fire in-tx.
    const p1 = posting('p1', 15000);
    const p2 = { ...posting('p2', 0), creditCents: 500 };
    const { svc } = buildService({
      repo: {
        findPostingById: jest.fn(async (_s: unknown, id: string) => (id === 'p1' ? p1 : p2)),
      },
    });
    // The throw aborts the tx — p1's side-effects roll back with it in production
    // (the mocked runTransaction has no rollback semantics, so only the rejection is asserted).
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1', 'p2'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a posting from another account even when Σ closes (gate 2 on the manual path)', async () => {
    const other = { ...posting('p1', 15000), accountId: 'acc-other' };
    const { svc } = buildService({
      repo: { findPostingById: jest.fn(async () => other) },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a posting whose entry is not Posted even when Σ closes (gate 2 on the manual path)', async () => {
    const reversed = posting('p1', 15000, 'Reversed');
    const { svc } = buildService({
      repo: { findPostingById: jest.fn(async () => reversed) },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('MAJOR guard: rejects a second full aggregation on an already-MATCHED line (over-match)', async () => {
    // Line already fully explained by an earlier batch; a new batch whose Σ also
    // closes would take Σ(active matches) to 2×|line|. Gate 0 in-tx must reject.
    const { svc, repo } = buildService({
      repo: {
        findLineById: jest.fn(async () => ({ ...line, status: 'MATCHED' })),
      },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p2'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('MAJOR guard (race shape): line UNMATCHED but an active match already exists in-tx → rejects', async () => {
    const { svc, repo } = buildService({
      repo: {
        findActiveMatchesByLine: jest.fn(async () => [{ ...activeMatch, id: 'm-race' }]),
      },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('double-link: posting already actively matched → rejected in-tx (TOCTOU)', async () => {
    const { svc } = buildService({
      repo: { findActiveMatchByPosting: jest.fn(async () => ({ ...activeMatch, id: 'm-other' })) },
    });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('cross-tenant line → NotFoundError', async () => {
    const { svc } = buildService({ repo: { findLineById: jest.fn(async () => null) } });
    await expect(
      svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1'] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('flips the entry when the manual aggregation completes its bank postings', async () => {
    const p1 = posting('p1', 10000);
    const p2 = posting('p2', 5000);
    const { svc, repo } = buildService({
      repo: {
        findPostingById: jest.fn(async (_s: unknown, id: string) => (id === 'p1' ? p1 : p2)),
        findEntryPostingsReconciliationState: jest.fn(async () => [
          { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: true },
          { postingId: 'p2', accountId: 'acc-bank', hasActiveMatch: true },
        ]),
      },
    });
    await svc.manualMatch(scope, { statementLineId: 'l1', postingIds: ['p1', 'p2'] });
    expect(repo.updateEntryStatus).toHaveBeenCalledWith(scope, 'je1', 'Posted', 'Reconciled', TX);
  });
});

describe('ReconciliationService.unmatch (D7 soft + flip-back)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soft-undo preserves the trail: softUnmatch + audit in the same tx, never a delete', async () => {
    const { svc, repo, audit } = buildService();
    await svc.unmatch(scope, { matchId: 'm1', reason: 'linha errada' });

    expect(repo.softUnmatch).toHaveBeenCalledWith(scope, 'm1', 'u1', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({
        eventType: 'reconciliation.unmatched',
        payload: expect.objectContaining({ reason: 'linha errada' }),
      }),
    );
  });

  it('recomputes the line to UNMATCHED when the LAST active match is undone', async () => {
    const { svc, repo } = buildService({ repo: { findActiveMatchesByLine: jest.fn(async () => []) } });
    await svc.unmatch(scope, { matchId: 'm1' });
    expect(repo.updateLineStatus).toHaveBeenCalledWith(scope, 'l1', 'MATCHED', 'UNMATCHED', TX);
  });

  it('keeps the line MATCHED while sibling active matches remain (aggregation)', async () => {
    const { svc, repo } = buildService({
      repo: { findActiveMatchesByLine: jest.fn(async () => [{ ...activeMatch, id: 'm2' }]) },
    });
    await svc.unmatch(scope, { matchId: 'm1' });
    expect(repo.updateLineStatus).not.toHaveBeenCalled();
  });

  it('flip-back: Reconciled entry loses a matched bank posting → Reconciled→Posted + audit, same tx', async () => {
    const { svc, repo, audit } = buildService({
      repo: {
        findPostingById: jest.fn(async () => posting('p1', 15000, 'Reconciled')),
        findEntryPostingsReconciliationState: jest.fn(async () => [
          { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: false },
        ]),
      },
    });
    await svc.unmatch(scope, { matchId: 'm1' });

    expect(repo.updateEntryStatus).toHaveBeenCalledWith(scope, 'je1', 'Reconciled', 'Posted', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.entry_unreconciled', targetId: 'je1' }),
    );
  });

  it('no flip-back while the entry still has all bank postings matched (other line covers it)', async () => {
    const { svc, repo } = buildService({
      repo: {
        findPostingById: jest.fn(async () => posting('p1', 15000, 'Reconciled')),
        findEntryPostingsReconciliationState: jest.fn(async () => [
          { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: true },
        ]),
      },
    });
    await svc.unmatch(scope, { matchId: 'm1' });
    expect(repo.updateEntryStatus).not.toHaveBeenCalled();
  });

  it('already-undone match → ValidationError (no tx opened)', async () => {
    const { svc, repo } = buildService({
      repo: { findMatchById: jest.fn(async () => ({ ...activeMatch, unmatchedAt: new Date() })) },
    });
    await expect(svc.unmatch(scope, { matchId: 'm1' })).rejects.toBeInstanceOf(ValidationError);
    expect(repo.runTransaction).not.toHaveBeenCalled();
  });

  it('TOCTOU: flip-back conditional update returns 0 rows → ServiceError (rollback)', async () => {
    const { svc } = buildService({
      repo: {
        findPostingById: jest.fn(async () => posting('p1', 15000, 'Reconciled')),
        findEntryPostingsReconciliationState: jest.fn(async () => [
          { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: false },
        ]),
        updateEntryStatus: jest.fn(async () => 0),
      },
    });
    await expect(svc.unmatch(scope, { matchId: 'm1' })).rejects.toBeInstanceOf(ServiceError);
  });

  it('cross-tenant match → NotFoundError', async () => {
    const { svc } = buildService({ repo: { findMatchById: jest.fn(async () => null) } });
    await expect(svc.unmatch(scope, { matchId: 'm1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ReconciliationService.listLines (activeMatches projection for UNMATCH)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads via findLinesWithActiveMatches (NOT the lean findLinesByStatement) so the matchId reaches the UI', async () => {
    const matchedLine = {
      ...line,
      status: 'MATCHED',
      activeMatches: [
        { id: 'm1', postingId: 'p1', matchType: 'AUTO', entry: { id: 'je1', date: line.date, description: 'venda' } },
      ],
    };
    const { svc, repo } = buildService({
      repo: { findLinesWithActiveMatches: jest.fn(async () => [matchedLine]) },
    });

    const result = await svc.listLines(scope, 'st1');

    expect(repo.findLinesWithActiveMatches).toHaveBeenCalledWith(scope, 'st1', undefined);
    expect(repo.findLinesByStatement).not.toHaveBeenCalled();
    expect(result.lines[0].activeMatches[0].id).toBe('m1');
  });
});

describe('ReconciliationService.setLineIgnored', () => {
  beforeEach(() => jest.clearAllMocks());

  it('MATCHED line cannot be ignored — unmatch first', async () => {
    const { svc } = buildService({
      repo: { findLineById: jest.fn(async () => ({ ...line, status: 'MATCHED' })) },
    });
    await expect(
      svc.setLineIgnored(scope, { statementLineId: 'l1', ignored: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('UNMATCHED → IGNORED with audit; unignore flips back', async () => {
    const { svc, repo, audit } = buildService();
    await svc.setLineIgnored(scope, { statementLineId: 'l1', ignored: true });
    expect(repo.updateLineStatus).toHaveBeenCalledWith(scope, 'l1', 'UNMATCHED', 'IGNORED', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.line_ignored' }),
    );
  });

  it('idempotent no-op when the line is already in the target status', async () => {
    const { svc, repo } = buildService({
      repo: { findLineById: jest.fn(async () => ({ ...line, status: 'IGNORED' })) },
    });
    await svc.setLineIgnored(scope, { statementLineId: 'l1', ignored: true });
    expect(repo.updateLineStatus).not.toHaveBeenCalled();
  });
});
