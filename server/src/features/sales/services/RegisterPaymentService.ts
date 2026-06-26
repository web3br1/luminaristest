import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import { maybeSyncSalonSaleSettled } from '../../accounting/sync/bridges/SalonSaleSettlementBridge';
import { resolveAccountingScope } from '../../accounting/scope/AccountingScope';
import type { PackageBalanceService } from '../../packages/services/PackageBalanceService';
import type { RegisterPaymentInput } from '../dtos/RegisterPaymentDto';

/**
 * RegisterPaymentService — server-side orchestration of the salon-sale payment transition
 * (Incremento D / D1), in the backend-workflow-transition-generator pattern (mirrors
 * SalesCancellationService and CrmPipelineService.advanceStage).
 *
 * The `sales` row is a DynamicTable record. Once Finalized, the preset's immutableAfter
 * `scope:'all'` locks the WHOLE row in the generic updateTableData path — so a user can never flip
 * paymentStatus → Paid directly (the "trava" stays intact). The ONLY legitimate bypass is this
 * service's `options.isSystem === true` write (Contract §2.1 / G2), restricted to a STRICT
 * whitelist of payment columns; every frozen field stays untouchable.
 *
 * Layering (Contract §2 orchestration variant): no Repository/Policy of its own — every write goes
 * through DynamicTableService, which already enforces `canManageData`. The settlement entry (baixa
 * de A Receber) is booked POST-COMMIT via SalonSaleSettlementBridge — never inside the DynamicTable
 * engine (§2.1 / G1) and never inside a transaction (it opens its own root tx). A bridge failure is
 * non-fatal: the payment stands and reconciliation re-drives the settlement idempotently.
 */
export class RegisterPaymentService {
  constructor(
    private readonly dynamicTableService: DynamicTableService,
    private readonly repository: IDynamicTableRepository,
    private readonly packageBalanceService: PackageBalanceService,
  ) {}

