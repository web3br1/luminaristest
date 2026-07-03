/**
 * ReconciliationService — import + auto-match (D6) + pending report (BE-INCR-7 PR5).
 *
 * Mocked: IReconciliationRepository, IAccountRepository, IAccountingPolicy,
 * AuditService. runTransaction resolves fn(mockTx) — every write inside the
 * block must receive the tx handle (ACC-012; asserted on the calls).
 *
 * Pins the ADR §5 gates owned by this slice:
 *  - auto-match commits ONLY on a single candidate (0 → pending, >1 → abstains);
 *  - exact cents + direction (side derives from the line sign);
 *  - re-run is idempotent by construction (matched lines out of scope; matched
 *    postings excluded by the candidate query);
 *  - re-import of the same file (sha256) writes nothing;
 *  - cross-tenant/id inexistente → NotFoundError;
 *  - flip D5: derived, in the same tx, audited; 0-row flip → rollback (TOCTOU);
 *  - delete guard: active matches block statement soft-delete.
 */
import { ReconciliationService, RECONCILE_WINDOW_DAYS } from '../ReconciliationService';
import { ForbiddenError, NotFoundError, ServiceError, ValidationError } from '../../../../lib/errors';
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

const bankAccount = {
  id: 'acc-bank',
  code: '1.1.1.1',
  name: 'Banco',
  nature: 'Asset',
  acceptsEntries: true,
};

const statement = {
  id: 'st1',
  userId: 'u1',
  unitId: 'unit-1',
  glAccountId: 'acc-bank',
  sha256: 'aaaa',
  deletedAt: null,
};

/** UNMATCHED inflow line — matches a DEBIT of 15000 on the bank account. */
const line = {
  id: 'l1',
  statementId: 'st1',
  status: 'UNMATCHED',
  amountCents: 15000,
  date: new Date('2026-06-15T00:00:00.000Z'),
};

const candidate = {
  id: 'p1',
  accountId: 'acc-bank',
  debitCents: 15000,
  creditCents: 0,
  entry: { id: 'je1', date: new Date('2026-06-16T00:00:00.000Z'), description: 'venda', status: 'Posted' },
};

function buildService(over: {
  repo?: Record<string, unknown>;
  accountRepo?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  audit?: Record<string, unknown>;
} = {}) {
  const repo = {
    createStatement: jest.fn(async () => ({ ...statement })),
    findStatementById: jest.fn(async () => ({ ...statement })),
    findStatementBySha256: jest.fn(async () => null),
    findStatements: jest.fn(async () => ({ statements: [], total: 0 })),
    softDeleteStatement: jest.fn(async () => undefined),
    countActiveMatchesByStatement: jest.fn(async () => 0),
    createLines: jest.fn(async () => 1),
    findLineById: jest.fn(async () => ({ ...line })),
    findLinesByStatement: jest.fn(async () => [{ ...line }]),
    updateLineStatus: jest.fn(async () => 1),
    createMatch: jest.fn(async () => ({ id: 'm1' })),
    findMatchById: jest.fn(async () => null),
    findMatchByLineAndPosting: jest.fn(async () => null),
    findActiveMatchByPosting: jest.fn(async () => null),
    findActiveMatchesByLine: jest.fn(async () => []),
    reactivateMatch: jest.fn(async () => 1),
    softUnmatch: jest.fn(async () => 1),
    findPostingById: jest.fn(async () => ({ ...candidate })),
    findCandidatePostings: jest.fn(async () => [{ ...candidate }]),
    findEntryPostingsReconciliationState: jest.fn(async () => [
      { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: true },
      { postingId: 'p2', accountId: 'acc-rev', hasActiveMatch: false }, // non-bank leg — irrelevant
    ]),
    findScopeBankAccountIds: jest.fn(async () => ['acc-bank']),
    updateEntryStatus: jest.fn(async () => 1),
    findUnmatchedLinesByAccount: jest.fn(async () => []),
    findUnmatchedBankPostings: jest.fn(async () => []),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
    ...over.repo,
  };
  const accountRepo = {
    findById: jest.fn(async () => ({ ...bankAccount })),
    ...over.accountRepo,
  };
  const policy = {
    canReconcile: jest.fn(() => true),
    canRead: jest.fn(() => true),
    ...over.policy,
  };
  const audit = { append: jest.fn(async () => undefined), ...over.audit };
  const svc = new ReconciliationService(
    repo as never,
    accountRepo as never,
    policy as never,
    audit as never,
  );
  return { svc, repo, accountRepo, policy, audit };
}

