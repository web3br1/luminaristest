import { AccountingPeriodNotOpenError, AppError, ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { Account, Prisma } from 'generated/prisma';
import { computeEntryContentHash } from '../models/entryContentHash';
import type {
  ApproveEntryInput,
  CreateDraftEntryInput,
  ListPendingApprovalQueryInput,
  RejectEntryInput,
  SubmitEntryInput,
  UpdateDraftEntryInput,
} from '../dtos/EntryApprovalDto';
import type {
  IJournalEntryRepository,
  JournalEntryWithFullPostings,
  JournalEntryWithPostings,
} from '../repositories/IJournalEntryRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPeriodRepository } from '../repositories/IAccountingPeriodRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AuditService } from './AuditService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

interface ResolvedLine {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

/**
 * EntryApprovalService — maker-checker approval tower (ADR-INCR-APPROVAL). FIRST-CLASS PRISMA.
 *
 * Inserts the submission→approval stage into the JournalEntry lifecycle BEFORE the post:
 *
 *   Draft ──submit──▶ PendingApproval ──approve──▶ Posted   (reject sends it back to Draft)
 *
 * It does NOT replace PostingService.postEntry — the "post directly" path stays for integrations
 * and for actors with post-without-approval authority. This service is the controlled, opt-in
 * path for MANUAL entries.
 *
 * Invariants (ADR §6):
 * - ACC-015: entryNumber/fiscalYear are born at APPROVE (=post), inside the tx, never in a draft.
 *   A rejected draft therefore never consumes a gapless number.
 * - ACC-016: state moves by COMMANDS (createDraft/updateDraft/submit/approve/reject), each with its
 *   own authz + audit — never a generic PATCH status.
 * - ACC-017/022: `contentHash` freezes the ECONOMIC content (legs + date + description) at submit;
 *   the checker approves exactly what was submitted.
 * - ACC-023: every transition is an optimistic-lock CAS on `version` (in-tx); the approve tx also
 *   re-verifies the frozen hash against the current legs (tamper check) and re-checks the period
 *   gate inside the tx (T6/TOCTOU). Dynamic SoD (approver ≠ creator/submitter) is server-side.
 */
export class EntryApprovalService {
  constructor(
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly periodRepo: IAccountingPeriodRepository,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
  ) {}

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  /** Create a Draft entry with its (balanced) legs. No number, no ledger impact yet. */
  async createDraft(scope: AccountingScope, dto: CreateDraftEntryInput): Promise<JournalEntryWithPostings> {
    if (!this.policy.canManageEntryApproval(scope)) {
      throw new ForbiddenError('Você não tem permissão para criar rascunhos de lançamento.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);
    const sumDebit = this.assertBalanced(dto.lines);
    const resolved = await this.resolveLines(scope, dto.lines);

    return this.postingRepo.runTransaction(async (tx) => {
      const entry = await this.journalEntryRepo.create(
        {
          userId,
          unitId,
          date: new Date(dto.date),
          description: dto.description,
          status: 'Draft',
          sourceType: 'manual',
          sourceId: null,
          createdById: scope.actorUserId,
          postedById: null,
          fiscalYear: null,
          entryNumber: null,
        },
        tx,
      );
      await this.writeLegs(scope, entry.id, resolved, tx);
      const postings = await this.postingRepo.findByEntryId(scope, entry.id, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'entry.drafted',
        targetType: 'journal_entry',
        targetId: entry.id,
        payload: { description: dto.description, lineCount: String(resolved.length), sumDebitCents: String(sumDebit) },
      });
      logger.info('Draft journal entry created', { entryId: entry.id, lines: resolved.length });
      return { ...entry, postings };
    });
  }

  /** Replace a DRAFT entry's date/description/legs. Only allowed while Draft; bumps version and
   *  clears the (now stale) contentHash. This is the "edit after rejection" path (F4). */
  async updateDraft(
    scope: AccountingScope,
    id: string,
    dto: UpdateDraftEntryInput,
  ): Promise<JournalEntryWithPostings> {
    if (!this.policy.canManageEntryApproval(scope)) {
      throw new ForbiddenError('Você não tem permissão para editar rascunhos de lançamento.');
    }
    const entry = await this.journalEntryRepo.findById(scope, id);
    if (!entry) throw new NotFoundError(`Lançamento '${id}' não foi encontrado.`);
    if (entry.status !== 'Draft') {
      throw new ValidationError('Apenas rascunhos podem ser editados (submeta uma rejeição antes de editar).');
    }
    this.assertBalanced(dto.lines);
    const resolved = await this.resolveLines(scope, dto.lines);
    const newVersion = dto.expectedVersion + 1;

    await this.postingRepo.runTransaction(async (tx) => {
      const count = await this.journalEntryRepo.casUpdate(
        scope,
        id,
        dto.expectedVersion,
        { date: new Date(dto.date), description: dto.description, contentHash: null, version: newVersion },
        tx,
      );
      if (count === 0) throw this.versionConflict();
      await this.postingRepo.deleteByEntryId(scope, id, tx);
      await this.writeLegs(scope, id, resolved, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'entry.draft_updated',
        targetType: 'journal_entry',
        targetId: id,
        payload: {
          description: dto.description,
          lineCount: String(resolved.length),
          sumDebitCents: String(resolved.reduce((a, l) => a + l.debitCents, 0)),
          version: String(newVersion),
        },
      });
    });
    return this.reload(scope, id);
  }

