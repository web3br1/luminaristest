import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import { maybeReverseSalonSale } from '../../accounting/sync/bridges/SalonSaleReversalBridge';
import type { CancelSaleInput, ReturnSaleInput } from '../dtos/SalesCancellationDto';

/**
 * SalesCancellationService — server-side orchestration of the salon-sale Cancelled / Returned
 * transitions (Incremento D), in the backend-workflow-transition-generator pattern (mirrors
 * CrmPipelineService.advanceStage/advanceOpportunity).
 *
 * The `sales` row is a DynamicTable record. Once it is `Finalized`, the preset's
 * immutableAfter `scope:'all'` locks the WHOLE row in the generic updateTableData path — so a
 * user can never flip a finalized sale. The ONLY legitimate bypass is a server-orchestrated
 * transition via `options.isSystem === true` (Contract §2.1 / G2), which this service performs.
 *
 * Layering (Contract §2 orchestration variant): no Repository/Policy of its own — every read/
 * write goes through DynamicTableService, which already enforces `canManageData` on writes.
 * The accounting effect (estorno / devolução) is applied POST-COMMIT via SalonSaleReversalBridge
 * — never inside the DynamicTable engine (§2.1 / G1) and never inside a transaction (it opens
 * its own root tx). A bridge failure is non-fatal: the transition stands and reconciliation
 * re-drives the accounting idempotently.
 */
export class SalesCancellationService {
  constructor(
    private readonly dynamicTableService: DynamicTableService,
    private readonly repository: IDynamicTableRepository,
  ) {}

  /** Cancel a finalized sale: status → Cancelled, then reverse its revenue (+ settlement). */
  async cancel(user: UserContext, input: CancelSaleInput) {
    return this.transition(user, input, 'Cancelled');
  }

  /** Return a finalized sale: status → Returned, then book the contra-revenue entry. */
  async return_(user: UserContext, input: ReturnSaleInput) {
    return this.transition(user, input, 'Returned');
  }

  /**
   * Shared transition: validate the source state, flip the status (+ audit fields) via an
   * isSystem write, then trigger the post-commit accounting bridge.
   */
  private async transition(
    user: UserContext,
    input: CancelSaleInput | ReturnSaleInput,
    target: 'Cancelled' | 'Returned',
  ) {
    // Resolve THIS tenant's salon `sales` table (tenant-scoped via user.userId → NotFoundError).
    const salesTable = await this.repository.findTableByInternalName(user.userId, 'sales');
    if (!salesTable) {
      throw new NotFoundError(`Sales table 'sales' is not installed for this user.`);
    }

    // Cross-tenant read guard (mirrors CrmPipelineService FIX 1, Contract §2): findDataById is
    // NOT tenant-scoped, so a foreign/mismatched saleId is treated as non-existent (no PII leak,
    // no enumeration). We also assert the client-supplied tableId matches the authoritative one.
    const saleRow = await this.repository.findDataById(input.saleId);
    if (!saleRow || saleRow.dynamicTableId !== salesTable.id || salesTable.id !== input.tableId) {
      throw new NotFoundError(`Sale '${input.saleId}' não foi encontrada.`);
    }

    const data = saleRow.data as Record<string, unknown>;

    // Only a Finalized sale can be cancelled or returned (D0: source state = Finalized).
    if (data.status !== 'Finalized') {
      throw new ValidationError(
        `Apenas uma venda Finalizada pode ser ${target === 'Cancelled' ? 'cancelada' : 'devolvida'} (estado atual: ${String(data.status)}).`,
      );
    }

    // Build the audit patch (JSON columns — no migration). reason/actor + the matching timestamp.
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { status: target, actor: user.userId };
    if (target === 'Cancelled') patch.cancelledAt = nowIso;
    else patch.returnedAt = nowIso;
    if (input.reason !== undefined) patch.reason = input.reason;

    // isSystem: the row is Finalized (immutableAfter scope:'all') and the audit fields are
    // readOnly — this is a server-orchestrated transition, not a direct user edit (G2).
    const updated = await this.dynamicTableService.updateTableData(
      user,
      input.saleId,
      { data: patch },
      { isSystem: true },
    );

    logger.info('Salon sale status transitioned', {
      saleId: input.saleId,
      from: 'Finalized',
      to: target,
    });

    // POST-COMMIT accounting effect (§2.1: integration above the engine, not inside it).
    // Best-effort and non-fatal — the transition is already committed; reconciliation re-drives
    // a failed reversal/return idempotently. salesTable.id is authoritative (verified above).
    await maybeReverseSalonSale(user, salesTable.id, updated);

    return updated;
  }
}
