import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import { maybeSyncSalonSaleSettled } from '../../accounting/sync/bridges/SalonSaleSettlementBridge';
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

    // Idempotent success: already Paid → do NOT re-write. Re-fire the bridge (best-effort, the
    // posting engine dedupes) so a settlement that previously failed still books, then return as-is.
    if (data.paymentStatus === 'Paid') {
      logger.info('Salon sale already Paid — payment registration is idempotent', {
        saleId: input.saleId,
      });
      await maybeSyncSalonSaleSettled(user, salesTable.id, saleRow);
      return saleRow;
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

    return updated;
  }
}
