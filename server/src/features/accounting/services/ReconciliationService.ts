import { createHash } from 'crypto';
import type { BankStatement, BankStatementLine, Prisma } from 'generated/prisma';
import { ForbiddenError, NotFoundError, ServiceError, ValidationError } from '../../../lib/errors';
import { parseTable, type SpreadsheetFormat } from '../../../lib/spreadsheet';
import type { IReconciliationRepository } from '../repositories/IReconciliationRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import type { AuditService } from './AuditService';
import { MAX_CENTS } from '../models/money';
import { isValidDateOnly } from '../models/dates';
import type {
  CandidatePosting,
  CreateBankStatementLineInput,
  ReconciliationMatchType,
} from '../models/Reconciliation.model';
import type {
  ImportBankStatementDto,
  PendingReportQueryDto,
} from '../dtos/ReconciliationDto';

/** D6 matching window in days around the line date. ponytail: configurável depois. */
export const RECONCILE_WINDOW_DAYS = 3;

/** Required import columns (same integer-cents convention as the INCR-6 templates). */
const REQUIRED_COLS = ['date', 'amountCents', 'description'] as const;
const OPTIONAL_REF_COL = 'externalRef';

interface ImportResult {
  statement: BankStatement;
  /** false = same file (sha256) already imported — nothing was written. */
  created: boolean;
  lineCount: number;
}

interface AutoMatchSummary {
  processed: number;
  matched: number;
  /** 0 candidates — stays UNMATCHED, shows in the pending report. */
  zeroCandidates: number;
  /** >1 candidates — D6 abstains; resolve via manual match. */
  ambiguous: number;
}

interface RankedSuggestion {
  posting: CandidatePosting;
  /** |entry.date - line.date| in whole days (ranking key, D6). */
  deltaDays: number;
}

/**
 * ReconciliationService — bank reconciliation engine (BE-INCR-7 / ADR-INCR7).
 *
 * Changes NO ledger money value: it writes statements/lines/matches and flips
 * JournalEntry.status Posted<->Reconciled as a DERIVED, reversible, audited
 * marker (D5). Real adjustments (fees, differences) are posted via
 * PostingService.postEntry — outside this engine.
 *
 * Every mutation runs inside repo.runTransaction with the authoritative gate
 * re-checked in-tx (ACC-011) and the audit appended in the SAME tx (ACC-019).
 */
export class ReconciliationService {
  constructor(
    private readonly repo: IReconciliationRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly policy: IAccountingPolicy,
    private readonly audit: AuditService,
  ) {}

  // ── Import (§4.1) ─────────────────────────────────────────────────────────
  async importStatement(
    scope: AccountingScope,
    dto: ImportBankStatementDto,
    file: { buffer: Buffer; format: SpreadsheetFormat },
  ): Promise<ImportResult> {
    if (!this.policy.canReconcile(scope)) {
      throw new ForbiddenError('Você não tem permissão para conciliar.');
    }
    const account = await this.accountRepo.findById(scope, dto.glAccountId);
    if (!account) {
      // Cross-tenant/id inexistente = NotFound (nunca Forbidden — anti-enumeração).
      throw new NotFoundError('Conta contábil não encontrada.');
    }
    if (!account.acceptsEntries) {
      throw new ValidationError('A conta-banco deve ser uma conta folha (acceptsEntries).');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.repo.findStatementBySha256(scope, sha256);
    if (existing) {
      const lines = await this.repo.findLinesByStatement(scope, existing.id);
      return { statement: existing, created: false, lineCount: lines.length };
    }

    const table = await parseTable(file.buffer, file.format);
    const parsedLines = this.parseLines(scope, table);
    if (parsedLines.length === 0) {
      throw new ValidationError('Extrato sem linhas de dados.');
    }

    // Pre-check above is advisory; the authoritative re-import guard is the real
    // @@unique([userId,unitId,sha256]) — a concurrent duplicate fails the tx (P2002).
    const statement = await this.repo.runTransaction(async (tx) => {
      const created = await this.repo.createStatement(
        {
          userId: scope.ownerUserId,
          unitId: scope.unitId,
          glAccountId: dto.glAccountId,
          statementRef: dto.statementRef ?? null,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          openingBalanceCents: dto.openingBalanceCents ?? null,
          closingBalanceCents: dto.closingBalanceCents ?? null,
          sha256,
          // ponytail: anexo do arquivo bruto (INCR-5) fica de fora do MVP; upgrade =
          // persistir via DocumentAttachmentService e preencher attachmentId aqui.
          attachmentId: null,
          importedById: scope.actorUserId,
        },
        tx,
      );
      await this.repo.createLines(
        parsedLines.map((line) => ({ ...line, statementId: created.id })),
        tx,
      );
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'reconciliation.statement_imported',
        targetType: 'BANK_STATEMENT',
        targetId: created.id,
        payload: {
          glAccountId: dto.glAccountId,
          sha256,
          lineCount: parsedLines.length,
          periodStart: dto.periodStart.toISOString(),
          periodEnd: dto.periodEnd.toISOString(),
        },
      });
      return created;
    });

