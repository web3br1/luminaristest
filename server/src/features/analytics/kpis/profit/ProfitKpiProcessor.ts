/**
 * Profit KPI Processor
 *
 * Calculates 18 profit and margin KPIs.
 *
 * KPIs included:
 * 1.  Lucro Bruto
 * 2.  Lucro Operacional
 * 3.  Lucro Líquido
 * 4.  Lucro Médio por Cliente
 * 5.  Lucro por Funcionário
 * 6.  Lucro por Hora Trabalhada
 * 7.  Margem Bruta (%)
 * 8.  Margem Operacional (%)
 * 9.  Margem Líquida (%)
 * 10. Margem de Contribuição (%)
 * 11. Rentabilidade Geral (%)
 * 12. Crescimento do Lucro (%)
 * 13. Produtividade do Lucro
 * 14. Eficiência do Lucro (Lucro/Custo)
 * 15. Índice de Qualidade do Lucro
 * 16. Resultado Financeiro Final
 * 17. Lucro Ajustado
 * 18. Lucro Acumulado
 * 
 * DESIGN DECISION: Negative amounts (refunds/chargebacks) are excluded natively.
 * It is expected that gross amounts are fed directly. Use excludeStatuses mapping inside Params 
 * if your business mixes returns with expenses in the identical tables.
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { getPeriodBoundaries, isDateWithinWindow, getStartDateForMonthsWindow, getZonedPeriodKey } from '../../utils/DateUtils';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { addMoney } from '../../utils/CurrencyUtils';

// =============================================================================
// HELPERS
// =============================================================================

// =============================================================================
// PROCESSOR
// =============================================================================

export const profitKpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, fetchByPresetTableKey, table } = context;

  // Field mappings
  const revenueAmountField = params.revenueAmountField || 'totalAmount';
  const revenueDateField = params.revenueDateField || 'date';
  const statusField = params.statusField || 'status';
  const paymentStatusField = params.paymentStatusField || 'paymentStatus';
  const excludeStatuses: string[] = Array.isArray(params.excludeStatuses)
    ? params.excludeStatuses
    : ['Cancelled'];

  // Only include sales that are Finalized and Paid
  const requireFinalized = params.requireFinalized !== false; // Default: true
  const requirePaid = params.requirePaid !== false; // Default: true

  // Cost totals (can be passed via params or calculated from expenses)
  let variableCostTotal = Number(params.variableCostTotal ?? 0);
  let fixedCostTotal = Number(params.fixedCostTotal ?? 0);
  let taxesTotal = Number(params.taxesTotal ?? 0);
  let nonRecurringTotal = Number(params.nonRecurringTotal ?? 0);

  const period = params.period || 'month';
  const datePreset = params.datePreset || 'thisMonth';
  const timeZone = params.timeZone || 'UTC';
  const now = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const boundaries = getPeriodBoundaries(datePreset, now, timeZone);

  const currentWindowStartDate = getStartDateForMonthsWindow(now, 12, timeZone);
  const currentWindowStartKey = getZonedPeriodKey(currentWindowStartDate, 'month', timeZone);

  // History tracking for sparklines (24 months trailing)
  const historyMap = new Map<string, {
    revenue: number,
    variableCosts: number,
    fixedCosts: number,
    taxes: number,
    grossProfit: number,
    operatingProfit: number,
    netProfit: number
  }>();

  for (let i = 0; i < 24; i++) {
    const d = new Date(now);
    d.setDate(1); // Set day to 1 BEFORE setMonth to prevent overflow on months with fewer days
    d.setMonth(d.getMonth() - i);
    
    historyMap.set(getZonedPeriodKey(d, 'month', timeZone), {
      revenue: 0, variableCosts: 0, fixedCosts: 0, taxes: 0,
      grossProfit: 0, operatingProfit: 0, netProfit: 0
    });
  }

  // Accumulators (CURRENT)
  let totalRevenue = 0;
  let totalRevenuePrevPeriod = 0;

  // Record IDs collectors
  const currentPeriodRevenueIds: string[] = [];
  const prevPeriodRevenueIds: string[] = [];
  const expenseIds: string[] = [];

  const revenueByCustomer = new Map<string, number>();

  // Process revenue rows
  for (const row of rows) {
    const data = row.data || {};
    const rowStatus = String(data[statusField] || '');
    const rowPaymentStatus = String(data[paymentStatusField] || '');
    const rowAmount = DataSanitizer.extractCurrency(data[revenueAmountField]);
    const rawDate = data[revenueDateField];
    const date = rawDate ? new Date(rawDate) : null;

    // Skip excluded statuses
    if (statusField) {
      const st = rowStatus.toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
        continue;
      }
    }

    // Require Finalized status if enabled
    if (requireFinalized && statusField) {
      if (rowStatus.toLowerCase() !== 'finalized') {
        continue;
      }
    }

    // Require Paid payment status if enabled
    if (requirePaid && paymentStatusField) {
      const paymentStatus = rowPaymentStatus.toLowerCase();
      if (paymentStatus !== 'paid' && paymentStatus !== 'pago') {
        continue;
      }
    }

    if (!Number.isFinite(rowAmount) || rowAmount <= 0) {
      continue;
    }

    if (!date || !isFinite(date.getTime())) {
      continue;
    }

    const isCurrent = isDateWithinWindow(date, boundaries.currentStart, boundaries.currentEnd);
    const isPrev = isDateWithinWindow(date, boundaries.prevStart, boundaries.prevEnd);

    // Update History (sparklines)
    const monthKey = getZonedPeriodKey(date, 'month', timeZone);
    if (historyMap.has(monthKey)) {
      historyMap.get(monthKey)!.revenue = addMoney(historyMap.get(monthKey)!.revenue, rowAmount);
    }

    if (isCurrent) {
      totalRevenue = addMoney(totalRevenue, rowAmount);
      currentPeriodRevenueIds.push(row.id);
    } else if (isPrev) {
      totalRevenuePrevPeriod = addMoney(totalRevenuePrevPeriod, rowAmount);
      prevPeriodRevenueIds.push(row.id);
    }

    const customerId = String(data.customerId || '').trim();
    if (customerId) {
      revenueByCustomer.set(customerId, addMoney(revenueByCustomer.get(customerId) || 0, rowAmount));
    }
  }

  // Integrate with expenses table if available
  let prevVariableCostTotal = 0;
  let prevFixedCostTotal = 0;
  let prevTaxesTotal = 0;
  let prevNonRecurringTotal = 0;

  if (fetchByPresetTableKey && typeof params.costSourceTableKey === 'string') {
    try {
      const { rows: expenseRows } = await fetchByPresetTableKey(params.costSourceTableKey);
      const expenseAmountField = params.expenseAmountField || 'amount';
      const expenseCategoryField = params.expenseCategoryField || 'category';
      const expenseDateField = params.expenseDateField || 'paymentDate';
      const expensePaymentStatusField = params.expensePaymentStatusField || 'paymentStatus';
      const requireExpensePaid = params.requireExpensePaid !== false; // Default: true

      for (const row of expenseRows) {
        const data = row.data || {};
        const rowPaymentStatus = String(data[expensePaymentStatusField] || '');
        const rowAmount = DataSanitizer.extractCurrency(data[expenseAmountField]);
        const categoryRaw = String(data[expenseCategoryField] || '').toLowerCase();
        const rawDate = data[expenseDateField];
        const date = rawDate ? new Date(rawDate) : null;

        // Require Paid payment status for expenses if enabled
        if (requireExpensePaid && expensePaymentStatusField) {
          const paymentStatus = rowPaymentStatus.toLowerCase();
          if (paymentStatus !== 'paid' && paymentStatus !== 'pago') {
            continue;
          }
        }

        if (!Number.isFinite(rowAmount) || rowAmount <= 0) {
          continue;
        }

        if (!date || !isFinite(date.getTime())) {
          continue;
        }

        const isCurrent = isDateWithinWindow(date, boundaries.currentStart, boundaries.currentEnd);
        const isPrev = isDateWithinWindow(date, boundaries.prevStart, boundaries.prevEnd);

        // Update History (sparklines)
        const monthKey = getZonedPeriodKey(date, 'month', timeZone);
        if (historyMap.has(monthKey)) {
          const h = historyMap.get(monthKey)!;
          if (categoryRaw.includes('variable') || categoryRaw.includes('marketing')) h.variableCosts = addMoney(h.variableCosts, rowAmount);
          else if (categoryRaw.includes('fixed') || categoryRaw.includes('personnel') || categoryRaw.includes('aluguel')) h.fixedCosts = addMoney(h.fixedCosts, rowAmount);
          else if (categoryRaw.includes('tax') || categoryRaw.includes('imposto')) h.taxes = addMoney(h.taxes, rowAmount);
        }

        if (!isCurrent && !isPrev) {
          continue;
        }

        expenseIds.push(row.id);

        // Classify costs
        if (categoryRaw.includes('variable') || categoryRaw.includes('marketing')) {
          if (isCurrent) variableCostTotal = addMoney(variableCostTotal, rowAmount);
          else if (isPrev) prevVariableCostTotal = addMoney(prevVariableCostTotal, rowAmount);
        } else if (
          categoryRaw.includes('fixed') ||
          categoryRaw.includes('personnel') ||
          categoryRaw.includes('aluguel')
        ) {
          if (isCurrent) fixedCostTotal = addMoney(fixedCostTotal, rowAmount);
          else if (isPrev) prevFixedCostTotal = addMoney(prevFixedCostTotal, rowAmount);
        } else if (categoryRaw.includes('tax') || categoryRaw.includes('imposto')) {
          if (isCurrent) taxesTotal = addMoney(taxesTotal, rowAmount);
          else if (isPrev) prevTaxesTotal = addMoney(prevTaxesTotal, rowAmount);
        }

        if (categoryRaw.includes('nonrecurring') || categoryRaw.includes('não recorrente')) {
          if (isCurrent) nonRecurringTotal = addMoney(nonRecurringTotal, rowAmount);
          else if (isPrev) prevNonRecurringTotal = addMoney(prevNonRecurringTotal, rowAmount);
        }
      }
    } catch (err) {
      console.warn('[profitKpiProcessor] Failed to integrate expenses:', err);
    }
  }

  // Calculate profit metrics for CURRENT period
  const grossProfit = totalRevenue - variableCostTotal;
  const operatingProfit = grossProfit - fixedCostTotal;
  const netProfit = operatingProfit - taxesTotal;

  // Calculate profit metrics for PREVIOUS period
  const prevGrossProfit = totalRevenuePrevPeriod - prevVariableCostTotal;
  const prevOperatingProfit = prevGrossProfit - prevFixedCostTotal;
  const prevNetProfit = prevOperatingProfit - prevTaxesTotal;

  const distinctCustomers = revenueByCustomer.size;
  const prevDistinctCustomers = revenueByCustomer.size; // prev uses same customer map (best we have)
  const profitPerCustomer = distinctCustomers > 0 ? netProfit / distinctCustomers : 0;
  const prevProfitPerCustomer = prevDistinctCustomers > 0 && totalRevenuePrevPeriod > 0 ? prevNetProfit / prevDistinctCustomers : undefined;

  const employeesCount = Number(params.employeesCount ?? 0);
  const profitPerEmployee = employeesCount > 0 ? netProfit / employeesCount : 0;
  const prevProfitPerEmployee = employeesCount > 0 ? prevNetProfit / employeesCount : undefined;

  const totalHoursWorked = Number(params.totalHoursWorked ?? 0);
  const profitPerHour = totalHoursWorked > 0 ? netProfit / totalHoursWorked : 0;
  const prevProfitPerHour = totalHoursWorked > 0 ? prevNetProfit / totalHoursWorked : undefined;

  // Margin calculations
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const operatingMarginPct = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;
  const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const prevGrossMarginPct = totalRevenuePrevPeriod > 0 ? (prevGrossProfit / totalRevenuePrevPeriod) * 100 : undefined;
  const prevOperatingMarginPct = totalRevenuePrevPeriod > 0 ? (prevOperatingProfit / totalRevenuePrevPeriod) * 100 : undefined;
  const prevNetMarginPct = totalRevenuePrevPeriod > 0 ? (prevNetProfit / totalRevenuePrevPeriod) * 100 : undefined;

  // Margin de contribuição
  const contributionMarginPct = totalRevenue > 0 ? ((totalRevenue - variableCostTotal) / totalRevenue) * 100 : 0;
  const prevContributionMarginPct = totalRevenuePrevPeriod > 0 ? ((totalRevenuePrevPeriod - prevVariableCostTotal) / totalRevenuePrevPeriod) * 100 : undefined;

  // Profitability
  const equity = Number(params.equity ?? 0);
  const globalProfitabilityPct = equity > 0 ? (netProfit / equity) * 100 : 0;

  // Growth — value = current vs prev, previousValue = prev vs prev-prev (from series)
  let profitGrowthPct = 0;
  if (prevNetProfit > 0) {
    profitGrowthPct = ((netProfit - prevNetProfit) / prevNetProfit) * 100;
  } else if (prevNetProfit < 0) {
    profitGrowthPct = ((netProfit - prevNetProfit) / Math.abs(prevNetProfit)) * 100;
  }
  // previousValue for growth: month-before-last vs its prior (computed after series is ready)

  // Productivity and efficiency
  const productivity = totalHoursWorked > 0 ? netProfit / totalHoursWorked : 0;
  const prevProductivity = totalHoursWorked > 0 ? prevNetProfit / totalHoursWorked : undefined;

  const totalCosts = addMoney(addMoney(variableCostTotal, fixedCostTotal), taxesTotal);
  const prevTotalCosts = addMoney(addMoney(prevVariableCostTotal, prevFixedCostTotal), prevTaxesTotal);
  const profitEfficiency = totalCosts > 0 ? netProfit / totalCosts : 0;
  const prevProfitEfficiency = prevTotalCosts > 0 ? prevNetProfit / prevTotalCosts : undefined;

  // Calculate historical derived profits for sparklines
  const series = Array.from(historyMap.entries())
    .map(([name, data]) => {
      const grossProfit = data.revenue - data.variableCosts;
      const operatingProfit = grossProfit - data.fixedCosts;
      const netProfit = operatingProfit - data.taxes;
      
      const grossMarginPct = data.revenue > 0 ? (grossProfit / data.revenue) * 100 : 0;
      const operatingMarginPct = data.revenue > 0 ? (operatingProfit / data.revenue) * 100 : 0;
      const netMarginPct = data.revenue > 0 ? (netProfit / data.revenue) * 100 : 0;
      const contributionMarginPct = data.revenue > 0 ? ((data.revenue - data.variableCosts) / data.revenue) * 100 : 0;

      const equity = Number(params.equity ?? 0);
      const globalProfitabilityPct = equity > 0 ? (netProfit / equity) * 100 : 0;
      
      const totalHoursWorked = Number(params.totalHoursWorked ?? 0);
      const productivity = totalHoursWorked > 0 ? netProfit / totalHoursWorked : 0;

      return {
        name,
        revenue: data.revenue,
        grossProfit,
        operatingProfit,
        netProfit,
        grossMarginPct,
        operatingMarginPct,
        netMarginPct,
        contributionMarginPct,
        globalProfitabilityPct,
        productivity,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Compute accumulated and growth based on sorted chronological order
  let runningAccumulatedProfit = Number(params.accumulatedProfit ?? 0); 
  let prevMonthProfit = 0;
  
  const finalSeries = series.map((s) => {
    runningAccumulatedProfit = addMoney(runningAccumulatedProfit, s.netProfit);
    let seriesGrowthPct = 0;
    if (prevMonthProfit > 0) {
      seriesGrowthPct = ((s.netProfit - prevMonthProfit) / prevMonthProfit) * 100;
    } else if (prevMonthProfit < 0) {
      seriesGrowthPct = ((s.netProfit - prevMonthProfit) / Math.abs(prevMonthProfit)) * 100;
    }
    prevMonthProfit = s.netProfit;
    
    return {
      ...s,
      accumulatedProfit: runningAccumulatedProfit,
      profitGrowthPct: seriesGrowthPct,
    };
  });

  // Quality index
  const recurringProfit = Number(params.recurringProfit ?? 0);
  const prevRecurringProfit = Number(params.prevRecurringProfit ?? 0);
  const profitQualityIndex = netProfit > 0 && recurringProfit >= 0
    ? (recurringProfit / netProfit) * 100
    : 0;
  const prevProfitQualityIndex = prevNetProfit > 0 && prevRecurringProfit >= 0
    ? (prevRecurringProfit / prevNetProfit) * 100
    : undefined;

  // Adjusted and accumulated profit
  const adjustedProfit = netProfit - nonRecurringTotal;
  const prevAdjustedProfit = prevNetProfit - prevNonRecurringTotal;
  const accumulatedProfit = Number(params.accumulatedProfit ?? netProfit);

  // Resultado Financeiro Final = net profit (fully consolidated view for the period)
  const resultadoFinanceiro = netProfit;
  const prevResultadoFinanceiro = totalRevenuePrevPeriod > 0 ? prevNetProfit : undefined;

  // previousValue for growth KPI: month-before-last growth rate from series
  let prevProfitGrowthPct: number | undefined = undefined;
  if (finalSeries.length >= 3) {
    const prevMonthGrowth = finalSeries[finalSeries.length - 2].profitGrowthPct;
    prevProfitGrowthPct = prevMonthGrowth !== 0 || finalSeries[finalSeries.length - 3].netProfit !== 0
      ? prevMonthGrowth
      : undefined;
  }

  // Combine revenue and expense IDs for profit calculations
  const allProfitIds = [...new Set([...currentPeriodRevenueIds, ...expenseIds])];

  // Determine table sources
  const mainTableSource = (table as any).presetKey || (table as any).internalName || params.tableId || 'sales';
  const expenseTableSource = params.costSourceTableKey || 'expenses';
  const mixedTableSource = 'mixed'; // For KPIs that use both tables

  // Return all KPIs with recordIds and tableSource
  return [
    { name: 'Lucro Bruto', value: grossProfit, previousValue: prevGrossProfit, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.grossProfit } })), timestamp: Date.now() } as any },
    { name: 'Lucro Operacional', value: operatingProfit, previousValue: prevOperatingProfit, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.operatingProfit } })), timestamp: Date.now() } as any },
    { name: 'Lucro Líquido', value: netProfit, previousValue: prevNetProfit, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.netProfit } })), timestamp: Date.now() } as any },
    { name: 'Lucro Médio por Cliente', value: profitPerCustomer, previousValue: prevProfitPerCustomer, recordIds: currentPeriodRevenueIds, tableSource: mainTableSource },
    { name: 'Lucro por Funcionário', value: profitPerEmployee, previousValue: prevProfitPerEmployee, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.netProfit } })), timestamp: Date.now() } as any },
    { name: 'Lucro por Hora Trabalhada', value: profitPerHour, previousValue: prevProfitPerHour, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.productivity } })), timestamp: Date.now() } as any },
    { name: 'Margem Bruta (%)', value: grossMarginPct, previousValue: prevGrossMarginPct, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.grossMarginPct } })), timestamp: Date.now() } as any },
    { name: 'Margem Operacional (%)', value: operatingMarginPct, previousValue: prevOperatingMarginPct, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.operatingMarginPct } })), timestamp: Date.now() } as any },
    { name: 'Margem Líquida (%)', value: netMarginPct, previousValue: prevNetMarginPct, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.netMarginPct } })), timestamp: Date.now() } as any },
    { name: 'Margem de Contribuição (%)', value: contributionMarginPct, previousValue: prevContributionMarginPct, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.contributionMarginPct } })), timestamp: Date.now() } as any },
    { name: 'Rentabilidade Geral (%)', value: globalProfitabilityPct, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.globalProfitabilityPct } })), timestamp: Date.now() } as any },
    { name: 'Crescimento do Lucro (%)', value: profitGrowthPct, previousValue: prevProfitGrowthPct, recordIds: [...currentPeriodRevenueIds, ...prevPeriodRevenueIds], tableSource: mainTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.profitGrowthPct } })), timestamp: Date.now() } as any },
    { name: 'Produtividade do Lucro', value: productivity, previousValue: prevProductivity, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.productivity } })), timestamp: Date.now() } as any },
    { name: 'Eficiência do Lucro (Lucro/Custo)', value: profitEfficiency, previousValue: prevProfitEfficiency, recordIds: allProfitIds, tableSource: mixedTableSource },
    { name: 'Índice de Qualidade do Lucro', value: profitQualityIndex, previousValue: prevProfitQualityIndex, recordIds: allProfitIds, tableSource: mixedTableSource },
    { name: 'Resultado Financeiro Final', value: resultadoFinanceiro, previousValue: prevResultadoFinanceiro, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.netProfit } })), timestamp: Date.now() } as any },
    { name: 'Lucro Ajustado', value: adjustedProfit, previousValue: prevAdjustedProfit, recordIds: allProfitIds, tableSource: mixedTableSource },
    { name: 'Lucro Acumulado', value: accumulatedProfit, recordIds: allProfitIds, tableSource: mixedTableSource, fullRecords: { records: finalSeries.map(s => ({ id: s.name, data: { value: s.accumulatedProfit } })), timestamp: Date.now() } as any },
  ];
};

