/**
 * SalesPlugin
 *
 * Thin orchestrator for the Sales subsystem. Wires the lifecycle hooks to the focused
 * modules under ./sales/. Validation that can be expressed declaratively (field formats,
 * ranges, immutability, status transitions) lives in the schema, not here — this plugin
 * only coordinates side-effects and cross-table business rules that cannot.
 *
 * Modules:
 * - sales/saleItems     — item validation (XOR, no-mix), loading, parent-finalized guard
 * - sales/stockSync     — reservations, stock deltas and inventory movements
 * - sales/appointmentSync — appointment coherence / auto-create / cancellation
 * - sales/commissions   — commission materialization and reversal
 * - sales/customerMetrics — customer revenue aggregates and new/loyal flags
 */
import type { RulePlugin } from '../RuleTypes';
import { ValidationError } from '../../../../lib/errors';
import { tableMatches } from '../shared/tableFinder';
import { SALE_KEYS } from './sales/shared';
import {
  loadSaleItems,
  validateSaleItemXor,
  validateNoMixedItemTypesOnInsert,
  assertParentSaleNotFinalized,
  deleteSaleIfFirstItem,
} from './sales/saleItems';
import {
  hasInventorySystem,
  readProductUnit,
  ensureReservationAvailability,
  resolveProductUnitId,
  ensureSufficientStock,
  adjustReservationForItemChange,
  processSaleStockUpdate,
  createMovementsForItems,
} from './sales/stockSync';
import { findSaleById } from './sales/shared';
import { applyCustomerRevenueSideEffects } from './sales/customerMetrics';
import { materializeCommissions, cancelCommissionsForSale } from './sales/commissions';
import {
  assertServiceAppointmentsReady,
  validateServiceAppointmentCoherence,
  cancelLinkedAppointmentsIfScheduled,
  autoCreateAppointmentForServiceItem,
} from './sales/appointmentSync';

import type { RuleContext } from '../RuleTypes';

// Sale-subsystem table keys used by hook branch detection.
const SCHEMA_KEYS = SALE_KEYS;

/** True when the current table is the Sale Items table (intra-plugin branch). */
const isSaleItemsTable = (ctx: RuleContext) =>
  tableMatches(ctx.table, { internalNames: [SCHEMA_KEYS.ITEMS], names: ['Sale Items', 'Itens da Venda'] });

/** True when the current table is the Sale header table (intra-plugin branch). */
const isSaleHeaderTable = (ctx: RuleContext) =>
  tableMatches(ctx.table, { internalNames: [SCHEMA_KEYS.SALES], names: ['Sales', 'sales', 'Vendas'] });

