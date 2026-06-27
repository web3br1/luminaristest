import { AccountingPeriodNotOpenError, AppError, ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
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
import type { IAccountingPeriodRepository } from '../repositories/IAccountingPeriodRepository';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/**
 * PostingService — double-entry posting engine, FIRST-CLASS PRISMA (no DynamicTable).
 *
 * All public methods receive an AccountingScope (resolved by the controller from the
 * authenticated user + unitId). Services use scope.ownerUserId for data tenancy and
 * scope.actorUserId for authorship (createdById, postedById on JournalEntry).
 *
 * Contract §2.1 invariants honored here:
 * - money is INTEGER CENTS; the balance check is EXACT integer equality (no epsilon);
 * - posted/reversed entries are immutable — corrections via a reversing entry (estorno);
 * - idempotency is closed by REAL DB constraints (@@unique([userId,unitId,code]) on
 *   accounts and @@unique([userId,unitId,sourceType,sourceId]) on journal entries) —
 *   P2002 unique violations are caught and resolved by re-fetch.
 */
export class PostingService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly policy: IAccountingPolicy,
    private readonly periodRepo: IAccountingPeriodRepository,
  ) {}

  /** Derive year+month from an ISO date string using UTC (no tz shift for date-only strings). */
  private extractYearMonth(dateStr: string): { year: number; month: number } {
    // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by JS — no tz conversion needed.
    const d = new Date(dateStr);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }

  /**
   * Preflight period gate (outside tx) — fast rejection before opening a transaction.
   * The authoritative gate lives in assertPeriodOpenTx (inside the tx).
   */
  private async assertPeriodOpen(scope: AccountingScope, dateStr: string): Promise<void> {
    const { year, month } = this.extractYearMonth(dateStr);
    const period = await this.periodRepo.findByYearMonth(scope, year, month);
    if (!period || period.status !== 'OPEN') {
      throw new AccountingPeriodNotOpenError(year, month);
    }
  }

  /**
   * Authoritative period gate (inside tx) — re-checks AFTER the tx is open, immediately
   * before the Posted write, to close the TOCTOU window where an admin could close the
   * period between the preflight check and the commit.
   */
  private async assertPeriodOpenTx(
    tx: Prisma.TransactionClient,
    scope: AccountingScope,
    dateStr: string,
  ): Promise<void> {
    const { year, month } = this.extractYearMonth(dateStr);
    const period = await this.periodRepo.findByYearMonth(scope, year, month, tx);
    if (!period || period.status !== 'OPEN') {
      throw new AccountingPeriodNotOpenError(year, month);
    }
  }

  /**
   * Idempotently ensure the canonical chart of accounts exists for the scope.
   * Definitions live in CANONICAL_ACCOUNTS; only creates the missing ones.
   * Backed by @@unique([userId,unitId,code]) — a concurrent create that loses the
   * race throws P2002.
   *
   * P2002 is NOT unconditionally benign: the @@unique is on the RAW columns and does not
   * exclude soft-deleted rows, while findByCode filters deletedAt:null. So if a canonical
   * account exists ONLY as a soft-deleted row, findByCode returns null → create trips P2002
   * → and swallowing it would leave the leaf permanently missing. We therefore try to
   * RESTORE the soft-deleted row on P2002.
   */
  private async ensureChartOfAccounts(scope: AccountingScope): Promise<void> {
    const { userId, unitId } = accountingScopeWhere(scope);
    for (const account of CANONICAL_ACCOUNTS) {
      const existing = await this.accountRepo.findByCode(scope, account.code);
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
          const restored = await this.accountRepo.restoreByCode(scope, account.code);
          if (restored) {
            logger.info('Canonical account restored from soft-deleted row', {
              userId,
              unitId,
              code: account.code,
            });
            continue;
          }
          continue;
        }
        throw error;
      }
    }
  }

  /** Resolve a leaf account by code, asserting it exists and accepts ledger lines. */
  private async resolveLeafAccount(scope: AccountingScope, code: string): Promise<Account> {
    const account = await this.accountRepo.findByCode(scope, code);
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
  async postEntry(scope: AccountingScope, input: PostEntryInput): Promise<JournalEntryWithPostings> {
    if (!this.policy.canPost(scope)) {
      throw new ForbiddenError('Você não tem permissão para postar lançamentos.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    // PERIOD GATE — preflight (fast rejection before tx); authoritative gate is inside the tx.
    await this.assertPeriodOpen(scope, input.date);

    await this.ensureChartOfAccounts(scope);

    // BALANCE INVARIANT — integer cents, EXACT equality (no float/epsilon, Contract §2.1).
    const sumDebit = input.lines.reduce((acc, line) => acc + line.debitCents, 0);
    const sumCredit = input.lines.reduce((acc, line) => acc + line.creditCents, 0);
    if (sumDebit !== sumCredit || sumDebit <= 0) {
      throw new ValidationError('Lançamento desbalanceado: Σdébito deve igualar Σcrédito.');
    }

    const sourceType = input.sourceType ?? 'manual';

    // IDEMPOTENCY (read side) — if an entry already exists for this source, return it.
    if (input.sourceId) {
      const existing = await this.journalEntryRepo.findBySource(scope, sourceType, input.sourceId);
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
      const account = await this.resolveLeafAccount(scope, line.accountCode);
      resolvedLines.push({
        accountId: account.id,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
      });
    }

    try {
      // ATOMIC — entry header + all legs commit/roll back together.
      const entry = await this.postingRepo.runTransaction(async (tx) => {
        // AUTHORITATIVE PERIOD GATE — inside the tx, before Posted. Closes the TOCTOU window.
        await this.assertPeriodOpenTx(tx, scope, input.date);

        const created = await this.journalEntryRepo.create(
          {
            userId,
            unitId,
            date: new Date(input.date),
            description: input.description,
            status: 'Posted',
            sourceType,
            sourceId: input.sourceId ?? null,
            createdById: scope.actorUserId,
            postedById: scope.actorUserId,
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

        const postings = await this.postingRepo.findByEntryId(scope, created.id, tx);
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
      // is a REAL DB constraint. A concurrent poster that wins the race trips P2002;
      // re-fetch and return its entry.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        input.sourceId
      ) {
        const existing = await this.journalEntryRepo.findBySource(scope, sourceType, input.sourceId);
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
   * move the original to `Reversed`, and link them. Only `Posted` entries reverse.
   */
  async reverseEntry(
    scope: AccountingScope,
    input: ReverseEntryInput,
  ): Promise<{ reversal: JournalEntryWithPostings; original: JournalEntryWithPostings }> {
    if (!this.policy.canPost(scope)) {
      throw new ForbiddenError('Você não tem permissão para estornar lançamentos.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    // PERIOD GATE — gate on the REVERSAL date (not the original entry date).
    await this.assertPeriodOpen(scope, input.reversalPostingDate);

    const original = await this.journalEntryRepo.findById(scope, input.lancamentoId);
    if (!original) {
      throw new NotFoundError(`Lançamento '${input.lancamentoId}' não foi encontrado.`);
    }

    // IDEMPOTENCY — must come BEFORE the status gate: a reversed entry has status 'Reversed',
    // so checking status first would throw instead of returning the prior reversal.
    if (original.reversedById) {
      const existing = await this.journalEntryRepo.findById(scope, original.reversedById);
      if (existing) {
        logger.info('Reversal skipped — original already reversed', {
          originalId: original.id,
          reversalId: existing.id,
        });
        return { reversal: existing, original };
      }
    }
    const priorReversal = await this.journalEntryRepo.findBySource(scope, 'reversal', original.id);
    if (priorReversal) {
      logger.info('Reversal skipped — idempotent hit', {
        originalId: original.id,
        reversalId: priorReversal.id,
      });
      return { reversal: priorReversal, original };
    }

    if (original.status !== 'Posted') {
      throw new ValidationError('Apenas lançamentos postados podem ser estornados.');
    }

    // Re-assert the original is balanced before mirroring.
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
        // AUTHORITATIVE PERIOD GATE — inside the tx, on the reversal date.
        await this.assertPeriodOpenTx(tx, scope, input.reversalPostingDate);

        const reversal = await this.journalEntryRepo.create(
          {
            userId,
            unitId,
            date: new Date(input.reversalPostingDate),
            description: input.reason ? `Estorno de ${original.id} — ${input.reason}` : `Estorno de ${original.id}`,
            status: 'Posted',
            sourceType: 'reversal',
            sourceId: original.id,
            createdById: scope.actorUserId,
            postedById: scope.actorUserId,
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

        await this.journalEntryRepo.setStatus(scope, original.id, 'Reversed', tx);
        await this.journalEntryRepo.setReversedBy(scope, original.id, reversal.id, tx);

        const reversalPostings = await this.postingRepo.findByEntryId(scope, reversal.id, tx);
        return { ...reversal, postings: reversalPostings };
      });
    } catch (error) {
      // ponytail: authoritative race-close — @@unique([userId,unitId,sourceType,sourceId]) blocks
      // a second reversal. A concurrent reverser that loses the race trips P2002; re-fetch.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.journalEntryRepo.findBySource(scope, 'reversal', original.id);
        if (existing) {
          const racedOriginal =
            (await this.journalEntryRepo.findById(scope, original.id)) ?? original;
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
      (await this.journalEntryRepo.findById(scope, original.id)) ?? original;
    return { reversal: result, original: refreshedOriginal };
  }

  /**
   * Find a single journal entry by its business source (sourceType + sourceId).
   * Used by integration hooks (e.g. accountingSync) that need the entry id to reverse.
   */
  async findEntryBySource(
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
  ): Promise<JournalEntryWithPostings | null> {
    if (!this.policy.canRead(scope)) return null;
    return this.journalEntryRepo.findBySource(scope, sourceType, sourceId);
  }

  /**
   * List all active accounts for the scope. Idempotently seeds the canonical
   * chart of accounts first so the caller always gets a non-empty list on first access.
   */
  async listAccounts(scope: AccountingScope): Promise<Account[]> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para listar contas.');
    }
    await this.ensureChartOfAccounts(scope);
    return this.accountRepo.findManyByUnit(scope);
  }

  /**
   * List journal entries for the scope, paginated, with postings including
   * account code and name. Ordered by date descending.
   */
  async listEntries(
    scope: AccountingScope,
    params: { page?: number; limit?: number },
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para listar lançamentos.');
    }
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;
    return this.journalEntryRepo.findManyByUnit(scope, skip, limit);
  }

  /**
   * Create a user-defined account in the chart of accounts (non-canonical).
   * Duplicate codes are blocked by the @@unique constraint; P2002 → ValidationError.
   */
  async createAccount(scope: AccountingScope, dto: CreateAccountInput): Promise<Account> {
    if (!this.policy.canManage(scope)) {
      throw new ForbiddenError('Você não tem permissão para criar contas.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);
    try {
      return await this.accountRepo.create({
        userId,
        unitId,
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
   * 1. Account must exist within this scope (ownerUserId + unitId).
   * 2. Account must not be a canonical/seeded account.
   * 3. Account must have no postings.
   *
   * The lookup is unit-scoped (Contract §2 tenancy): an account can only be deleted
   * while acting in its own unit, so there is no cross-unit-by-id deletion path.
   */
  async deleteAccount(scope: AccountingScope, accountId: string): Promise<void> {
    if (!this.policy.canManage(scope)) {
      throw new ForbiddenError('Você não tem permissão para excluir contas.');
    }

    const account = await this.accountRepo.findById(scope, accountId);
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
    const postings = await this.postingRepo.findByAccount(scope, accountId);
    if (postings.length > 0) {
      throw new AppError(
        'Conta possui lançamentos e não pode ser excluída.',
        409,
        'CONFLICT',
      );
    }

    await this.accountRepo.softDelete(scope, accountId);
    logger.info('Account soft-deleted', { accountId, userId: scope.ownerUserId });
  }
}
