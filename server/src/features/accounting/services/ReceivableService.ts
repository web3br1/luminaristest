import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import { Prisma } from 'generated/prisma';
import type { Account, Receivable, ReceivableReceipt } from 'generated/prisma';
import { CLIENTES_A_RECEBER_CODE } from '../fixtures/ChartOfAccountsFixture';
import {
  AR_RECEIVABLE_SOURCE_TYPE,
  AR_RECEIPT_SOURCE_TYPE,
  deletedDocumentNumber,
  resolveReceiptMethodAccount,
} from '../models/Receivable.model';
import type {
  CancelReceivableInput,
  CancelReceiptInput,
  CreateReceivableInput,
  ListReceivablesQueryInput,
  RegisterReceiptInput,
} from '../dtos/ReceivableDto';
import type { IReceivableRepository, ReceivableWithReceipts } from '../repositories/IReceivableRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { ICounterpartyRepository } from '../repositories/ICounterpartyRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { PostEntryInput } from '../dtos/PostingDto';
import type { AuditService } from './AuditService';
import type { PostingService } from './PostingService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/**
 * ReceivableService — Contas a Receber (INCR-AR / ADR-INCR-AR). FIRST-CLASS PRISMA. MIRROR of
 * PayableService (a receber × a pagar), inverting every leg.
 *
 * Books the DUAL fato gerador directly through PostingService.postEntry (F0 rota (a), golden ref
 * PayableService/ExerciseClosingService — AR is a module INTERNAL to the accounting world, not a
 * DynamicTable origin, so there is NO AccountingSyncPort/mapper/bridge):
 *   - recognition (competência): D 1.1.5 Clientes a Receber / C revenueAccount (3.x) — sourceType='ar.receivable', sourceId=receivableId
 *   - receipt (data efetiva):     D conta-por-método / C 1.1.5 — sourceType='ar.receipt', sourceId=receiptId
 *
 * Control account = the DEDICATED 1.1.5 (F7), distinct from the salon's 1.1.2, so the subledger
 * ties out to the GL. AR-formal takes MANUAL customer invoices (avulsas) and, since
 * ADR-CRM-AR-SEAM, CRM Won deals fed by CrmReceivableBridge (documentNumber `CRM-<oppId>`) —
 * never salon sales (those settle via their own salon.sale.settled events on 1.1.2).
 *
 * Key invariants (mirror the AP module):
 * - postEntry opens its OWN root tx (SQLite has no nesting), so the AR-row write and the ledger write
 *   are DIFFERENT transactions. The double-receipt race is closed BEFORE the post by an atomic
 *   OPEN→RECEIVING status CAS (claimForReceipt, D4); a crash between the two txs converges via
 *   reconcileReceivables (the re-drive safety net — mandatory, since with rota (a) this reconcile is
 *   our own code, not the generic AccountingSync registry).
 * - receipt idempotency keys on receiptId, NEVER receivableId (D3) — re-receiving after a reversal
 *   mints a new key instead of returning the reverted entry (T7).
 * - cancel = estorno (reverseEntry) in an open period + row lifecycle flip (ACC-018/T5), never a
 *   destructive edit; rename-on-delete frees the business key (D3).
 */
