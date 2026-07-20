import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import { Prisma } from 'generated/prisma';
import type { Account, Payable, PayablePayment } from 'generated/prisma';
import { ESTOQUES_CODE, FORNECEDORES_A_PAGAR_CODE } from '../fixtures/ChartOfAccountsFixture';
import { INVENTORY_INBOUND_SOURCE_TYPE } from '../models/Inventory.model';
import {
  AP_PAYABLE_SOURCE_TYPE,
  AP_PAYMENT_SOURCE_TYPE,
  deletedDocumentNumber,
  isInventoryPurchase,
  resolvePaymentMethodAccount,
} from '../models/Payable.model';
import type {
  CancelPayableInput,
  CancelPaymentInput,
  CreatePayableInput,
  ListPayablesQueryInput,
  RegisterPaymentInput,
} from '../dtos/PayableDto';
import type { IPayableRepository, PayableWithPayments } from '../repositories/IPayableRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { ICounterpartyRepository } from '../repositories/ICounterpartyRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { PostEntryInput } from '../dtos/PostingDto';
import type { AuditService } from './AuditService';
import type { PostingService } from './PostingService';
import type { IInventoryService } from './IInventoryService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/**
 * PayableService — Contas a Pagar (INCR-AP / ADR-INCR-AP). FIRST-CLASS PRISMA.
 *
 * Books the DUAL fato gerador directly through PostingService.postEntry (F0 rota (a), golden ref
 * ExerciseClosingService — AP is a module INTERNAL to the accounting world, not a DynamicTable
 * origin, so there is NO AccountingSyncPort/mapper/bridge):
 *   - recognition (competência): D expenseAccount (4.x) / C 2.1.2 — sourceType='ap.payable', sourceId=payableId
 *   - settlement (data efetiva):  D 2.1.2 / C conta-por-método — sourceType='ap.payment', sourceId=paymentId
 *
 * Key invariants:
 * - postEntry opens its OWN root tx (SQLite has no nesting), so the AP-row write and the ledger
 *   write are DIFFERENT transactions. The double-payment race is closed BEFORE the post by an
 *   atomic OPEN→PAYING status CAS (claimForPayment, D4); a crash between the two txs converges via
 *   reconcilePayables (the re-drive safety net — mandatory, ADR §6.2, since with rota (a) this
 *   reconcile is our own code, not the generic AccountingSync registry).
 * - settlement idempotency keys on paymentId, NEVER payableId (D3) — re-paying after a reversal
 *   mints a new key instead of returning the reverted entry (T7).
 * - cancel = estorno (reverseEntry) in an open period + row lifecycle flip (ACC-018/T5), never a
 *   destructive edit; rename-on-delete frees the business key (D3).
 */
