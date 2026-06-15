import type { RuleContext } from '../../RuleTypes';
import type { IDynamicTableData, ISchemaField } from '../../../models/DynamicTable.model';
import { ValidationError } from '../../../../../lib/errors';
import { resolveTable } from '../../shared/tableFinder';
import { findSaleById } from './shared';

/** Heuristic shape of a Product Units table (for custom tables without internalName). */
const PRODUCT_UNITS_MATCH = (fields: ISchemaField[]): boolean => {
  const names = new Set(fields.map(f => f.name));
  return names.has('stock') && names.has('productId') && names.has('unitId');
};

/** Resolve the Product Units table id (indexed-first, schema heuristic fallback). */
async function findProductUnitsTableId(ctx: RuleContext): Promise<string | null> {
  const t = await resolveTable(ctx, {
    internalName: 'productUnits',
    category: 'inventory',
    schemaMatch: PRODUCT_UNITS_MATCH,
  });
  return t?.id ?? null;
}

/**
 * Maintain reservation consistency on item create/update/delete while sale is not finalized.
 * - When product changes: remove old reservation, ensure and apply new reservation
 * - When qty changes: apply delta to reservations (with availability check when increasing)
 */
export async function adjustReservationForItemChange(ctx: RuleContext, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  // Apenas para itens de produto e vendas não finalizadas
  const saleId = String((after?.saleId ?? before?.saleId) || '');
  if (!saleId) return;
  const sale = await findSaleById(ctx, saleId);
  const saleData = (sale?.data as Record<string, unknown>) ?? {};
  const saleStatus = String(saleData.status || 'Draft');
  if (saleStatus === 'Finalized' || saleStatus === 'Cancelled' || saleStatus === 'Returned') return;

  const hasInventory = await hasInventorySystem(ctx);
  if (!hasInventory) return;

  const unitId = String(saleData.unitId || '');
  const beforeIsProduct = !!before?.productId || (before?.type && String(before.type) === 'Product');
  const afterIsProduct = !!after?.productId || (after?.type && String(after.type) === 'Product');

  const beforeQty = beforeIsProduct ? Number(before?.quantity || 0) : 0;
  const afterQty = afterIsProduct ? Number(after?.quantity || 0) : 0;
  const beforePid = beforeIsProduct ? String(before?.productId || '') : '';
  const afterPid = afterIsProduct ? String(after?.productId || '') : '';

  // Se produto mudou, zera antiga e aplica nova
  if (beforePid && beforePid !== afterPid) {
    await applyReservationDelta(ctx, beforePid, unitId, -beforeQty);
    if (afterPid) {
      await ensureReservationAvailability(ctx, afterPid, unitId, afterQty);
      await applyReservationDelta(ctx, afterPid, unitId, +afterQty);
    }
    return;
  }

  // Mesmo produto: aplica delta de quantidade
  const pid = afterPid || beforePid;
  if (!pid) return;

  // Se o produto foi alterado, trata como remoção do antigo e adição do novo
  if (beforePid && beforePid !== afterPid) {
    await applyReservationDelta(ctx, beforePid, unitId, -beforeQty);
    await ensureReservationAvailability(ctx, afterPid, unitId, afterQty);
    await applyReservationDelta(ctx, afterPid, unitId, afterQty);
    return;
  }

  // Se for o mesmo produto, aplica o delta na quantidade
  const delta = afterQty - beforeQty;
  if (delta === 0) return;
  if (delta > 0) {
    await ensureReservationAvailability(ctx, pid, unitId, delta);
  }
  await applyReservationDelta(ctx, pid, unitId, delta);
}

/** Ensure stock - reserved >= delta before increasing reservation. */
export async function ensureReservationAvailability(ctx: RuleContext, productId: string, unitId: string, delta: number) {
  // Bypassa validação para operações de sistema (Seed)
  if (ctx.isSystem) return;

  // Garante que há disponibilidade: stock - reserved >= delta
  const { entry } = await readProductUnit(ctx, productId, unitId);
  if (!entry) return; // Se não há estoque, não há o que reservar. A falha ocorrerá ao finalizar.
  const d = entry.data as Record<string, unknown>;
  const stock = Number(d?.stock ?? 0);
  const reserved = Number(d?.reserved ?? 0);
  const available = stock - reserved;
  if (available < delta) {
    throw new ValidationError(`Estoque insuficiente (disponível: ${available}) para reservar ${delta} unidades.`);
  }
}

