import prisma from '../../../lib/prisma';
import type { BankStatement, BankStatementLine, ReconciliationMatch, Prisma } from 'generated/prisma';
import { NotFoundError } from '../../../lib/errors';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type { IReconciliationRepository } from './IReconciliationRepository';
import type {
  BankStatementLineStatus,
  CandidatePosting,
  CandidatePostingQuery,
  CreateBankStatementInput,
  CreateBankStatementLineInput,
  CreateReconciliationMatchInput,
  EntryPostingReconciliationState,
  ReconciliationMatchType,
} from '../models/Reconciliation.model';

/** Entry summary selected alongside candidate postings (ranking/display). */
const CANDIDATE_ENTRY_SELECT = {
  entry: { select: { id: true, date: true, description: true, status: true } },
} as const;

/**
 * Prisma-backed repository for bank reconciliation (`bank_statements`,
 * `bank_statement_lines`, `reconciliation_matches`) plus the reconciliation-
 * domain reads/flip over postings/journal entries (ADR-INCR7). Only place the
 * reconciliation feature touches prisma.*. Money is INTEGER CENTS — exact
 * equality, never floats (ACC-014). Conditional writes return row counts so
 * the service owns the in-tx gate decision (ACC-011).
 */
export class ReconciliationRepository implements IReconciliationRepository {
  // ── Statements ────────────────────────────────────────────────────────────
  public async createStatement(
    data: CreateBankStatementInput,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatement> {
    return (tx ?? prisma).bankStatement.create({
      data: {
        userId: data.userId,
        unitId: data.unitId,
        glAccountId: data.glAccountId,
        statementRef: data.statementRef ?? null,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        openingBalanceCents: data.openingBalanceCents ?? null,
        closingBalanceCents: data.closingBalanceCents ?? null,
        sha256: data.sha256,
        attachmentId: data.attachmentId ?? null,
        importedById: data.importedById ?? null,
      },
    });
  }

  public async findStatementById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatement | null> {
    return (tx ?? prisma).bankStatement.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findStatementBySha256(
    scope: AccountingScope,
    sha256: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatement | null> {
    return (tx ?? prisma).bankStatement.findFirst({
      where: { sha256, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findStatements(
    scope: AccountingScope,
    page = 1,
    limit = 10,
  ): Promise<{ statements: BankStatement[]; total: number }> {
    const where = { ...accountingScopeWhere(scope), deletedAt: null };
    const [statements, total] = await prisma.$transaction([
      prisma.bankStatement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bankStatement.count({ where }),
    ]);
    return { statements, total };
  }

  public async softDeleteStatement(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // updateMany so the WHERE carries userId+unitId; 0 rows = not this tenant's
    // active statement — fail loud, never no-op (same pattern as DocumentAttachment).
    const { count } = await (tx ?? prisma).bankStatement.updateMany({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundError(`Extrato '${id}' não encontrado para exclusão.`);
    }
  }

  // ── Lines ─────────────────────────────────────────────────────────────────
  public async createLines(
    lines: CreateBankStatementLineInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (lines.length === 0) return 0;
    const { count } = await (tx ?? prisma).bankStatementLine.createMany({
      data: lines.map((line) => ({
        userId: line.userId,
        unitId: line.unitId,
        statementId: line.statementId,
        lineNumber: line.lineNumber,
        date: line.date,
        amountCents: line.amountCents,
        description: line.description,
        externalRef: line.externalRef ?? null,
        rawJson: line.rawJson,
      })),
    });
    return count;
  }

  public async findLineById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatementLine | null> {
    return (tx ?? prisma).bankStatementLine.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async findLinesByStatement(
    scope: AccountingScope,
    statementId: string,
    status?: BankStatementLineStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatementLine[]> {
    return (tx ?? prisma).bankStatementLine.findMany({
      where: {
        ...accountingScopeWhere(scope),
        statementId,
        ...(status ? { status } : {}),
      },
      orderBy: { lineNumber: 'asc' },
    });
  }

  public async updateLineStatus(
    scope: AccountingScope,
    lineId: string,
    fromStatus: BankStatementLineStatus,
    toStatus: BankStatementLineStatus,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.bankStatementLine.updateMany({
      where: { id: lineId, ...accountingScopeWhere(scope), status: fromStatus },
      data: { status: toStatus },
    });
    return count;
  }

  // ── Matches ───────────────────────────────────────────────────────────────
  public async createMatch(
    data: CreateReconciliationMatchInput,
    tx: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch> {
    return tx.reconciliationMatch.create({
      data: {
        userId: data.userId,
        unitId: data.unitId,
        statementLineId: data.statementLineId,
        postingId: data.postingId,
        matchType: data.matchType,
        matchedById: data.matchedById ?? null,
      },
    });
  }

  public async findMatchById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch | null> {
    return (tx ?? prisma).reconciliationMatch.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async findMatchByLineAndPosting(
    scope: AccountingScope,
    statementLineId: string,
    postingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch | null> {
    return (tx ?? prisma).reconciliationMatch.findFirst({
      where: { statementLineId, postingId, ...accountingScopeWhere(scope) },
    });
  }

  public async findActiveMatchByPosting(
    scope: AccountingScope,
    postingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch | null> {
    return (tx ?? prisma).reconciliationMatch.findFirst({
      where: { postingId, ...accountingScopeWhere(scope), unmatchedAt: null },
    });
  }

  public async findActiveMatchesByLine(
    scope: AccountingScope,
    statementLineId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch[]> {
    return (tx ?? prisma).reconciliationMatch.findMany({
      where: { statementLineId, ...accountingScopeWhere(scope), unmatchedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async reactivateMatch(
    scope: AccountingScope,
    id: string,
    data: { matchType: ReconciliationMatchType; matchedById?: string | null },
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.reconciliationMatch.updateMany({
      where: { id, ...accountingScopeWhere(scope), unmatchedAt: { not: null } },
      data: {
        matchType: data.matchType,
        matchedById: data.matchedById ?? null,
        unmatchedAt: null,
        unmatchedById: null,
      },
    });
    return count;
  }

  public async softUnmatch(
    scope: AccountingScope,
    id: string,
    unmatchedById: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.reconciliationMatch.updateMany({
      where: { id, ...accountingScopeWhere(scope), unmatchedAt: null },
      data: { unmatchedAt: new Date(), unmatchedById },
    });
    return count;
  }

  // ── Reconciliation-domain reads/writes over postings & entries ───────────
  public async findCandidatePostings(
    scope: AccountingScope,
    query: CandidatePostingQuery,
    tx?: Prisma.TransactionClient,
  ): Promise<CandidatePosting[]> {
    return (tx ?? prisma).posting.findMany({
      where: {
        ...accountingScopeWhere(scope),
        accountId: query.glAccountId,
        ...(query.side === 'debit'
          ? { debitCents: query.amountCents }
          : { creditCents: query.amountCents }),
        entry: {
          status: 'Posted',
          date: { gte: query.dateFrom, lte: query.dateTo },
        },
        reconciliationMatches: { none: { unmatchedAt: null } },
      },
      include: CANDIDATE_ENTRY_SELECT,
      orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
    });
  }

  public async findEntryPostingsReconciliationState(
    scope: AccountingScope,
    entryId: string,
    tx: Prisma.TransactionClient,
  ): Promise<EntryPostingReconciliationState[]> {
    const postings = await tx.posting.findMany({
      where: { entryId, ...accountingScopeWhere(scope) },
      select: {
        id: true,
        accountId: true,
        reconciliationMatches: { where: { unmatchedAt: null }, select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return postings.map((posting) => ({
      postingId: posting.id,
      accountId: posting.accountId,
      hasActiveMatch: posting.reconciliationMatches.length > 0,
    }));
  }

  public async findScopeBankAccountIds(
    scope: AccountingScope,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const rows = await (tx ?? prisma).bankStatement.findMany({
      where: { ...accountingScopeWhere(scope), deletedAt: null },
      select: { glAccountId: true },
      distinct: ['glAccountId'],
    });
    return rows.map((row) => row.glAccountId);
  }

  public async updateEntryStatus(
    scope: AccountingScope,
    entryId: string,
    fromStatus: string,
    toStatus: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { count } = await tx.journalEntry.updateMany({
      where: { id: entryId, ...accountingScopeWhere(scope), status: fromStatus },
      data: { status: toStatus },
    });
    return count;
  }

  public async findUnmatchedBankPostings(
    scope: AccountingScope,
    glAccountId: string,
    options?: { from?: Date; to?: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<CandidatePosting[]> {
    const dateFilter =
      options?.from || options?.to
        ? {
            date: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {};
    return (tx ?? prisma).posting.findMany({
      where: {
        ...accountingScopeWhere(scope),
        accountId: glAccountId,
        // Reconciled never appears here by construction (it requires an active
        // match), but the pending report reads both ledger statuses as-of (ACC-021).
        entry: { status: { in: ['Posted', 'Reconciled'] }, ...dateFilter },
        reconciliationMatches: { none: { unmatchedAt: null } },
      },
      include: CANDIDATE_ENTRY_SELECT,
      orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
    });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
