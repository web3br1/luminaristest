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
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { CANONICAL_ACCOUNTS } from '../../fixtures/ChartOfAccountsFixture';
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
    findById: jest.fn(async (_uid: string, id: string) => ({ id, userId: 'u1', unitId, code: '9.9', name: 'test', nature: 'Asset', acceptsEntries: true })),
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
    ...over.journalEntryRepo,
  };

  const postingRepo = {
    create: jest.fn(async (data: any) => ({ id: 'p-x', ...data })),
    findByEntryId: jest.fn(async () => []),
    findByAccount: jest.fn(async () => []),
    groupByAccount: jest.fn(async () => []),
    // delegates to the global $transaction so existing assertions (toHaveBeenCalledTimes,
    // mockImplementationOnce P2002 overrides) continue to work unchanged.
    runTransaction: jest.fn(async (fn: (tx: unknown) => unknown) => $transaction(fn)),
    ...over.postingRepo,
  };

  const policy = {
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canRead: jest.fn(() => true),
    ...over.policy,
  };

  const svc = new PostingService(
    accountRepo as any,
    journalEntryRepo as any,
    postingRepo as any,
    policy as any,
  );
  return { svc, accountRepo, journalEntryRepo, postingRepo, policy };
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

    it('rejects reversing a non-Posted entry (e.g. Draft) → ValidationError, no write', async () => {
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById: jest.fn(async () => ({ ...original, status: 'Draft' })) },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
      expect(journalEntryRepo.create).not.toHaveBeenCalled();
    });

    it('missing / other-unit entry → NotFoundError (findById is scope-scoped)', async () => {
      const findById = jest.fn(async () => null);
      const { svc, journalEntryRepo } = buildService({
        journalEntryRepo: { findById },
      });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1' }),
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
      const { reversal } = await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1' });
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
      const { reversal } = await svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1' });
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
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect($transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when policy.canPost is false', async () => {
      const { svc, journalEntryRepo } = buildService({ policy: { canPost: jest.fn(() => false) } });
      await expect(
        svc.reverseEntry(scope, { unitId, lancamentoId: 'entry-1' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(journalEntryRepo.findById).not.toHaveBeenCalled();
    });
  });
});
