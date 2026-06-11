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

  // DEBUG: Track filtering
  let rowsSkippedExcluded = 0;
  let rowsSkippedNotFinalized = 0;
  let rowsSkippedNotPaid = 0;
  let rowsSkippedInvalidAmount = 0;
  let rowsSkippedInvalidDate = 0;
  let rowsSkippedWrongPeriod = 0;
  let rowsIncluded = 0;

  // DEBUG: Detailed tracking for each row
  const revenueRowDetails: Array<{
    id: string;
    amount: number;
    rawAmount: any; // Valor bruto antes da conversão
    date: string | null;
    status: string;
    paymentStatus: string;
    periodKey: string | null;
    included: boolean;
    reason: string;
    totalAmountField?: any; // Valor do campo totalAmount original
    dateDebug?: any; // Informações detalhadas sobre a data (timezone, etc.)
  }> = [];

  // Process revenue rows
  for (const row of rows) {
    const data = row.data || {};
    const rowStatus = String(data[statusField] || '');
    const rowPaymentStatus = String(data[paymentStatusField] || '');
    const rawAmountValue = data[revenueAmountField]; // Valor bruto do campo
    const rowAmount = DataSanitizer.extractCurrency(rawAmountValue);
    const rawDate = data[revenueDateField];
    const date = rawDate ? new Date(rawDate) : null;

    let reason = '';
    let included = false;

    // Skip excluded statuses
    if (statusField) {
      const st = rowStatus.toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
        rowsSkippedExcluded++;
        reason = `Excluded status: ${rowStatus}`;
        revenueRowDetails.push({
          id: row.id,
          amount: rowAmount,
          rawAmount: rawAmountValue,
          date: rawDate || null,
          status: rowStatus,
          paymentStatus: rowPaymentStatus,
          periodKey: null,
          included: false,
          reason,
          totalAmountField: data[revenueAmountField],
          dateDebug: rawDate ? {
            rawDate,
            dateISO: date?.toISOString(),
            dateLocal: date?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          } : null,
        });
        continue;
      }
    }

    // Require Finalized status if enabled
    if (requireFinalized && statusField) {
      const st = rowStatus.toLowerCase();
      if (st !== 'finalized') {
        rowsSkippedNotFinalized++;
        reason = `Not finalized: ${rowStatus}`;
        revenueRowDetails.push({
          id: row.id,
          amount: rowAmount,
          rawAmount: rawAmountValue,
          date: rawDate || null,
          status: rowStatus,
          paymentStatus: rowPaymentStatus,
          periodKey: null,
          included: false,
          reason,
          totalAmountField: data[revenueAmountField],
        });
        continue;
      }
    }

    // Require Paid payment status if enabled
    if (requirePaid && paymentStatusField) {
      const paymentStatus = rowPaymentStatus.toLowerCase();
      if (paymentStatus !== 'paid' && paymentStatus !== 'pago') {
        rowsSkippedNotPaid++;
        reason = `Not paid: ${rowPaymentStatus}`;
        revenueRowDetails.push({
          id: row.id,
          amount: rowAmount,
          rawAmount: rawAmountValue,
          date: rawDate || null,
          status: rowStatus,
          paymentStatus: rowPaymentStatus,
          periodKey: null,
          included: false,
          reason,
          totalAmountField: data[revenueAmountField],
        });
        continue;
      }
    }

    if (!Number.isFinite(rowAmount) || rowAmount <= 0) {
      rowsSkippedInvalidAmount++;
      reason = `Invalid amount: ${rowAmount}`;
      revenueRowDetails.push({
        id: row.id,
        amount: rowAmount,
        rawAmount: rawAmountValue,
        date: rawDate || null,
        status: rowStatus,
        paymentStatus: rowPaymentStatus,
        periodKey: null,
        included: false,
        reason,
        totalAmountField: data[revenueAmountField],
      });
      continue;
    }

    if (!date || !isFinite(date.getTime())) {
      rowsSkippedInvalidDate++;
      reason = `Invalid date: ${rawDate}`;
      revenueRowDetails.push({
        id: row.id,
        amount: rowAmount,
        rawAmount: rawAmountValue,
        date: rawDate || null,
        status: rowStatus,
        paymentStatus: rowPaymentStatus,
        periodKey: null,
        included: false,
        reason,
        totalAmountField: data[revenueAmountField],
      });
      continue;
    }

    const isCurrent = isDateWithinWindow(date, boundaries.currentStart, boundaries.currentEnd);
    const isPrev = isDateWithinWindow(date, boundaries.prevStart, boundaries.prevEnd);

    // Update History (sparklines)
    const monthKey = getZonedPeriodKey(date, 'month', timeZone);
    if (historyMap.has(monthKey)) {
      historyMap.get(monthKey)!.revenue = addMoney(historyMap.get(monthKey)!.revenue, rowAmount);
    }

    const key = isCurrent ? 'CURRENT' : (isPrev ? 'PREV' : 'OUTSIDE');

    // DEBUG: Log date calculation details for timezone debugging
    const dateDebug = {
      rawDate,
      dateISO: date.toISOString(),
      dateLocal: date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      periodKey: key,
    };

    if (isCurrent) {
      totalRevenue = addMoney(totalRevenue, rowAmount);
      currentPeriodRevenueIds.push(row.id);
      rowsIncluded++;
      included = true;
      reason = `Included (current period)`;
    } else if (isPrev) {
      totalRevenuePrevPeriod = addMoney(totalRevenuePrevPeriod, rowAmount);
      prevPeriodRevenueIds.push(row.id);
      included = true;
      reason = `Included (previous period)`;
    } else {
      rowsSkippedWrongPeriod++;
      reason = `Wrong period (outside of both boundaries)`;
    }

    // Add date debug info to revenue row details
    const revenueDetail = {
      id: row.id,
      amount: rowAmount,
      rawAmount: rawAmountValue,
      date: rawDate || null,
      status: rowStatus,
      paymentStatus: rowPaymentStatus,
      periodKey: key,
      included,
      reason,
      totalAmountField: data[revenueAmountField],
      dateDebug, // NOVO: Informações detalhadas sobre a data
    };

    revenueRowDetails.push(revenueDetail);

    const customerId = String(data.customerId || '').trim();
    if (customerId) {
      revenueByCustomer.set(customerId, addMoney(revenueByCustomer.get(customerId) || 0, rowAmount));
    }
  }

  // Calculate revenue summary statistics
  const amountsSummary = {
    totalRows: rows.length,
    rowsWithZeroAmount: revenueRowDetails.filter(r => r.amount === 0).length,
    rowsWithNullAmount: revenueRowDetails.filter(r => r.rawAmount == null || r.rawAmount === undefined).length,
    rowsWithInvalidAmount: revenueRowDetails.filter(r => !Number.isFinite(r.amount) || r.amount <= 0).length,
    includedRowsWithZeroAmount: revenueRowDetails.filter(r => r.included && r.amount === 0).length,
    totalAmountIncluded: revenueRowDetails.filter(r => r.included).reduce((sum, r) => sum + r.amount, 0),
    revenueAmountField,
    sampleZeroAmountRows: revenueRowDetails.filter(r => r.amount === 0).slice(0, 3).map(r => ({
      id: r.id,
      rawAmount: r.rawAmount,
      amount: r.amount,
      totalAmountField: r.totalAmountField,
      status: r.status,
      paymentStatus: r.paymentStatus,
    })),
    // NOVO: Análise de vendas por status
    salesByStatus: {
      finalized: revenueRowDetails.filter(r => r.status.toLowerCase() === 'finalized').length,
      draft: revenueRowDetails.filter(r => r.status.toLowerCase() === 'draft').length,
      paid: revenueRowDetails.filter(r => r.paymentStatus.toLowerCase() === 'paid' || r.paymentStatus.toLowerCase() === 'pago').length,
      pending: revenueRowDetails.filter(r => r.paymentStatus.toLowerCase() === 'pending').length,
    },
    // NOVO: Análise de vendas incluídas vs excluídas
    includedVsExcluded: {
      included: revenueRowDetails.filter(r => r.included).length,
      excluded: revenueRowDetails.filter(r => !r.included).length,
      excludedByStatus: revenueRowDetails.filter(r => !r.included && r.reason.includes('Not finalized')).length,
      excludedByPayment: revenueRowDetails.filter(r => !r.included && r.reason.includes('Not paid')).length,
      excludedByPeriod: revenueRowDetails.filter(r => !r.included && r.reason.includes('Wrong period')).length,
    },
    // NOVO: Verificar se há vendas duplicadas
    duplicateIds: (() => {
      const ids = revenueRowDetails.map(r => r.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      return duplicates.length > 0 ? [...new Set(duplicates)] : null;
    })(),
  };

  // Integrate with expenses table if available
  let expenseRowsTotal = 0;
  let expenseRowsSkippedNotPaid = 0;
  let expenseRowsSkippedInvalidAmount = 0;
  let expenseRowsSkippedInvalidDate = 0;
  let expenseRowsSkippedWrongPeriod = 0;
  let expenseRowsIncluded = 0;

  // DEBUG: Detailed tracking for each expense row
  const expenseRowDetails: Array<{
    id: string;
    amount: number;
    date: string | null;
    category: string;
    categoryRaw: string;
    paymentStatus: string;
    periodKey: string | null;
    included: boolean;
    classifiedAs: string;
    reason: string;
    dateDebug?: any; // Informações detalhadas sobre a data (timezone, etc.)
  }> = [];

  let prevVariableCostTotal = 0;
  let prevFixedCostTotal = 0;
  let prevTaxesTotal = 0;
  let prevNonRecurringTotal = 0;

  if (fetchByPresetTableKey && typeof params.costSourceTableKey === 'string') {
    try {
      const { rows: expenseRows } = await fetchByPresetTableKey(params.costSourceTableKey);
      expenseRowsTotal = expenseRows.length;
      const expenseAmountField = params.expenseAmountField || 'amount';
      const expenseCategoryField = params.expenseCategoryField || 'category';
      const expenseDateField = params.expenseDateField || 'paymentDate';
      const expensePaymentStatusField = params.expensePaymentStatusField || 'paymentStatus';
      const requireExpensePaid = params.requireExpensePaid !== false; // Default: true

      for (const row of expenseRows) {
        const data = row.data || {};
        const rowPaymentStatus = String(data[expensePaymentStatusField] || '');
        const rawAmountValue = data[expenseAmountField];
        const rowAmount = DataSanitizer.extractCurrency(rawAmountValue);
        const rowCategory = String(data[expenseCategoryField] || '');
        const categoryRaw = rowCategory.toLowerCase();
        const rawDate = data[expenseDateField];
        const date = rawDate ? new Date(rawDate) : null;

        let reason = '';
        let included = false;
        let classifiedAs = 'none';

        // Require Paid payment status for expenses if enabled
        if (requireExpensePaid && expensePaymentStatusField) {
          const paymentStatus = rowPaymentStatus.toLowerCase();
          if (paymentStatus !== 'paid' && paymentStatus !== 'pago') {
            expenseRowsSkippedNotPaid++;
            reason = `Not paid: ${rowPaymentStatus}`;
            expenseRowDetails.push({
              id: row.id,
              amount: rowAmount,
              date: rawDate || null,
              category: rowCategory,
              categoryRaw,
              paymentStatus: rowPaymentStatus,
              periodKey: null,
              included: false,
              classifiedAs: 'none',
              reason,
            });
            continue;
          }
        }

        if (!Number.isFinite(rowAmount) || rowAmount <= 0) {
          expenseRowsSkippedInvalidAmount++;
          reason = `Invalid amount: ${rowAmount}`;
          expenseRowDetails.push({
            id: row.id,
            amount: rowAmount,
            date: rawDate || null,
            category: rowCategory,
            categoryRaw,
            paymentStatus: rowPaymentStatus,
            periodKey: null,
            included: false,
            classifiedAs: 'none',
            reason,
          });
          continue;
        }

        if (!date || !isFinite(date.getTime())) {
          expenseRowsSkippedInvalidDate++;
          reason = `Invalid date: ${rawDate}`;
          expenseRowDetails.push({
            id: row.id,
            amount: rowAmount,
            date: rawDate || null,
            category: rowCategory,
            categoryRaw,
            paymentStatus: rowPaymentStatus,
            periodKey: null,
            included: false,
            classifiedAs: 'none',
            reason,
          });
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

        const key = isCurrent ? 'CURRENT' : (isPrev ? 'PREV' : 'OUTSIDE');

        // DEBUG: Log date calculation details for timezone debugging
        const expenseDateDebug = {
          rawDate,
          dateISO: date.toISOString(),
          dateLocal: date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hours: date.getHours(),
          periodKey: key,
        };

        if (!isCurrent && !isPrev) {
          expenseRowsSkippedWrongPeriod++;
          reason = `Wrong period (outside of boundaries)`;
          expenseRowDetails.push({
            id: row.id,
            amount: rowAmount,
            date: rawDate || null,
            category: rowCategory,
            categoryRaw,
            paymentStatus: rowPaymentStatus,
            periodKey: key,
            included: false,
            classifiedAs: 'none',
            reason,
            dateDebug: expenseDateDebug,
          });
          continue;
        }

        expenseIds.push(row.id);
        expenseRowsIncluded++;
        included = true;

        // Classify costs
        if (categoryRaw.includes('variable') || categoryRaw.includes('marketing')) {
          if (isCurrent) variableCostTotal = addMoney(variableCostTotal, rowAmount);
          else if (isPrev) prevVariableCostTotal = addMoney(prevVariableCostTotal, rowAmount);
          classifiedAs = 'variable';
        } else if (
          categoryRaw.includes('fixed') ||
          categoryRaw.includes('personnel') ||
          categoryRaw.includes('aluguel')
        ) {
          if (isCurrent) fixedCostTotal = addMoney(fixedCostTotal, rowAmount);
          else if (isPrev) prevFixedCostTotal = addMoney(prevFixedCostTotal, rowAmount);
          classifiedAs = 'fixed';
        } else if (categoryRaw.includes('tax') || categoryRaw.includes('imposto')) {
          if (isCurrent) taxesTotal = addMoney(taxesTotal, rowAmount);
          else if (isPrev) prevTaxesTotal = addMoney(prevTaxesTotal, rowAmount);
          classifiedAs = 'tax';
        } else {
          classifiedAs = 'unclassified';
        }

        if (categoryRaw.includes('nonrecurring') || categoryRaw.includes('não recorrente')) {
          if (isCurrent) nonRecurringTotal = addMoney(nonRecurringTotal, rowAmount);
          else if (isPrev) prevNonRecurringTotal = addMoney(prevNonRecurringTotal, rowAmount);
        }

        reason = `Included (period: ${key}, classified as: ${classifiedAs})`;
        expenseRowDetails.push({
          id: row.id,
          amount: rowAmount,
          date: rawDate || null,
          category: rowCategory,
          categoryRaw,
          paymentStatus: rowPaymentStatus,
          periodKey: key,
          included: true,
          classifiedAs,
          reason,
          dateDebug: expenseDateDebug, // NOVO: Informações detalhadas sobre a data
        });
      }

      // Calculate expense summary statistics
      const expenseAmountsSummary = {
        totalExpenseRows: expenseRows.length,
        expenseRowsIncluded,
        expenseRowsSkippedNotPaid,
        expenseRowsSkippedWrongPeriod,
        expenseRowsSkippedInvalidAmount,
        expenseRowsSkippedInvalidDate,
        // NOVO: Análise de classificação
        classificationSummary: {
          variable: expenseRowDetails.filter(r => r.classifiedAs === 'variable' && r.included).reduce((sum, r) => sum + r.amount, 0),
          fixed: expenseRowDetails.filter(r => r.classifiedAs === 'fixed' && r.included).reduce((sum, r) => sum + r.amount, 0),
          tax: expenseRowDetails.filter(r => r.classifiedAs === 'tax' && r.included).reduce((sum, r) => sum + r.amount, 0),
          unclassified: expenseRowDetails.filter(r => r.classifiedAs === 'unclassified' && r.included).length,
          none: expenseRowDetails.filter(r => r.classifiedAs === 'none' && r.included).length,
        },
        // NOVO: Análise de períodos errados
        wrongPeriodExpenses: expenseRowDetails.filter(r => !r.included && r.reason.includes('Wrong period')).map(r => ({
          id: r.id,
          amount: r.amount,
          category: r.category,
          date: r.date,
          periodKey: r.periodKey,
          expectedPeriod: 'CURRENT',
          dateDebug: r.dateDebug,
        })),
        // NOVO: Verificar se há despesas duplicadas
        duplicateIds: (() => {
          const ids = expenseRowDetails.map(r => r.id);
          const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
          return duplicates.length > 0 ? [...new Set(duplicates)] : null;
        })(),
        // NOVO: Análise de categorias
        categoriesFound: [...new Set(expenseRowDetails.map(r => r.category))],
        categoriesIncluded: [...new Set(expenseRowDetails.filter(r => r.included).map(r => r.category))],
        categoriesExcluded: [...new Set(expenseRowDetails.filter(r => !r.included).map(r => r.category))],
      };
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