/** Apply a reservation delta (can be negative) clamped to non-negative. */
async function applyReservationDelta(ctx: RuleContext, productId: string, unitId: string, delta: number) {
  if (!delta) return;
  const { entry, tableId } = await readProductUnit(ctx, productId, unitId);
  if (!entry || !tableId) return;
  const d = entry.data as Record<string, unknown>;
  const current = Number(d?.reserved ?? 0);
  const next = Math.max(0, current + delta);
  await ctx.repository.updateData(String(entry.id), { ...d, reserved: next });
}

/** Read the Product Units entry for a (productId, unitId) pair and return row and table id. */
export async function readProductUnit(ctx: RuleContext, productId: string, unitId: string): Promise<{ entry: IDynamicTableData | null; tableId: string | null }> {
  const productUnitsTableId = await findProductUnitsTableId(ctx);
  if (!productUnitsTableId) return { entry: null, tableId: null };
  const rows = await ctx.repository.findRowsByFieldValue(productUnitsTableId, 'productId', String(productId));
  const entry = rows.find((e: IDynamicTableData) => String((e.data as Record<string, unknown>)?.unitId || '') === String(unitId)) || null;
  return { entry, tableId: productUnitsTableId };
}

/** Validate that a product unit has at least qtyNeeded stock. */
export async function ensureSufficientStock(ctx: RuleContext, productUnitId: string, qtyNeeded: number) {
  // Bypassa validação para operações de sistema (Seed)
  if (ctx.isSystem) return;
  // Sem controle de estoque no sistema → nada a validar.
  if (!(await findProductUnitsTableId(ctx))) return;
  const entry = await ctx.repository.findDataById(String(productUnitId));
  const current = Number((entry?.data as Record<string, unknown>)?.stock ?? 0);
  if (current < qtyNeeded) {
    throw new ValidationError('Estoque insuficiente para concluir a venda.');
  }
}

/** Resolve the productUnits row id for a product (optionally for a specific sale unit). */
export async function resolveProductUnitId(ctx: RuleContext, productId: string, saleUnitId?: string): Promise<string> {
  const productUnitsTableId = await findProductUnitsTableId(ctx);
  if (!productUnitsTableId) return '';
  const candidates = await ctx.repository.findRowsByFieldValue(productUnitsTableId, 'productId', String(productId));
  // Se não houver unidades de produto para este produto, tolera ausência de estoque e pula movimentações
  if (candidates.length === 0) return '';
  if (saleUnitId) {
    const match = candidates.find((e: IDynamicTableData) => String((e.data as Record<string, unknown>)?.unitId || '') === String(saleUnitId));
    if (match) return String(match.id);
  }
  // fallback: first available productUnit
  return String(candidates[0].id);
}

/** Create inventory movements for product items (In or Out) and avoid duplicates by (sourceType, sourceId, detailKey). */
export async function createMovementsForItems(ctx: RuleContext, items: Array<{ id: string; data: Record<string, unknown> }>, saleUnitId?: string, type: 'In' | 'Out' = 'Out') {
  // Find movements table and whether it requires unitId; if not present, skip silently
  const mv = await findMovementsTable(ctx);
  if (!mv) return;
  for (const it of items) {
    const isProduct = (it.data?.type ? String(it.data.type) === 'Product' : !!it.data?.productId);
    if (!isProduct) continue;
    const productUnitId = await resolveProductUnitId(ctx, String(it.data?.productId || ''), String(saleUnitId || ''));
    const quantity = Number(it.data?.quantity || 0);
    // Se não há controle de estoque (sem productUnitId), não gera movimentação
    if (!productUnitId || quantity <= 0) continue;
    // Resolve productId from productUnit
    const productId = await resolveProductIdFromProductUnit(ctx, productUnitId);
    const saleId = String(ctx.after?.id || ctx.before?.id || '');
    const reason = type === 'Out' ? 'SALE' : 'RETURN';
    const payload: Record<string, unknown> = { productId, type, quantity, date: new Date().toISOString(), reason, sourceId: saleId, detailKey: `${it.id}-${type}` };
    if (mv.hasUnitId) {
      if (!saleUnitId) throw new ValidationError('unitId é obrigatório para movimentações neste sistema.');
      payload.unitId = saleUnitId;
    }
    if (!(await movementExists(ctx, mv.id, String(payload.sourceId || ''), String(payload.detailKey || '')))) {
      await ctx.repository.createData(mv.id, payload);
    }
  }
}

