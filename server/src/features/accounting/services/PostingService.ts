import type { UserContext } from '../../../types/UserContext';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import { Prisma } from 'generated/prisma';
import type { Account } from 'generated/prisma';
import { CANONICAL_ACCOUNTS } from '../fixtures/ChartOfAccountsFixture';
import type { CreateAccountInput, PostEntryInput, ReverseEntryInput } from '../dtos/PostingDto';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type {
  IJournalEntryRepository,
  JournalEntryWithFullPostings,
  JournalEntryWithPostings,
} from '../repositories/IJournalEntryRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';

/**
 * PostingService — double-entry posting engine, FIRST-CLASS PRISMA (no DynamicTable).
 *
 * Repositories talk directly to the shared prisma client; this service composes the
 * atomic writes via prisma.$transaction. Tenancy is two-level (Contract §2): every
 * read/write filters userId (auth boundary) AND unitId (request sub-partition).
 *
 * Contract §2.1 invariants honored here:
 * - money is INTEGER CENTS; the balance check is EXACT integer equality (no epsilon);
 * - posted/reversed entries are immutable — corrections via a reversing entry (estorno);
 * - idempotency is now closed by REAL DB constraints (@@unique([userId,unitId,code]) on
 *   accounts and @@unique([userId,unitId,sourceType,sourceId]) on journal entries) —
 *   P2002 unique violations are caught and resolved by re-fetch. NB: the accounts @@unique
 *   is on raw columns (does not exclude soft-deleted rows), so a P2002 on a code held only
 *   by a soft-deleted account is resolved by RESTORING that row, not swallowed (see
 *   ensureChartOfAccounts) — that is the one place P2002 is not unconditionally benign.
 */
