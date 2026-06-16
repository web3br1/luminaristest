/**
 * Revenue KPI Processor
 *
 * Calculates 17 revenue KPIs in a single pass for optimal performance.
 *
 * KPIs included:
 * 1.  Receita Bruta
 * 2.  Receita Líquida
 * 3.  Crescimento da Receita (%)
 * 4.  Receita Total Anual
 * 5.  Receita Operacional
 * 6.  Receita Não Operacional
 * 7.  Receita Média Mensal
 * 8.  Receita Média por Dia Útil
 * 9.  Receita por Hora Operacional
 * 10. Receita por Cliente
 * 11. Receita Máxima por Cliente
 * 12. Receita por Categoria
 * 13. Dependência de Receita de Fonte Única (%)
 * 14. Receita Nova (%)
 * 15. Receita Recorrente (%)
 * 16. Receita Sazonal (Índice)
 * 17. Receita Incremental por Campanha
 *
 * DESIGN DECISION: Negative amounts (refunds/chargebacks) are excluded.
 *
 * This processor expects all amounts to be positive (gross sale values).
 * If your business records returns as negative values in the same table,
 * those rows will be silently ignored. The recommended pattern for ERPs
 * with mixed tables is to use a separate "refunds" table and subtract it
 * at the reporting layer, or to use the `excludeStatuses` param to filter
 * out cancelled/reversed transactions before they reach this processor.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { countBusinessDaysInMonth, getStartDateForMonthsWindow, getPeriodBoundaries, isDateWithinWindow, getZonedPeriodKey } from '../../utils/DateUtils';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { addMoney } from '../../utils/CurrencyUtils';

// =============================================================================
// HELPERS
// =============================================================================

// =============================================================================
// PROCESSOR
// =============================================================================

export const revenueKpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, table } = context;

  // Field mappings
  const amountField = (params.amountField as string | undefined) ?? 'totalAmount';
  const discountField = params.discountField as string | undefined;
  const taxField = params.taxField as string | undefined;
  const statusField = params.statusField as string | undefined;
  const excludeStatuses: string[] = Array.isArray(params.excludeStatuses)
    ? params.excludeStatuses as string[]
    : [];
  const dateField = (params.dateField as string | undefined) ?? 'date';
  const customerIdField = params.customerIdField as string | undefined;
  const categoryField = params.categoryField as string | undefined;
  const sourceField = (params.sourceField as string | undefined) ?? customerIdField ?? categoryField;
  const revenueTypeField = (params.revenueTypeField as string | undefined) ?? 'revenueType';
  const isNewCustomerField = params.isNewCustomerField as string | undefined;
  const isLoyalCustomerField = params.isLoyalCustomerField as string | undefined;

  const datePreset = (params.datePreset as string | undefined) ?? 'thisMonth';
  const monthsWindow = typeof params.monthsWindow === 'number' && params.monthsWindow > 0
    ? params.monthsWindow
    : 12;

  // Heuristic parameters
  const newCustomerMinRevenue = typeof params.newCustomerMinRevenue === 'number'
    ? (params.newCustomerMinRevenue as number)
    : 0;
  const loyalCustomerMinSales = typeof params.loyalCustomerMinSales === 'number'
    ? (params.loyalCustomerMinSales as number)
    : 3;
  const loyalCustomerMinRevenue = typeof params.loyalCustomerMinRevenue === 'number'
    ? (params.loyalCustomerMinRevenue as number)
    : 0;

  // Accumulators (CURRENT)
  let grossRevenue = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let newRevenue = 0;
  let loyalRevenue = 0;
  let operationalRevenue = 0;
  let nonOperationalRevenue = 0;

  // Accumulators (PREVIOUS)
  let prevGrossRevenue = 0;
  let prevNetRevenue = 0;
  let prevTotalDiscount = 0;
  let prevTotalTax = 0;
  let prevOperationalRevenue = 0;
  let prevNonOperationalRevenue = 0;
  const prevRevenueByCustomer = new Map<string, number>();
  let prevCampaignRevenue = 0;
  let prevNewRevenue = 0;
  let prevLoyalRevenue = 0;
  const prevRevenueByCategory = new Map<string, number>();

  // Record IDs collectors
  const grossRevenueIds: string[] = [];
  const newRevenueIds: string[] = [];
  const loyalRevenueIds: string[] = [];
  const operationalRevenueIds: string[] = [];
  const nonOperationalRevenueIds: string[] = [];

  // Time baseline: use referenceDate from params (crucial for audits/history) or current time
  const now = params.referenceDate ? new Date(params.referenceDate as string | number | Date) : new Date();
  const timeZone = (params.timeZone as string | undefined) ?? 'UTC';
  const startWindow = getStartDateForMonthsWindow(now, monthsWindow, timeZone);
  const boundaries = getPeriodBoundaries(datePreset, now, timeZone);

  const revenueByCustomer = new Map<string, number>();
  const salesCountByCustomer = new Map<string, number>();
  const revenueByCategory = new Map<string, number>();
  const revenueBySource = new Map<string, number>();

  // Accumulators (History) — tracks data per month for all KPIs
  const historyMap = new Map<string, { 
    total: number, 
    net: number, 
    op: number, 
    nonOp: number, 
    customers: Set<string>,
    maxCustomerRev: number,
    newRev: number,
    loyalRev: number,
    customerRevenues: Map<string, number>
  }>();
  // 24 months: first 12 = current window, months 12-23 = previous window (for annualRevenue previousValue)
  for (let i = 0; i < 24; i++) {
    const d = new Date(now);
    d.setDate(1); // Set day to 1 BEFORE setMonth to prevent overflow on months with fewer days (e.g., Mar 31 -> Feb 28)
    d.setMonth(d.getMonth() - i);
    historyMap.set(getZonedPeriodKey(d, 'month', timeZone), { 
      total: 0, 
      net: 0, 
      op: 0, 
      nonOp: 0, 
      customers: new Set(),
      maxCustomerRev: 0,
      newRev: 0,
      loyalRev: 0,
      customerRevenues: new Map()
    });
  }

  // Campaign Revenue calculation (merged into main loop)
  let campaignRevenue = 0;
  const campaignRevenueIds: string[] = [];
  const campaignField = (params.campaignIdField as string | undefined) ?? 'campaignId';
  const campaignDistributionMap = new Map<string, number>();

  // Need to track which rows belong to which customer for heuristic calculation
  const customerRowMap = new Map<string, string[]>();

  // If no stream is provided, simulate a stream with the rows array
  const stream = typeof context.streamRows === 'function' 
    ? context.streamRows() 
    : (async function* () { yield rows; })();

  // Single pass through data (chunked for memory-safety)
  for await (const batch of stream) {
    for (const row of batch) {
    const data = row.data || {};

    // Skip excluded statuses
    if (statusField) {
      const st = String(data[statusField] || '').toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
        continue;
      }
    }

    const rawAmount = DataSanitizer.extractCurrency(data[amountField]);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

    // Period tracking
    const rawDate = data[dateField];
    const date = rawDate ? new Date(rawDate as string | number | Date) : null;
    if (!date || isNaN(date.getTime())) continue;

    const isCurrent = isDateWithinWindow(date, boundaries.currentStart, boundaries.currentEnd);
    const isPrev = isDateWithinWindow(date, boundaries.prevStart, boundaries.prevEnd);

    // Update History (even if outside current/prev window, as long as within last 12 mo)
    const monthKey = getZonedPeriodKey(date, 'month', timeZone);
    if (historyMap.has(monthKey)) {
      const h = historyMap.get(monthKey)!;
      h.total = addMoney(h.total, rawAmount);
      const d = DataSanitizer.extractCurrency(discountField ? data[discountField] : undefined);
      const t = DataSanitizer.extractCurrency(taxField ? data[taxField] : undefined);
      h.net = addMoney(h.net, rawAmount - d - t);

      const rType = String(data[revenueTypeField] || '').toLowerCase();
      if (rType === 'operational' || rType === 'operacional') h.op = addMoney(h.op, rawAmount);
      else if (rType === 'nonoperational' || rType === 'não operacional' || rType === 'nao operacional' || rType === 'non-operational') h.nonOp = addMoney(h.nonOp, rawAmount);

      // Track unique customers per month for real ARPU
      if (customerIdField) {
        const cid = String(data[customerIdField] || '').trim();
        if (cid) {
          h.customers.add(cid);
          h.customerRevenues.set(cid, addMoney(h.customerRevenues.get(cid) || 0, rawAmount));
          if (h.customerRevenues.get(cid)! > h.maxCustomerRev) {
            h.maxCustomerRev = h.customerRevenues.get(cid)!;
          }
        }
      }

      const isNew = isNewCustomerField && data[isNewCustomerField];
      const isLoyal = isLoyalCustomerField && data[isLoyalCustomerField];
      if (isNew) h.newRev = addMoney(h.newRev, rawAmount);
      if (isLoyal) h.loyalRev = addMoney(h.loyalRev, rawAmount);
    }

    // Campaign tracking (merged into main loop — no 2nd pass needed)
    if (isCurrent) {
      const cmpId = String(data[campaignField] || '').trim();
      if (cmpId) {
        campaignRevenue = addMoney(campaignRevenue, rawAmount);
        campaignRevenueIds.push(row.id);
        campaignDistributionMap.set(cmpId, addMoney(campaignDistributionMap.get(cmpId) || 0, rawAmount));
      }
    }

    // If outside both windows, skip current/prev accumulators
    if (!isCurrent && !isPrev) continue;

    const rType = String(data[revenueTypeField] || '').toLowerCase();
    const isOp = rType === 'operational' || rType === 'operacional';
    const isNonOp = rType === 'nonoperational' || rType === 'não operacional' || rType === 'nao operacional' || rType === 'non-operational';

    if (isCurrent) {
      grossRevenue = addMoney(grossRevenue, rawAmount);
      grossRevenueIds.push(row.id);

      // Discounts
      if (discountField) {
        const d = DataSanitizer.extractCurrency(data[discountField]);
        if (Number.isFinite(d) && d > 0) totalDiscount = addMoney(totalDiscount, d);
      }

      // Taxes
      if (taxField) {
        const t = DataSanitizer.extractCurrency(data[taxField]);
        if (Number.isFinite(t) && t > 0) totalTax = addMoney(totalTax, t);
      }

      // Customer tracking
      if (customerIdField) {
        const cid = String(data[customerIdField] || '').trim();
        if (cid) {
          revenueByCustomer.set(cid, addMoney(revenueByCustomer.get(cid) || 0, rawAmount));
          salesCountByCustomer.set(cid, (salesCountByCustomer.get(cid) || 0) + 1);
          if (!customerRowMap.has(cid)) customerRowMap.set(cid, []);
          customerRowMap.get(cid)!.push(row.id);
        }
      }

      // Category tracking
      if (categoryField) {
        const cat = String(data[categoryField] || '').trim();
        if (cat) {
          revenueByCategory.set(cat, addMoney(revenueByCategory.get(cat) || 0, rawAmount));
        }
      }

      // Source tracking
      if (sourceField) {
        const src = String(data[sourceField] || '').trim();
        if (src) {
          revenueBySource.set(src, addMoney(revenueBySource.get(src) || 0, rawAmount));
        }
      }

      if (isOp) {
        operationalRevenue = addMoney(operationalRevenue, rawAmount);
        operationalRevenueIds.push(row.id);
      } else if (isNonOp) {
        nonOperationalRevenue = addMoney(nonOperationalRevenue, rawAmount);
        nonOperationalRevenueIds.push(row.id);
      }

      // Explicit new/loyal customer flags
      if (isNewCustomerField && data[isNewCustomerField]) {
        newRevenue = addMoney(newRevenue, rawAmount);
        newRevenueIds.push(row.id);
      }
      if (isLoyalCustomerField && data[isLoyalCustomerField]) {
        loyalRevenue = addMoney(loyalRevenue, rawAmount);
        loyalRevenueIds.push(row.id);
      }
    } else if (isPrev) {
      prevGrossRevenue = addMoney(prevGrossRevenue, rawAmount);
      // [B1 FIX] Use DataSanitizer to handle PT-BR currency strings (e.g. "R$ 1.500,00")
      if (discountField) {
        const pd = DataSanitizer.extractCurrency(data[discountField]);
        if (pd > 0) prevTotalDiscount = addMoney(prevTotalDiscount, pd);
      }
      if (taxField) {
        const pt = DataSanitizer.extractCurrency(data[taxField]);
        if (pt > 0) prevTotalTax = addMoney(prevTotalTax, pt);
      }
      if (isOp) prevOperationalRevenue = addMoney(prevOperationalRevenue, rawAmount);
      if (isNonOp) prevNonOperationalRevenue = addMoney(prevNonOperationalRevenue, rawAmount);

      // prev-period customer tracking
      if (customerIdField) {
        const cid = String(data[customerIdField] || '').trim();
        if (cid) prevRevenueByCustomer.set(cid, addMoney(prevRevenueByCustomer.get(cid) || 0, rawAmount));
      }
      // prev-period campaign tracking
      const prevCmpId = String(data[campaignField] || '').trim();
      if (prevCmpId) prevCampaignRevenue = addMoney(prevCampaignRevenue, rawAmount);
      // prev-period new/loyal tracking
      if (isNewCustomerField && data[isNewCustomerField]) prevNewRevenue = addMoney(prevNewRevenue, rawAmount);
      if (isLoyalCustomerField && data[isLoyalCustomerField]) prevLoyalRevenue = addMoney(prevLoyalRevenue, rawAmount);
      // prev-period category tracking
      if (categoryField) {
        const pcat = String(data[categoryField] || '').trim();
        if (pcat) {
          prevRevenueByCategory.set(pcat, addMoney(prevRevenueByCategory.get(pcat) || 0, rawAmount));
        }
      }
    }
    }
  }

  // Calculate derived metrics
  const netRevenue = grossRevenue - totalDiscount - totalTax;
  prevNetRevenue = prevGrossRevenue - prevTotalDiscount - prevTotalTax;

  let revenueGrowthPct = 0;
  if (prevGrossRevenue > 0) {
    revenueGrowthPct = ((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 100;
  }

  // Window revenue calculation (Passos B+D: split 24-month historyMap into two 12-month windows)
  // The key for the first month of the current 12-month window
  const currentWindowStartDate = getStartDateForMonthsWindow(now, 12, timeZone);
  const currentWindowStartKey = getZonedPeriodKey(currentWindowStartDate, 'month', timeZone);

  // Build full series sorted oldest → newest
  const seriesFull = Array.from(historyMap.entries())
    .map(([name, h]) => ({ name, ...h, customerCount: h.customers.size }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Split: months 0-11 = current window, months 12-23 = previous window
  const series = seriesFull.filter(s => s.name >= currentWindowStartKey);
  const prevSeries = seriesFull.filter(s => s.name < currentWindowStartKey);

  let windowRevenue = 0;
  const windowRevenueIds = [...grossRevenueIds];
  for (const s of series) windowRevenue += s.total;

  // [D] Previous annual window (months 12-23)
  let prevWindowRevenue = 0;
  for (const s of prevSeries) prevWindowRevenue += s.total;
  const prevMonthsWithData = prevSeries.filter(s => s.total > 0).length;
  const prevEffectiveMonths = Math.max(1, prevMonthsWithData);
  const prevAvgMonthlyRevenue = prevWindowRevenue > 0 ? prevWindowRevenue / prevEffectiveMonths : 0;

  const annualRevenue = windowRevenue;

  // Use actual months with data in current window instead of hardcoded monthsWindow
  const monthsWithData = series.filter(s => s.total > 0).length;
  const effectiveMonths = Math.max(1, monthsWithData);
  const avgMonthlyRevenue = windowRevenue / effectiveMonths;

  // Business day revenue
  let avgBusinessDayRevenue = 0;
  let prevAvgBusinessDayRevenue = 0;
  const currentBusinessDays = countBusinessDaysInMonth(boundaries.currentStart);
  const prevBusinessDays = countBusinessDaysInMonth(boundaries.prevStart);

  if (grossRevenue > 0) {
    avgBusinessDayRevenue = grossRevenue / (currentBusinessDays || 1);
  }
  if (prevGrossRevenue > 0) {
    prevAvgBusinessDayRevenue = prevGrossRevenue / (prevBusinessDays || 1);
  }

  // Customer metrics
  const distinctCustomers = revenueByCustomer.size;
  const revenuePerCustomer = distinctCustomers > 0 ? grossRevenue / distinctCustomers : 0;

  let maxRevenuePerCustomer = 0;
  for (const total of revenueByCustomer.values()) {
    if (total > maxRevenuePerCustomer) maxRevenuePerCustomer = total;
  }

  // Category metrics
  let topCategoryRevenue = 0;
  let topCategoryName = '';
  for (const [cat, total] of revenueByCategory.entries()) {
    if (total > topCategoryRevenue) {
      topCategoryRevenue = total;
      topCategoryName = cat;
    }
  }

  let prevTopCategoryRevenue = 0;
  if (prevRevenueByCategory.size > 0) {
    prevTopCategoryRevenue = Math.max(...prevRevenueByCategory.values());
  }

  // Source dependency
  const singleSourceConfigured = !!sourceField;
  let singleSourceDependencyPct = 0;
  if (singleSourceConfigured && revenueBySource.size > 0 && grossRevenue > 0) {
    let maxSource = 0;
    for (const val of revenueBySource.values()) {
      if (val > maxSource) maxSource = val;
    }
    singleSourceDependencyPct = (maxSource / grossRevenue) * 100;
  }

  // Heuristic new/loyal calculation
  if (!isNewCustomerField && !isLoyalCustomerField && revenueByCustomer.size > 0) {
    let heuristicNewRevenue = 0;
    let heuristicLoyalRevenue = 0;
    const heuristicNewIds: string[] = [];
    const heuristicLoyalIds: string[] = [];

    for (const [cid, total] of revenueByCustomer.entries()) {
      const salesCount = salesCountByCustomer.get(cid) || 0;
      const rowIds = customerRowMap.get(cid) || [];

      if (salesCount === 1 && total >= newCustomerMinRevenue) {
        heuristicNewRevenue += total;
        heuristicNewIds.push(...rowIds);
      }

      const isLoyalByCount = salesCount >= loyalCustomerMinSales;
      const isLoyalByRevenue = loyalCustomerMinRevenue > 0 ? total >= loyalCustomerMinRevenue : false;
      if ((isLoyalByCount || isLoyalByRevenue) && salesCount > 1) {
        heuristicLoyalRevenue += total;
        heuristicLoyalIds.push(...rowIds);
      }
    }

    newRevenue = heuristicNewRevenue;
    loyalRevenue = heuristicLoyalRevenue;
    if (heuristicNewIds.length > 0) {
      newRevenueIds.push(...heuristicNewIds);
    }
    if (heuristicLoyalIds.length > 0) {
      loyalRevenueIds.push(...heuristicLoyalIds);
    }
  }

  const newRevenuePct = newRevenue > 0 && grossRevenue > 0 ? (newRevenue / grossRevenue) * 100 : 0;
  const recurringRevenuePct = loyalRevenue > 0 && grossRevenue > 0 ? (loyalRevenue / grossRevenue) * 100 : 0;

  // New Heuristic for Historical New/Loyal if fields missing
  if (!isNewCustomerField && !isLoyalCustomerField && customerIdField) {
    for (const h of historyMap.values()) {
        let hNew = 0;
        let hLoyal = 0;
        for (const [cid, amt] of h.customerRevenues.entries()) {
            const totalSales = salesCountByCustomer.get(cid) || 0; // heuristic from global count
            if (totalSales === 1) hNew += amt;
            else if (totalSales >= loyalCustomerMinSales) hLoyal += amt;
        }
        h.newRev = hNew;
        h.loyalRev = hLoyal;
    }
  }

  // Revenue per hour
  let revenuePerHour = 0;
  let prevRevenuePerHour = 0;
  if (grossRevenue > 0) {
    const totalHours = currentBusinessDays * 8;
    revenuePerHour = totalHours > 0 ? grossRevenue / totalHours : 0;
  }

  if (prevGrossRevenue > 0) {
    const totalPrevHours = prevBusinessDays * 8;
    prevRevenuePerHour = totalPrevHours > 0 ? prevGrossRevenue / totalPrevHours : 0;
  }

  // [E] Crescimento da Receita (%) — previousValue: growth of prevMonth vs its prior month
  // The correct window is the current series, representing the past 12 months up to current
  // series[series.length - 2] is the month prior to current
  // series[series.length - 3] is two months prior
  let prevRevenueGrowthPct: number | undefined = undefined;
  if (series.length >= 3) {
    const prevMonthTotal = series[series.length - 2].total;
    const prevPrevMonthTotal = series[series.length - 3].total;
    prevRevenueGrowthPct = prevPrevMonthTotal > 0
      ? ((prevMonthTotal - prevPrevMonthTotal) / prevPrevMonthTotal) * 100
      : undefined;
  }

  // [F] Seasonal Index — previousValue: index of prevGrossRevenue relative to current-window average
  let seasonalIndex = 0;
  if (windowRevenue > 0 && grossRevenue > 0) {
    const avg = windowRevenue / effectiveMonths;
    if (avg > 0) seasonalIndex = (grossRevenue / avg) * 100;
  }
  const prevSeasonalIndex: number | undefined = avgMonthlyRevenue > 0 && prevGrossRevenue > 0
    ? (prevGrossRevenue / avgMonthlyRevenue) * 100
    : undefined;

  // Campaign distribution already collected in main loop (no 2nd pass needed)

  // Determine table source
  const mainTableSource = table.presetKey || (params.tableId as string | undefined) || 'sales';

  // Return all KPIs with recordIds and tableSource
  return [
    { name: 'Receita Bruta', value: grossRevenue, previousValue: prevGrossRevenue, recordIds: grossRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Receita Líquida', value: netRevenue, previousValue: prevNetRevenue, recordIds: grossRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.net } as Record<string, unknown> })), timestamp: Date.now() } },
    {
      name: 'Crescimento da Receita (%)',
      value: revenueGrowthPct,
      previousValue: prevRevenueGrowthPct,
      recordIds: grossRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: series.map((s, i, arr) => {
          const prev = i > 0 ? arr[i - 1].total : 0;
          const growth = prev > 0 ? ((s.total - prev) / prev) * 100 : 0;
          return { id: s.name, data: { value: growth } as Record<string, unknown> };
        }),
        timestamp: Date.now()
      }
    },
    { name: 'Receita Total Anual', value: annualRevenue, previousValue: prevWindowRevenue > 0 ? prevWindowRevenue : undefined, recordIds: windowRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Receita Operacional', value: operationalRevenue, previousValue: prevOperationalRevenue, recordIds: operationalRevenueIds, tableSource: mainTableSource, fullRecords: { records: [{ id: 'Operacional', data: { value: operationalRevenue } as Record<string, unknown> }, { id: 'Não Operacional', data: { value: nonOperationalRevenue } as Record<string, unknown> }], timestamp: Date.now() } },
    { name: 'Receita Não Operacional', value: nonOperationalRevenue, previousValue: prevNonOperationalRevenue, recordIds: nonOperationalRevenueIds, tableSource: mainTableSource, fullRecords: { records: [{ id: 'Operacional', data: { value: operationalRevenue } as Record<string, unknown> }, { id: 'Não Operacional', data: { value: nonOperationalRevenue } as Record<string, unknown> }], timestamp: Date.now() } },
    { name: 'Receita Média Mensal', value: avgMonthlyRevenue, previousValue: prevAvgMonthlyRevenue > 0 ? prevAvgMonthlyRevenue : undefined, recordIds: windowRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total } as Record<string, unknown> })), timestamp: Date.now() } },
    {
      name: 'Receita Média por Dia Útil',
      value: avgBusinessDayRevenue,
      previousValue: prevAvgBusinessDayRevenue || undefined,
      recordIds: grossRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: series.map(s => {
          const parts = s.name.split('-');
          const date = parts.length === 2 ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1) : new Date();
          const businessDays = countBusinessDaysInMonth(date);
          return { id: s.name, data: { value: s.total / (businessDays || 1) } as Record<string, unknown> };
        }),
        timestamp: Date.now()
      }
    },
    {
      name: 'Receita por Hora Operacional',
      value: revenuePerHour,
      previousValue: prevRevenuePerHour || undefined,
      recordIds: grossRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: series.map(s => {
          const parts = s.name.split('-');
          const date = parts.length === 2 ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1) : new Date();
          const businessDays = countBusinessDaysInMonth(date);
          return { id: s.name, data: { value: s.total / ((businessDays || 1) * 8) } as Record<string, unknown> };
        }),
        timestamp: Date.now()
      }
    },
    {
      name: 'Receita por Cliente',
      value: revenuePerCustomer,
      previousValue: prevRevenueByCustomer.size > 0 ? prevGrossRevenue / prevRevenueByCustomer.size : undefined,
      recordIds: grossRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: series.map(s => {
          // Real ARPU per month (Fix #1): revenue / unique customers in that month
          const monthlyArpu = s.customerCount > 0 ? s.total / s.customerCount : 0;
          return { id: s.name, data: { value: monthlyArpu } as Record<string, unknown> };
        }),
        timestamp: Date.now()
      }
    },
    { 
      name: 'Receita Máxima por Cliente', 
      value: maxRevenuePerCustomer, 
      previousValue: prevRevenueByCustomer.size > 0 ? Math.max(...prevRevenueByCustomer.values()) : undefined, 
      recordIds: grossRevenueIds, 
      tableSource: mainTableSource,
      fullRecords: {
        records: series.map(s => ({ id: s.name, data: { value: s.maxCustomerRev } as Record<string, unknown> })),
        timestamp: Date.now()
      }
    },
    {
      name: 'Receita por Categoria',
      value: topCategoryRevenue,
      previousValue: prevTopCategoryRevenue || undefined,
      recordIds: grossRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: Array.from(revenueByCategory.entries()).map(([cat, total]) => ({ id: cat, data: { value: total } as Record<string, unknown> })),
        timestamp: Date.now()
      }
    },
    { name: 'Dependência de Receita de Fonte Única (%)', value: singleSourceDependencyPct, previousValue: singleSourceConfigured && prevRevenueByCustomer.size > 0 && prevGrossRevenue > 0 ? (Math.max(...prevRevenueByCustomer.values()) / prevGrossRevenue) * 100 : undefined, recordIds: grossRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.maxCustomerRev / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Receita Nova (%)', value: newRevenuePct, previousValue: prevGrossRevenue > 0 ? (prevNewRevenue / prevGrossRevenue) * 100 : undefined, recordIds: newRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.newRev / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Receita Recorrente (%)', value: recurringRevenuePct, previousValue: prevGrossRevenue > 0 ? (prevLoyalRevenue / prevGrossRevenue) * 100 : undefined, recordIds: loyalRevenueIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.loyalRev / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
    {
      name: 'Receita Sazonal (Índice)',
      value: seasonalIndex,
      previousValue: prevSeasonalIndex,
      recordIds: windowRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: series.map(s => {
          const avg = windowRevenue / effectiveMonths; // Fix #3: use real month count
          const idx = avg > 0 ? (s.total / avg) * 100 : 0;
          return { id: s.name, data: { value: idx } as Record<string, unknown> };
        }),
        timestamp: Date.now()
      }
    },
    {
      name: 'Receita Atribuída a Campanhas', // Fix #6: renamed from "Incremental"
      value: campaignRevenue,
      previousValue: prevCampaignRevenue || undefined,
      recordIds: campaignRevenueIds,
      tableSource: mainTableSource,
      fullRecords: {
        records: Array.from(campaignDistributionMap.entries()).map(([cid, total]) => ({ id: cid, data: { value: total } as Record<string, unknown> })),
        timestamp: Date.now()
      }
    },
  ];
};

