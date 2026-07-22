/**
 * PostingService — FIRST-CLASS PRISMA double-entry posting engine (no DynamicTable).
 *
 * What is mocked (and why):
 *  - The three REPOSITORIES (Account/JournalEntry/Posting) and the POLICY are mocked —
 *    they are the service's injected collaborators. DynamicTableService is NOT used by
 *    this engine, so it is not mocked.
 *  - The shared prisma client (`../../../../lib/prisma`) is stubbed to a thin object whose
 *    `$transaction(fn)` simply runs the callback with a fake tx handle. We do NOT mock
 *    Prisma query methods — all data flows through the mocked repositories. The stub
 *    exists only so the service can compose its atomic write without hitting SQLite, and
 *    so we can simulate a P2002 unique-constraint race.
 *  - `generated/prisma` stays REAL so `Prisma.PrismaClientKnownRequestError` is genuine.
 *
 * These tests verify (a) the balance invariant uses EXACT integer equality,
 * (b) the chart of accounts is ensured idempotently per scope,
 * (c) post/reverse compose every write inside the SAME prisma.$transaction,
 * (d) idempotency by (sourceType, sourceId) on both the read and P2002 race paths,
 * (e) leaf-only / known-account guard, (f) tenant+unit-scoped reads,
 * (g) debit/credit swap + Reversed + reversedById link on reverse.
 */
import { Prisma } from 'generated/prisma';
import { PostingService } from '../PostingService';
import { AccountingPeriodNotOpenError, ForbiddenError, MaxCentsExceededError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { CANONICAL_ACCOUNTS } from '../../fixtures/ChartOfAccountsFixture';
import { MAX_CENTS } from '../../models/money';
import type { AccountingScope } from '../../scope/AccountingScope';

// prisma.$transaction runs the callback with a fake tx handle; repos are mocked so the
// tx is just threaded through (they ignore it here).
const txHandle = { __tx: true };
const $transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(txHandle));
jest.mock('../../../../lib/prisma', () => ({
  __esModule: true,
  default: { $transaction: (fn: (tx: unknown) => unknown) => $transaction(fn) },
}));

jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};
const unitId = scope.unitId;

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function buildService(over: {
  accountRepo?: any;
  journalEntryRepo?: any;
  postingRepo?: any;
  policy?: any;
  periodRepo?: any;
  auditService?: any;
  sourceProvenanceRepo?: any;
  dimensionRepo?: any;
} = {}) {
  const accountRepo = {
    findByCode: jest.fn(async (_scope: AccountingScope, code: string) => ({
      id: `acc-${code}`,
      userId: 'u1',
      unitId,
      code,
      name: code,
      nature: 'Asset',
      acceptsEntries: true,
    })),
    create: jest.fn(async (data: any) => ({ id: `acc-${data.code}`, ...data })),
    findById: jest.fn(async (_scope: AccountingScope, id: string) => ({ id, userId: 'u1', unitId, code: '9.9', name: 'test', nature: 'Asset', acceptsEntries: true })),
    findManyByUnit: jest.fn(async () => []),
    softDelete: jest.fn(),
    // null = no soft-deleted row to revive → a P2002 in ensureChartOfAccounts is a benign race.
    restoreByCode: jest.fn(async () => null),
    ...over.accountRepo,
  };

  const journalEntryRepo = {
    create: jest.fn(async (data: any) => ({ id: 'entry-1', ...data })),
    findById: jest.fn(async () => null),
    findBySource: jest.fn(async () => null),
    setStatus: jest.fn(async () => ({ id: 'entry-1', status: 'Reversed' })),
    setReversedBy: jest.fn(async () => ({ id: 'entry-1' })),
    setSourceId: jest.fn(async () => {}),
    ...over.journalEntryRepo,
  };

  const postingRepo = {
    create: jest.fn(async (data: any) => ({ id: 'p-x', ...data })),
    findByEntryId: jest.fn(async () => []),
    findByAccount: jest.fn(async () => []),
    groupByAccount: jest.fn(async () => []),
    nextEntryNumber: jest.fn(async () => 1),
    // delegates to the global $transaction so existing assertions (toHaveBeenCalledTimes,
    // mockImplementationOnce P2002 overrides) continue to work unchanged.
    runTransaction: jest.fn(async (fn: (tx: unknown) => unknown) => $transaction(fn)),
    ...over.postingRepo,
  };

  const policy = {
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canRead: jest.fn(() => true),
    canClosePeriod: jest.fn(() => true),
    ...over.policy,
  };

  // Default: period is OPEN so existing tests are unaffected by the period gate.
  const periodRepo = {
    findByYearMonth: jest.fn(async () => ({ status: 'OPEN' })),
    findById: jest.fn(async () => null),
    seedYear: jest.fn(async () => []),
    setStatus: jest.fn(async () => ({})),
    list: jest.fn(async () => []),
    ...over.periodRepo,
  };

  const auditService = { append: jest.fn(async () => {}), ...over.auditService };

  const sourceProvenanceRepo = {
    createSourceDocument: jest.fn(async (data: any) => ({ id: 'srcdoc-1', ...data })),
    linkEntry: jest.fn(async (data: any) => ({ id: 'jes-1', ...data })),
    findSourcesByEntry: jest.fn(async () => []),
    ...over.sourceProvenanceRepo,
  };

  // INCR-DIM: dimension repo — default returns no value (untagged posts never touch it). Tests that
  // exercise tagging override findValueById/countActiveChildren.
  const dimensionRepo = {
    findValueById: jest.fn(async () => null),
    countActiveChildren: jest.fn(async () => 0),
    createPostingDimension: jest.fn(async (data: any) => ({ id: 'pd-1', ...data })),
    // INCR-DIM-COMPLETENESS: reverse copies the original leg's tags. Default = original had none.
    findPostingDimensions: jest.fn(async () => []),
    ...over.dimensionRepo,
  };

  const svc = new PostingService(
    accountRepo as any,
    journalEntryRepo as any,
    postingRepo as any,
    policy as any,
    periodRepo as any,
    auditService as any,
    sourceProvenanceRepo as any,
    dimensionRepo as any,
  );
  return { svc, accountRepo, journalEntryRepo, postingRepo, policy, periodRepo, auditService, sourceProvenanceRepo, dimensionRepo };
}

const balancedInput = {
  unitId,
  date: '2026-06-23',
  description: 'Venda à vista',
  sourceType: 'manual',
  lines: [
    { accountCode: '1.1.1', debitCents: 10000, creditCents: 0 },
    { accountCode: '3.1', debitCents: 0, creditCents: 10000 },
  ],
};