  /**
   * Register payment for a Finalized sale: paymentStatus → Paid (+ payment audit) via an isSystem
   * write, then trigger the post-commit settlement bridge. Idempotent: a sale already Paid is not
   * re-written; the bridge is still re-fired (best-effort, dedup-safe) so a previously-failed
   * settlement still books.
   */
  async registerPayment(user: UserContext, input: RegisterPaymentInput) {
    // Resolve THIS tenant's salon `sales` table (tenant-scoped via user.userId → NotFoundError).
    const salesTable = await this.repository.findTableByInternalName(user.userId, 'sales');
    if (!salesTable) {
      throw new NotFoundError(`Sales table 'sales' is not installed for this user.`);
    }

    // Cross-tenant read guard (mirrors SalesCancellationService): findDataById is NOT tenant-scoped,
    // so a foreign/mismatched saleId is treated as non-existent (no PII leak, no enumeration). Also
    // assert the client-supplied tableId matches the authoritative one.
    const saleRow = await this.repository.findDataById(input.saleId);
    if (!saleRow || saleRow.dynamicTableId !== salesTable.id || salesTable.id !== input.tableId) {
      throw new NotFoundError(`Sale '${input.saleId}' não foi encontrada.`);
    }

    const data = saleRow.data as Record<string, unknown>;

    // Only a Finalized sale can be paid (D0: source state = Finalized).
    if (data.status !== 'Finalized') {
      throw new ValidationError(
        `Apenas uma venda Finalizada pode ser paga (estado atual: ${String(data.status)}).`,
      );
    }

    // Consumption context (Incremento G P5): a 'Package Balance' payment draws the customer's
    // prepaid balance for input.packageId. customerId/unitId come from the sale header.
    const unitId = typeof data.unitId === 'string' ? data.unitId : '';
    const customerId = typeof data.customerId === 'string' ? data.customerId : '';
    const isPackageBalance = input.paymentMethod === 'Package Balance';

    // Idempotent success: already Paid → do NOT re-write. Re-fire the settlement bridge (best-effort,
    // the posting engine dedupes) so a previously-failed settlement still books. The balance debit is
    // also re-driven (idempotent per (saleId,'debit')) in case it failed the first time, then return.
    if (data.paymentStatus === 'Paid') {
      logger.info('Salon sale already Paid — payment registration is idempotent', {
        saleId: input.saleId,
      });
      await maybeSyncSalonSaleSettled(user, salesTable.id, saleRow);
      if (isPackageBalance) {
        await this.debitPackageBalanceBestEffort(user, {
          unitId,
          customerId,
          packageId: input.packageId,
          totalAmount: data.totalAmount,
          saleId: input.saleId,
        });
      }
      return saleRow;
    }

    // Sufficiency HARD-GATE (P5, pre-write): a 'Package Balance' payment must NOT mark the sale Paid
    // unless the balance can cover it. assertSufficient throws ValidationError → no write, no
    // settlement, no debit. The atomic post-commit debit is the authoritative guard that keeps
    // balanceCents >= 0; this read-check gives fast, clean user feedback up front.
    if (isPackageBalance) {
      if (!input.packageId) {
        throw new ValidationError('packageId é obrigatório para pagamento com saldo de pacote.');
      }
      if (!unitId) throw new ValidationError('Venda sem unitId — saldo de pacote não pode ser consumido.');
      if (!customerId) throw new ValidationError('Venda sem cliente — saldo de pacote não pode ser consumido.');
      const amountCents = this.toCents(data.totalAmount, input.saleId);
      const scope = resolveAccountingScope(user, unitId);
      await this.packageBalanceService.assertSufficient(scope, customerId, input.packageId, amountCents);
    }

    // Build the STRICT whitelist patch (JSON columns — no migration). NEVER spread the payload:
    // only the five payment columns are written; frozen fields can never be touched (G2).
    const patch: Record<string, unknown> = {
      paymentStatus: 'Paid',
      paymentMethod: input.paymentMethod,
      paidAt: input.paidAt ?? new Date().toISOString(),
      paidByUserId: user.userId,
    };
    if (input.paymentReference !== undefined) patch.paymentReference = input.paymentReference;
    // Persist the consumed package (P6): the reconcile needs it to re-drive a missing balance
    // debit — it must NEVER be inferred. Written only for Package Balance; absent otherwise.
    if (isPackageBalance && input.packageId) patch.paidWithPackageId = input.packageId;

    // isSystem: the row is Finalized (immutableAfter scope:'all') and paidAt/paidByUserId/
    // paymentReference are readOnly — this is a server-orchestrated transition, not a user edit (G2).
    const updated = await this.dynamicTableService.updateTableData(
      user,
      input.saleId,
      { data: patch },
      { isSystem: true },
    );

    logger.info('Salon sale payment registered', {
      saleId: input.saleId,
      paymentMethod: input.paymentMethod,
    });

    // POST-COMMIT settlement (§2.1: integration above the engine, not inside it). Best-effort and
    // non-fatal — the payment is already committed; reconciliation re-drives a failed settlement
    // idempotently. salesTable.id is authoritative (verified above).
    await maybeSyncSalonSaleSettled(user, salesTable.id, updated);

    // POST-COMMIT balance debit (P5): draws the prepaid balance for a Package Balance consumption.
    // Best-effort and non-fatal — the payment is committed; reconcile re-drives a missing debit.
    if (isPackageBalance) {
      await this.debitPackageBalanceBestEffort(user, {
        unitId,
        customerId,
        packageId: input.packageId,
        totalAmount: data.totalAmount,
        saleId: input.saleId,
      });
    }

    return updated;
  }

  /** Money boundary: a DynamicTable float `totalAmount` → positive safe-integer cents. */
  private toCents(totalAmount: unknown, saleId: string): number {
    if (typeof totalAmount !== 'number' || !Number.isFinite(totalAmount)) {
      throw new ValidationError(`Valor da venda '${saleId}' inválido para consumo de saldo de pacote.`);
    }
    const cents = Math.round(totalAmount * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) {
      throw new ValidationError(
        `Valor da venda '${saleId}' fora da faixa válida para consumo de saldo de pacote.`,
      );
    }
    return cents;
  }

  /**
   * Post-commit balance debit for a Package Balance consumption. Best-effort: a failure (transient,
   * or an insufficient-at-debit race after assertSufficient passed) is logged and left for
   * reconciliation — it must NOT throw, because the payment is already committed. Idempotent per
   * (saleId,'debit'); the atomic decrement guarantees balanceCents never goes negative.
   */
  private async debitPackageBalanceBestEffort(
    user: UserContext,
    args: { unitId: string; customerId: string; packageId?: string; totalAmount: unknown; saleId: string },
  ): Promise<void> {
    try {
      if (!args.unitId || !args.customerId || !args.packageId) {
        logger.warn('Package balance debit skipped — missing unitId/customerId/packageId', {
          saleId: args.saleId,
        });
        return;
      }
      const amountCents = this.toCents(args.totalAmount, args.saleId);
      const scope = resolveAccountingScope(user, args.unitId);
      await this.packageBalanceService.debitForConsumption(scope, {
        customerId: args.customerId,
        packageId: args.packageId,
        saleId: args.saleId,
        amountCents,
      });
    } catch (debitError) {
      logger.error('Package balance debit failed post-commit — left for reconciliation', {
        saleId: args.saleId,
        error: debitError instanceof Error ? debitError.message : String(debitError),
      });
    }
  }
}