    return { statement, created: true, lineCount: parsedLines.length };
  }

  /**
   * Parses {headers, rows} into line inputs. ALL-OR-NOTHING: any invalid row
   * fails the whole import with a clear per-row error list (statements are one
   * bounded file — no partial staging like the INCR-6 jobs). Zero-value lines
   * are rejected here, so the match engine never sees amountCents == 0.
   */
  private parseLines(
    scope: AccountingScope,
    table: { headers: string[]; rows: string[][] },
  ): Array<Omit<CreateBankStatementLineInput, 'statementId'>> {
    const col = (name: string): number => table.headers.indexOf(name);
    const missing = REQUIRED_COLS.filter((c) => col(c) === -1);
    if (missing.length > 0) {
      throw new ValidationError(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`, {
        expectedHeaders: [...REQUIRED_COLS, OPTIONAL_REF_COL],
      });
    }
    const cDate = col('date');
    const cAmount = col('amountCents');
    const cDesc = col('description');
    const cRef = col(OPTIONAL_REF_COL);

    const errors: Array<{ row: number; error: string }> = [];
    const lines: Array<Omit<CreateBankStatementLineInput, 'statementId'>> = [];

    table.rows.forEach((row, i) => {
      const rowNumber = i + 1; // 1-based data row (header excluded by parseTable contract)
      const rawDate = row[cDate] ?? '';
      const rawAmount = row[cAmount] ?? '';
      const description = (row[cDesc] ?? '').trim();

      // Round-trip calendar check (isValidDateOnly): JS Date rolls day overflow
      // forward ('2026-02-30' -> 03-02), which would silently MUTATE the line date
      // and distort the D6 ±3-day window — reject, never shift.
      if (!isValidDateOnly(rawDate)) {
        errors.push({ row: rowNumber, error: `date '${rawDate}' deve ser uma data real YYYY-MM-DD.` });
        return;
      }
      const date = new Date(`${rawDate}T00:00:00.000Z`);
      // SIGNED integer cents (same "tudo em centavos" convention as INCR-6 templates).
      if (!/^-?\d+$/.test(rawAmount)) {
        errors.push({ row: rowNumber, error: `amountCents '${rawAmount}' deve ser inteiro (centavos, sinalizado).` });
        return;
      }
      const amountCents = Number(rawAmount);
      if (amountCents === 0) {
        errors.push({ row: rowNumber, error: 'amountCents não pode ser 0.' });
        return;
      }
      if (Math.abs(amountCents) > MAX_CENTS) {
        errors.push({ row: rowNumber, error: `amountCents excede o limite suportado (máx ${MAX_CENTS}).` });
        return;
      }
      if (description.length === 0) {
        errors.push({ row: rowNumber, error: 'description vazia.' });
        return;
      }

      lines.push({
        userId: scope.ownerUserId,
        unitId: scope.unitId,
        lineNumber: rowNumber,
        date,
        amountCents,
        description,
        externalRef: cRef === -1 ? null : (row[cRef] ?? '').trim() || null,
        rawJson: JSON.stringify(row),
      });
    });

    if (errors.length > 0) {
      throw new ValidationError(
        `Extrato com ${errors.length} linha(s) inválida(s) — nada foi importado.`,
        { errors: errors.slice(0, 20) },
      );
    }
    return lines;
  }

  // ── Auto-match (§4.2, D6) ─────────────────────────────────────────────────
  async autoMatchStatement(scope: AccountingScope, statementId: string): Promise<AutoMatchSummary> {
    if (!this.policy.canReconcile(scope)) {
      throw new ForbiddenError('Você não tem permissão para conciliar.');
    }
    const preflight = await this.repo.findStatementById(scope, statementId);
    if (!preflight) throw new NotFoundError('Extrato não encontrado.');

    // ponytail: one interactive tx for the whole statement (Prisma default 5s) —
    // chunk per N lines if real statements ever hit the timeout.
    return this.repo.runTransaction(async (tx) => {
      // Liveness re-check in-tx (ACC-011): a concurrent deleteStatement must not
      // interleave matches under a soft-deleted statement.
      const statement = await this.repo.findStatementById(scope, statementId, tx);
      if (!statement) throw new NotFoundError('Extrato não encontrado.');
      const lines = await this.repo.findLinesByStatement(scope, statementId, 'UNMATCHED', tx);
      const summary: AutoMatchSummary = { processed: 0, matched: 0, zeroCandidates: 0, ambiguous: 0 };

      for (const line of lines) {
        summary.processed++;
        const candidates = await this.findCandidates(scope, statement, line, tx);
        if (candidates.length === 1) {
          // Único candidato — comita (D6). Abster no empate é o que torna o
          // re-run idempotente por construção: nunca há escolha entre candidatos.
          await this.commitMatch(tx, scope, line, candidates[0], 'AUTO');
          summary.matched++;
        } else if (candidates.length === 0) {
          summary.zeroCandidates++;
        } else {
          summary.ambiguous++;
        }
      }
      return summary;
    });
  }

  /** Ranked suggestions for one UNMATCHED line (D6 ranking: |Δdias| asc, postingId asc). */
  async suggestions(scope: AccountingScope, lineId: string): Promise<RankedSuggestion[]> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler a conciliação.');
    }
    const line = await this.repo.findLineById(scope, lineId);
    if (!line) throw new NotFoundError('Linha de extrato não encontrada.');
    // Statement must exist AND be active — lines of a soft-deleted statement are dead.
    const statement = await this.repo.findStatementById(scope, line.statementId);
    if (!statement) throw new NotFoundError('Extrato não encontrado.');
    if (line.status !== 'UNMATCHED' || line.amountCents === 0) return [];

    const candidates = await this.findCandidates(scope, statement, line);
    return candidates
      .map((posting) => ({
        posting,
        deltaDays: Math.abs(
          Math.round((posting.entry.date.getTime() - line.date.getTime()) / 86_400_000),
        ),
      }))
      .sort((a, b) => a.deltaDays - b.deltaDays || a.posting.id.localeCompare(b.posting.id));
  }

  /** D6 candidate query: bank account, exact cents on the right side, ±window, no active match. */
  private async findCandidates(
    scope: AccountingScope,
    statement: BankStatement,
    line: BankStatementLine,
    tx?: Prisma.TransactionClient,
  ): Promise<CandidatePosting[]> {
    const windowMs = RECONCILE_WINDOW_DAYS * 86_400_000;
    return this.repo.findCandidatePostings(
      scope,
      {
        glAccountId: statement.glAccountId,
        side: line.amountCents > 0 ? 'debit' : 'credit',
        amountCents: Math.abs(line.amountCents),
        dateFrom: new Date(line.date.getTime() - windowMs),
        dateTo: new Date(line.date.getTime() + windowMs),
      },
      tx,
    );
  }

  /**
   * Match core — the in-tx authoritative gate (ADR §3, ACC-011). Line and
   * statement are re-read INSIDE the tx; the POSTING object must itself have
   * been read in-tx by the caller (candidate query or findPostingById with tx),
   * otherwise entry.status is stale — the TOCTOU the gate exists to close.
   */
  private async commitMatch(
    tx: Prisma.TransactionClient,
    scope: AccountingScope,
    line: BankStatementLine,
    posting: CandidatePosting,
    matchType: ReconciliationMatchType,
  ): Promise<void> {
    // Gate 1 — line is alive and matchable, under a LIVE statement (re-read in-tx).
    const freshLine = await this.repo.findLineById(scope, line.id, tx);
    if (!freshLine) throw new NotFoundError('Linha de extrato não encontrada.');
    if (freshLine.status === 'IGNORED') {
      throw new ValidationError('Linha marcada como IGNORED não pode ser conciliada.');
    }
    const statement = await this.repo.findStatementById(scope, freshLine.statementId, tx);
    if (!statement) throw new NotFoundError('Extrato não encontrado.');
    // Gate 2 — posting belongs to the statement's bank account and entry is Posted.
    if (posting.accountId !== statement.glAccountId) {
      throw new ValidationError('O posting não pertence à conta-banco deste extrato.');
    }
    if (posting.entry.status !== 'Posted') {
      throw new ValidationError(
        `Lançamento '${posting.entry.id}' não está Posted (status atual: ${posting.entry.status}).`,
      );
    }
    // Gate 3 — max 1 active match per posting (D3; closes the duplicated-line hole).
    const activeOnPosting = await this.repo.findActiveMatchByPosting(scope, posting.id, tx);
    if (activeOnPosting) {
      throw new ValidationError('O posting já está conciliado com outra linha (unmatch primeiro).');
    }
    // Gate 4 — exact cents + direction (integer equality, no epsilon — ACC-014).
    const expected = Math.abs(freshLine.amountCents);
    const actual = freshLine.amountCents > 0 ? posting.debitCents : posting.creditCents;
    if (freshLine.amountCents === 0 || actual !== expected) {
      throw new ValidationError('Valor/direção do posting não confere com a linha do extrato.');
    }

    // Gate 5 — create (or reactivate the soft-undone unique pair) + line status.
    const existingPair = await this.repo.findMatchByLineAndPosting(scope, freshLine.id, posting.id, tx);
    let matchId: string;
    if (existingPair) {
      if (existingPair.unmatchedAt === null) {
        throw new ValidationError('Este vínculo já está ativo.');
      }
      const reactivated = await this.repo.reactivateMatch(
        scope,
        existingPair.id,
        { matchType, matchedById: scope.actorUserId },
        tx,
      );
      if (reactivated === 0) {
        throw new ServiceError('Conflito ao reativar vínculo — tente novamente.', 'RECONCILE_RACE');
      }
      matchId = existingPair.id;
    } else {
      const created = await this.repo.createMatch(
        {
          userId: scope.ownerUserId,
          unitId: scope.unitId,
          statementLineId: freshLine.id,
          postingId: posting.id,
          matchType,
          matchedById: scope.actorUserId,
        },
        tx,
      );
      matchId = created.id;
    }
    if (freshLine.status === 'UNMATCHED') {
      const flipped = await this.repo.updateLineStatus(scope, freshLine.id, 'UNMATCHED', 'MATCHED', tx);
      if (flipped === 0) {
        throw new ServiceError('Conflito ao atualizar a linha — tente novamente.', 'RECONCILE_RACE');
      }
    }
    await this.audit.append(tx, scope, {
      actorUserId: scope.actorUserId,
      eventType: 'reconciliation.matched',
      targetType: 'RECONCILIATION_MATCH',
      targetId: matchId,
      payload: {
        statementLineId: freshLine.id,
        postingId: posting.id,
        entryId: posting.entry.id,
        matchType,
      },
    });

    // Gate 6 — derived flip (D5): Posted -> Reconciled when EVERY bank-account
    // posting of the entry has an active match (this tx sees the one just created).
    await this.recomputeEntryFlip(tx, scope, posting.entry.id);
  }

  /**
   * D5 derivation, shared by match (flip) and — in the next increment — unmatch
   * (flip-back). Reads the per-posting state in-tx and conditionally flips; a
   * 0-row conditional update means the entry changed under us — rollback (ACC-011).
   */
  private async recomputeEntryFlip(
    tx: Prisma.TransactionClient,
    scope: AccountingScope,
    entryId: string,
  ): Promise<void> {
    const states = await this.repo.findEntryPostingsReconciliationState(scope, entryId, tx);
    const bankAccountIds = new Set(await this.repo.findScopeBankAccountIds(scope, tx));
    const bankPostings = states.filter((s) => bankAccountIds.has(s.accountId));
    if (bankPostings.length === 0) return;

    const allMatched = bankPostings.every((s) => s.hasActiveMatch);
    if (allMatched) {
      const flipped = await this.repo.updateEntryStatus(scope, entryId, 'Posted', 'Reconciled', tx);
      if (flipped === 0) {
        // Entry is no longer Posted (reversed/changed between gate and flip) — TOCTOU.
        throw new ServiceError(
          'Lançamento mudou de status durante a conciliação — operação cancelada.',
          'RECONCILE_RACE',
        );
      }
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'reconciliation.entry_reconciled',
        targetType: 'JOURNAL_ENTRY',
        targetId: entryId,
        payload: { derivedFrom: 'all_bank_postings_matched' },
      });
    }
  }

  // ── Pending report (§4.5, as-of — ACC-021) ────────────────────────────────
  async pendingReport(scope: AccountingScope, query: PendingReportQueryDto) {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler a conciliação.');
    }
    const account = await this.accountRepo.findById(scope, query.glAccountId);
    if (!account) throw new NotFoundError('Conta contábil não encontrada.');

    const window = query.from || query.to ? { from: query.from, to: query.to } : undefined;
    const [unmatchedLines, unmatchedPostings] = await Promise.all([
      this.repo.findUnmatchedLinesByAccount(scope, query.glAccountId, window),
      this.repo.findUnmatchedBankPostings(scope, query.glAccountId, window),
    ]);

    let lineTotalCents = 0;
    for (const line of unmatchedLines) lineTotalCents += line.amountCents;

    return {
      account: { id: account.id, code: account.code, name: account.name },
      unmatchedLines,
      unmatchedPostings,
      totals: {
        lineCount: unmatchedLines.length,
        lineTotalCents,
        postingCount: unmatchedPostings.length,
      },
    };
  }

  // ── Reads / lifecycle ─────────────────────────────────────────────────────
  async listStatements(scope: AccountingScope, page: number, limit: number) {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler a conciliação.');
    }
    return this.repo.findStatements(scope, page, limit);
  }

  async listLines(
    scope: AccountingScope,
    statementId: string,
    status?: 'UNMATCHED' | 'MATCHED' | 'IGNORED',
  ) {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler a conciliação.');
    }
    const statement = await this.repo.findStatementById(scope, statementId);
    if (!statement) throw new NotFoundError('Extrato não encontrado.');
    const lines = await this.repo.findLinesByStatement(scope, statementId, status);
    return { statement, lines };
  }

  /** Soft-deletes a statement — blocked while any match is ACTIVE (unmatch first). */
  async deleteStatement(scope: AccountingScope, statementId: string): Promise<void> {
    if (!this.policy.canReconcile(scope)) {
      throw new ForbiddenError('Você não tem permissão para conciliar.');
    }
    const statement = await this.repo.findStatementById(scope, statementId);
    if (!statement) throw new NotFoundError('Extrato não encontrado.');

    await this.repo.runTransaction(async (tx) => {
      // Authoritative in-tx guard: an active match anchors ledger state (D5) —
      // deleting the statement under it would orphan the trail.
      const activeMatches = await this.repo.countActiveMatchesByStatement(scope, statementId, tx);
      if (activeMatches > 0) {
        throw new ValidationError(
          `Extrato tem ${activeMatches} vínculo(s) ativo(s) — desfaça (unmatch) antes de excluir.`,
        );
      }
      await this.repo.softDeleteStatement(scope, statementId, tx);
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'reconciliation.statement_deleted',
        targetType: 'BANK_STATEMENT',
        targetId: statementId,
        payload: { sha256: statement.sha256 },
      });
    });
  }
}