/** Resolve productId from a productUnits row id. */
async function resolveProductIdFromProductUnit(ctx: RuleContext, productUnitId: string): Promise<string> {
  const entry = await ctx.repository.findDataById(String(productUnitId));
  const pid = String((entry?.data as Record<string, unknown>)?.productId || '');
  if (!pid) throw new ValidationError('productId não encontrado para o item de produto.');
  return pid;
}

/** Detect presence of an inventory system by structure of tables in the workspace. */
export async function hasInventorySystem(ctx: RuleContext): Promise<boolean> {
  return (await findProductUnitsTableId(ctx)) !== null;
}

/** Locate a stock movements table by schema and report whether unitId is required. */
async function findMovementsTable(ctx: RuleContext): Promise<{ id: string; hasUnitId: boolean } | null> {
  const t = await resolveTable(ctx, {
    internalName: 'stockMovements',
    category: 'inventory',
    // Movements: productId+type+quantity, but NOT a Product Units table (no stock+reserved).
    schemaMatch: (fields) => {
      const names = new Set(fields.map(f => f.name));
      if (names.has('stock') && names.has('reserved')) return false;
      return names.has('productId') && names.has('type') && names.has('quantity');
    },
  });
  if (!t) return null;
  const hasUnitId = (t.schema?.fields || []).some((f) => f.name === 'unitId');
  return { id: t.id, hasUnitId };
}

/** Check if a movement already exists for (sourceId, detailKey). */
async function movementExists(ctx: RuleContext, movementsTableId: string, sourceId: string, detailKey: string): Promise<boolean> {
  const rows = await ctx.repository.findRowsByFieldValue(movementsTableId, 'sourceId', String(sourceId));
  return rows.some((r: IDynamicTableData) => (r.data as Record<string, unknown>)?.detailKey === detailKey);
}

/**
 * Apply stock/reservation deltas according to sale status transitions in an atomic manner.
 * - Finalized: stock -= qty, reserved -= qty
 * - Cancelled/Returned: reserved -= qty; if previously Finalized → stock += qty
 */
export async function processSaleStockUpdate(ctx: RuleContext, items: Array<{ id: string; data: Record<string, unknown> }>, saleUnitId: string | undefined, prevStatus: string, nextStatus: string) {
  const hasInventory = await hasInventorySystem(ctx);
  if (!hasInventory) return;
  const unitId = String(saleUnitId || '');

  // Idempotency guard: if this sale was already Finalized in the database, a retry or
  // double-apply (e.g. from a transaction rollback/retry scenario) must not re-apply
  // stock deltas. We re-read the persisted record rather than trusting ctx.before, which
  // may reflect the in-memory state before this transaction began.
  if (nextStatus === 'Finalized') {
    const saleId = String(ctx.after?.id || ctx.before?.id || '');
    if (saleId) {
      const currentSale = await ctx.repository.findDataById(saleId);
      if ((currentSale?.data as Record<string, unknown>)?.status === 'Finalized') {
        // Already processed — skip to avoid double stock deduction.
        return;
      }
    }
  }

  for (const it of items) {
    const isProduct = (it.data?.type ? String(it.data.type) === 'Product' : !!it.data?.productId);
    if (!isProduct) continue;

    const productId = String(it.data?.productId || '');
    const qty = Number(it.data?.quantity || 0);

    if (!productId || !qty) continue;

    const { entry, tableId } = await readProductUnit(ctx, productId, unitId);
    if (!entry || !tableId) continue;

    const d = entry.data as Record<string, unknown>;
    let stock = Number(d.stock ?? 0);
    let reserved = Number(d.reserved ?? 0);

    if (nextStatus === 'Finalized') {
      stock -= qty;
      reserved = Math.max(0, reserved - qty);
    } else if (nextStatus === 'Cancelled' || nextStatus === 'Returned') {
      reserved = Math.max(0, reserved - qty); // Sempre libera a reserva
      if (prevStatus === 'Finalized') {
        stock += qty; // Devolve ao estoque apenas se a venda já tinha sido finalizada
      }
    }

    if (stock < 0) {
      // Esta validação já ocorre em `beforeUpdate`, mas serve como uma camada extra de proteção.
      throw new ValidationError(`A operação resultaria em estoque negativo para o produto ${productId}.`);
    }

    await ctx.repository.updateData(String(entry.id), { ...d, stock, reserved });
  }
}