/** Minimal CSV in the module's integer-cents convention. */
const CSV = Buffer.from(
  'date,amountCents,description,externalRef\n2026-06-15,15000,PIX recebido,tx-9\n2026-06-16,-2500,Tarifa,\n',
  'utf8',
);
const importDto = {
  unitId: 'unit-1',
  glAccountId: 'acc-bank',
  periodStart: new Date('2026-06-01T00:00:00.000Z'),
  periodEnd: new Date('2026-06-30T00:00:00.000Z'),
};

describe('ReconciliationService.importStatement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects without canReconcile (policy-first)', async () => {
    const { svc } = buildService({ policy: { canReconcile: jest.fn(() => false) } });
    await expect(svc.importStatement(scope, importDto, { buffer: CSV, format: 'csv' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cross-tenant/unknown glAccountId → NotFoundError (never Forbidden)', async () => {
    const { svc } = buildService({ accountRepo: { findById: jest.fn(async () => null) } });
    await expect(svc.importStatement(scope, importDto, { buffer: CSV, format: 'csv' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('re-import of the same file (sha256) writes NOTHING and returns created:false', async () => {
    const { svc, repo } = buildService({
      repo: { findStatementBySha256: jest.fn(async () => ({ ...statement })) },
    });
    const result = await svc.importStatement(scope, importDto, { buffer: CSV, format: 'csv' });
    expect(result.created).toBe(false);
    expect(repo.runTransaction).not.toHaveBeenCalled();
    expect(repo.createStatement).not.toHaveBeenCalled();
  });

  it('happy path: statement + lines + audit in the SAME tx, signed integer cents', async () => {
    const { svc, repo, audit } = buildService();
    const result = await svc.importStatement(scope, importDto, { buffer: CSV, format: 'csv' });

    expect(result.created).toBe(true);
    expect(result.lineCount).toBe(2);
    expect(repo.createStatement).toHaveBeenCalledWith(
      expect.objectContaining({ glAccountId: 'acc-bank', importedById: 'u1' }),
      TX,
    );
    const createdLines = (repo.createLines as jest.Mock).mock.calls[0][0];
    expect((repo.createLines as jest.Mock).mock.calls[0][1]).toBe(TX);
    expect(createdLines).toHaveLength(2);
    expect(createdLines[0]).toMatchObject({ lineNumber: 1, amountCents: 15000, externalRef: 'tx-9' });
    expect(createdLines[1]).toMatchObject({ lineNumber: 2, amountCents: -2500, externalRef: null });
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.statement_imported' }),
    );
  });

  it.each([
    ['zero amount', 'date,amountCents,description\n2026-06-15,0,PIX\n'],
    ['non-integer amount', 'date,amountCents,description\n2026-06-15,150.00,PIX\n'],
    ['bad date', 'date,amountCents,description\n15/06/2026,15000,PIX\n'],
    ['empty description', 'date,amountCents,description\n2026-06-15,15000,\n'],
    ['missing required column', 'date,description\n2026-06-15,PIX\n'],
  ])('ALL-OR-NOTHING: %s → ValidationError, nothing written', async (_label, csv) => {
    const { svc, repo } = buildService();
    await expect(
      svc.importStatement(scope, importDto, { buffer: Buffer.from(csv, 'utf8'), format: 'csv' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.runTransaction).not.toHaveBeenCalled();
  });
});

describe('ReconciliationService.autoMatchStatement (D6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('statement of another tenant → NotFoundError', async () => {
    const { svc } = buildService({ repo: { findStatementById: jest.fn(async () => null) } });
    await expect(svc.autoMatchStatement(scope, 'st1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('single candidate → AUTO match + line MATCHED + audit, all inside the tx', async () => {
    const { svc, repo, audit } = buildService();
    const summary = await svc.autoMatchStatement(scope, 'st1');

    expect(summary).toEqual({ processed: 1, matched: 1, zeroCandidates: 0, ambiguous: 0 });
    expect(repo.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ statementLineId: 'l1', postingId: 'p1', matchType: 'AUTO' }),
      TX,
    );
    expect(repo.updateLineStatus).toHaveBeenCalledWith(scope, 'l1', 'UNMATCHED', 'MATCHED', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.matched' }),
    );
  });

  it('queries candidates with exact cents on the sign-derived side and ±window', async () => {
    const { svc, repo } = buildService();
    await svc.autoMatchStatement(scope, 'st1');
    const query = (repo.findCandidatePostings as jest.Mock).mock.calls[0][1];
    expect(query).toMatchObject({ glAccountId: 'acc-bank', side: 'debit', amountCents: 15000 });
    const windowMs = RECONCILE_WINDOW_DAYS * 86_400_000;
    expect(query.dateFrom.getTime()).toBe(line.date.getTime() - windowMs);
    expect(query.dateTo.getTime()).toBe(line.date.getTime() + windowMs);
  });

  it('outflow line (<0) queries the CREDIT side with the absolute value', async () => {
    const outflow = { ...line, id: 'l2', amountCents: -2500 };
    const { svc, repo } = buildService({
      repo: {
        findLinesByStatement: jest.fn(async () => [outflow]),
        findLineById: jest.fn(async () => outflow),
        findCandidatePostings: jest.fn(async () => []),
      },
    });
    await svc.autoMatchStatement(scope, 'st1');
    expect((repo.findCandidatePostings as jest.Mock).mock.calls[0][1]).toMatchObject({
      side: 'credit',
      amountCents: 2500,
    });
  });

  it('0 candidates → line stays pending; no match written', async () => {
    const { svc, repo } = buildService({ repo: { findCandidatePostings: jest.fn(async () => []) } });
    const summary = await svc.autoMatchStatement(scope, 'st1');
    expect(summary.zeroCandidates).toBe(1);
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('>1 candidates → ABSTAINS (idempotent by construction); no match written', async () => {
    const { svc, repo } = buildService({
      repo: { findCandidatePostings: jest.fn(async () => [{ ...candidate }, { ...candidate, id: 'p2' }]) },
    });
    const summary = await svc.autoMatchStatement(scope, 'st1');
    expect(summary.ambiguous).toBe(1);
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('re-run after full match is a no-op (no UNMATCHED lines in scope)', async () => {
    const { svc, repo } = buildService({ repo: { findLinesByStatement: jest.fn(async () => []) } });
    const summary = await svc.autoMatchStatement(scope, 'st1');
    expect(summary).toEqual({ processed: 0, matched: 0, zeroCandidates: 0, ambiguous: 0 });
    expect(repo.createMatch).not.toHaveBeenCalled();
  });

  it('TOCTOU: posting got an active match between query and commit → rejects (rollback)', async () => {
    const { svc } = buildService({
      repo: { findActiveMatchByPosting: jest.fn(async () => ({ id: 'other-match', unmatchedAt: null })) },
    });
    await expect(svc.autoMatchStatement(scope, 'st1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('re-match of a soft-undone pair REACTIVATES the unique row instead of inserting', async () => {
    const { svc, repo } = buildService({
      repo: {
        findMatchByLineAndPosting: jest.fn(async () => ({ id: 'm-old', unmatchedAt: new Date() })),
      },
    });
    await svc.autoMatchStatement(scope, 'st1');
    expect(repo.reactivateMatch).toHaveBeenCalledWith(
      scope,
      'm-old',
      expect.objectContaining({ matchType: 'AUTO' }),
      TX,
    );
    expect(repo.createMatch).not.toHaveBeenCalled();
  });
});

describe('D5 flip — derived, audited, TOCTOU-guarded', () => {
  beforeEach(() => jest.clearAllMocks());

  it('flips Posted→Reconciled when ALL bank postings of the entry have active matches', async () => {
    const { svc, repo, audit } = buildService();
    await svc.autoMatchStatement(scope, 'st1');
    expect(repo.updateEntryStatus).toHaveBeenCalledWith(scope, 'je1', 'Posted', 'Reconciled', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.entry_reconciled', targetId: 'je1' }),
    );
  });

  it('does NOT flip while a sibling bank posting is still unmatched', async () => {
    const { svc, repo } = buildService({
      repo: {
        findEntryPostingsReconciliationState: jest.fn(async () => [
          { postingId: 'p1', accountId: 'acc-bank', hasActiveMatch: true },
          { postingId: 'p3', accountId: 'acc-bank', hasActiveMatch: false },
        ]),
      },
    });
    await svc.autoMatchStatement(scope, 'st1');
    expect(repo.updateEntryStatus).not.toHaveBeenCalled();
  });

  it('0-row flip (entry changed under us) → ServiceError, tx rolls back', async () => {
    const { svc } = buildService({ repo: { updateEntryStatus: jest.fn(async () => 0) } });
    await expect(svc.autoMatchStatement(scope, 'st1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('ReconciliationService.suggestions (ranking D6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ranks by |Δdays| asc, then postingId asc', async () => {
    const far = { ...candidate, id: 'p-far', entry: { ...candidate.entry, date: new Date('2026-06-18T00:00:00.000Z') } };
    const near = { ...candidate, id: 'p-near', entry: { ...candidate.entry, date: new Date('2026-06-15T00:00:00.000Z') } };
    const { svc } = buildService({
      repo: { findCandidatePostings: jest.fn(async () => [far, near]) },
    });
    const ranked = await svc.suggestions(scope, 'l1');
    expect(ranked.map((r) => r.posting.id)).toEqual(['p-near', 'p-far']);
    expect(ranked[0].deltaDays).toBe(0);
    expect(ranked[1].deltaDays).toBe(3);
  });

  it('IGNORED line → empty suggestions', async () => {
    const { svc } = buildService({
      repo: { findLineById: jest.fn(async () => ({ ...line, status: 'IGNORED' })) },
    });
    await expect(svc.suggestions(scope, 'l1')).resolves.toEqual([]);
  });

  it('line under a soft-deleted statement → NotFoundError', async () => {
    const { svc } = buildService({ repo: { findStatementById: jest.fn(async () => null) } });
    await expect(svc.suggestions(scope, 'l1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ReconciliationService.deleteStatement — active-match guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks soft-delete while matches are ACTIVE (unmatch first)', async () => {
    const { svc, repo } = buildService({
      repo: { countActiveMatchesByStatement: jest.fn(async () => 2) },
    });
    await expect(svc.deleteStatement(scope, 'st1')).rejects.toBeInstanceOf(ValidationError);
    expect(repo.softDeleteStatement).not.toHaveBeenCalled();
  });

  it('soft-deletes + audits in the same tx when no active match', async () => {
    const { svc, repo, audit } = buildService();
    await svc.deleteStatement(scope, 'st1');
    expect(repo.softDeleteStatement).toHaveBeenCalledWith(scope, 'st1', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'reconciliation.statement_deleted' }),
    );
  });
});

describe('ReconciliationService.pendingReport (§4.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sums UNMATCHED line totals in SIGNED integer cents', async () => {
    const { svc } = buildService({
      repo: {
        findUnmatchedLinesByAccount: jest.fn(async () => [
          { ...line, amountCents: 15000 },
          { ...line, id: 'l2', amountCents: -2500 },
        ]),
        findUnmatchedBankPostings: jest.fn(async () => [{ ...candidate }]),
      },
    });
    const report = await svc.pendingReport(scope, { unitId: 'unit-1', glAccountId: 'acc-bank' });
    expect(report.totals).toEqual({ lineCount: 2, lineTotalCents: 12500, postingCount: 1 });
    expect(Number.isInteger(report.totals.lineTotalCents)).toBe(true);
  });

  it('unknown/cross-tenant account → NotFoundError', async () => {
    const { svc } = buildService({ accountRepo: { findById: jest.fn(async () => null) } });
    await expect(
      svc.pendingReport(scope, { unitId: 'unit-1', glAccountId: 'acc-x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