export const SalesPlugin: RulePlugin = {
  name: 'SalesPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, {
      categories: ['sales', 'finance'],
      internalNames: [SCHEMA_KEYS.SALES, SCHEMA_KEYS.ITEMS],
      names: ['Sales', 'sales', 'Sale Items', 'Vendas', 'Itens da Venda'],
    });
  },
  async beforeUpdate(ctx) {
    const isItemsTable = isSaleItemsTable(ctx);
    if (isItemsTable) {
      await assertParentSaleNotFinalized(ctx);
      await validateSaleItemXor(ctx, ctx.after as any);
      // Validação adicional para itens de serviço em edição: coerência do agendamento com serviço/responsável/unidade
      const after: any = ctx.after as any;
      const isService = !!after?.serviceId || (after?.type && String(after.type) === 'Service');
      if (isService) {
        const saleId = String(after?.saleId || (ctx.before as any)?.saleId || '');
        const sale = await findSaleById(ctx, saleId);
        const saleUnitId = String((sale?.data as any)?.unitId || '');
        await validateServiceAppointmentCoherence(ctx, after, saleUnitId);
      }
      return;
    }
    const prevStatus = String(ctx.before?.status || 'Draft');
    let nextStatus = String(ctx.after?.status || prevStatus);
    const prevPayment = String(ctx.before?.paymentStatus || 'Pending');
    const nextPayment = String(ctx.after?.paymentStatus || prevPayment);

    // Detect deltas
    let statusChanging = prevStatus !== nextStatus;
    const paymentChanging = prevPayment !== nextPayment;

    // If payment is moving to Paid, force status to Finalized first, avoiding false-positive blocks
    if (paymentChanging && nextPayment === 'Paid' && nextStatus !== 'Finalized') {
      (ctx.after as any).status = 'Finalized';
      nextStatus = 'Finalized';
      statusChanging = prevStatus !== nextStatus;
    }

    // Block status changes when paid, except to keep or become Finalized
    if (statusChanging && (prevPayment === 'Paid' || nextPayment === 'Paid') && nextStatus !== 'Finalized') {
      throw new ValidationError('Venda paga não permite alteração de status (exceto finalizar).');
    }

    // Restringe transições a partir de Finalized
    if (statusChanging && prevStatus === 'Finalized' && nextStatus !== 'Finalized' && !(nextStatus === 'Cancelled' || nextStatus === 'Returned')) {
      throw new ValidationError('Transição inválida: vendas finalizadas só podem ir para Cancelled ou Returned.');
    }

    // Bloqueia cancelamento quando já está pago (ou sendo marcado como pago nesta mudança)
    if (statusChanging && (prevPayment === 'Paid' || nextPayment === 'Paid') && nextStatus === 'Cancelled') {
      throw new ValidationError('Não é possível cancelar uma venda já paga.');
    }

    // Se marcar como pago e ainda não finalizada, finalize automaticamente
    if (paymentChanging && nextPayment === 'Paid' && nextStatus !== 'Finalized') {
      (ctx.after as any).status = 'Finalized';
    }

    // Recalculate dueDate when paymentTermDays or date changes
    const after = ctx.after as any;
    const before = ctx.before as any;
    const newTermDays = Number(after?.paymentTermDays ?? before?.paymentTermDays ?? 0);
    const newDate = after?.date || before?.date;
    const termChanged = after?.paymentTermDays !== undefined && after?.paymentTermDays !== before?.paymentTermDays;
    const dateChanged = after?.date !== undefined && after?.date !== before?.date;
    if ((termChanged || dateChanged) && newTermDays > 0 && newDate) {
      const baseDate = new Date(newDate);
      baseDate.setDate(baseDate.getDate() + newTermDays);
      (ctx.after as any).dueDate = baseDate.toISOString().split('T')[0];
    }

    if (String((ctx.after as any)?.status || nextStatus) === 'Finalized' && (statusChanging || (paymentChanging && nextPayment === 'Paid'))) {
      // Must have items and totals consistent
      const { items } = await loadSaleItems(ctx);
      if (items.length === 0) {
        throw new ValidationError('Não é possível finalizar uma venda sem itens.');
      }
      // Validate discount <= subtotal
      const currentData = (ctx.after as any) || (ctx.before as any) || {};
      const discount = Number((currentData?.discountAmount ?? 0) as any) || 0;
      let subtotal = 0;
      for (const it of items) {
        const isProduct = (it.data?.type ? String(it.data.type) === 'Product' : !!it.data?.productId);
        const qty = isProduct ? Number(it.data?.quantity || 1) : 1;
        const price = Number(it.data?.unitPrice || 0);
        subtotal += qty * price;
      }
      if (discount > subtotal) {
        throw new ValidationError('Desconto não pode ser maior que o subtotal.');
      }
      // Customer requirement
      const simple = Boolean((ctx.after as any)?.simpleCustomer || (ctx.before as any)?.simpleCustomer);
      const simpleName = String((ctx.after as any)?.simpleCustomerName || (ctx.before as any)?.simpleCustomerName || '').trim();
      const custId = String((ctx.after as any)?.customerId || (ctx.before as any)?.customerId || '').trim();
      if (!simple && !custId) {
        throw new ValidationError('Informe um cliente (relacional) ou habilite "cliente simples" com um nome.');
      }
      if (simple && !simpleName) {
        throw new ValidationError('Nome do "cliente simples" é obrigatório quando habilitado.');
      }

      // Serviços precisam ter agendamento pronto antes de finalizar
      await assertServiceAppointmentsReady(ctx, items);

      // Stock checks
      // If inventory system exists, enforce stock presence and sufficiency
      const hasInventory = await hasInventorySystem(ctx);
      for (const it of items) {
        const isProduct = (it.data?.type ? String(it.data.type) === 'Product' : !!it.data?.productId);
        if (!isProduct) continue;
        if (hasInventory) {
          const productUnitId = await resolveProductUnitId(ctx, String(it.data?.productId || ''), String((ctx.after as any)?.unitId || (ctx.before as any)?.unitId || ''));
          if (!productUnitId) {
            throw new ValidationError('Produto sem estoque: cadastre o produto no estoque (Product Units) antes de vender.');
          }
          await ensureSufficientStock(ctx, productUnitId, Number(it.data.quantity || 0));
        }
      }
    }
  },
  async beforeCreate(ctx) {
    const isSalesTable = isSaleHeaderTable(ctx);
    if (isSalesTable) {
      const after = ctx.after as any;

      // Validate unitId is required
      const unitId = String(after?.unitId || '').trim();
      if (!unitId) {
        throw new ValidationError('Unidade de negócio é obrigatória para criar uma venda.');
      }

      // Auto-fill date with today if not provided
      if (!after?.date) {
        (ctx.after as any).date = new Date().toISOString().split('T')[0];
      }

      // Calculate dueDate from paymentTermDays if provided
      const paymentTermDays = Number(after?.paymentTermDays || 0);
      if (paymentTermDays > 0) {
        const baseDate = new Date(after?.date || new Date());
        baseDate.setDate(baseDate.getDate() + paymentTermDays);
        (ctx.after as any).dueDate = baseDate.toISOString().split('T')[0];
      }

      return;
    }
    const isItemsTable = isSaleItemsTable(ctx);
    if (isItemsTable) {
      await assertParentSaleNotFinalized(ctx);
      await validateSaleItemXor(ctx, ctx.after as any);
      // Enforce homogeneous sale: cannot mix product and service items in the same sale
      await validateNoMixedItemTypesOnInsert(ctx, ctx.after as any);

      // Validate stock/reservation / appointment BEFORE creating the item.
      // If it fails and the sale has no other items, delete the sale (server-side rollback for first-item failure).
      const after: any = ctx.after as any;
      const isProduct = !!after?.productId || (after?.type && String(after.type) === 'Product');
      const isService = !!after?.serviceId || (after?.type && String(after.type) === 'Service');
      if (isService) {
        const saleId = String(after?.saleId || '');
        const sale = await findSaleById(ctx, saleId);
        const saleUnitId = String((sale?.data as any)?.unitId || '');
        const requiresAppointment = Boolean(after?.requiresAppointment);
        let apptId = String(after?.appointmentId || '');

        try {
          // Se o item exigir agendamento e ainda não houver appointmentId, cria automaticamente
          if (requiresAppointment && !apptId) {
            apptId = await autoCreateAppointmentForServiceItem(ctx, after, saleUnitId, sale);
            (ctx.after as any).appointmentId = apptId;
          }
          // Quando houver appointmentId (manual ou automático), valida coerência com serviço/responsável/unidade
          if (apptId) {
            await validateServiceAppointmentCoherence(ctx, { ...after, appointmentId: apptId }, saleUnitId);
          }
        } catch (err) {
          // Se falhar na primeira criação de item, remove a venda para evitar draft órfão
          await deleteSaleIfFirstItem(ctx, saleId);
          throw err;
        }
        return;
      }
      if (!isProduct) return;

      const saleId = String(after?.saleId || '');
      if (!saleId) return;

      const sale = await findSaleById(ctx, saleId);
      const unitId = String((sale?.data as any)?.unitId || '');

      const hasInv = await hasInventorySystem(ctx);
      if (!hasInv) return;

      try {
        const pid = String(after?.productId || '');
        const qty = Number(after?.quantity || 0);
        const { entry } = await readProductUnit(ctx, pid, unitId);
        if (!entry) {
          throw new ValidationError('Produto sem estoque: cadastre o produto no estoque (Product Units) antes de vender.');
        }
        if (qty > 0) {
          await ensureReservationAvailability(ctx, pid, unitId, qty);
        }
      } catch (err) {
        // If this is the first item being added (no other items yet), delete the just-created sale to avoid orphan draft
        await deleteSaleIfFirstItem(ctx, saleId);
        throw err;
      }
    }
  },
  async afterCreate(ctx) {
    // Reserva estoque ao adicionar item de produto em venda não finalizada
    const isItemsTable = isSaleItemsTable(ctx);
    if (isItemsTable) {
      await adjustReservationForItemChange(ctx, null, ctx.after as any);
    }
  },
  async afterDelete(ctx) {
    const isItemsTable = isSaleItemsTable(ctx);
    if (isItemsTable) {
      await adjustReservationForItemChange(ctx, ctx.before as any, null);
      // Cancel linked appointment if it was still Scheduled
      const before: any = ctx.before as any;
      const isService = !!before?.serviceId || (before?.type && String(before.type) === 'Service');
      if (isService && before?.appointmentId) {
        await cancelLinkedAppointmentsIfScheduled(ctx, [{ id: String(before?.id || ''), data: before }]);
      }
    }
  },
  async beforeDelete(ctx) {
    const isItemsTable = isSaleItemsTable(ctx);
    if (isItemsTable) {
      await assertParentSaleNotFinalized(ctx);
    }
  },
  async afterUpdate(ctx) {
    const isItemsTable = isSaleItemsTable(ctx);
    if (isItemsTable) {
      await adjustReservationForItemChange(ctx, ctx.before as any, ctx.after as any);
      return;
    }
    const prevStatus = String(ctx.before?.status || 'Draft');
    const nextStatus = String(ctx.after?.status || prevStatus);

    // Sempre recompute totais após update (status ou pagamento), baseado nos itens atuais
    const { items, saleUnitId } = await loadSaleItems(ctx);
    let subtotal = 0;
    for (const it of items) {
      const isProduct = (it.data?.type ? String(it.data.type) === 'Product' : !!it.data?.productId);
      const qty = isProduct ? Number(it.data?.quantity || 1) : 1;
      const price = Number(it.data?.unitPrice || 0);
      subtotal += qty * price;
    }
    // Merge values without clobbering unrelated data
    const currentData = (ctx.after as any) || (ctx.before as any) || {};
    const discount = Number((currentData?.discountAmount ?? 0) as any) || 0;
    const merged = { ...currentData, subtotal, totalAmount: Math.max(0, subtotal - discount) } as any;

    // Atualiza métricas agregadas do cliente e flags de receita nova/recorrente na venda
    await applyCustomerRevenueSideEffects(ctx, ctx.before as any, merged, prevStatus, nextStatus);

    await ctx.repository.updateData(String((ctx.after as any)?.id || (ctx.before as any)?.id), merged);

    // Se status não mudou mas pagamento mudou para Paid, já tratamos auto-finalização em beforeUpdate.
    if (prevStatus === nextStatus) {
      return;
    }

    if (nextStatus === 'Finalized') {
      await assertServiceAppointmentsReady(ctx, items);
      // Libera reservas e aplica o estoque em uma única operação atômica
      await processSaleStockUpdate(ctx, items, saleUnitId, prevStatus, nextStatus);
      await createMovementsForItems(ctx, items, saleUnitId, 'Out');
      // Materializa comissões para os itens com responsável e taxa definidos
      await materializeCommissions(ctx, items, prevStatus, nextStatus);
    }
    if (nextStatus === 'Cancelled' || nextStatus === 'Returned') {
      // Libera reservas e retorna o estoque se necessário, de forma atômica
      await processSaleStockUpdate(ctx, items, saleUnitId, prevStatus, nextStatus);
      await createMovementsForItems(ctx, items, saleUnitId, 'In');
      // Propagar cancelamento para agendamentos ainda Scheduled
      await cancelLinkedAppointmentsIfScheduled(ctx, items);
      // Cancelar comissões pendentes/aprovadas geradas por esta venda
      await cancelCommissionsForSale(ctx, prevStatus, nextStatus);
    }
  },
};
