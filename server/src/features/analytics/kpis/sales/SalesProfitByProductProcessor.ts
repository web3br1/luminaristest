/**
 * Sales Profit By Product Processor
 *
 * Computes monthly profit for product sales:
 * profit = revenue - (avg_inbound_cost_per_unit(product) × quantity)
 *
 * Gold Standard compliant:
 * - DataSanitizer.extractCurrency on all monetary/numeric fields
 * - addMoney() for all accumulations (anti float-drift)
 * - getZonedPeriodKey() for timezone-safe period bucketing
 * - 12-month pre-zeroed historyMap
 * - Graceful fallback if headerTableKey is absent
 * - previousValue on the most recent period point
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import {
  getStartDateForMonthsWindow,
  isDateWithinWindow,
  getZonedPeriodKey,
  type PeriodType,
} from '../../utils/DateUtils';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { addMoney } from '../../utils/CurrencyUtils';

export const salesProfitByProductOverTimeProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, fetchByPresetTableKey, table } = context;

  // ============================================================================
  // FIELD MAPPINGS
  // ============================================================================
  const itemTypeField            = params.itemTypeField            || 'itemType';
  const productIdField           = params.productIdField           || 'productId';
  const quantityField            = params.quantityField            || 'quantity';
  const unitPriceField           = params.unitPriceField           || 'unitPrice';
  const saleIdField              = params.saleIdField              || 'saleId';
  const saleItemDateField        = params.saleItemDateField        || 'date'; // fallback date field

  const headerTableKey           = params.headerTableKey as string | undefined;
  const headerDateField          = params.headerDateField          || 'date';
  const headerPaymentStatusField = params.headerPaymentStatusField || 'paymentStatus';
  const includePaymentStatuses: string[] = Array.isArray(params.includePaymentStatuses)
    ? params.includePaymentStatuses
    : ['Paid'];

  const period: PeriodType = (params.period as PeriodType) || 'month';
  const timeZone            = params.timeZone || 'UTC';

  const now          = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const monthsWindow = typeof params.monthsWindow === 'number' && params.monthsWindow > 0
    ? params.monthsWindow
    : 12;
  const startWindow  = getStartDateForMonthsWindow(now, monthsWindow, timeZone);

  const stockMovementsTableKey = params.stockMovementsTableKey as string | undefined;
  const stockTypeField         = params.stockTypeField         || 'type';
  const stockProductIdField    = params.stockProductIdField    || 'productId';
  const stockQuantityField     = params.stockQuantityField     || 'quantity';
  const stockCostField         = params.stockCostField         || 'cost';
  // If true, stockCostField holds the TOTAL cost of the lot (not unit cost).
  // Default: true (Σcost / Σqty = avg unit cost)
  const stockCostIsTotal       = params.stockCostIsTotal !== false;

  // ============================================================================
  // PRE-FILL 12-MONTH HISTORY MAP (zero-drift safe, YYYY-MM keys)
  // ============================================================================
  const historyMap = new Map<string, number>();
  for (let i = 0; i < monthsWindow; i++) {
    // Use safe month arithmetic: setDate(1) before setMonth to avoid leap-month errors
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = getZonedPeriodKey(d, 'month', timeZone);
    historyMap.set(key, 0);
  }

  // ============================================================================
  // LOAD SALE HEADERS (optional — for date + payment status)
  // ============================================================================
  let headerById: Map<string, Record<string, unknown>> | null = null;
  if (headerTableKey && fetchByPresetTableKey) {
    try {
      const { rows: headerRows } = await fetchByPresetTableKey(headerTableKey);
      headerById = new Map(headerRows.map((r) => [r.id, r.data as Record<string, unknown>]));
    } catch {
      headerById = null;
    }
  }

  // ============================================================================
  // LOAD STOCK MOVEMENTS → avg cost per product (weighted average)
  // ============================================================================
  let avgCostByProduct: Map<string, number> | null = null;
  if (stockMovementsTableKey && fetchByPresetTableKey) {
    try {
      const { rows: smRows } = await fetchByPresetTableKey(stockMovementsTableKey);
      const accum = new Map<string, { qty: number; cost: number }>();

      for (const r of smRows) {
        const type = String(r.data?.[stockTypeField] || '');
        if (type !== 'In') continue;

        const pid = String(r.data?.[stockProductIdField] || '').trim();
        if (!pid) continue;

        const q = DataSanitizer.extractCurrency(r.data?.[stockQuantityField]);
        const c = DataSanitizer.extractCurrency(r.data?.[stockCostField]);

        if (!Number.isFinite(q) || q <= 0) continue;
        if (!Number.isFinite(c) || c < 0) continue;

        const cur = accum.get(pid) || { qty: 0, cost: 0 };
        cur.qty  = addMoney(cur.qty, q);
        // If stockCostIsTotal, cost is the total batch cost. Else it's unit cost × qty.
        cur.cost = addMoney(cur.cost, stockCostIsTotal ? c : c * q);
        accum.set(pid, cur);
      }

      avgCostByProduct = new Map<string, number>();
      for (const [pid, { qty, cost }] of accum.entries()) {
        if (qty > 0) {
          avgCostByProduct.set(pid, cost / qty); // weighted avg unit cost
        }
      }
    } catch {
      avgCostByProduct = null;
    }
  }

  // ============================================================================
  // MAIN LOOP — aggregate profit per period
  // ============================================================================
  const totals          = new Map<string, number>();
  const recordIdsByPeriod = new Map<string, string[]>();

  for (const row of rows) {
    const data = row.data || {};

    // Filter by itemType if configured
    if (itemTypeField && params.itemTypeValue) {
      const type = String(data[itemTypeField] || '').trim();
      if (type !== String(params.itemTypeValue)) continue;
    } else if (itemTypeField && data[itemTypeField] !== undefined) {
      const type = String(data[itemTypeField] || '').trim();
      // Only skip if it is explicitly NOT 'Product' AND itemTypeValue was not explicitly set
      if (type && type !== 'Product' && !params.itemTypeValue) continue;
    }

    // Resolve date + payment status
    let dateVal: string | number | Date | null = null;
    let paymentStatusOk = true;

    if (headerById) {
      // Mode A: join to header table
      const saleId = String(data[saleIdField] || '').trim();
      const header = headerById.get(saleId);
      if (!header) continue;

      dateVal = header[headerDateField];

      if (includePaymentStatuses.length > 0) {
        const pStatus = String(header[headerPaymentStatusField] || '').trim();
        const match   = includePaymentStatuses.some(
          (s) => pStatus.toLowerCase() === String(s).toLowerCase()
        );
        if (!match) continue;
      }
    } else {
      // Mode B: fallback — read date directly from saleItem row
      dateVal = data[saleItemDateField];

      if (includePaymentStatuses.length > 0 && data[headerPaymentStatusField] !== undefined) {
        const pStatus = String(data[headerPaymentStatusField] || '').trim();
        const match   = includePaymentStatuses.some(
          (s) => pStatus.toLowerCase() === String(s).toLowerCase()
        );
        if (!match) paymentStatusOk = false;
      }
      if (!paymentStatusOk) continue;
    }

    const saleDate = dateVal ? new Date(dateVal) : null;
    if (!saleDate || !Number.isFinite(saleDate.getTime())) continue;
    if (!isDateWithinWindow(saleDate, startWindow, now)) continue;

    const key = getZonedPeriodKey(saleDate, period, timeZone);

    // Monetary extraction via DataSanitizer (handles "R$ 1.500,00" safely)
    const qty  = DataSanitizer.extractCurrency(data[quantityField]);
    const unit = DataSanitizer.extractCurrency(data[unitPriceField]);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(unit)) continue;

    const productId = String(data[productIdField] || '').trim();
    const avgCost   = avgCostByProduct?.get(productId) ?? 0;
    const revenue   = qty * unit;
    const cost      = avgCost * qty;
    const profit    = revenue - cost;

    // Accumulate (addMoney for float safety)
    const prev = historyMap.has(key) ? historyMap.get(key)! : 0;
    historyMap.set(key, addMoney(prev, profit));
    // Also mirror to totals (used to avoid double-iterating)
    totals.set(key, historyMap.get(key)!);

    if (!recordIdsByPeriod.has(key)) recordIdsByPeriod.set(key, []);
    recordIdsByPeriod.get(key)!.push(row.id);
  }

  // ============================================================================
  // BUILD OUTPUT — sorted YYYY-MM series, all 12 months present
  // ============================================================================
  const mainTableSource = table.presetKey || table.internalName || params.tableId || 'saleItems';

  const sortedEntries = Array.from(historyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const result: ChartDataPoint[] = sortedEntries.map(([name, value], idx, arr) => {
    const previousValue = idx > 0 ? arr[idx - 1][1] : undefined;
    return {
      name,
      value,
      previousValue: previousValue !== undefined ? previousValue : undefined,
      recordIds: recordIdsByPeriod.get(name) || [],
      tableSource: mainTableSource,
    };
  });

  return result;
};