export class PostingService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  /**
   * Idempotently ensure the canonical chart of accounts exists for (userId, unitId).
   * Definitions live in CANONICAL_ACCOUNTS (the fixture); this only creates the missing
   * ones. Backed by @@unique([userId,unitId,code]) — a concurrent create that loses the
   * race throws P2002.
   *
   * P2002 is NOT unconditionally benign: the @@unique is on the RAW columns and does not
   * exclude soft-deleted rows, while findByCode filters deletedAt:null. So if a canonical
   * account exists ONLY as a soft-deleted row, findByCode returns null → create trips P2002
   * → and swallowing it would leave the leaf permanently missing (every postEntry to that
   * code then failing in resolveLeafAccount). We therefore try to RESTORE the soft-deleted
   * row on P2002; only when nothing soft-deleted is found (an ACTIVE row already holds the
   * code — a genuine concurrent-create race) is the collision truly benign.
   */
  private async ensureChartOfAccounts(userId: string, unitId: string): Promise<void> {
    for (const account of CANONICAL_ACCOUNTS) {
      const existing = await this.accountRepo.findByCode(userId, unitId, account.code);
      if (existing) continue;
      try {
        await this.accountRepo.create({
          userId,
          unitId,
          code: account.code,
          name: account.name,
          nature: account.nature,
          acceptsEntries: account.acceptsEntries,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // The code is taken on the raw columns. If it is taken by a SOFT-DELETED row,
          // revive it — otherwise the canonical leaf stays invisible to findByCode forever.
          const restored = await this.accountRepo.restoreByCode(userId, unitId, account.code);
          if (restored) {
            logger.info('Canonical account restored from soft-deleted row', {
              userId,
              unitId,
              code: account.code,
            });
            continue;
          }
          // Nothing soft-deleted to revive → an active row already holds the code (a benign
          // concurrent-create race lost). The row exists and is live; continue.
          continue;
        }
        throw error;
      }
    }
  }

  /** Resolve a leaf account by code, asserting it exists and accepts ledger lines. */
  private async resolveLeafAccount(
    userId: string,
    unitId: string,
    code: string,
  ): Promise<Account> {
    const account = await this.accountRepo.findByCode(userId, unitId, code);
    if (!account) {
      throw new ValidationError(`Conta '${code}' não existe no plano de contas.`);
    }
    if (account.acceptsEntries === false) {
      throw new ValidationError(
        `Conta '${code}' é sintética e não aceita partidas (use uma conta analítica).`,
      );
    }
    return account;
  }

  /**
   * Post a balanced double-entry journal entry. Creates a `journal_entries` row in
   * status `Posted` plus its `postings` legs, atomically. Σdebit must EXACTLY equal
   * Σcredit (integer cents) and be > 0. When `sourceId` is given, posting is idempotent.
   */
  async postEntry(user: UserContext, input: PostEntryInput): Promise<JournalEntryWithPostings> {
    if (!this.policy.canPost(user)) {
      throw new ForbiddenError('Você não tem permissão para postar lançamentos.');
    }
    const { userId } = user;
    const { unitId } = input;

    await this.ensureChartOfAccounts(userId, unitId);

    // BALANCE INVARIANT — integer cents, EXACT equality (no float/epsilon, Contract §2.1).
    const sumDebit = input.lines.reduce((acc, line) => acc + line.debitCents, 0);
    const sumCredit = input.lines.reduce((acc, line) => acc + line.creditCents, 0);
    if (sumDebit !== sumCredit || sumDebit <= 0) {
      throw new ValidationError('Lançamento desbalanceado: Σdébito deve igualar Σcrédito.');
    }

    const sourceType = input.sourceType ?? 'manual';

    // IDEMPOTENCY (read side) — if an entry already exists for this source, return it.
    if (input.sourceId) {
      const existing = await this.journalEntryRepo.findBySource(
        userId,
        unitId,
        sourceType,
        input.sourceId,
      );
      if (existing) {
        logger.info('Posting skipped — idempotent hit', {
          sourceType,
          sourceId: input.sourceId,
          entryId: existing.id,
        });
        return existing;
      }
    }

    // Resolve every line's account (leaf-only) BEFORE opening the transaction.
    const resolvedLines: Array<{ accountId: string; debitCents: number; creditCents: number }> = [];
    for (const line of input.lines) {
      const account = await this.resolveLeafAccount(userId, unitId, line.accountCode);
      resolvedLines.push({
        accountId: account.id,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
      });
    }

    try {
      // ATOMIC — entry header + all legs commit/roll back together.
      const entry = await this.postingRepo.runTransaction(async (tx) => {
        const created = await this.journalEntryRepo.create(
          {
            userId,
            unitId,
            date: new Date(input.date),
            description: input.description,
            status: 'Posted',
            sourceType,
            sourceId: input.sourceId ?? null,
          },
          tx,
        );

        for (const line of resolvedLines) {
          await this.postingRepo.create(
            {
              userId,
              unitId,
              entryId: created.id,
              accountId: line.accountId,
              debitCents: line.debitCents,
              creditCents: line.creditCents,
            },
            tx,
          );
        }

        const postings = await this.postingRepo.findByEntryId(userId, unitId, created.id, tx);
        return { ...created, postings };
      });

      logger.info('Journal entry posted', {
        entryId: entry.id,
        lines: resolvedLines.length,
        sumDebit,
      });
      return entry;
    } catch (error) {
      // ponytail: authoritative race-close — @@unique([userId,unitId,sourceType,sourceId])
      // is a REAL DB constraint now (not the TOCTOU the DynamicTable version had). A
      // concurrent poster that wins the race trips P2002; we re-fetch and return its entry.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        input.sourceId
      ) {
        const existing = await this.journalEntryRepo.findBySource(
          userId,
          unitId,
          sourceType,
          input.sourceId,
        );
        if (existing) {
          logger.info('Posting race closed by unique constraint — returning existing', {
            sourceType,
            sourceId: input.sourceId,
            entryId: existing.id,
          });
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Reverse a posted entry (estorno): create a mirror entry with debit/credit SWAPPED,
   * move the original to `Reversed`, and link them. Reads are tenant+unit scoped, so a
   * foreign id is simply NotFound (no cross-tenant read). Only `Posted` entries reverse.
   */
  async reverseEntry(
    user: UserContext,
    input: ReverseEntryInput,
  ): Promise<{ reversal: JournalEntryWithPostings; original: JournalEntryWithPostings }> {
    if (!this.policy.canPost(user)) {
      throw new ForbiddenError('Você não tem permissão para estornar lançamentos.');
    }
    const { userId } = user;
    const { unitId } = input;

    const original = await this.journalEntryRepo.findById(userId, unitId, input.lancamentoId);
    if (!original) {
      throw new NotFoundError(`Lançamento '${input.lancamentoId}' não foi encontrado.`);
    }
    if (original.status !== 'Posted') {
      throw new ValidationError('Apenas lançamentos postados podem ser estornados.');
    }

    // IDEMPOTENCY / no double-reversal — the original may already carry its reversal link,
    // or a reversal entry (sourceType='reversal', sourceId=original.id) may already exist.
    if (original.reversedById) {
      const existing = await this.journalEntryRepo.findById(userId, unitId, original.reversedById);
      if (existing) {
        logger.info('Reversal skipped — original already reversed', {
          originalId: original.id,
          reversalId: existing.id,
        });
        return { reversal: existing, original };
      }
    }
    const priorReversal = await this.journalEntryRepo.findBySource(
      userId,
      unitId,
      'reversal',
      original.id,
    );
    if (priorReversal) {
      logger.info('Reversal skipped — idempotent hit', {
        originalId: original.id,
        reversalId: priorReversal.id,
      });
      return { reversal: priorReversal, original };
    }

    // Re-assert the original is balanced before mirroring — the swap is balanced BY
    // CONSTRUCTION only if `postings` is the COMPLETE leg set. Integer cents, EXACT equality.
    const origDebit = original.postings.reduce((acc, p) => acc + p.debitCents, 0);
    const origCredit = original.postings.reduce((acc, p) => acc + p.creditCents, 0);
    if (origDebit !== origCredit || origDebit <= 0) {
      throw new ValidationError(
        `Lançamento '${original.id}' está desbalanceado ou sem partidas — estorno abortado.`,
      );
    }

    // ATOMIC — reversal header + swapped legs + original→Reversed + link commit together.
    let result: JournalEntryWithPostings;
    try {
      result = await this.postingRepo.runTransaction(async (tx) => {
        const reversal = await this.journalEntryRepo.create(
          {
            userId,
            unitId,
            date: new Date(),
            description: `Estorno de ${original.id}`,
            status: 'Posted',
            sourceType: 'reversal',
            sourceId: original.id,
          },
          tx,
        );

        for (const leg of original.postings) {
          await this.postingRepo.create(
            {
              userId,
              unitId,
              entryId: reversal.id,
              accountId: leg.accountId,
              // SWAP: a debit leg becomes a credit leg and vice-versa.
              debitCents: leg.creditCents,
              creditCents: leg.debitCents,
            },
            tx,
          );
        }

        await this.journalEntryRepo.setStatus(userId, unitId, original.id, 'Reversed', tx);
        await this.journalEntryRepo.setReversedBy(userId, unitId, original.id, reversal.id, tx);

        const reversalPostings = await this.postingRepo.findByEntryId(userId, unitId, reversal.id, tx);
        return { ...reversal, postings: reversalPostings };
      });
    } catch (error) {
      // ponytail: authoritative race-close — @@unique([userId,unitId,sourceType,sourceId]) blocks
      // a second reversal (sourceType='reversal', sourceId=original.id) at the DB. A concurrent
      // reverser that loses the race trips P2002; re-fetch and return the winning reversal instead
      // of leaking a 500 (mirrors postEntry's benign-resolve).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.journalEntryRepo.findBySource(userId, unitId, 'reversal', original.id);
        if (existing) {
          const racedOriginal =
            (await this.journalEntryRepo.findById(userId, unitId, original.id)) ?? original;
          logger.info('Reversal race closed by unique constraint — returning existing', {
            originalId: original.id,
            reversalId: existing.id,
          });
          return { reversal: existing, original: racedOriginal };
        }
      }
      throw error;
    }

    logger.info('Journal entry reversed', { originalId: original.id, reversalId: result.id });

    const refreshedOriginal =
      (await this.journalEntryRepo.findById(userId, unitId, original.id)) ?? original;
    return { reversal: result, original: refreshedOriginal };
  }

  /**
   * List all active accounts for a (userId, unitId). Idempotently seeds the canonical
   * chart of accounts first so the caller always gets a non-empty list on first access.
   */
  async listAccounts(user: UserContext, unitId: string): Promise<Account[]> {
    if (!this.policy.canRead(user)) {
      throw new ForbiddenError('Você não tem permissão para listar contas.');
    }
    await this.ensureChartOfAccounts(user.userId, unitId);
    return this.accountRepo.findManyByUnit(user.userId, unitId);
  }

  /**
   * List journal entries for a (userId, unitId), paginated, with postings including
   * account code and name. Ordered by date descending.
   */
  async listEntries(
    user: UserContext,
    params: { unitId: string; page?: number; limit?: number },
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }> {
    if (!this.policy.canRead(user)) {
      throw new ForbiddenError('Você não tem permissão para listar lançamentos.');
    }
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;
    return this.journalEntryRepo.findManyByUnit(user.userId, params.unitId, skip, limit);
  }

  /**
   * Create a user-defined account in the chart of accounts (non-canonical).
   * Canonical/seeded accounts are marked via the PostingService's own seeding path;
   * user-created accounts get isDefault=false (there is no such column — the fixture
   * is what defines canonical accounts, not a DB flag). We block duplicate codes
   * by letting the @@unique constraint speak; P2002 → ValidationError.
   */
  async createAccount(user: UserContext, dto: CreateAccountInput): Promise<Account> {
    if (!this.policy.canManage(user)) {
      throw new ForbiddenError('Você não tem permissão para criar contas.');
    }
    try {
      return await this.accountRepo.create({
        userId: user.userId,
        unitId: dto.unitId,
        code: dto.code,
        name: dto.name,
        nature: dto.nature,
        acceptsEntries: dto.acceptsEntries ?? true,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(
          `Já existe uma conta com o código '${dto.code}' nesta unidade.`,
        );
      }
      throw error;
    }
  }

  /**
   * Soft-delete a user-defined account. Guards:
   * 1. Account must exist and belong to this user+unit.
   * 2. Account must not be a canonical/seeded account (code present in CANONICAL_ACCOUNTS).
   * 3. Account must have no postings.
   */
  async deleteAccount(user: UserContext, accountId: string): Promise<void> {
    if (!this.policy.canManage(user)) {
      throw new ForbiddenError('Você não tem permissão para excluir contas.');
    }
    const { userId } = user;

    const account = await this.accountRepo.findById(userId, accountId);
    if (!account) {
      throw new NotFoundError(`Conta '${accountId}' não encontrada.`);
    }

    // Guard: cannot delete canonical (seeded) accounts.
    const isCanonical = CANONICAL_ACCOUNTS.some((c) => c.code === account.code);
    if (isCanonical) {
      throw new AppError(
        'Contas padrão do plano de contas não podem ser excluídas.',
        409,
        'CONFLICT',
      );
    }

    // Guard: cannot delete an account that has postings.
    const postings = await this.postingRepo.findByAccount(userId, account.unitId, accountId);
    if (postings.length > 0) {
      throw new AppError(
        'Conta possui lançamentos e não pode ser excluída.',
        409,
        'CONFLICT',
      );
    }

    await this.accountRepo.softDelete(userId, account.unitId, accountId);
    logger.info('Account soft-deleted', { accountId, userId });
  }
}