  /** Submit a draft for approval: freeze the economic-content hash and move to PendingApproval. */
  async submitForApproval(
    scope: AccountingScope,
    id: string,
    dto: SubmitEntryInput,
  ): Promise<JournalEntryWithPostings> {
    if (!this.policy.canManageEntryApproval(scope)) {
      throw new ForbiddenError('Você não tem permissão para submeter lançamentos para aprovação.');
    }
    const entry = await this.journalEntryRepo.findById(scope, id);
    if (!entry) throw new NotFoundError(`Lançamento '${id}' não foi encontrado.`);
    if (entry.status !== 'Draft') {
      throw new ValidationError('Apenas rascunhos podem ser submetidos para aprovação.');
    }
    // Re-assert balance at the boundary (the legs are the source of truth, not the create-time DTO).
    this.assertBalancedPostings(entry.postings);
    const contentHash = computeEntryContentHash({
      date: entry.date,
      description: entry.description,
      postings: entry.postings,
    });
    const newVersion = dto.expectedVersion + 1;

    await this.postingRepo.runTransaction(async (tx) => {
      const count = await this.journalEntryRepo.casUpdate(
        scope,
        id,
        dto.expectedVersion,
        { status: 'PendingApproval', submittedById: scope.actorUserId, contentHash, version: newVersion },
        tx,
      );
      if (count === 0) throw this.versionConflict();
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'entry.submitted',
        targetType: 'journal_entry',
        targetId: id,
        payload: { contentHash, version: String(newVersion) },
      });
    });
    logger.info('Journal entry submitted for approval', { entryId: id });
    return this.reload(scope, id);
  }

  /**
   * Approve a submitted entry and POST it (F5: approve == post). One tx: authoritative period
   * gate + hash tamper check + gapless numbering + status flip + audit. Dynamic SoD: the approver
   * must not be the creator or the submitter (checked before AND enforced by the audit trail).
   */
  async approveEntry(
    scope: AccountingScope,
    id: string,
    dto: ApproveEntryInput,
  ): Promise<JournalEntryWithPostings> {
    if (!this.policy.canApproveEntry(scope)) {
      throw new ForbiddenError('Você não tem permissão para aprovar lançamentos.');
    }
    const entry = await this.journalEntryRepo.findById(scope, id);
    if (!entry) throw new NotFoundError(`Lançamento '${id}' não foi encontrado.`);
    if (entry.status !== 'PendingApproval') {
      throw new ValidationError('O lançamento não está aguardando aprovação.');
    }
    // SoD (ACC-017/F3) — dynamic, server-side. Creator and submitter cannot approve their own.
    if (entry.createdById && entry.createdById === scope.actorUserId) {
      throw new ForbiddenError('Segregação de funções: o criador não pode aprovar o próprio lançamento.');
    }
    if (entry.submittedById && entry.submittedById === scope.actorUserId) {
      throw new ForbiddenError('Segregação de funções: quem submeteu não pode aprovar.');
    }
    // Preflight period gate (fast rejection); the authoritative gate is inside the tx.
    await this.assertPeriodOpen(scope, entry.date);
    const newVersion = dto.expectedVersion + 1;

    await this.postingRepo.runTransaction(async (tx) => {
      // Authoritative period gate — inside the tx, before the Posted write (T6/ACC-011).
      await this.assertPeriodOpenTx(tx, scope, entry.date);

      // Tamper check (ACC-023): the frozen hash must still match the current legs. A submitted
      // entry ALWAYS carries a hash (frozen at submit); its absence means a corrupt/out-of-band
      // state — fail loud rather than approve unverified. Since only a Draft can be edited, a
      // present-but-divergent hash can only come from an out-of-band mutation — also fail loud.
      if (!entry.contentHash) {
        throw new ValidationError('Lançamento submetido sem hash de conteúdo — reenvie para aprovação.');
      }
      const currentPostings = await this.postingRepo.findByEntryId(scope, id, tx);
      const recomputed = computeEntryContentHash({
        date: entry.date,
        description: entry.description,
        postings: currentPostings,
      });
      if (recomputed !== entry.contentHash) {
        throw new ValidationError('O conteúdo do lançamento mudou após a submissão — reenvie para aprovação.');
      }

      // Number is born HERE (ACC-015). If the CAS below loses, the tx rolls back and this
      // sequence increment is undone — gapless.
      const fiscalYear = this.fiscalYearFrom(entry.date);
      const entryNumber = await this.postingRepo.nextEntryNumber(scope, fiscalYear, tx);

      const count = await this.journalEntryRepo.casUpdate(
        scope,
        id,
        dto.expectedVersion,
        {
          status: 'Posted',
          approvedById: scope.actorUserId,
          postedById: scope.actorUserId,
          fiscalYear,
          entryNumber,
          version: newVersion,
        },
        tx,
      );
      if (count === 0) throw this.versionConflict();

      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'entry.approved',
        targetType: 'journal_entry',
        targetId: id,
        payload: {
          createdById: entry.createdById,
          contentHash: entry.contentHash,
          fiscalYear: String(fiscalYear),
          entryNumber: String(entryNumber),
        },
      });
    });
    logger.info('Journal entry approved and posted', { entryId: id, approvedBy: scope.actorUserId });
    return this.reload(scope, id);
  }

  /** Reject a submitted entry: send it back to Draft (F4) so the maker can fix and resubmit. */
  async rejectEntry(
    scope: AccountingScope,
    id: string,
    dto: RejectEntryInput,
  ): Promise<JournalEntryWithPostings> {
    if (!this.policy.canManageEntryApproval(scope)) {
      throw new ForbiddenError('Você não tem permissão para rejeitar lançamentos.');
    }
    const entry = await this.journalEntryRepo.findById(scope, id);
    if (!entry) throw new NotFoundError(`Lançamento '${id}' não foi encontrado.`);
    if (entry.status !== 'PendingApproval') {
      throw new ValidationError('Apenas lançamentos submetidos podem ser rejeitados.');
    }
    const newVersion = dto.expectedVersion + 1;

    await this.postingRepo.runTransaction(async (tx) => {
      const count = await this.journalEntryRepo.casUpdate(
        scope,
        id,
        dto.expectedVersion,
        { status: 'Draft', submittedById: null, contentHash: null, version: newVersion },
        tx,
      );
      if (count === 0) throw this.versionConflict();
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'entry.rejected',
        targetType: 'journal_entry',
        targetId: id,
        payload: { reason: dto.reason, version: String(newVersion) },
      });
    });
    logger.info('Journal entry rejected back to draft', { entryId: id });
    return this.reload(scope, id);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** The checker's queue: entries awaiting approval, paginated. */
  async listPendingApproval(
    scope: AccountingScope,
    params: ListPendingApprovalQueryInput,
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }> {
    if (!this.policy.canApproveEntry(scope)) {
      throw new ForbiddenError('Você não tem permissão para ver a fila de aprovação.');
    }
    const skip = (params.page - 1) * params.limit;
    return this.journalEntryRepo.findManyByStatus(scope, ['PendingApproval'], skip, params.limit);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private versionConflict(): AppError {
    return new AppError(
      'O lançamento foi modificado por outra operação (versão desatualizada). Recarregue e tente novamente.',
      409,
      'CONFLICT',
    );
  }

  /** Sum-debit === sum-credit, > 0 (integer cents, exact — mirrors PostingService). */
  private assertBalanced(lines: Array<{ debitCents: number; creditCents: number }>): number {
    const sumDebit = lines.reduce((acc, l) => acc + l.debitCents, 0);
    const sumCredit = lines.reduce((acc, l) => acc + l.creditCents, 0);
    if (sumDebit !== sumCredit || sumDebit <= 0) {
      throw new ValidationError('Lançamento desbalanceado: Σdébito deve igualar Σcrédito.');
    }
    return sumDebit;
  }

  private assertBalancedPostings(postings: Array<{ debitCents: number; creditCents: number }>): void {
    this.assertBalanced(postings);
  }

  /** Resolve every line's account (leaf-only) — mirrors PostingService.resolveLeafAccount.
   *  The chart must already be seeded (any prior listAccounts/postEntry seeds it). */
  private async resolveLines(
    scope: AccountingScope,
    lines: Array<{ accountCode: string; debitCents: number; creditCents: number }>,
  ): Promise<ResolvedLine[]> {
    const resolved: ResolvedLine[] = [];
    for (const line of lines) {
      const account = await this.resolveLeafAccount(scope, line.accountCode);
      resolved.push({ accountId: account.id, debitCents: line.debitCents, creditCents: line.creditCents });
    }
    return resolved;
  }

  private async resolveLeafAccount(scope: AccountingScope, code: string): Promise<Account> {
    const account = await this.accountRepo.findByCode(scope, code);
    if (!account) {
      throw new ValidationError(`Conta '${code}' não existe no plano de contas.`);
    }
    if (account.acceptsEntries === false) {
      throw new ValidationError(`Conta '${code}' é sintética e não aceita partidas (use uma conta analítica).`);
    }
    return account;
  }

  private async writeLegs(
    scope: AccountingScope,
    entryId: string,
    lines: ResolvedLine[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { userId, unitId } = accountingScopeWhere(scope);
    for (const line of lines) {
      await this.postingRepo.create(
        { userId, unitId, entryId, accountId: line.accountId, debitCents: line.debitCents, creditCents: line.creditCents },
        tx,
      );
    }
  }

  private async reload(scope: AccountingScope, id: string): Promise<JournalEntryWithPostings> {
    const entry = await this.journalEntryRepo.findById(scope, id);
    if (!entry) throw new NotFoundError(`Lançamento '${id}' não foi encontrado após a operação.`);
    return entry;
  }

  private extractYearMonth(date: Date): { year: number; month: number } {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  }

  private fiscalYearFrom(date: Date): number {
    return date.getUTCFullYear();
  }

  private async assertPeriodOpen(scope: AccountingScope, date: Date): Promise<void> {
    const { year, month } = this.extractYearMonth(date);
    const period = await this.periodRepo.findByYearMonth(scope, year, month);
    if (!period || period.status !== 'OPEN') {
      throw new AccountingPeriodNotOpenError(year, month);
    }
  }

  private async assertPeriodOpenTx(
    tx: Prisma.TransactionClient,
    scope: AccountingScope,
    date: Date,
  ): Promise<void> {
    const { year, month } = this.extractYearMonth(date);
    const period = await this.periodRepo.findByYearMonth(scope, year, month, tx);
    if (!period || period.status !== 'OPEN') {
      throw new AccountingPeriodNotOpenError(year, month);
    }
  }
}