export class ReceivableService {
  constructor(
    private readonly receivableRepo: IReceivableRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly posting: PostingService,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
    private readonly counterpartyRepo: ICounterpartyRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async listReceivables(
    scope: AccountingScope,
    params: ListReceivablesQueryInput,
  ): Promise<{ receivables: ReceivableWithReceipts[]; total: number }> {
    if (!this.policy.canReadReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para listar contas a receber.');
    }
    const skip = (params.page - 1) * params.limit;
    return this.receivableRepo.findManyByUnit(scope, { status: params.status, skip, limit: params.limit });
  }

  async getReceivable(scope: AccountingScope, id: string): Promise<ReceivableWithReceipts> {
    if (!this.policy.canReadReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler contas a receber.');
    }
    const receivable = await this.receivableRepo.findByIdWithReceipts(scope, id);
    if (!receivable) throw new NotFoundError(`Conta a receber '${id}' não foi encontrada.`);
    return receivable;
  }

  // ---------------------------------------------------------------------------
  // Create (recognition)
  // ---------------------------------------------------------------------------

  /**
   * Create a receivable and book its recognition entry (D 1.1.5 / C revenueAccount). The row and the
   * recognition posting live in DIFFERENT txs; on a synchronous posting failure (e.g. the competência
   * period is closed) the row is COMPENSATED (soft-delete + rename) and the error is surfaced, so a
   * failed creation never leaves a dangling receivable. A crash between the two txs is converged by
   * reconcileReceivables.
   */
  async createReceivable(scope: AccountingScope, dto: CreateReceivableInput): Promise<Receivable> {
    if (!this.policy.canManageReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para criar contas a receber.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    // Revenue-account gate (D4): must be an existing, active, LEAF Revenue account of this scope.
    const revenueAccount = await this.resolveRevenueAccount(scope, dto.revenueAccountId);

    // Counterparty gate (SEC-A1-1 — IDOR #1): if a counterpartyId is supplied, RE-SCOPE it here so an
    // AR row can never link to another tenant's counterparty. Nullable this increment (SEC-A1-5).
    const counterpartyId = await this.resolveCounterpartyId(scope, dto.counterpartyId);

    // tx1 — create the row (OPEN) + receivable.created audit atomically (ACC-019). Mints receivableId.
    let receivable: Receivable;
    try {
      receivable = await this.receivableRepo.runTransaction(async (tx) => {
        const created = await this.receivableRepo.create(
          {
            userId,
            unitId,
            customerName: dto.customerName,
            customerRef: dto.customerRef ?? null,
            counterpartyId,
            documentNumber: dto.documentNumber ?? null,
            description: dto.description,
            issueDate: new Date(dto.issueDate),
            dueDate: new Date(dto.dueDate),
            amountCents: dto.amountCents,
            revenueAccountId: revenueAccount.id,
            status: 'OPEN',
            createdById: scope.actorUserId,
          },
          tx,
        );
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'receivable.created',
          targetType: 'receivable',
          targetId: created.id,
          payload: {
            receivableId: created.id,
            customerRef: dto.customerRef,
            amountCents: String(dto.amountCents),
            dueDate: dto.dueDate,
            revenueAccountCode: revenueAccount.code,
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(
          'Já existe uma conta a receber em aberto para este cliente e documento.',
        );
      }
      throw error;
    }

    // Recognition posting (SEPARATE tx). Compensate the row on synchronous failure.
    try {
      await this.posting.postEntry(scope, this.buildRecognitionInput(scope, receivable, revenueAccount, dto));
    } catch (error) {
      await this.compensateFailedRecognition(scope, receivable);
      throw error;
    }
    return receivable;
  }

  // ---------------------------------------------------------------------------
  // Register receipt (settlement)
  // ---------------------------------------------------------------------------

  /**
   * Register the (single, full) receipt of a receivable: book the receipt (D conta-por-método / C
   * 1.1.5) and move the receivable to RECEIVED. The double-receipt race is closed by the
   * OPEN→RECEIVING CAS before any ledger write, so two concurrent calls yield exactly one receipt.
   */
  async registerReceipt(
    scope: AccountingScope,
    receivableId: string,
    dto: RegisterReceiptInput,
  ): Promise<ReceivableReceipt> {
    if (!this.policy.canManageReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para receber contas.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    const receivable = await this.receivableRepo.findByIdWithReceipts(scope, receivableId);
    if (!receivable) throw new NotFoundError(`Conta a receber '${receivableId}' não foi encontrada.`);
    if (receivable.status !== 'OPEN') {
      throw new ValidationError(
        `Conta a receber não está aberta para recebimento (status atual: ${receivable.status}).`,
      );
    }

    // Full-receipt guard (F2 MVP): the amount must settle the whole remaining balance.
    const remaining = receivable.amountCents - this.sumActiveReceipts(receivable);
    if (dto.amountCents !== remaining) {
      throw new ValidationError(
        `Recebimento parcial não é suportado: informe o saldo integral (${remaining} centavos).`,
      );
    }

    // Resolve the debit account for the method (closed map — unknown REJECTS, D2) BEFORE the CAS.
    const debitCode = resolveReceiptMethodAccount(dto.method);

    // ATOMIC RACE GATE (D4) — OPEN → RECEIVING. count 0 = lost the race / not open.
    const claimed = await this.receivableRepo.claimForReceipt(scope, receivableId);
    if (claimed === 0) {
      throw new ValidationError('A conta já está em recebimento ou não está mais aberta.');
    }

    let posted = false;
    let receipt: ReceivableReceipt | undefined;
    try {
      // Mint the receipt row (ACTIVE) — its id is the receipt idempotency key (D3).
      receipt = await this.receivableRepo.createReceipt({
        userId,
        unitId,
        receivableId,
        amountCents: dto.amountCents,
        method: dto.method,
        receivedAt: new Date(dto.receivedAt),
        receivedByUserId: scope.actorUserId,
        status: 'ACTIVE',
      });

      const entry = await this.posting.postEntry(
        scope,
        this.buildReceiptInput(scope, receivable, receipt, debitCode, dto),
      );
      posted = true;

      // Finalize (tx) — link the entry, mark RECEIVED via the atomic RECEIVING→RECEIVED CAS, emit the
      // domain audit ONLY when THIS call performed the transition. The ledger is already committed; if
      // this tx crashes, reconcileReceivables finalizes it. The CAS closes the race with a concurrent
      // reconcile that could finalize between the post above and this tx (else both would emit).
      await this.receivableRepo.runTransaction(async (tx) => {
        await this.receivableRepo.updateReceipt(scope, receipt!.id, { entryId: entry.id }, tx);
        const flipped = await this.receivableRepo.markReceivedIfReceiving(scope, receivableId, tx);
        if (flipped === 1) {
          await this.auditService.append(tx, scope, {
            actorUserId: scope.actorUserId,
            eventType: 'receivable.receipt_registered',
            targetType: 'receivable',
            targetId: receivableId,
            payload: {
              receivableId,
              receiptId: receipt!.id,
              amountCents: String(dto.amountCents),
              method: dto.method,
              entryId: entry.id,
            },
          });
        }
      });
      return { ...receipt, entryId: entry.id, status: 'ACTIVE' };
    } catch (error) {
      // Only safe to revert BEFORE the ledger commit. After a successful post, the money is booked —
      // leave it RECEIVING for reconcile to finalize (never revert over a real posting).
      if (!posted) {
        await this.revertClaim(scope, receivableId, receipt);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Cancel receivable (reverse recognition — F6)
  // ---------------------------------------------------------------------------

  /**
   * Cancel an OPEN receivable: reverse its recognition (estorno on the reversalDate — its own period
   * gate, T5) and flip the row to CANCELLED (terminal) with rename-on-delete freeing the business key.
   * Re-runnable: reverseEntry is idempotent, so a crash mid-cancel completes on retry.
   */
  async cancelReceivable(
    scope: AccountingScope,
    receivableId: string,
    dto: CancelReceivableInput,
  ): Promise<Receivable> {
    if (!this.policy.canManageReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para cancelar contas a receber.');
    }
    const receivable = await this.receivableRepo.findByIdWithReceipts(scope, receivableId);
    if (!receivable) throw new NotFoundError(`Conta a receber '${receivableId}' não foi encontrada.`);
    if (receivable.status === 'CANCELLED') return receivable; // idempotent
    if (receivable.status !== 'OPEN') {
      throw new ValidationError(
        receivable.status === 'RECEIVED'
          ? 'Desfaça o recebimento (cancelar recebimento) antes de cancelar a conta.'
          : `Conta a receber não pode ser cancelada no status atual (${receivable.status}).`,
      );
    }
    // Defense-in-depth: an OPEN receivable should have no active receipt, but never cancel over one.
    const activeReceipt = await this.receivableRepo.findActiveReceipt(scope, receivableId);
    if (activeReceipt) {
      throw new ValidationError('Desfaça o recebimento ativo antes de cancelar a conta.');
    }

    // Reverse the recognition if it exists (a dangling create may have none).
    const recognition = await this.posting.findEntryBySource(scope, AR_RECEIVABLE_SOURCE_TYPE, receivableId);
    let reversalEntryId: string | null = null;
    if (recognition) {
      const { reversal } = await this.posting.reverseEntry(scope, {
        unitId: scope.unitId,
        lancamentoId: recognition.id,
        reversalPostingDate: dto.reversalDate,
        reason: dto.reason,
      });
      reversalEntryId = reversal.id;
    }

    return this.receivableRepo.runTransaction(async (tx) => {
      const cancelled = await this.receivableRepo.updateReceivable(
        scope,
        receivableId,
        {
          status: 'CANCELLED',
          deletedAt: new Date(),
          cancelledById: scope.actorUserId,
          cancelReason: dto.reason ?? null,
          documentNumber: deletedDocumentNumber(receivableId, receivable.documentNumber),
        },
        tx,
      );
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'receivable.cancelled',
        targetType: 'receivable',
        targetId: receivableId,
        payload: { receivableId, reversalEntryId, reason: dto.reason },
      });
      return cancelled;
    });
  }

  // ---------------------------------------------------------------------------
  // Cancel receipt (reverse receipt, reopen)
  // ---------------------------------------------------------------------------

  /**
   * Cancel an active receipt: reverse its receipt entry and reopen the receivable. The receipt + its
   * reversal net to zero on 1.1.5, leaving the recognition's asset standing again.
   */
  async cancelReceipt(
    scope: AccountingScope,
    receivableId: string,
    receiptId: string,
    dto: CancelReceiptInput,
  ): Promise<ReceivableReceipt> {
    if (!this.policy.canManageReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para cancelar recebimentos.');
    }
    const receipt = await this.receivableRepo.findReceiptById(scope, receiptId);
    if (!receipt || receipt.receivableId !== receivableId) {
      throw new NotFoundError(`Recebimento '${receiptId}' não foi encontrado.`);
    }
    if (receipt.status === 'CANCELLED') return receipt; // idempotent

    const settlement = await this.posting.findEntryBySource(scope, AR_RECEIPT_SOURCE_TYPE, receiptId);
    let reversalEntryId: string | null = null;
    if (settlement) {
      const { reversal } = await this.posting.reverseEntry(scope, {
        unitId: scope.unitId,
        lancamentoId: settlement.id,
        reversalPostingDate: dto.reversalDate,
        reason: dto.reason,
      });
      reversalEntryId = reversal.id;
    }

    return this.receivableRepo.runTransaction(async (tx) => {
      const cancelled = await this.receivableRepo.updateReceipt(scope, receiptId, { status: 'CANCELLED' }, tx);
      await this.receivableRepo.updateReceivable(scope, receivableId, { status: 'OPEN' }, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'receivable.receipt_cancelled',
        targetType: 'receivable',
        targetId: receivableId,
        payload: { receivableId, receiptId, reversalEntryId, reason: dto.reason },
      });
      return cancelled;
    });
  }

  // ---------------------------------------------------------------------------
  // Reconcile (re-drive safety net — D4 / ADR §6.2)
  // ---------------------------------------------------------------------------

  /**
   * Re-drive missing recognitions/receipts for the scope. postEntry is idempotent on sourceId, so
   * re-posting is safe; the finalize (entryId + RECEIVED) is applied when a receipt exists but its
   * receivable/receipt never got finalized (crash between the post and the finalize tx). Returns what
   * it repaired. Best-effort per item: one failing receivable does not abort the pass.
   */
  async reconcileReceivables(
    scope: AccountingScope,
  ): Promise<{ recognitionsPosted: number; receiptsPosted: number; finalized: number }> {
    if (!this.policy.canManageReceivable(scope)) {
      throw new ForbiddenError('Você não tem permissão para reconciliar contas a receber.');
    }
    let recognitionsPosted = 0;
    let receiptsPosted = 0;
    let finalized = 0;

    // 1. Every live, non-cancelled receivable must carry its recognition entry.
    const receivables = await this.receivableRepo.findAllActive(scope);
    for (const receivable of receivables) {
      if (receivable.status === 'CANCELLED') continue;
      const recognition = await this.posting.findEntryBySource(scope, AR_RECEIVABLE_SOURCE_TYPE, receivable.id);
      if (recognition) continue;
      try {
        const revenueAccount = await this.accountRepo.findById(scope, receivable.revenueAccountId);
        if (!revenueAccount) {
          logger.warn('AR reconcile: revenue account missing, skipping recognition re-drive', {
            receivableId: receivable.id,
          });
          continue;
        }
        await this.posting.postEntry(scope, this.buildRecognitionInputFromRow(scope, receivable, revenueAccount));
        recognitionsPosted += 1;
      } catch (error) {
        logger.warn('AR reconcile: recognition re-drive failed', { receivableId: receivable.id, error });
      }
    }

    // 2. Every active receipt must carry its receipt entry AND its receivable must be finalized.
    const receipts = await this.receivableRepo.findAllActiveReceipts(scope);
    for (const receipt of receipts) {
      try {
        let settlement = await this.posting.findEntryBySource(scope, AR_RECEIPT_SOURCE_TYPE, receipt.id);
        if (!settlement) {
          const receivable = await this.receivableRepo.findByIdWithReceipts(scope, receipt.receivableId);
          if (!receivable) continue;
          const debitCode = resolveReceiptMethodAccount(receipt.method);
          settlement = await this.posting.postEntry(
            scope,
            this.buildReceiptInputFromRow(scope, receivable, receipt, debitCode),
          );
          receiptsPosted += 1;
        }
        // Finalize atomically — link the entry, mark RECEIVED, and re-emit the AR-domain audit event
        // that the crashed normal-path finalize tx never wrote. The ledger 'entry.posted' audit already
        // exists (postEntry's own tx), so the hash-chain is intact; this restores the
        // 'receivable.receipt_registered' domain trail. The audit is tied to the RECEIVING→RECEIVED
        // transition, which happens exactly once per receipt (normal path OR here) — so repeated
        // reconcile passes never double-emit (once RECEIVED, needsFinalize is false).
        const receivable = await this.receivableRepo.findById(scope, receipt.receivableId);
        const settlementEntryId = settlement.id;
        const needsEntryLink = receipt.entryId !== settlementEntryId;
        const maybeFinalize = receivable?.status === 'RECEIVING'; // preliminary read — the CAS below is authoritative
        if (needsEntryLink || maybeFinalize) {
          await this.receivableRepo.runTransaction(async (tx) => {
            if (needsEntryLink) {
              await this.receivableRepo.updateReceipt(scope, receipt.id, { entryId: settlementEntryId }, tx);
            }
            // Atomic RECEIVING→RECEIVED: emit + count ONLY when THIS pass performed the transition.
            const flipped = await this.receivableRepo.markReceivedIfReceiving(scope, receipt.receivableId, tx);
            if (flipped === 1) {
              await this.auditService.append(tx, scope, {
                actorUserId: scope.actorUserId,
                eventType: 'receivable.receipt_registered',
                targetType: 'receivable',
                targetId: receipt.receivableId,
                payload: {
                  receivableId: receipt.receivableId,
                  receiptId: receipt.id,
                  amountCents: String(receipt.amountCents),
                  method: receipt.method,
                  entryId: settlementEntryId,
                },
              });
              finalized += 1;
            }
          });
        }
      } catch (error) {
        logger.warn('AR reconcile: receipt re-drive failed', { receiptId: receipt.id, error });
      }
    }

    logger.info('AR reconcile pass complete', { recognitionsPosted, receiptsPosted, finalized });
    return { recognitionsPosted, receiptsPosted, finalized };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sumActiveReceipts(receivable: ReceivableWithReceipts): number {
    return receivable.receipts
      .filter((r) => r.status === 'ACTIVE')
      .reduce((acc, r) => acc + r.amountCents, 0);
  }

  /**
   * Re-scope a body-supplied counterpartyId (SEC-A1-1). Returns null when none was supplied (nullable
   * this increment, SEC-A1-5); otherwise the counterparty MUST exist IN THIS SCOPE and be a CUSTOMER
   * — a cross-tenant id resolves to null via the scoped findById and is rejected here.
   */
  private async resolveCounterpartyId(
    scope: AccountingScope,
    counterpartyId: string | undefined,
  ): Promise<string | null> {
    if (!counterpartyId) return null;
    const counterparty = await this.counterpartyRepo.findById(scope, counterpartyId);
    if (!counterparty) {
      throw new ValidationError('Contraparte informada não existe nesta unidade.');
    }
    if (counterparty.type !== 'CUSTOMER') {
      throw new ValidationError('A contraparte de uma conta a receber deve ser um cliente (CUSTOMER).');
    }
    return counterparty.id;
  }

  private async resolveRevenueAccount(scope: AccountingScope, accountId: string): Promise<Account> {
    const account = await this.accountRepo.findById(scope, accountId);
    if (!account) {
      throw new ValidationError('Conta de receita informada não existe nesta unidade.');
    }
    if (account.nature !== 'Revenue') {
      throw new ValidationError('A contrapartida deve ser uma conta de receita (nature=Revenue).');
    }
    if (account.acceptsEntries === false) {
      throw new ValidationError('A conta de receita deve ser analítica (aceita lançamentos).');
    }
    return account;
  }

  private buildRecognitionInput(
    scope: AccountingScope,
    receivable: Receivable,
    revenueAccount: Account,
    dto: CreateReceivableInput,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: dto.issueDate,
      description: this.recognitionDescription(receivable),
      sourceType: AR_RECEIVABLE_SOURCE_TYPE,
      sourceId: receivable.id,
      sourceDocument: {
        externalRef: dto.documentNumber,
        documentDate: dto.issueDate,
        attachmentId: dto.attachmentId,
      },
      lines: [
        { accountCode: CLIENTES_A_RECEBER_CODE, debitCents: dto.amountCents, creditCents: 0 },
        { accountCode: revenueAccount.code, debitCents: 0, creditCents: dto.amountCents },
      ],
    };
  }

  /** Recognition input rebuilt from a persisted row (reconcile re-drive). */
  private buildRecognitionInputFromRow(
    scope: AccountingScope,
    receivable: Receivable,
    revenueAccount: Account,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: this.toDateOnly(receivable.issueDate),
      description: this.recognitionDescription(receivable),
      sourceType: AR_RECEIVABLE_SOURCE_TYPE,
      sourceId: receivable.id,
      sourceDocument: {
        externalRef: receivable.documentNumber ?? undefined,
        documentDate: this.toDateOnly(receivable.issueDate),
      },
      lines: [
        { accountCode: CLIENTES_A_RECEBER_CODE, debitCents: receivable.amountCents, creditCents: 0 },
        { accountCode: revenueAccount.code, debitCents: 0, creditCents: receivable.amountCents },
      ],
    };
  }

  private buildReceiptInput(
    scope: AccountingScope,
    receivable: Receivable,
    receipt: ReceivableReceipt,
    debitCode: string,
    dto: RegisterReceiptInput,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: dto.receivedAt,
      description: this.receiptDescription(receivable),
      sourceType: AR_RECEIPT_SOURCE_TYPE,
      sourceId: receipt.id,
      lines: [
        { accountCode: debitCode, debitCents: dto.amountCents, creditCents: 0 },
        { accountCode: CLIENTES_A_RECEBER_CODE, debitCents: 0, creditCents: dto.amountCents },
      ],
    };
  }

  /** Receipt input rebuilt from persisted rows (reconcile re-drive). */
  private buildReceiptInputFromRow(
    scope: AccountingScope,
    receivable: Receivable,
    receipt: ReceivableReceipt,
    debitCode: string,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: this.toDateOnly(receipt.receivedAt),
      description: this.receiptDescription(receivable),
      sourceType: AR_RECEIPT_SOURCE_TYPE,
      sourceId: receipt.id,
      lines: [
        { accountCode: debitCode, debitCents: receipt.amountCents, creditCents: 0 },
        { accountCode: CLIENTES_A_RECEBER_CODE, debitCents: 0, creditCents: receipt.amountCents },
      ],
    };
  }

  private recognitionDescription(receivable: Receivable): string {
    const doc = receivable.documentNumber ? ` (Fatura ${receivable.documentNumber})` : '';
    return `Contas a receber — ${receivable.customerName}${doc}`;
  }

  private receiptDescription(receivable: Receivable): string {
    const doc = receivable.documentNumber ? ` (Fatura ${receivable.documentNumber})` : '';
    return `Recebimento de cliente — ${receivable.customerName}${doc}`;
  }

  /** DateTime → date-only YYYY-MM-DD (UTC, matching how postEntry parses date-only strings). */
  private toDateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Undo a claimed-but-unposted receipt attempt (safe only before the ledger commit). */
  private async revertClaim(
    scope: AccountingScope,
    receivableId: string,
    receipt: ReceivableReceipt | undefined,
  ): Promise<void> {
    try {
      await this.receivableRepo.runTransaction(async (tx) => {
        if (receipt) {
          await this.receivableRepo.updateReceipt(scope, receipt.id, { status: 'CANCELLED' }, tx);
        }
        await this.receivableRepo.updateReceivable(scope, receivableId, { status: 'OPEN' }, tx);
      });
    } catch (error) {
      logger.error('AR registerReceipt revert failed — reconcile will reconcile state', {
        receivableId,
        error,
      });
    }
  }

  /** Compensate a receivable whose recognition posting failed synchronously (soft-delete + rename). */
  private async compensateFailedRecognition(scope: AccountingScope, receivable: Receivable): Promise<void> {
    try {
      await this.receivableRepo.updateReceivable(scope, receivable.id, {
        status: 'CANCELLED',
        deletedAt: new Date(),
        documentNumber: deletedDocumentNumber(receivable.id, receivable.documentNumber),
      });
    } catch (error) {
      logger.error('AR createReceivable compensation failed — reconcile will not re-post a cancelled row', {
        receivableId: receivable.id,
        error,
      });
    }
  }
}
