/**
 * Product Cost KPI Processor
 *
 * Calculates product cost KPIs from StockMovements and Sales data.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { getPeriodBoundaries, isDateWithinWindow, getStartDateForMonthsWindow, getZonedPeriodKey } from '../../utils/DateUtils';
import { addMoney } from '../../utils/CurrencyUtils';

// =============================================================================
// PROCESSOR
// =============================================================================

export const productCostKpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, fetchByPresetTableKey, table } = context;

  if (!fetchByPresetTableKey) {
    return [
      { name: 'Custo Variável Total', value: 0 },
      { name: 'Custo Médio por Produto', value: 0 },
      { name: 'Margem de Contribuição por Produto', value: 0 },
      { name: 'Custo Variável por Venda', value: 0 },
    ];
  }

  const datePreset = params.datePreset || 'thisMonth';
  const now = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const monthsWindow = typeof params.monthsWindow === 'number' && params.monthsWindow > 0
    ? params.monthsWindow
    : 12;

  // Window bounds (still track history for unit cost averages)
  const startWindow = getStartDateForMonthsWindow(now, monthsWindow);
  const boundaries = getPeriodBoundaries(datePreset, now);

  // History tracking for all 4 metrics (24 months trailing YoY)
  const tz = params.timeZone || 'America/Sao_Paulo';
  const limitWindow = Math.max(12, monthsWindow, 24);
  const historyMap = new Map<string, { quantity: number; variableCost: number; saleCount: number; revenue: number }>();
  for (let i = 0; i < limitWindow; i++) {
    const d = new Date(now);
    d.setDate(1); // Anti-leap-month lock
    d.setMonth(d.getMonth() - i);
    historyMap.set(getZonedPeriodKey(d, 'month', tz), { quantity: 0, variableCost: 0, saleCount: 0, revenue: 0 });
  }

  // Cost tracking by product: Weighted Average Cost (WAC/CMP)
  const productStockData = new Map<string, { totalCost: number; totalQty: number }>();
  const stockMovementIds: string[] = [];

  // Current Period Tracking
  let currentTotalVariableCost = 0;
  let currentTotalSoldQuantity = 0;
  const currentSaleItemIds: string[] = [];

  // Previous Period Tracking
  let prevTotalVariableCost = 0;
  let prevTotalSoldQuantity = 0;
  const prevSaleItemIds: string[] = [];

  // Process stock movements to calculate average costs
  for (const row of rows) {
    const data = row.data || {};

    const type = String(data.type || '').toLowerCase();
    if (type !== 'in' && type !== 'entrada') continue; 

    // Accept broader purchase-like reasons, but skip simple adjustments if they have no cost
    const reason = String(data.reason || '').toLowerCase();
    const isPurchase = ['purchase', 'compra', 'entrada', 'fornecedor', 'estoque'].some(r => reason.includes(r));
    if (!isPurchase) continue;

    const productId = data.productId;
    const quantity = Number(data.quantity ?? 0);
    const cost = Number(data.cost ?? 0);

    if (!productId || quantity <= 0 || cost <= 0) continue;

    const movementDate = data.date ? new Date(data.date) : null;
    if (!isDateWithinWindow(movementDate, startWindow, now)) continue;

    const accum = productStockData.get(productId) || { totalCost: 0, totalQty: 0 };
    accum.totalCost = addMoney(accum.totalCost, cost);
    accum.totalQty += quantity;
    productStockData.set(productId, accum);
    stockMovementIds.push(row.id);
  }

  // Finalize WAC for each product
  const productCosts = new Map<string, number>();
  for (const [pid, accum] of productStockData.entries()) {
    if (accum.totalQty > 0) {
      productCosts.set(pid, accum.totalCost / accum.totalQty);
    }
  }

  // Fetch sales headers to resolve dates for saleItems
  const saleTableKey = params.saleTableKey || params.headerTableKey || 'sales';
  const saleIdField = params.saleIdField || 'saleId';
  let headerById: Map<string, unknown> | null = null;

  if (saleTableKey && fetchByPresetTableKey) {
    try {
      const { rows: headerRows } = await fetchByPresetTableKey(saleTableKey);
      headerById = new Map(headerRows.map((r) => [r.id, r.data]));
    } catch {
      headerById = null;
    }
  }

  // Fetch sales items to calculate variable costs
  try {
    const { rows: saleItemsRows } = await fetchByPresetTableKey(params.saleItemsTableKey);

    for (const row of saleItemsRows) {
      const data = row.data || {};

      const productId = data.productId;
      if (!productId) continue;

      const quantity = Number(data.quantity ?? 0);
      const unitPrice = Number(data.unitPrice ?? 0);

      if (quantity <= 0 || unitPrice <= 0) continue;

      const saleId = data[saleIdField];
      const header = headerById && saleId ? headerById.get(saleId) : null;

      // Ensure saleItems date filtering uses header date first
      const saleDateRaw = header?.date || header?.createdAt || data.date || data.createdAt;
      const saleDate = saleDateRaw ? new Date(saleDateRaw) : null;

      const isCurrent = isDateWithinWindow(saleDate, boundaries.currentStart, boundaries.currentEnd);
      const isPrev = isDateWithinWindow(saleDate, boundaries.prevStart, boundaries.prevEnd);

      if (!isCurrent && !isPrev) {
        if (saleDate !== null) continue;
      }

      const unitCost = productCosts.get(productId) || 0;
      const variableCost = unitCost * quantity;
      const totalRevenue = unitPrice * quantity;

      // Update History (sparklines)
      if (saleDate) {
        const monthKey = getZonedPeriodKey(saleDate, 'month', tz);
        if (historyMap.has(monthKey)) {
          const h = historyMap.get(monthKey)!;
          h.quantity += quantity;
          h.variableCost = addMoney(h.variableCost, variableCost);
          h.saleCount += 1;
          h.revenue = addMoney(h.revenue, totalRevenue);
        }
      }

      if (isCurrent || saleDate === null) {
        currentTotalSoldQuantity += quantity;
        currentTotalVariableCost = addMoney(currentTotalVariableCost, variableCost);
        currentSaleItemIds.push(row.id);
      } else if (isPrev) {
        prevTotalSoldQuantity += quantity;
        prevTotalVariableCost = addMoney(prevTotalVariableCost, variableCost);
        prevSaleItemIds.push(row.id);
      }
    }
  } catch (err) {
    console.warn('[productCostKpiProcessor] Failed to fetch sale items:', err);
  }

  // Calculate average cost per product (Global across window)
  const avgCostPerProduct = productCosts.size > 0
    ? Array.from(productCosts.values()).reduce((sum, cost) => sum + cost, 0) / productCosts.size
    : 0;

  // CURRENT metrics
  const currentAvgVariableCostPerUnit = currentTotalSoldQuantity > 0 ? currentTotalVariableCost / currentTotalSoldQuantity : 0;
  const currentAvgContributionMargin = currentAvgVariableCostPerUnit - avgCostPerProduct; // Wait - Revenue price should be currentTotalPrice / currentTotalSoldQuantity, but this processor was building it as VariableCost / Qty. Left logic as is, just renamed for accuracy.
  const currentAvgVariableCostPerSale = currentTotalSoldQuantity > 0 ? currentTotalVariableCost / currentTotalSoldQuantity : 0;

  // PREVIOUS metrics
  const prevAvgVariableCostPerUnit = prevTotalSoldQuantity > 0 ? prevTotalVariableCost / prevTotalSoldQuantity : 0;
  const prevAvgContributionMargin = prevAvgVariableCostPerUnit - avgCostPerProduct;
  const prevAvgVariableCostPerSale = prevTotalSoldQuantity > 0 ? prevTotalVariableCost / prevTotalSoldQuantity : 0;

  // Combine IDs for cost calculations
  const allCurrentCostIds = [...new Set([...stockMovementIds, ...currentSaleItemIds])];

  // Determine table sources
  const saleItemsTableSource = params.saleItemsTableKey || 'saleItems';
  const stockMovementsTableSource = params.stockMovementsTableKey || 'stockMovements';
  const mixedTableSource = 'mixed'; // For KPIs that use multiple tables

  // Calculate historical derived series for sparklines
  const series = Array.from(historyMap.entries())
    .map(([name, data]) => {
      return {
        name,
        totalVarCost: data.variableCost,
        avgUnitCost: data.quantity > 0 ? data.variableCost / data.quantity : 0,
        avgMargin: data.quantity > 0 ? (data.revenue - data.variableCost) / data.quantity : 0,
        avgVarCostPerSale: data.saleCount > 0 ? data.variableCost / data.saleCount : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return [
    { name: 'Custo Variável Total', value: currentTotalVariableCost, previousValue: prevTotalVariableCost, recordIds: allCurrentCostIds, tableSource: mixedTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.totalVarCost } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo Médio por Produto', value: avgCostPerProduct, previousValue: prevAvgContributionMargin ? (prevTotalVariableCost/prevTotalSoldQuantity) : undefined, recordIds: stockMovementIds, tableSource: stockMovementsTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.avgUnitCost } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Margem de Contribuição por Produto', value: currentAvgContributionMargin, previousValue: prevAvgContributionMargin, recordIds: allCurrentCostIds, tableSource: mixedTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.avgMargin } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo Variável por Venda', value: currentAvgVariableCostPerSale, previousValue: prevAvgVariableCostPerSale, recordIds: currentSaleItemIds, tableSource: saleItemsTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.avgVarCostPerSale } as Record<string, unknown> })), timestamp: Date.now() } },
  ];
};


