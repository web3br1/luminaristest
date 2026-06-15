import type { RuleContext } from '../../RuleTypes';
import { resolveTable } from '../../shared/tableFinder';

/**
 * Atualiza métricas agregadas de receita no registro de cliente (Customers) e marca
 * flags de receita nova/recorrente na venda, com base em transições de status.
 *
 * Regra:
 * - Venda "efetiva" é aquela em status Finalized.
 * - Ao entrar em Finalized: incrementa contagem/valor do cliente e marca isNewCustomer/isLoyalCustomer.
 * - Ao sair de Finalized para Cancelled/Returned: reverte contagem/valor do cliente.
 */
export async function applyCustomerRevenueSideEffects(
  ctx: RuleContext,
  beforeSale: Record<string, unknown>,
  afterSale: Record<string, unknown>,
  prevStatus: string,
  nextStatus: string
): Promise<void> {
  const prevEffective = prevStatus === 'Finalized';
  const nextEffective = nextStatus === 'Finalized';
  if (prevEffective === nextEffective) {
    // Nenhuma mudança de contribuição desta venda para métricas de cliente
    return;
  }

  const customerId = String(afterSale?.customerId || beforeSale?.customerId || '').trim();
  if (!customerId) {
    // Vendas com cliente simples não alimentam agregados de Customers
    return;
  }

  const customersTable = await resolveTable(ctx, {
    internalName: 'customers',
    category: 'people',
    names: ['Customers', 'customers', 'Clientes'],
  });
  if (!customersTable) return;

  const customer = await ctx.repository.findDataById(customerId);
  if (!customer) return;

  const cData = (customer.data || {}) as Record<string, unknown>;
  const currentCount = Number(cData.totalSalesCount ?? 0) || 0;
  const currentAmount = Number(cData.totalSalesAmount ?? 0) || 0;

  const prevAmount = Number(beforeSale?.totalAmount ?? 0) || 0;
  const nextAmount = Number(afterSale?.totalAmount ?? prevAmount) || 0;

  let newCount = currentCount;
  let newAmount = currentAmount;

  if (!prevEffective && nextEffective) {
    newCount = currentCount + 1;
    newAmount = currentAmount + nextAmount;
  } else if (prevEffective && !nextEffective) {
    newCount = Math.max(0, currentCount - 1);
    newAmount = Math.max(0, currentAmount - prevAmount);
  }

  if (newCount === currentCount && newAmount === currentAmount) {
    return;
  }

  // Atualiza datas de primeira/última venda com base na data da venda atual
  const saleDateRaw = afterSale?.date || beforeSale?.date;
  const saleDate = saleDateRaw ? new Date(String(saleDateRaw)) : null;
  const existingFirst = cData.firstSaleAt ? new Date(String(cData.firstSaleAt)) : null;
  const existingLast = cData.lastSaleAt ? new Date(String(cData.lastSaleAt)) : null;

  let firstSaleAt = cData.firstSaleAt;
  let lastSaleAt = cData.lastSaleAt;

  if (saleDate && isFinite(saleDate.getTime())) {
    if (!existingFirst || saleDate < existingFirst) {
      firstSaleAt = saleDate.toISOString();
    }
    if (!existingLast || saleDate > existingLast) {
      lastSaleAt = saleDate.toISOString();
    }
  }

  // Heurística simples para lifecycleStage baseada no número de vendas e receita acumulada
  let lifecycleStage = String(cData.lifecycleStage ?? '') || undefined;
  if (newCount === 0) {
    lifecycleStage = 'Prospect';
  } else if (newCount === 1) {
    lifecycleStage = 'New';
  } else if (newCount > 1 && newCount <= 5) {
    lifecycleStage = 'Active';
  } else if (newCount > 5) {
    // Considera Loyal quando cliente tem histórico relevante
    lifecycleStage = 'Loyal';
  }

  // Flags de venda: nova e recorrente (fiel) com base no estado ANTES do update no cliente
  const isNewCustomerFlag = !prevEffective && nextEffective && currentCount === 0;
  const isLoyalCustomerFlag = nextEffective && lifecycleStage === 'Loyal';

  afterSale['isNewCustomer'] = isNewCustomerFlag;
  afterSale['isLoyalCustomer'] = isLoyalCustomerFlag;

  const patch: Record<string, unknown> = {
    ...cData,
    totalSalesCount: newCount,
    totalSalesAmount: newAmount,
    firstSaleAt,
    lastSaleAt,
    lifecycleStage,
  };

  await ctx.repository.updateData(String(customer.id), patch);
}