export class PayableService {
  constructor(
    private readonly payableRepo: IPayableRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly posting: PostingService,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
    private readonly counterpartyRepo: ICounterpartyRepository,
    // OPTIONAL (INCR-INVENTORY D3(b) / Body 3): the AP→estoque bridge injects the inventory subledger.
    // Kept optional so the Fase B factory wiring is a separate step — the factory compiles with this
    // arg absent. Inventory-purchase paths assert its presence and fail loud when it is missing.
    private readonly inventoryService?: IInventoryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async listPayables(
    scope: AccountingScope,
    params: ListPayablesQueryInput,
  ): Promise<{ payables: PayableWithPayments[]; total: number }> {
    if (!this.policy.canReadPayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para listar contas a pagar.');
    }
    const skip = (params.page - 1) * params.limit;
    return this.payableRepo.findManyByUnit(scope, { status: params.status, skip, limit: params.limit });
  }

  async getPayable(scope: AccountingScope, id: string): Promise<PayableWithPayments> {
    if (!this.policy.canReadPayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler contas a pagar.');
    }
    const payable = await this.payableRepo.findByIdWithPayments(scope, id);
    if (!payable) throw new NotFoundError(`Conta a pagar '${id}' não foi encontrada.`);
    return payable;
  }

  // ---------------------------------------------------------------------------
  // Create (recognition)
  // ---------------------------------------------------------------------------

  /**
   * Create a payable and book its recognition entry (D expenseAccount / C 2.1.2). The row and
   * the recognition posting live in DIFFERENT txs; on a synchronous posting failure (e.g. the
   * competência period is closed) the row is COMPENSATED (soft-delete + rename) and the error is
   * surfaced, so a failed creation never leaves a dangling payable. A crash between the two txs is
   * converged by reconcilePayables.
   */
  async createPayable(scope: AccountingScope, dto: CreatePayableInput): Promise<Payable> {
    if (!this.policy.canManagePayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para criar contas a pagar.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    // INCR-INVENTORY D3(b): an inventory PURCHASE (inventoryProductRef + inventoryQty, DTO XOR gate)
    // debits 1.1.6 Estoques instead of an expense leaf and drives a StockMovement INBOUND.
    const inventoryPurchase = isInventoryPurchase(dto);

    // Expense-account gate (D4): only for ordinary expense payables — must be an existing, active, LEAF
    // Expense account of this scope. Inventory purchases carry expenseAccountId=null.
    const expenseAccount = inventoryPurchase
      ? null
      : await this.resolveExpenseAccount(scope, dto.expenseAccountId!);

    // Inventory purchases MUST have the subledger wired (the dep is optional until Fase B factory
    // wiring). Fail LOUD before minting a row we could never value, never silently skip the INBOUND.
    if (inventoryPurchase && !this.inventoryService) {
      throw new ValidationError(
        'Compra de estoque requer o serviço de estoque configurado (wiring de inventário pendente).',
      );
    }

    // Counterparty gate (SEC-A1-1 — IDOR #1): if a counterpartyId is supplied, RE-SCOPE it here
    // (findById carries the scope), so a payable can never link to another tenant's counterparty. The
    // DTO cannot know the scope, so this resolution lives in the service, never in Zod. Nullable this
    // increment (SEC-A1-5): no counterpartyId → no link; supplierName stays the identity snapshot.
    const counterpartyId = await this.resolveCounterpartyId(scope, dto.counterpartyId);

    // tx1 — create the row (OPEN) + payable.created audit atomically (ACC-019). Mints payableId.
    let payable: Payable;
    try {
      payable = await this.payableRepo.runTransaction(async (tx) => {
        const created = await this.payableRepo.create(
          {
            userId,
            unitId,
            supplierName: dto.supplierName,
            supplierRef: dto.supplierRef ?? null,
            counterpartyId,
            documentNumber: dto.documentNumber ?? null,
            description: dto.description,
            issueDate: new Date(dto.issueDate),
            dueDate: new Date(dto.dueDate),
            amountCents: dto.amountCents,
            expenseAccountId: expenseAccount?.id ?? null,
            inventoryProductRef: dto.inventoryProductRef ?? null,
            inventoryQty: dto.inventoryQty ?? null,
            status: 'OPEN',
            createdById: scope.actorUserId,
          },
          tx,
        );
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'payable.created',
          targetType: 'payable',
          targetId: created.id,
          payload: {
            payableId: created.id,
            supplierRef: dto.supplierRef,
            amountCents: String(dto.amountCents),
            dueDate: dto.dueDate,
            // Debit leg of the recognition: an expense leaf, or 1.1.6 Estoques for an inventory purchase.
            expenseAccountCode: expenseAccount?.code ?? ESTOQUES_CODE,
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(
          'Já existe uma conta a pagar em aberto para este fornecedor e documento.',
        );
      }
      throw error;
    }

    // Recognition posting (SEPARATE tx). Compensate the row on synchronous failure.
    try {
      await this.posting.postEntry(scope, this.buildRecognitionInput(scope, payable, expenseAccount, dto));
    } catch (error) {
      await this.compensateFailedRecognition(scope, payable);
      throw error;
    }

    // Inventory INBOUND (D3(b)) — AFTER the recognition is booked (D 1.1.6 / C 2.1.2), value the SKU.
    // receiveStock is READ-FIRST idempotent on sourceId=payableId, so this same purchase can never
    // double-value with a seed of the same lot (Gate 4). It runs in its OWN tx; the recognition is
    // already committed, so a failure here must NOT compensate the (valid) recognition — leave the
    // payable OPEN and let reconcilePayables re-drive the missing INBOUND (Gap 2/Gate 8), converging
    // like the AP settlement crash window. Best-effort: log and return; reconcile is the net.
    if (inventoryPurchase) {
      try {
        await this.inventoryService!.receiveStock(scope, {
          productRef: dto.inventoryProductRef!,
          qty: dto.inventoryQty!,
          totalValueCents: dto.amountCents,
          occurredAt: new Date(dto.issueDate),
          sourceType: INVENTORY_INBOUND_SOURCE_TYPE,
          sourceId: payable.id,
          description: dto.description,
        });
      } catch (error) {
        logger.warn('AP createPayable: inventory INBOUND failed — reconcile will re-drive', {
          payableId: payable.id,
          error,
        });
      }
    }
    return payable;
  }

  // ---------------------------------------------------------------------------
  // Register payment (settlement)
  // ---------------------------------------------------------------------------

  /**
   * Register the (single, full) payment of a payable: book the settlement (D 2.1.2 / C
   * conta-por-método) and move the payable to PAID. The double-payment race is closed by the
   * OPEN→PAYING CAS before any ledger write, so two concurrent calls yield exactly one payment.
   */
  async registerPayment(
    scope: AccountingScope,
    payableId: string,
    dto: RegisterPaymentInput,
  ): Promise<PayablePayment> {
    if (!this.policy.canManagePayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para pagar contas.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    const payable = await this.payableRepo.findByIdWithPayments(scope, payableId);
    if (!payable) throw new NotFoundError(`Conta a pagar '${payableId}' não foi encontrada.`);
    if (payable.status !== 'OPEN') {
      throw new ValidationError(
        `Conta a pagar não está aberta para pagamento (status atual: ${payable.status}).`,
      );
    }

    // Full-payment guard (F2 MVP): the amount must settle the whole remaining balance.
    const remaining = payable.amountCents - this.sumActivePayments(payable);
    if (dto.amountCents !== remaining) {
      throw new ValidationError(
        `Pagamento parcial não é suportado: informe o saldo integral (${remaining} centavos).`,
      );
    }

    // Resolve the credit account for the method (closed map — unknown REJECTS, D2) BEFORE the CAS.
    const creditCode = resolvePaymentMethodAccount(dto.method);

    // ATOMIC RACE GATE (D4) — OPEN → PAYING. count 0 = lost the race / not open.
    const claimed = await this.payableRepo.claimForPayment(scope, payableId);
    if (claimed === 0) {
      throw new ValidationError('A conta já está em pagamento ou não está mais aberta.');
    }

    let posted = false;
    let payment: PayablePayment | undefined;
    try {
      // Mint the payment row (ACTIVE) — its id is the settlement idempotency key (D3).
      payment = await this.payableRepo.createPayment({
        userId,
        unitId,
        payableId,
        amountCents: dto.amountCents,
        method: dto.method,
        paidAt: new Date(dto.paidAt),
        paidByUserId: scope.actorUserId,
        status: 'ACTIVE',
      });

      const entry = await this.posting.postEntry(
        scope,
        this.buildSettlementInput(scope, payable, payment, creditCode, dto),
      );
      posted = true;

      // Finalize (tx) — link the entry, mark PAID via the atomic PAYING→PAID CAS, emit the domain
      // audit ONLY when THIS call performed the transition. The ledger is already committed; if
      // this tx crashes, reconcilePayables finalizes it. The CAS closes the race with a concurrent
      // reconcile that could finalize between the post above and this tx (else both would emit).
      await this.payableRepo.runTransaction(async (tx) => {
        await this.payableRepo.updatePayment(scope, payment!.id, { entryId: entry.id }, tx);
        const flipped = await this.payableRepo.markPaidIfPaying(scope, payableId, tx);
        if (flipped === 1) {
          await this.auditService.append(tx, scope, {
            actorUserId: scope.actorUserId,
            eventType: 'payable.payment_registered',
            targetType: 'payable',
            targetId: payableId,
            payload: {
              payableId,
              paymentId: payment!.id,
              amountCents: String(dto.amountCents),
              method: dto.method,
              entryId: entry.id,
            },
          });
        }
      });
      return { ...payment, entryId: entry.id, status: 'ACTIVE' };
    } catch (error) {
      // Only safe to revert BEFORE the ledger commit. After a successful post, the money is
      // booked — leave it PAYING for reconcile to finalize (never revert over a real posting).
      if (!posted) {
        await this.revertClaim(scope, payableId, payment);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Cancel payable (reverse recognition — F6)
  // ---------------------------------------------------------------------------

  /**
   * Cancel an OPEN payable: reverse its recognition (estorno on the reversalDate — its own period
   * gate, T5) and flip the row to CANCELLED (terminal) with rename-on-delete freeing the business
   * key. Re-runnable: reverseEntry is idempotent, so a crash mid-cancel completes on retry.
   */
  async cancelPayable(scope: AccountingScope, payableId: string, dto: CancelPayableInput): Promise<Payable> {
    if (!this.policy.canManagePayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para cancelar contas a pagar.');
    }
    const payable = await this.payableRepo.findByIdWithPayments(scope, payableId);
    if (!payable) throw new NotFoundError(`Conta a pagar '${payableId}' não foi encontrada.`);
    if (payable.status === 'CANCELLED') return payable; // idempotent
    if (payable.status !== 'OPEN') {
      throw new ValidationError(
        payable.status === 'PAID'
          ? 'Desfaça o pagamento (cancelar pagamento) antes de cancelar a conta.'
          : `Conta a pagar não pode ser cancelada no status atual (${payable.status}).`,
      );
    }
    // Defense-in-depth: an OPEN payable should have no active payment, but never cancel over one.
    const activePayment = await this.payableRepo.findActivePayment(scope, payableId);
    if (activePayment) {
      throw new ValidationError('Desfaça o pagamento ativo antes de cancelar a conta.');
    }

    // INCR-INVENTORY D3(b): an inventory purchase received stock at create — un-receive it at the
    // ORIGINAL receipt cost BEFORE reversing the ledger, so an insufficient-stock rejection (the goods
    // were already sold) aborts the cancel cleanly instead of leaving a half-done ledger reversal.
    // Idempotent by a reversalEventId distinct from the receipt key (payableId), so a retried cancel
    // replays without a second decrement. Keeps the tie-out Σ==saldo(1.1.6) intact.
    if (isInventoryPurchase(payable)) {
      if (!this.inventoryService) {
        throw new ValidationError(
          'Cancelamento de compra de estoque requer o serviço de estoque configurado.',
        );
      }
      await this.inventoryService.reverseStockForReceipt(scope, {
        sourceType: INVENTORY_INBOUND_SOURCE_TYPE,
        sourceId: payableId,
        reversalEventId: `${payableId}:cancel`,
        reversalDate: new Date(dto.reversalDate),
      });
    }

    // Reverse the recognition if it exists (a dangling create may have none).
    const recognition = await this.posting.findEntryBySource(scope, AP_PAYABLE_SOURCE_TYPE, payableId);
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

    return this.payableRepo.runTransaction(async (tx) => {
      const cancelled = await this.payableRepo.updatePayable(
        scope,
        payableId,
        {
          status: 'CANCELLED',
          deletedAt: new Date(),
          cancelledById: scope.actorUserId,
          cancelReason: dto.reason ?? null,
          documentNumber: deletedDocumentNumber(payableId, payable.documentNumber),
        },
        tx,
      );
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'payable.cancelled',
        targetType: 'payable',
        targetId: payableId,
        payload: { payableId, reversalEntryId, reason: dto.reason },
      });
      return cancelled;
    });
  }

  // ---------------------------------------------------------------------------
  // Cancel payment (reverse settlement, reopen)
  // ---------------------------------------------------------------------------

  /**
   * Cancel an active payment: reverse its settlement and reopen the payable. The settlement +
   * its reversal net to zero on 2.1.2, leaving the recognition's liability standing again.
   */
  async cancelPayment(
    scope: AccountingScope,
    payableId: string,
    paymentId: string,
    dto: CancelPaymentInput,
  ): Promise<PayablePayment> {
    if (!this.policy.canManagePayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para cancelar pagamentos.');
    }
    const payment = await this.payableRepo.findPaymentById(scope, paymentId);
    if (!payment || payment.payableId !== payableId) {
      throw new NotFoundError(`Pagamento '${paymentId}' não foi encontrado.`);
    }
    if (payment.status === 'CANCELLED') return payment; // idempotent

    const settlement = await this.posting.findEntryBySource(scope, AP_PAYMENT_SOURCE_TYPE, paymentId);
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

    return this.payableRepo.runTransaction(async (tx) => {
      const cancelled = await this.payableRepo.updatePayment(scope, paymentId, { status: 'CANCELLED' }, tx);
      await this.payableRepo.updatePayable(scope, payableId, { status: 'OPEN' }, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'payable.payment_cancelled',
        targetType: 'payable',
        targetId: payableId,
        payload: { payableId, paymentId, reversalEntryId, reason: dto.reason },
      });
      return cancelled;
    });
  }

  // ---------------------------------------------------------------------------
  // Reconcile (re-drive safety net — D4 / ADR §6.2)
  // ---------------------------------------------------------------------------

  /**
   * Re-drive missing recognitions/settlements for the scope. postEntry is idempotent on sourceId,
   * so re-posting is safe; the finalize (entryId + PAID) is applied when a settlement exists but
   * its payable/payment never got finalized (crash between the post and the finalize tx).
   * Returns what it repaired. Best-effort per item: one failing payable does not abort the pass.
   */
  async reconcilePayables(
    scope: AccountingScope,
  ): Promise<{ recognitionsPosted: number; settlementsPosted: number; finalized: number }> {
    if (!this.policy.canManagePayable(scope)) {
      throw new ForbiddenError('Você não tem permissão para reconciliar contas a pagar.');
    }
    let recognitionsPosted = 0;
    let settlementsPosted = 0;
    let finalized = 0;

    // 1. Every live, non-cancelled payable must carry its recognition entry.
    const payables = await this.payableRepo.findAllActive(scope);
    for (const payable of payables) {
      if (payable.status === 'CANCELLED') continue;
      const recognition = await this.posting.findEntryBySource(scope, AP_PAYABLE_SOURCE_TYPE, payable.id);

      // INCR-INVENTORY D3(b) twin (Gap 2/Gate 8): an inventory PURCHASE carries expenseAccountId=null
      // and debits 1.1.6 Estoques. It must NOT be resolved by expenseAccountId (=null → the pre-inventory
      // path skipped it, orphaning the row). Re-post the missing recognition (D 1.1.6 / C 2.1.2) AND
      // re-drive the possibly-missing INBOUND (idempotent by read-first on payableId), so the tie-out
      // Σ==saldo(1.1.6) closes after a crash between the two txs.
      if (isInventoryPurchase(payable)) {
        try {
          if (!recognition) {
            await this.posting.postEntry(scope, this.buildRecognitionInputFromRow(scope, payable, null));
            recognitionsPosted += 1;
          }
          if (this.inventoryService) {
            await this.inventoryService.receiveStock(scope, {
              productRef: payable.inventoryProductRef!,
              qty: payable.inventoryQty!,
              totalValueCents: payable.amountCents,
              occurredAt: payable.issueDate,
              sourceType: INVENTORY_INBOUND_SOURCE_TYPE,
              sourceId: payable.id,
              description: payable.description,
            });
          }
        } catch (error) {
          logger.warn('AP reconcile: inventory purchase re-drive failed', { payableId: payable.id, error });
        }
        continue;
      }

      if (recognition) continue;
      // An ordinary expense payable with no expense account cannot be recognized (defensive skip).
      if (!payable.expenseAccountId) continue;
      try {
        const expenseAccount = await this.accountRepo.findById(scope, payable.expenseAccountId);
        if (!expenseAccount) {
          logger.warn('AP reconcile: expense account missing, skipping recognition re-drive', {
            payableId: payable.id,
          });
          continue;
        }
        await this.posting.postEntry(scope, this.buildRecognitionInputFromRow(scope, payable, expenseAccount));
        recognitionsPosted += 1;
      } catch (error) {
        logger.warn('AP reconcile: recognition re-drive failed', { payableId: payable.id, error });
      }
    }

    // 2. Every active payment must carry its settlement entry AND its payable must be finalized.
    const payments = await this.payableRepo.findAllActivePayments(scope);
    for (const payment of payments) {
      try {
        let settlement = await this.posting.findEntryBySource(scope, AP_PAYMENT_SOURCE_TYPE, payment.id);
        if (!settlement) {
          const payable = await this.payableRepo.findByIdWithPayments(scope, payment.payableId);
          if (!payable) continue;
          const creditCode = resolvePaymentMethodAccount(payment.method);
          settlement = await this.posting.postEntry(
            scope,
            this.buildSettlementInputFromRow(scope, payable, payment, creditCode),
          );
          settlementsPosted += 1;
        }
        // Finalize atomically — link the entry, mark PAID, and re-emit the AP-domain audit event
        // that the crashed normal-path finalize tx never wrote. The ledger 'entry.posted' audit
        // already exists (postEntry's own tx), so the hash-chain is intact; this restores the
        // 'payable.payment_registered' domain trail so a reconcile-finalized payment is
        // indistinguishable from a normally-paid one. The audit is tied to the PAYING→PAID
        // transition, which happens exactly once per payment (normal path OR here) — so repeated
        // reconcile passes never double-emit (once PAID, needsFinalize is false).
        const payable = await this.payableRepo.findById(scope, payment.payableId);
        const settlementEntryId = settlement.id;
        const needsEntryLink = payment.entryId !== settlementEntryId;
        const maybeFinalize = payable?.status === 'PAYING'; // preliminary read — the CAS below is authoritative
        if (needsEntryLink || maybeFinalize) {
          await this.payableRepo.runTransaction(async (tx) => {
            if (needsEntryLink) {
              await this.payableRepo.updatePayment(scope, payment.id, { entryId: settlementEntryId }, tx);
            }
            // Atomic PAYING→PAID: emit + count ONLY when THIS pass performed the transition. Closes
            // the double-emit under two overlapping reconcile passes (or a reconcile-vs-normal race).
            const flipped = await this.payableRepo.markPaidIfPaying(scope, payment.payableId, tx);
            if (flipped === 1) {
              await this.auditService.append(tx, scope, {
                actorUserId: scope.actorUserId,
                eventType: 'payable.payment_registered',
                targetType: 'payable',
                targetId: payment.payableId,
                payload: {
                  payableId: payment.payableId,
                  paymentId: payment.id,
                  amountCents: String(payment.amountCents),
                  method: payment.method,
                  entryId: settlementEntryId,
                },
              });
              finalized += 1;
            }
          });
        }
      } catch (error) {
        logger.warn('AP reconcile: settlement re-drive failed', { paymentId: payment.id, error });
      }
    }

    logger.info('AP reconcile pass complete', { recognitionsPosted, settlementsPosted, finalized });
    return { recognitionsPosted, settlementsPosted, finalized };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sumActivePayments(payable: PayableWithPayments): number {
    return payable.payments
      .filter((p) => p.status === 'ACTIVE')
      .reduce((acc, p) => acc + p.amountCents, 0);
  }

  /**
   * Re-scope a body-supplied counterpartyId (SEC-A1-1). Returns null when none was supplied (the FK
   * is nullable this increment, SEC-A1-5); otherwise the counterparty MUST exist IN THIS SCOPE and be
   * a SUPPLIER — a cross-tenant id resolves to null via the scoped findById and is rejected here, so a
   * payable can never point at another tenant's counterparty (IDOR #1) or at a CUSTOMER record.
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
    if (counterparty.type !== 'SUPPLIER') {
      throw new ValidationError('A contraparte de uma conta a pagar deve ser um fornecedor (SUPPLIER).');
    }
    return counterparty.id;
  }

  private async resolveExpenseAccount(scope: AccountingScope, accountId: string): Promise<Account> {
    const account = await this.accountRepo.findById(scope, accountId);
    if (!account) {
      throw new ValidationError('Conta de despesa informada não existe nesta unidade.');
    }
    if (account.nature !== 'Expense') {
      throw new ValidationError('A contrapartida deve ser uma conta de despesa (nature=Expense).');
    }
    if (account.acceptsEntries === false) {
      throw new ValidationError('A conta de despesa deve ser analítica (aceita lançamentos).');
    }
    return account;
  }

  /**
   * Debit account code of the recognition: an inventory purchase debits `1.1.6 Estoques` (D3(b)); an
   * ordinary expense payable debits its resolved Expense leaf. `expenseAccount` is null exactly when
   * the payable is an inventory purchase (createPayable/reconcile pass it accordingly).
   */
  private recognitionDebitCode(payable: Payable, expenseAccount: Account | null): string {
    if (isInventoryPurchase(payable)) return ESTOQUES_CODE;
    if (!expenseAccount) {
      // Defensive: a non-inventory payable without an expense account cannot be recognized.
      throw new ValidationError('Conta de despesa ausente para o reconhecimento da conta a pagar.');
    }
    return expenseAccount.code;
  }

  private buildRecognitionInput(
    scope: AccountingScope,
    payable: Payable,
    expenseAccount: Account | null,
    dto: CreatePayableInput,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: dto.issueDate,
      description: this.recognitionDescription(payable),
      sourceType: AP_PAYABLE_SOURCE_TYPE,
      sourceId: payable.id,
      sourceDocument: {
        externalRef: dto.documentNumber,
        documentDate: dto.issueDate,
        attachmentId: dto.attachmentId,
      },
      lines: [
        { accountCode: this.recognitionDebitCode(payable, expenseAccount), debitCents: dto.amountCents, creditCents: 0 },
        { accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: 0, creditCents: dto.amountCents },
      ],
    };
  }

  /** Recognition input rebuilt from a persisted row (reconcile re-drive). `expenseAccount` is null for
   *  an inventory purchase (debit routes to 1.1.6). */
  private buildRecognitionInputFromRow(
    scope: AccountingScope,
    payable: Payable,
    expenseAccount: Account | null,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: this.toDateOnly(payable.issueDate),
      description: this.recognitionDescription(payable),
      sourceType: AP_PAYABLE_SOURCE_TYPE,
      sourceId: payable.id,
      sourceDocument: {
        externalRef: payable.documentNumber ?? undefined,
        documentDate: this.toDateOnly(payable.issueDate),
      },
      lines: [
        { accountCode: this.recognitionDebitCode(payable, expenseAccount), debitCents: payable.amountCents, creditCents: 0 },
        { accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: 0, creditCents: payable.amountCents },
      ],
    };
  }

  private buildSettlementInput(
    scope: AccountingScope,
    payable: Payable,
    payment: PayablePayment,
    creditCode: string,
    dto: RegisterPaymentInput,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: dto.paidAt,
      description: this.settlementDescription(payable),
      sourceType: AP_PAYMENT_SOURCE_TYPE,
      sourceId: payment.id,
      lines: [
        { accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: dto.amountCents, creditCents: 0 },
        { accountCode: creditCode, debitCents: 0, creditCents: dto.amountCents },
      ],
    };
  }

  /** Settlement input rebuilt from persisted rows (reconcile re-drive). */
  private buildSettlementInputFromRow(
    scope: AccountingScope,
    payable: Payable,
    payment: PayablePayment,
    creditCode: string,
  ): PostEntryInput {
    return {
      unitId: scope.unitId,
      date: this.toDateOnly(payment.paidAt),
      description: this.settlementDescription(payable),
      sourceType: AP_PAYMENT_SOURCE_TYPE,
      sourceId: payment.id,
      lines: [
        { accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: payment.amountCents, creditCents: 0 },
        { accountCode: creditCode, debitCents: 0, creditCents: payment.amountCents },
      ],
    };
  }

  private recognitionDescription(payable: Payable): string {
    const doc = payable.documentNumber ? ` (NF ${payable.documentNumber})` : '';
    return `Contas a pagar — ${payable.supplierName}${doc}`;
  }

  private settlementDescription(payable: Payable): string {
    const doc = payable.documentNumber ? ` (NF ${payable.documentNumber})` : '';
    return `Pagamento a fornecedor — ${payable.supplierName}${doc}`;
  }

  /** DateTime → date-only YYYY-MM-DD (UTC, matching how postEntry parses date-only strings). */
  private toDateOnly(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Undo a claimed-but-unposted payment attempt (safe only before the ledger commit). */
  private async revertClaim(
    scope: AccountingScope,
    payableId: string,
    payment: PayablePayment | undefined,
  ): Promise<void> {
    try {
      await this.payableRepo.runTransaction(async (tx) => {
        if (payment) {
          await this.payableRepo.updatePayment(scope, payment.id, { status: 'CANCELLED' }, tx);
        }
        await this.payableRepo.updatePayable(scope, payableId, { status: 'OPEN' }, tx);
      });
    } catch (error) {
      logger.error('AP registerPayment revert failed — reconcile will reconcile state', {
        payableId,
        error,
      });
    }
  }

  /** Compensate a payable whose recognition posting failed synchronously (soft-delete + rename). */
  private async compensateFailedRecognition(scope: AccountingScope, payable: Payable): Promise<void> {
    try {
      await this.payableRepo.updatePayable(scope, payable.id, {
        status: 'CANCELLED',
        deletedAt: new Date(),
        documentNumber: deletedDocumentNumber(payable.id, payable.documentNumber),
      });
    } catch (error) {
      logger.error('AP createPayable compensation failed — reconcile will not re-post a cancelled row', {
        payableId: payable.id,
        error,
      });
    }
  }
}