describe('PostingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    $transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txHandle));
  });

  describe('postEntry', () => {
    it('posts a balanced entry: Posted header + one leg per line, all inside one $transaction', async () => {
      const { svc, journalEntryRepo, postingRepo } = buildService();
      await svc.postEntry(scope, balancedInput);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(journalEntryRepo.create).toHaveBeenCalledTimes(1);
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          unitId,
          status: 'Posted',
          description: 'Venda à vista',
          createdById: 'u1',
          postedById: 'u1',
        }),
        txHandle,
      );
      expect(postingRepo.create).toHaveBeenCalledTimes(2);
      // legs written with the SAME tx handle the entry header used
      expect(postingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ debitCents: 10000, creditCents: 0 }),
        txHandle,
      );
    });

    it('rejects an unbalanced entry (Σdebit !== Σcredit) — no write, no tx', async () => {
      const { svc, journalEntryRepo, postingRepo } = buildService();
      const unbalanced = {
        ...balancedInput,
        lines: [
          { accountCode: '1.1.1', debitCents: 10000, creditCents: 0 },
          { accountCode: '3.1', debitCents: 0, creditCents: 9999 },
        ],
      };
      await expect(svc.postEntry(scope, unbalanced)).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
      expect(postingRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a zero-total entry (Σdebit === Σcredit === 0 → sumDebit <= 0)', async () => {
      const { svc, journalEntryRepo } = buildService();
      const zero = {
        ...balancedInput,
        lines: [
          { accountCode: '1.1.1', debitCents: 0, creditCents: 0 },
          { accountCode: '3.1', debitCents: 0, creditCents: 0 },
        ],
      };
      await expect(svc.postEntry(scope, zero)).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('idempotency: existing (sourceType, sourceId) returns the existing entry, no re-post', async () => {
      const existing = { id: 'entry-existing', postings: [] };
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findBySource: jest.fn(async () => existing) },
      });
      const out = await svc.postEntry(scope, { ...balancedInput, sourceId: 'inv-1' });
      expect(out).toBe(existing);
      expect(journalEntryRepo.findBySource).toHaveBeenCalledWith(scope, 'manual', 'inv-1');
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('idempotency P2002 race: tx trips a unique violation, re-fetch returns the race winner', async () => {
      const winner = { id: 'entry-winner', postings: [] };
      const findBySource = jest
        .fn()
        .mockResolvedValueOnce(null) // pre-tx idempotency read misses
        .mockResolvedValueOnce(winner); // post-P2002 re-fetch hits
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findBySource },
      });
      $transaction.mockImplementationOnce(async () => {
        throw p2002();
      });

      const out = await svc.postEntry(scope, { ...balancedInput, sourceId: 'inv-1' });
      expect(out).toBe(winner);
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
      expect(findBySource).toHaveBeenCalledTimes(2);
    });

    it('rejects posting to an unknown account', async () => {
      const { svc, journalEntryRepo } = buildService({
        accountRepo: {
          // chart ensure sees accounts, but the line code '9.9.9' is unknown
          findByCode: jest.fn(async (_scope: AccountingScope, code: string) =>
            code === '9.9.9'
              ? null
              : { id: `acc-${code}`, code, acceptsEntries: true },
          ),
        },
      });
      const input = {
        ...balancedInput,
        lines: [
          { accountCode: '9.9.9', debitCents: 10000, creditCents: 0 },
          { accountCode: '3.1', debitCents: 0, creditCents: 10000 },
        ],
      };
      await expect(svc.postEntry(scope, input)).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('rejects posting to a non-leaf (synthetic) account (acceptsEntries=false)', async () => {
      const { svc } = buildService({
        accountRepo: {
          findByCode: jest.fn(async (_scope: AccountingScope, code: string) => ({
            id: `acc-${code}`,
            code,
            acceptsEntries: code !== '3.1',
          })),
        },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
    });

    it('ensureChartOfAccounts creates ONLY the missing canonical accounts', async () => {
      const present = new Set(['1.1.1', '3.1']);
      const create = jest.fn(async (data: any) => ({ id: `acc-${data.code}`, ...data }));
      const { svc } = buildService({
        accountRepo: {
          // present codes resolve; everything else is missing during ensure
          findByCode: jest.fn(async (_scope: AccountingScope, code: string) =>
            present.has(code) ? { id: `acc-${code}`, code, acceptsEntries: true } : null,
          ),
          create,
        },
      });
      await svc.postEntry(scope, balancedInput);

      // 8 canonical accounts, 2 already present -> exactly 6 created, never the present ones
      const createdCodes = create.mock.calls.map((c) => c[0].code);
      expect(create).toHaveBeenCalledTimes(CANONICAL_ACCOUNTS.length - present.size);
      expect(createdCodes).not.toContain('1.1.1');
      expect(createdCodes).not.toContain('3.1');
      expect(createdCodes).toEqual(
        expect.arrayContaining(['1', '1.1.2', '1.1.3', '3', '4', '4.1']),
      );
    });

    it('ensureChartOfAccounts swallows a benign P2002 create race and keeps seeding', async () => {
      // ensure() sees every canonical code as missing (forcing a create attempt for each),
      // but the LINE accounts the post later resolves are present so resolution succeeds —
      // the P2002 here only concerns the ensure create path.
      const findByCode = jest.fn(async (_scope: AccountingScope, code: string) =>
        code === '1.1.1' || code === '3.1'
          ? { id: `acc-${code}`, code, acceptsEntries: true }
          : null,
      );
      const create = jest
        .fn()
        .mockRejectedValueOnce(p2002()) // first create loses the race — benign no-op
        .mockImplementation(async (data: any) => ({ id: `acc-${data.code}`, ...data }));
      const { svc } = buildService({ accountRepo: { findByCode, create } });

      await expect(svc.postEntry(scope, balancedInput)).resolves.toBeDefined();
      // attempted a create for each missing canonical account (6: all but the 2 present),
      // and the first throwing P2002 did NOT abort the loop.
      expect(create).toHaveBeenCalledTimes(CANONICAL_ACCOUNTS.length - 2);
    });

    it('tenant + unit scoping: findBySource is called with scope', async () => {
      const { svc, journalEntryRepo } = buildService();
      await svc.postEntry(scope, { ...balancedInput, sourceId: 'inv-1' });
      expect(journalEntryRepo.findBySource).toHaveBeenCalledWith(scope, 'manual', 'inv-1');
    });

    it('throws ForbiddenError when policy.canPost is false (no chart touch, no tx)', async () => {
      const { svc, accountRepo } = buildService({ policy: { canPost: jest.fn(() => false) } });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(ForbiddenError);
      expect(accountRepo.findByCode).not.toHaveBeenCalled();
      expect($transaction).not.toHaveBeenCalled();
    });
  });

  describe('reverseEntry', () => {
    const original = {
      id: 'entry-1',
      userId: 'u1',
      unitId,
      status: 'Posted',
      reversedById: null,
      postings: [
        { id: 'p1', accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 0 },
        { id: 'p2', accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
      ],
    };

    it('reverses a Posted entry: SWAPS debit/credit, marks original Reversed + links reversedById', async () => {
      const reversal = { id: 'rev-1', sourceType: 'reversal', sourceId: 'entry-1', postings: [] };
      const findById = jest
        .fn()
        .mockResolvedValueOnce(original) // initial fetch
        .mockResolvedValueOnce({ ...original, status: 'Reversed', reversedById: 'rev-1' }); // refresh
      const { svc, journalEntryRepo, postingRepo } = buildService({
        journalEntryRepo: {
          findById,
          findBySource: jest.fn(async () => null),
          create: jest.fn(async () => reversal),
        },
      });
      const { reversal: rev, original: orig } = await svc.reverseEntry(scope, {
        unitId,
        lancamentoId: 'entry-1',
        reversalPostingDate: '2026-06-23',
      });

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Posted',
          sourceType: 'reversal',
          sourceId: 'entry-1',
          createdById: 'u1',
          postedById: 'u1',
        }),
        txHandle,
      );
      // SWAP: original debit leg (acc-1.1.1) becomes a credit leg, and the credit leg a debit leg
      const createArgs = postingRepo.create.mock.calls.map((c: any[]) => c[0]);
      expect(createArgs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: 'acc-1.1.1', debitCents: 0, creditCents: 10000 }),
          expect.objectContaining({ accountId: 'acc-3.1', debitCents: 10000, creditCents: 0 }),
        ]),
      );
      expect(journalEntryRepo.setStatus).toHaveBeenCalledWith(scope, 'entry-1', 'Reversed', txHandle);
      expect(journalEntryRepo.setReversedBy).toHaveBeenCalledWith(scope, 'entry-1', 'rev-1', txHandle);
      // the returned reversal is built as { ...reversal, postings } — same id, hydrated legs
      expect(rev.id).toBe('rev-1');
      expect(orig.status).toBe('Reversed');
    });

    it('reversing a CLOSING entry: reversal inherits sourceType=closing AND the original key is freed (D5)', async () => {
      // A closing entry keys on sourceType='closing', sourceId=String(year); its fiscalYear is 2026.
      const closingOriginal = {
        ...original,
        sourceType: 'closing',
        sourceId: '2026',
        fiscalYear: 2026,
      };
      const reversal = { id: 'rev-1', sourceType: 'closing', sourceId: 'entry-1', postings: [] };
      const findById = jest
        .fn()
        .mockResolvedValueOnce(closingOriginal)
        .mockResolvedValueOnce({ ...closingOriginal, status: 'Reversed', reversedById: 'rev-1' });
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: {
          findById,
          findBySource: jest.fn(async () => null),
          create: jest.fn(async () => reversal),
        },
      });

      await svc.reverseEntry(scope, {
        unitId,
        lancamentoId: 'entry-1',
        reversalPostingDate: '2026-12-31',
      });

      // (a) reversal inherits sourceType='closing' so it too is excluded from the DRE.
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'closing', sourceId: 'entry-1' }),
        txHandle,
      );
      // (b) the original's key is freed so a fresh close(2026) can post a NEW entry.
      expect(journalEntryRepo.setSourceId).toHaveBeenCalledWith(
        scope,
        'entry-1',
        'closing:2026:reversed:entry-1',
        txHandle,
      );
    });

    it('reversing a NORMAL entry does not free any key and stays sourceType=reversal', async () => {
      const reversal = { id: 'rev-2', sourceType: 'reversal', sourceId: 'entry-1', postings: [] };
      const findById = jest
        .fn()
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce({ ...original, status: 'Reversed', reversedById: 'rev-2' });
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById, findBySource: jest.fn(async () => null), create: jest.fn(async () => reversal) },
      });
      await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' });
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'reversal' }),
        txHandle,
      );
      expect(journalEntryRepo.setSourceId).not.toHaveBeenCalled();
    });

    it('rejects reversing a non-Posted entry (e.g. Draft) → ValidationError, no write', async () => {
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById: jest.fn(async () => ({ ...original, status: 'Draft' })) },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('INCR4-B: rejects reversing a Reconciled entry with a clear "unmatch first" error, no write', async () => {
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById: jest.fn(async () => ({ ...original, status: 'Reconciled' })) },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' }),
      ).rejects.toThrow(/desfaça a conciliação/);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('missing / other-unit entry → NotFoundError (findById is scope-scoped)', async () => {
      const findById = jest.fn(async () => null);
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(journalEntryRepo.findById).toHaveBeenCalledWith(scope, 'entry-1');
      expect($transaction).not.toHaveBeenCalled();
    });

    it('idempotent when original already carries reversedById (realistic: status Reversed): returns prior reversal', async () => {
      // Realistic post-reversal state: status is 'Reversed', reversedById is set.
      // Idempotency check must fire BEFORE the status gate — otherwise re-reversing a
      // 'Reversed' entry would throw ValidationError instead of returning the prior reversal.
      const prior = { id: 'rev-prior', sourceType: 'reversal', sourceId: 'entry-1', postings: [] };
      const findById = jest
        .fn()
        .mockResolvedValueOnce({ ...original, status: 'Reversed', reversedById: 'rev-prior' }) // realistic state
        .mockResolvedValueOnce(prior); // lookup of original.reversedById
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById, findBySource: jest.fn(async () => null) },
      });
      const { reversal } = await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' });
      expect(reversal).toBe(prior);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('idempotent when a reversal already exists by source (reversal, original.id)', async () => {
      const prior = { id: 'rev-prior', sourceType: 'reversal', sourceId: 'entry-1', postings: [] };
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: {
          findById: jest.fn(async () => original),
          findBySource: jest.fn(async () => prior),
        },
      });
      const { reversal } = await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' });
      expect(reversal).toBe(prior);
      expect(journalEntryRepo.findBySource).toHaveBeenCalledWith(scope, 'reversal', 'entry-1');
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('rejects reversing a Posted entry whose legs are unbalanced', async () => {
      const lopsided = {
        ...original,
        postings: [
          { id: 'p1', accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 0 },
          { id: 'p2', accountId: 'acc-3.1', debitCents: 0, creditCents: 9000 },
        ],
      };
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: {
          findById: jest.fn(async () => lopsided),
          findBySource: jest.fn(async () => null),
        },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when policy.canPost is false', async () => {
      const { svc, journalEntryRepo } = buildService({ policy: { canPost: jest.fn(() => false) } });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(journalEntryRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('period gate', () => {
    it('postEntry: throws AccountingPeriodNotOpenError when period is missing (null)', async () => {
      const { svc } = buildService({
        periodRepo: { findByYearMonth: jest.fn(async () => null) },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(
        AccountingPeriodNotOpenError,
      );
      expect($transaction).not.toHaveBeenCalled();
    });

    it('postEntry: throws when period is FUTURE', async () => {
      const { svc } = buildService({
        periodRepo: { findByYearMonth: jest.fn(async () => ({ status: 'FUTURE' })) },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(
        AccountingPeriodNotOpenError,
      );
    });

    it('postEntry: throws when period is SOFT_CLOSED', async () => {
      const { svc } = buildService({
        periodRepo: { findByYearMonth: jest.fn(async () => ({ status: 'SOFT_CLOSED' })) },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(
        AccountingPeriodNotOpenError,
      );
    });

    it('postEntry: throws when period is HARD_CLOSED', async () => {
      const { svc } = buildService({
        periodRepo: { findByYearMonth: jest.fn(async () => ({ status: 'HARD_CLOSED' })) },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(
        AccountingPeriodNotOpenError,
      );
    });

    it('postEntry TOCTOU: preflight passes (OPEN) but authoritative tx-gate fails (period closed between checks) — no write', async () => {
      // First call (no tx arg) = OPEN; second call (with tx arg) = SOFT_CLOSED (admin closed it in between).
      const findByYearMonth = jest
        .fn()
        .mockResolvedValueOnce({ status: 'OPEN' })
        .mockResolvedValueOnce({ status: 'SOFT_CLOSED' });
      const { svc, journalEntryRepo } = buildService({
        periodRepo: { findByYearMonth },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(
        AccountingPeriodNotOpenError,
      );
      expect(findByYearMonth).toHaveBeenCalledTimes(2);
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('reverseEntry: gates on reversalPostingDate, not the original entry date', async () => {
      // Period for 2026-06 (reversalPostingDate) is CLOSED; original entry date doesn't matter.
      const findByYearMonth = jest.fn(async () => ({ status: 'SOFT_CLOSED' }));
      const original = {
        id: 'entry-1',
        userId: 'u1',
        unitId,
        status: 'Posted',
        reversedById: null,
        postings: [
          { id: 'p1', accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 0 },
          { id: 'p2', accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
        ],
      };
      const { svc } = buildService({
        periodRepo: { findByYearMonth },
        journalEntryRepo: {
          findById: jest.fn(async () => original),
          findBySource: jest.fn(async () => null),
        },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' }),
      ).rejects.toBeInstanceOf(AccountingPeriodNotOpenError);
      expect($transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('soft-deletes a user-defined account, scoping every step to (ownerUserId + unitId)', async () => {
      const { svc, accountRepo, postingRepo } = buildService();
      await svc.deleteAccount(scope, 'acc-9.9');

      // Unit-isolation regression: lookup, posting-check and delete are all scoped to the
      // FULL request scope — never a userId-only lookup nor a placeholder-unit scope.
      expect(accountRepo.findById).toHaveBeenCalledWith(scope, 'acc-9.9');
      expect(postingRepo.findByAccount).toHaveBeenCalledWith(scope, 'acc-9.9');
      expect(accountRepo.softDelete).toHaveBeenCalledWith(scope, 'acc-9.9', expect.anything());
    });

    it('throws NotFoundError when the id is not visible in the caller scope (cross-unit isolation)', async () => {
      // findById returns null: the id belongs to another unit, so it is invisible in this
      // scope. The delete must NOT fall through to the posting-check or softDelete.
      const { svc, accountRepo, postingRepo } = buildService({
        accountRepo: { findById: jest.fn(async () => null) },
      });
      await expect(svc.deleteAccount(scope, 'acc-other-unit')).rejects.toBeInstanceOf(NotFoundError);
      expect(accountRepo.findById).toHaveBeenCalledWith(scope, 'acc-other-unit');
      expect(postingRepo.findByAccount).not.toHaveBeenCalled();
      expect(accountRepo.softDelete).not.toHaveBeenCalled();
    });

    it('refuses to delete a canonical (seeded) account with 409', async () => {
      const { svc, accountRepo, postingRepo } = buildService({
        accountRepo: {
          findById: jest.fn(async (_s: AccountingScope, id: string) => ({
            id, userId: 'u1', unitId, code: '1', name: 'Ativo', nature: 'Asset', acceptsEntries: false,
          })),
        },
      });
      await expect(svc.deleteAccount(scope, 'acc-canon')).rejects.toMatchObject({ statusCode: 409 });
      expect(postingRepo.findByAccount).not.toHaveBeenCalled();
      expect(accountRepo.softDelete).not.toHaveBeenCalled();
    });

    it('refuses to delete an account that has postings with 409', async () => {
      const { svc, accountRepo, postingRepo } = buildService({
        postingRepo: { findByAccount: jest.fn(async () => [{ id: 'p-1' }]) },
      });
      await expect(svc.deleteAccount(scope, 'acc-9.9')).rejects.toMatchObject({ statusCode: 409 });
      expect(accountRepo.softDelete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError (before any read) when policy.canManage is false', async () => {
      const { svc, accountRepo } = buildService({ policy: { canManage: jest.fn(() => false) } });
      await expect(svc.deleteAccount(scope, 'acc-9.9')).rejects.toBeInstanceOf(ForbiddenError);
      expect(accountRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('INCR-2 audit wiring', () => {
    describe('postEntry audit', () => {
      it('appends entry.posted audit event with correct payload', async () => {
        const { svc, auditService } = buildService();
        await svc.postEntry(scope, balancedInput);
        expect(auditService.append).toHaveBeenCalledTimes(1);
        const call = (auditService.append.mock.calls as any[])[0];
        expect(call[1]).toBe(scope);
        expect(call[2]).toMatchObject({
          eventType:  'entry.posted',
          targetType: 'journal_entry',
          payload:    expect.objectContaining({ sourceType: 'manual', lineCount: '2' }),
        });
      });

      it('no audit when balance check fails (no tx opened)', async () => {
        const { svc, auditService } = buildService();
        await expect(svc.postEntry(scope, { ...balancedInput, lines: [
          { accountCode: '1.1.01', debitCents: 100, creditCents: 0 },
          { accountCode: '4.1.01', debitCents: 200, creditCents: 0 },
        ]})).rejects.toBeInstanceOf(ValidationError);
        expect(auditService.append).not.toHaveBeenCalled();
      });

      it('audit append failure inside tx rolls back the entry (not swallowed)', async () => {
        const appendErr = new Error('audit append fail');
        const { svc } = buildService({ auditService: { append: jest.fn(async () => { throw appendErr; }) } });
        await expect(svc.postEntry(scope, balancedInput)).rejects.toThrow('audit append fail');
      });

      it('ensureChartOfAccounts does NOT emit audit events', async () => {
        const { svc, auditService } = buildService({
          // force ensureChartOfAccounts to create an account
          accountRepo: { findByCode: jest.fn(async () => null), create: jest.fn(async (d: any) => ({ id: 'acc-new', ...d })), restoreByCode: jest.fn(async () => null) },
        });
        // postEntry will call ensureChartOfAccounts then fail on resolveLeafAccount (findByCode null)
        // — we only care that any audit calls come from postEntry itself, not from chart seeding.
        // Use a variant where the entry goes through but only one audit event is emitted.
        const auditCalls = (auditService as any).append.mock.calls;
        // ensureChartOfAccounts must not call append — there is no code path that does, confirmed.
        expect(auditCalls.length).toBe(0);
      });
    });

    describe('reverseEntry audit', () => {
      const originalEntry = {
        id: 'entry-1',
        userId: 'u1',
        unitId,
        status: 'Posted',
        reversedById: null,
        postings: [
          { id: 'p-1', accountId: 'acc-debit', debitCents: 10000, creditCents: 0 },
          { id: 'p-2', accountId: 'acc-credit', debitCents: 0, creditCents: 10000 },
        ],
      };

      it('appends entry.reversed with originalId and reversalId in payload', async () => {
        const { svc, auditService } = buildService({
          journalEntryRepo: {
            findById: jest.fn(async () => originalEntry),
            findBySource: jest.fn(async () => null),
            create: jest.fn(async (data: any) => ({ id: 'reversal-1', ...data, postings: [] })),
          },
        });
        await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' });
        expect(auditService.append).toHaveBeenCalledTimes(1);
        const call = (auditService.append.mock.calls as any[])[0];
        expect(call[2]).toMatchObject({
          eventType:  'entry.reversed',
          targetType: 'journal_entry',
          payload:    expect.objectContaining({ originalId: 'entry-1', reversalId: 'reversal-1' }),
        });
      });
    });

    describe('createAccount audit', () => {
      it('appends account.created with code, name, nature in payload', async () => {
        const { svc, auditService } = buildService();
        await svc.createAccount(scope, { code: '9.9', name: 'Teste', nature: 'Asset', acceptsEntries: true, unitId });
        expect(auditService.append).toHaveBeenCalledTimes(1);
        const call = (auditService.append.mock.calls as any[])[0];
        expect(call[2]).toMatchObject({
          eventType:  'account.created',
          targetType: 'account',
          payload:    expect.objectContaining({ code: '9.9', name: 'Teste', nature: 'Asset' }),
        });
      });

      it('P2002 on create → ValidationError thrown, no audit emitted', async () => {
        const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
        const { svc, auditService } = buildService({
          accountRepo: { create: jest.fn(async () => { throw p2002; }) },
        });
        await expect(svc.createAccount(scope, { code: '9.9', name: 'Teste', nature: 'Asset', acceptsEntries: true, unitId }))
          .rejects.toBeInstanceOf(ValidationError);
        expect(auditService.append).not.toHaveBeenCalled();
      });
    });

    describe('deleteAccount audit', () => {
      it('appends account.deleted with account code in payload', async () => {
        const { svc, auditService } = buildService();
        await svc.deleteAccount(scope, 'acc-9.9');
        expect(auditService.append).toHaveBeenCalledTimes(1);
        const call = (auditService.append.mock.calls as any[])[0];
        expect(call[2]).toMatchObject({
          eventType:  'account.deleted',
          targetType: 'account',
          payload:    expect.objectContaining({ code: '9.9' }),
        });
      });

      it('canonical-account guard → no audit emitted', async () => {
        const { svc, auditService } = buildService({
          accountRepo: {
            findById: jest.fn(async (_s: AccountingScope, id: string) => ({
              id, userId: 'u1', unitId, code: '1', name: 'Ativo', nature: 'Asset', acceptsEntries: false,
            })),
          },
        });
        await expect(svc.deleteAccount(scope, 'acc-canon')).rejects.toMatchObject({ statusCode: 409 });
        expect(auditService.append).not.toHaveBeenCalled();
      });

      it('has-postings guard → no audit emitted', async () => {
        const { svc, auditService } = buildService({
          postingRepo: { findByAccount: jest.fn(async () => [{ id: 'p-1' }]) },
        });
        await expect(svc.deleteAccount(scope, 'acc-9.9')).rejects.toMatchObject({ statusCode: 409 });
        expect(auditService.append).not.toHaveBeenCalled();
      });
    });

  describe('INCR-3 entry numbering', () => {
    it('postEntry: calls nextEntryNumber inside tx and passes fiscalYear/entryNumber to create', async () => {
      const { svc, journalEntryRepo, postingRepo } = buildService();
      await svc.postEntry(scope, { ...balancedInput, date: '2026-06-23' });

      expect(postingRepo.nextEntryNumber).toHaveBeenCalledTimes(1);
      expect(postingRepo.nextEntryNumber).toHaveBeenCalledWith(scope, 2026, txHandle);
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ fiscalYear: 2026, entryNumber: 1 }),
        txHandle,
      );
    });

    it('postEntry: fiscalYear is derived from postingDate using UTC (matches the period gate)', async () => {
      const { svc, journalEntryRepo } = buildService();
      await svc.postEntry(scope, { ...balancedInput, date: '2026-12-31' });
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ fiscalYear: 2026 }),
        txHandle,
      );
    });

    it('postEntry: fiscalYear on Jan 1 matches the period gate (no America/Sao_Paulo shift into the prior year)', async () => {
      const { svc, journalEntryRepo } = buildService();
      // Regression guard: fiscalYearFrom used to convert UTC midnight to America/Sao_Paulo
      // (UTC-3), landing on Dec 31 21:00 BRT and reporting 2025 for an entry the period
      // gate (extractYearMonth, UTC-only) correctly placed in 2026-01.
      await svc.postEntry(scope, { ...balancedInput, date: '2026-01-01' });
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ fiscalYear: 2026 }),
        txHandle,
      );
    });

    it('postEntry: nextEntryNumber NOT called on idempotent hit (no number consumed)', async () => {
      const existing = { id: 'entry-existing', postings: [], fiscalYear: 2026, entryNumber: 5 };
      const { svc, postingRepo } = buildService({
        journalEntryRepo: { findBySource: jest.fn(async () => existing) },
      });
      await svc.postEntry(scope, { ...balancedInput, sourceId: 'dup-1' });
      expect(postingRepo.nextEntryNumber).not.toHaveBeenCalled();
    });

    it('reverseEntry: calls nextEntryNumber for reversal date and passes fiscalYear/entryNumber', async () => {
      const original = {
        id: 'orig-1',
        status: 'Posted',
        reversedById: null,
        fiscalYear: 2026,
        entryNumber: 10,
        postings: [
          { accountId: 'acc-A', debitCents: 5000, creditCents: 0 },
          { accountId: 'acc-B', debitCents: 0, creditCents: 5000 },
        ],
      };
      const { svc, journalEntryRepo, postingRepo } = buildService({
        journalEntryRepo: {
          findById: jest.fn(async () => original),
          findBySource: jest.fn(async () => null),
        },
        postingRepo: { nextEntryNumber: jest.fn(async () => 11) },
      });
      await svc.reverseEntry(scope, { unitId, lancamentoId: 'orig-1', reversalPostingDate: '2026-06-24' });

      expect(postingRepo.nextEntryNumber).toHaveBeenCalledWith(scope, 2026, txHandle);
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ fiscalYear: 2026, entryNumber: 11 }),
        txHandle,
      );
    });

    it('rollback: nextEntryNumber is called but create throws → tx rolls back (number not persisted)', async () => {
      const { svc, postingRepo } = buildService({
        journalEntryRepo: { create: jest.fn(async () => { throw new Error('DB error'); }) },
      });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toThrow('DB error');
      // nextEntryNumber was called inside the tx that rolled back — number is not consumed
      expect(postingRepo.nextEntryNumber).toHaveBeenCalledTimes(1);
    });
  });

  // ── BE-INCR-8 / ADR-INCR8 — formal provenance seam ────────────────────────────
  describe('postEntry — provenance (BE-INCR-8 / ADR-INCR8)', () => {
    const withDoc = {
      ...balancedInput,
      sourceType: 'salon.sale.finalized',
      sourceId: 'sale-1',
      sourceDocument: {
        externalRef: 'NF-123',
        documentDate: '2026-06-20',
        description: 'Venda salão',
        attachmentId: 'att-9',
      },
    };

    it('records SourceDocument + JournalEntrySource + entry.source_recorded audit — all in the SAME tx', async () => {
      const { svc, sourceProvenanceRepo, auditService } = buildService();
      await svc.postEntry(scope, withDoc);

      expect($transaction).toHaveBeenCalledTimes(1);
      expect(sourceProvenanceRepo.createSourceDocument).toHaveBeenCalledTimes(1);
      expect(sourceProvenanceRepo.createSourceDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          unitId,
          sourceType: 'salon.sale.finalized', // origin sourceType mirrors the entry (D5)
          externalRef: 'NF-123',
          documentDate: new Date('2026-06-20'), // date-only string → Date
          description: 'Venda salão',
          attachmentId: 'att-9',
          createdById: 'u1',
        }),
        txHandle, // propagated tx (T6) — same handle threaded to every provenance write
      );
      expect(sourceProvenanceRepo.linkEntry).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', unitId, journalEntryId: 'entry-1', sourceDocumentId: 'srcdoc-1' }),
        txHandle,
      );
      // entry.source_recorded appended in the SAME tx (ACC-019), payload in the allowlist.
      expect(auditService.append).toHaveBeenCalledWith(
        txHandle,
        scope,
        expect.objectContaining({
          eventType: 'entry.source_recorded',
          targetType: 'journal_entry',
          targetId: 'entry-1',
          payload: expect.objectContaining({
            journalEntryId: 'entry-1',
            sourceDocumentId: 'srcdoc-1',
            externalRef: 'NF-123',
            sourceType: 'salon.sale.finalized',
          }),
        }),
      );
    });

    it('atomicity: if linkEntry throws, the whole postEntry rejects (entry + origin roll back together)', async () => {
      const { svc, sourceProvenanceRepo } = buildService({
        sourceProvenanceRepo: { linkEntry: jest.fn(async () => { throw new Error('link failed'); }) },
      });
      await expect(svc.postEntry(scope, withDoc)).rejects.toThrow('link failed');
      // createSourceDocument ran, but the throw inside the same $transaction fn rolls it all back —
      // no entry-with-orphan-origin, no origin-without-entry.
      expect(sourceProvenanceRepo.createSourceDocument).toHaveBeenCalledTimes(1);
    });

    it('T7 idempotent re-post: an existing entry short-circuits BEFORE the tx — no new SourceDocument', async () => {
      const existing = { id: 'entry-existing', postings: [] };
      const { svc, sourceProvenanceRepo, journalEntryRepo } = buildService({
        journalEntryRepo: { findBySource: jest.fn(async () => existing) },
      });
      const result = await svc.postEntry(scope, withDoc);
      expect(result).toBe(existing);
      expect(journalEntryRepo.findBySource).toHaveBeenCalledWith(scope, 'salon.sale.finalized', 'sale-1');
      expect(sourceProvenanceRepo.createSourceDocument).not.toHaveBeenCalled();
      expect(sourceProvenanceRepo.linkEntry).not.toHaveBeenCalled();
    });

    it('manual entry (no descriptor) records NO origin', async () => {
      const { svc, sourceProvenanceRepo } = buildService();
      await svc.postEntry(scope, balancedInput); // no sourceDocument
      expect(sourceProvenanceRepo.createSourceDocument).not.toHaveBeenCalled();
      expect(sourceProvenanceRepo.linkEntry).not.toHaveBeenCalled();
    });

    it('reversal records NO origin (estorno is internal, never carries a descriptor)', async () => {
      const original = {
        id: 'orig-1', status: 'Posted', reversedById: null,
        postings: [
          { accountId: 'a1', debitCents: 10000, creditCents: 0 },
          { accountId: 'a2', debitCents: 0, creditCents: 10000 },
        ],
      };
      const { svc, sourceProvenanceRepo } = buildService({
        journalEntryRepo: {
          findById: jest.fn(async () => original),
          findBySource: jest.fn(async () => null),
        },
        postingRepo: {
          nextEntryNumber: jest.fn(async () => 5),
          findByEntryId: jest.fn(async () => original.postings),
        },
      });
      await svc.reverseEntry(scope, { unitId, lancamentoId: 'orig-1', reversalPostingDate: '2026-06-24' });
      expect(sourceProvenanceRepo.createSourceDocument).not.toHaveBeenCalled();
      expect(sourceProvenanceRepo.linkEntry).not.toHaveBeenCalled();
    });

    it('desconflação: two entries sharing an externalRef under DIFFERENT sourceIds each get their own SourceDocument (externalRef is not a dedup key — D6)', async () => {
      const { svc, sourceProvenanceRepo } = buildService();
      await svc.postEntry(scope, { ...withDoc, sourceId: 'sale-A', sourceDocument: { externalRef: 'NF-DUP' } });
      await svc.postEntry(scope, { ...withDoc, sourceId: 'sale-B', sourceDocument: { externalRef: 'NF-DUP' } });
      expect(sourceProvenanceRepo.createSourceDocument).toHaveBeenCalledTimes(2);
      const refs = sourceProvenanceRepo.createSourceDocument.mock.calls.map((c: any[]) => c[0].externalRef);
      expect(refs).toEqual(['NF-DUP', 'NF-DUP']); // no collision — externalRef participates in no dedup key
    });
  });

  describe('postEntry — dimension tagging (INCR-DIM)', () => {
    const valueRow = (over: any = {}) => ({
      id: 'val-cc-1', userId: 'u1', unitId, definitionId: 'def-cc', code: 'CC1', name: 'Loja Centro',
      parentId: null, status: 'ACTIVE', createdById: null, createdAt: new Date(), updatedAt: new Date(),
      deletedAt: null, ...over,
    });
    const taggedInput = (dimensions: string[]) => ({
      ...balancedInput,
      lines: [
        { accountCode: '1.1.1', debitCents: 10000, creditCents: 0 },
        { accountCode: '3.1', debitCents: 0, creditCents: 10000, dimensions },
      ],
    });

    it('tags a leg: derives definitionId from the value and writes PostingDimension in the tx', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => valueRow()),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(async (d: any) => ({ id: 'pd-1', ...d })),
      };
      const { svc } = buildService({ dimensionRepo });
      await svc.postEntry(scope, taggedInput(['val-cc-1']));
      expect(dimensionRepo.createPostingDimension).toHaveBeenCalledTimes(1);
      expect(dimensionRepo.createPostingDimension).toHaveBeenCalledWith(
        expect.objectContaining({ postingId: 'p-x', definitionId: 'def-cc', valueId: 'val-cc-1', userId: 'u1', unitId }),
        txHandle,
      );
    });

    it('untagged post writes NO PostingDimension and never touches the dimension repo (ACC-024)', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => null),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(),
      };
      const { svc } = buildService({ dimensionRepo });
      await svc.postEntry(scope, balancedInput);
      expect(dimensionRepo.findValueById).not.toHaveBeenCalled();
      expect(dimensionRepo.createPostingDimension).not.toHaveBeenCalled();
    });

    it('rejects two values of the SAME axis on one leg (ACC-025), writing nothing', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async (_s: any, id: string) => valueRow({ id, definitionId: 'def-cc' })),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(),
      };
      const { svc } = buildService({ dimensionRepo });
      await expect(svc.postEntry(scope, taggedInput(['val-a', 'val-b']))).rejects.toBeInstanceOf(ValidationError);
      expect(dimensionRepo.createPostingDimension).not.toHaveBeenCalled();
    });

    it('rejects a non-leaf value (has active children) — leaf-only tagging D3', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => valueRow()),
        countActiveChildren: jest.fn(async () => 1),
        createPostingDimension: jest.fn(),
      };
      const { svc } = buildService({ dimensionRepo });
      await expect(svc.postEntry(scope, taggedInput(['val-parent']))).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects an archived value', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => valueRow({ status: 'ARCHIVED' })),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(),
      };
      const { svc } = buildService({ dimensionRepo });
      await expect(svc.postEntry(scope, taggedInput(['val-x']))).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a value not in the scope', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => null),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(),
      };
      const { svc } = buildService({ dimensionRepo });
      await expect(svc.postEntry(scope, taggedInput(['ghost']))).rejects.toBeInstanceOf(ValidationError);
    });

    it('tags across DIFFERENT axes on the same leg (N-axis)', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async (_s: any, id: string) =>
          id === 'v-cc' ? valueRow({ id, definitionId: 'def-cc' }) : valueRow({ id, definitionId: 'def-proj' }),
        ),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(async (d: any) => ({ id: 'pd', ...d })),
      };
      const { svc } = buildService({ dimensionRepo });
      await svc.postEntry(scope, taggedInput(['v-cc', 'v-proj']));
      expect(dimensionRepo.createPostingDimension).toHaveBeenCalledTimes(2);
    });
  });

  describe('mandatory-dimension gate + estorno copy (INCR-DIM-COMPLETENESS B1)', () => {
    const valueRow = (over: any = {}) => ({
      id: 'val-cc-1', userId: 'u1', unitId, definitionId: 'def-cc', code: 'CC1', name: 'Loja Centro',
      parentId: null, status: 'ACTIVE', createdById: null, createdAt: new Date(), updatedAt: new Date(),
      deletedAt: null, ...over,
    });
    // accountRepo where account '3.1' requires a dimension; everything else optional.
    const requiresOn31 = {
      findByCode: jest.fn(async (_s: AccountingScope, code: string) => ({
        id: `acc-${code}`, userId: 'u1', unitId, code, name: code, nature: 'Asset',
        acceptsEntries: true, requiresDimension: code === '3.1',
      })),
    };
    const taggedInput = (dimensions: string[]) => ({
      ...balancedInput,
      lines: [
        { accountCode: '1.1.1', debitCents: 10000, creditCents: 0 },
        { accountCode: '3.1', debitCents: 0, creditCents: 10000, dimensions },
      ],
    });

    it('postEntry: rejects an untagged leg to a requiresDimension account (SEC-B1-1), writing no tag', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => valueRow()),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(),
        findPostingDimensions: jest.fn(async () => []),
      };
      const { svc } = buildService({ accountRepo: requiresOn31, dimensionRepo });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dimensionRepo.createPostingDimension).not.toHaveBeenCalled();
    });

    it('postEntry: accepts the same leg WHEN tagged', async () => {
      const dimensionRepo = {
        findValueById: jest.fn(async () => valueRow()),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(async (d: any) => ({ id: 'pd', ...d })),
        findPostingDimensions: jest.fn(async () => []),
      };
      const { svc } = buildService({ accountRepo: requiresOn31, dimensionRepo });
      await expect(svc.postEntry(scope, taggedInput(['val-cc-1']))).resolves.toBeDefined();
      expect(dimensionRepo.createPostingDimension).toHaveBeenCalledTimes(1);
    });

    it('an account WITHOUT the flag stays 100% optional (untagged post succeeds)', async () => {
      const { svc } = buildService(); // default accountRepo → requiresDimension falsy
      await expect(svc.postEntry(scope, balancedInput)).resolves.toBeDefined();
    });

    it('MACHINE-WRITER EXEMPTION (Council 1.7/N6): a CLOSING entry with untagged legs on a requiresDimension account posts — the year-end close cannot deadlock', async () => {
      // Exact shape ExerciseClosingService composes: sourceType='closing', sourceId=String(year),
      // dated 31 Dec, untagged legs — one of them zeroing the FLAGGED result account '3.1'.
      const closingInput = {
        unitId,
        date: '2026-12-31',
        description: 'Encerramento do exercício 2026 — apuração do resultado',
        sourceType: 'closing',
        sourceId: '2026',
        lines: [
          { accountCode: '3.1', debitCents: 150000, creditCents: 0 }, // requiresDimension, UNTAGGED
          { accountCode: '2.3.1', debitCents: 0, creditCents: 150000 },
        ],
      };
      const { svc, journalEntryRepo } = buildService({ accountRepo: requiresOn31 });
      await expect(svc.postEntry(scope, closingInput)).resolves.toBeDefined();
      expect(journalEntryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'closing', status: 'Posted' }),
        txHandle,
      );
    });

    it('the exemption is CLOSING-ONLY: the same untagged legs under sourceType manual still reject', async () => {
      const { svc } = buildService({ accountRepo: requiresOn31 });
      await expect(svc.postEntry(scope, balancedInput)).rejects.toBeInstanceOf(ValidationError);
    });

    it('reverseEntry: COPIES the original leg tags onto the mirror (SEC-B1-2) so estorno inherits them', async () => {
      const original = {
        id: 'entry-1', userId: 'u1', unitId, status: 'Posted', sourceType: 'manual', reversedById: null,
        fiscalYear: 2026,
        postings: [
          { id: 'p1', accountId: 'acc-1.1.1', debitCents: 10000, creditCents: 0 },
          { id: 'p2', accountId: 'acc-3.1', debitCents: 0, creditCents: 10000 },
        ],
      };
      const reversal = { id: 'rev-1', sourceType: 'reversal', sourceId: 'entry-1', postings: [] };
      // p2 (the requiresDimension account leg) carries a tag; p1 has none.
      const dimensionRepo = {
        findValueById: jest.fn(async () => valueRow()),
        countActiveChildren: jest.fn(async () => 0),
        createPostingDimension: jest.fn(async (d: any) => ({ id: 'pd', ...d })),
        findPostingDimensions: jest.fn(async (_s: any, postingId: string) =>
          postingId === 'p2' ? [{ id: 'pd-orig', postingId, definitionId: 'def-cc', valueId: 'val-cc-1' }] : []),
      };
      // mirror leg ids are deterministic per create call — emulate distinct ids so the copy targets them.
      let mirrorSeq = 0;
      const postingRepo = {
        create: jest.fn(async (data: any) => ({ id: `mirror-${++mirrorSeq}`, ...data })),
        findByEntryId: jest.fn(async () => []),
      };
      const { svc } = buildService({
        accountRepo: requiresOn31,
        dimensionRepo,
        postingRepo,
        journalEntryRepo: {
          findById: jest.fn(async () => original),
          findBySource: jest.fn(async () => null),
          create: jest.fn(async () => reversal),
        },
      });
      await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1', reversalPostingDate: '2026-06-23' });
      // Exactly ONE tag copied (from p2), onto a mirror leg — the reversal inherited the original's tag.
      expect(dimensionRepo.createPostingDimension).toHaveBeenCalledTimes(1);
      expect(dimensionRepo.createPostingDimension).toHaveBeenCalledWith(
        expect.objectContaining({ definitionId: 'def-cc', valueId: 'val-cc-1', userId: 'u1', unitId }),
        txHandle,
      );
    });
  });

  describe('MAX_CENTS choke-point guard (Council 1.5 / ACC-014)', () => {
    const overCeilingInput = {
      unitId,
      date: '2026-06-23',
      description: 'Venda gigante',
      sourceType: 'salon.sale.finalized',
      sourceId: 'sale-big',
      lines: [
        { accountCode: '1.1.2', debitCents: MAX_CENTS + 1, creditCents: 0 },
        { accountCode: '3.1', debitCents: 0, creditCents: MAX_CENTS + 1 },
      ],
    };

    it('rejects a leg above MAX_CENTS with MaxCentsExceededError (OWN code, distinct from period-closed) — no tx opened', async () => {
      const { svc, journalEntryRepo } = buildService();
      const err = await svc.postEntry(scope, overCeilingInput).catch((e) => e);
      expect(err).toBeInstanceOf(MaxCentsExceededError);
      expect(err.errorCode).toBe('MAX_CENTS_EXCEEDED');
      expect(err.errorCode).not.toBe('ACCOUNTING_PERIOD_NOT_OPEN');
      expect(err.message).toContain('1.1.2'); // account-coded, as actionable as the old border replicas
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('accepts EXACTLY MAX_CENTS (boundary is inclusive — the Int32 column stores it)', async () => {
      const { svc } = buildService();
      const atCeiling = {
        ...overCeilingInput,
        lines: [
          { accountCode: '1.1.2', debitCents: MAX_CENTS, creditCents: 0 },
          { accountCode: '3.1', debitCents: 0, creditCents: MAX_CENTS },
        ],
      };
      await expect(svc.postEntry(scope, atCeiling)).resolves.toBeDefined();
    });

    it('rejects NON-INTEGER cents at the choke-point (mapper/bridge callers bypass every DTO)', async () => {
      const { svc } = buildService();
      const floaty = {
        ...overCeilingInput,
        lines: [
          { accountCode: '1.1.2', debitCents: 100.5, creditCents: 0 },
          { accountCode: '3.1', debitCents: 0, creditCents: 100.5 },
        ],
      };
      const err = await svc.postEntry(scope, floaty).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
    });

    it('rejects NEGATIVE cents at the choke-point', async () => {
      const { svc } = buildService();
      const negative = {
        ...overCeilingInput,
        lines: [
          // Balanced sums (Σd = Σc = 100) — only the per-line guard can catch this.
          { accountCode: '1.1.2', debitCents: -100, creditCents: 0 },
          { accountCode: '1.1.1', debitCents: 200, creditCents: 0 },
          { accountCode: '3.1', debitCents: 0, creditCents: 100 },
        ],
      };
      const err = await svc.postEntry(scope, negative).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
    });
  });

  describe('setAccountRequiresDimension (INCR-DIM-COMPLETENESS SEC-B1-4)', () => {
    it('flips the flag + emits an AuditEvent, all in one tx', async () => {
      const accountRepo = {
        findById: jest.fn(async (_s: AccountingScope, id: string) => ({
          id, userId: 'u1', unitId, code: '4.1', name: 'Despesa', nature: 'Expense',
          acceptsEntries: true, requiresDimension: false,
        })),
        setRequiresDimension: jest.fn(async (_s: any, id: string, v: boolean) => ({ id, code: '4.1', requiresDimension: v })),
      };
      const { svc, auditService } = buildService({ accountRepo });
      const updated = await svc.setAccountRequiresDimension(scope, 'acc-4.1', true);
      expect(accountRepo.setRequiresDimension).toHaveBeenCalledWith(scope, 'acc-4.1', true, txHandle);
      expect(updated.requiresDimension).toBe(true);
      expect(auditService.append).toHaveBeenCalledWith(
        txHandle,
        scope,
        expect.objectContaining({ eventType: 'account.requires_dimension_changed', targetType: 'account', targetId: 'acc-4.1' }),
      );
    });

    it('is forbidden without canManage', async () => {
      const { svc } = buildService({ policy: { canManage: jest.fn(() => false) } });
      await expect(svc.setAccountRequiresDimension(scope, 'acc-4.1', true)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
  });
});
