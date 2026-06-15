/**
 * Cashflow KPI Processor
 *
 * Calculates 11 cashflow and solvency KPIs in a single pass.
 *
 * KPIs included:
 * 1.  Fluxo de Caixa Operacional
 * 2.  Fluxo de Caixa Livre
 * 3.  Saldo de Caixa
 * 4.  Contas a Receber Total
 * 5.  Contas a Receber Vencidas
 * 6.  Prazo Médio de Recebimento (dias)
 * 7.  Contas a Pagar Total
 * 8.  Contas a Pagar Vencidas
 * 9.  Prazo Médio de Pagamento (dias)
 * 10. Índice de Liquidez Corrente
 * 11. Índice de Solvência
 *
 * Gold Standard compliant:
 * - DataSanitizer.extractCurrency on all monetary fields
 * - addMoney() for all accumulations (anti float-drift)
 * - getZonedPeriodKey() for timezone-safe period bucketing
 * - 12-month pre-zeroed historyMap with setDate(1) anti-leap-month guard
 * - freeCashflow formula corrected: operationalCashflow - investmentOutflow
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import {
  daysBetween,
  getPeriodBoundaries,
  isDateWithinWindow,
  getZonedPeriodKey,
} from '../../utils/DateUtils';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { addMoney } from '../../utils/CurrencyUtils';

// =============================================================================
// PROCESSOR
// =============================================================================

export const cashflowKpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, fetchByPresetTableKey, table } = context;

  // Field mappings for Sales (receivables)
  const salesAmountField        = params.salesAmountField        || 'totalAmount';
  const salesDateField          = params.salesDateField          || 'date';
  const salesDueDateField       = params.salesDueDateField       || 'dueDate';
  const salesPaymentStatusField = params.salesPaymentStatusField || 'paymentStatus';
  const salesStatusField        = params.salesStatusField        || 'status';
  const excludeStatuses: string[] = Array.isArray(params.excludeStatuses)
    ? params.excludeStatuses
    : ['Cancelled'];

  // Field mappings for Expenses (payables)
  const expenseAmountField        = params.expenseAmountField        || 'amount';
  const expenseDateField          = params.expenseDateField          || 'date';
  const expenseDueDateField       = params.expenseDueDateField       || 'dueDate';
  const expensePaymentStatusField = params.expensePaymentStatusField || 'paymentStatus';
  const expenseCategoryField      = params.expenseCategoryField      || 'category';

  const datePreset = params.datePreset || 'thisMonth';
  const timeZone   = params.timeZone   || 'UTC';
  const now        = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const boundaries = getPeriodBoundaries(datePreset, now, timeZone);

  // ===========================================================================
  // PRE-FILL 12-MONTH HISTORY MAP (zero-safe, timezone-aware, anti-leap-month)
  // ===========================================================================
  const historyMap = new Map<string, {
    inflow: number;
    outflow: number;
    operationalOutflow: number;
    investmentOutflow: number;
  }>();

  for (let i = 0; i < 12; i++) {
    const d = new Date(now);
    d.setDate(1);             // ← CRITICAL: prevents Feb 31 → Mar 3 leap-month bug
    d.setMonth(d.getMonth() - i);
    const key = getZonedPeriodKey(d, 'month', timeZone);
    historyMap.set(key, { inflow: 0, outflow: 0, operationalOutflow: 0, investmentOutflow: 0 });
  }

  // ===========================================================================
  // ACCUMULATORS — SALES (receivables)
  // ===========================================================================

  // Flow (current / previous period windows)
  let currentReceivedAmount    = 0;
  let currentTotalReceivableDays = 0;
  let currentReceivablesCount  = 0;

  let prevReceivedAmount       = 0;
  let prevTotalReceivableDays  = 0;
  let prevReceivablesCount     = 0;

  // Stock (absolute snapshot up to `now`)
  let stockReceivables         = 0;
  let stockOverdueReceivables  = 0;
  let absoluteReceivedCash     = 0;

  let prevStockReceivables     = 0;
  let prevAbsoluteReceivedCash = 0;

  // Record IDs
  const currentReceivedIds:          string[] = [];
  const stockReceivablesIds:         string[] = [];
  const stockOverdueReceivablesIds:  string[] = [];
  const absoluteReceivedIds:         string[] = [];

  // ===========================================================================
  // LOOP — SALES ROWS
  // ===========================================================================
  for (const row of rows) {
    const data = row.data || {};

    // Skip excluded statuses
    if (salesStatusField) {
      const st = String(data[salesStatusField] || '').toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) continue;
    }

    const amount = DataSanitizer.extractCurrency(data[salesAmountField]);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const saleDate = data[salesDateField] ? new Date(data[salesDateField]) : null;
    if (!saleDate || !isFinite(saleDate.getTime())) continue;

    const isCurrentFlow  = isDateWithinWindow(saleDate, boundaries.currentStart, boundaries.currentEnd);
    const isPrevFlow     = isDateWithinWindow(saleDate, boundaries.prevStart,    boundaries.prevEnd);
    const isValidStock   = saleDate <= now;
    const isValidPrevStock = saleDate <= boundaries.prevEnd;

    if (!isCurrentFlow && !isPrevFlow && !isValidStock && !isValidPrevStock) continue;

    const paymentStatus = String(data[salesPaymentStatusField] || '').toLowerCase();
    const dueDate = data[salesDueDateField] ? new Date(data[salesDueDateField]) : null;

    if (paymentStatus === 'paid' || paymentStatus === 'pago') {
      if (isValidStock) {
        absoluteReceivedCash = addMoney(absoluteReceivedCash, amount);
        absoluteReceivedIds.push(row.id);
      }
      if (isValidPrevStock) {
        prevAbsoluteReceivedCash = addMoney(prevAbsoluteReceivedCash, amount);
      }

      // History — timezone-safe bucket key
      const monthKey = getZonedPeriodKey(saleDate, 'month', timeZone);
      if (historyMap.has(monthKey)) {
        const h = historyMap.get(monthKey)!;
        h.inflow = addMoney(h.inflow, amount);
      }

      // Period flow
      if (isCurrentFlow) {
        currentReceivedAmount = addMoney(currentReceivedAmount, amount);
        currentReceivedIds.push(row.id);
        if (dueDate && isFinite(dueDate.getTime())) {
          currentTotalReceivableDays += daysBetween(saleDate, dueDate);
          currentReceivablesCount++;
        }
      } else if (isPrevFlow) {
        prevReceivedAmount = addMoney(prevReceivedAmount, amount);
        if (dueDate && isFinite(dueDate.getTime())) {
          prevTotalReceivableDays += daysBetween(saleDate, dueDate);
          prevReceivablesCount++;
        }
      }
    } else if (
      paymentStatus === 'pending'  ||
      paymentStatus === 'pendente' ||
      paymentStatus === 'partial'
    ) {
      if (isValidStock) {
        stockReceivables = addMoney(stockReceivables, amount);
        stockReceivablesIds.push(row.id);
        if (dueDate && isFinite(dueDate.getTime()) && dueDate < now) {
          stockOverdueReceivables = addMoney(stockOverdueReceivables, amount);
          stockOverdueReceivablesIds.push(row.id);
        }
      }
      if (isValidPrevStock) {
        prevStockReceivables = addMoney(prevStockReceivables, amount);
      }
    }
  }

  // ===========================================================================
  // ACCUMULATORS — EXPENSES (payables)
  // ===========================================================================

  let currentPaidAmount            = 0;
  let currentTotalPayableDays      = 0;
  let currentPayablesCount         = 0;
  let currentOperationalCashOutflow = 0;
  let currentInvestmentCashOutflow  = 0;

  let prevPaidAmount               = 0;
  let prevTotalPayableDays         = 0;
  let prevPayablesCount            = 0;
  let prevOperationalCashOutflow   = 0;
  let prevInvestmentCashOutflow    = 0;

  let stockPayables                = 0;
  let stockOverduePayables         = 0;
  let absolutePaidCash             = 0;

  let prevStockPayables            = 0;
  let prevAbsolutePaidCash         = 0;

  const currentPaidIds:                string[] = [];
  const currentOperationalOutflowIds:  string[] = [];
  const currentInvestmentOutflowIds:   string[] = [];
  const stockPayablesIds:              string[] = [];
  const stockOverduePayablesIds:       string[] = [];
  const absolutePaidIds:               string[] = [];

  // ===========================================================================
  // LOOP — EXPENSE ROWS (fetched from auxiliary table)
  // ===========================================================================
  if (fetchByPresetTableKey && typeof params.expensesTableKey === 'string') {
    try {
      const { rows: expenseRows } = await fetchByPresetTableKey(params.expensesTableKey);

      for (const row of expenseRows) {
        const data = row.data || {};

        const amount = DataSanitizer.extractCurrency(data[expenseAmountField]);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const expenseDate = data[expenseDateField] ? new Date(data[expenseDateField]) : null;
        if (!expenseDate || !isFinite(expenseDate.getTime())) continue;

        const isCurrentFlow    = isDateWithinWindow(expenseDate, boundaries.currentStart, boundaries.currentEnd);
        const isPrevFlow       = isDateWithinWindow(expenseDate, boundaries.prevStart,    boundaries.prevEnd);
        const isValidStock     = expenseDate <= now;
        const isValidPrevStock = expenseDate <= boundaries.prevEnd;

        if (!isCurrentFlow && !isPrevFlow && !isValidStock && !isValidPrevStock) continue;

        const paymentStatus = String(data[expensePaymentStatusField] || '').toLowerCase();
        const dueDate       = data[expenseDueDateField] ? new Date(data[expenseDueDateField]) : null;
        const category      = String(data[expenseCategoryField] || '').toLowerCase();
        const isInvestment  = category.includes('investment') || category.includes('investimento') || category.includes('capex');

        if (paymentStatus === 'pending' || paymentStatus === 'pendente') {
          if (isValidStock) {
            stockPayables = addMoney(stockPayables, amount);
            stockPayablesIds.push(row.id);
            if (dueDate && isFinite(dueDate.getTime()) && dueDate < now) {
              stockOverduePayables = addMoney(stockOverduePayables, amount);
              stockOverduePayablesIds.push(row.id);
            }
          }
          if (isValidPrevStock) {
            prevStockPayables = addMoney(prevStockPayables, amount);
          }
        } else if (paymentStatus === 'paid' || paymentStatus === 'pago') {
          if (isValidStock) {
            absolutePaidCash = addMoney(absolutePaidCash, amount);
            absolutePaidIds.push(row.id);
          }
          if (isValidPrevStock) {
            prevAbsolutePaidCash = addMoney(prevAbsolutePaidCash, amount);
          }

          // History — timezone-safe bucket key
          const monthKey = getZonedPeriodKey(expenseDate, 'month', timeZone);
          if (historyMap.has(monthKey)) {
            const h = historyMap.get(monthKey)!;
            h.outflow = addMoney(h.outflow, amount);
            if (!isInvestment) {
              h.operationalOutflow = addMoney(h.operationalOutflow, amount);
            } else {
              h.investmentOutflow = addMoney(h.investmentOutflow, amount);
            }
          }

          if (isCurrentFlow) {
            currentPaidAmount = addMoney(currentPaidAmount, amount);
            currentPaidIds.push(row.id);

            if (isInvestment) {
              currentInvestmentCashOutflow = addMoney(currentInvestmentCashOutflow, amount);
              currentInvestmentOutflowIds.push(row.id);
            } else {
              currentOperationalCashOutflow = addMoney(currentOperationalCashOutflow, amount);
              currentOperationalOutflowIds.push(row.id);
            }

            if (dueDate && isFinite(dueDate.getTime())) {
              currentTotalPayableDays += daysBetween(expenseDate, dueDate);
              currentPayablesCount++;
            }
          } else if (isPrevFlow) {
            prevPaidAmount = addMoney(prevPaidAmount, amount);

            if (isInvestment) {
              prevInvestmentCashOutflow = addMoney(prevInvestmentCashOutflow, amount);
            } else {
              prevOperationalCashOutflow = addMoney(prevOperationalCashOutflow, amount);
            }

            if (dueDate && isFinite(dueDate.getTime())) {
              prevTotalPayableDays += daysBetween(expenseDate, dueDate);
              prevPayablesCount++;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[cashflowKpiProcessor] Failed to fetch expenses:', err);
    }
  }

  // ===========================================================================
  // DERIVED METRICS
  // ===========================================================================

  // Flow — Current
  const currentOperationalCashflow = currentReceivedAmount - currentOperationalCashOutflow;
  const currentFreeCashflow        = currentOperationalCashflow - currentInvestmentCashOutflow; // ← FIXED

  const currentAvgCollectionPeriod = currentReceivablesCount > 0
    ? currentTotalReceivableDays / currentReceivablesCount : 0;
  const currentAvgPaymentPeriod = currentPayablesCount > 0
    ? currentTotalPayableDays / currentPayablesCount : 0;

  // Flow — Previous
  const prevOperationalCashflow = prevReceivedAmount - prevOperationalCashOutflow;
  const prevFreeCashflow        = prevOperationalCashflow - prevInvestmentCashOutflow; // ← FIXED

  const prevAvgCollectionPeriod = prevReceivablesCount > 0
    ? prevTotalReceivableDays / prevReceivablesCount : undefined;
  const prevAvgPaymentPeriod = prevPayablesCount > 0
    ? prevTotalPayableDays / prevPayablesCount : undefined;

  // Stock — Cash Balance
  const initialCashBalance = DataSanitizer.extractCurrency(params.initialCashBalance ?? 0);
  const cashBalance         = addMoney(addMoney(initialCashBalance, absoluteReceivedCash), -absolutePaidCash);
  const prevCashBalance     = addMoney(addMoney(initialCashBalance, prevAbsoluteReceivedCash), -prevAbsolutePaidCash);

  // Liquidity & Solvency
  const currentAssets     = addMoney(cashBalance, stockReceivables);
  const prevCurrentAssets = addMoney(prevCashBalance, prevStockReceivables);

  const currentLiquidityRatio = stockPayables > 0
    ? currentAssets / stockPayables
    : currentAssets > 0 ? 999 : 0;
  const prevLiquidityRatio    = prevStockPayables > 0
    ? prevCurrentAssets / prevStockPayables
    : prevCurrentAssets > 0 ? 999 : 0;

  const totalAssets      = DataSanitizer.extractCurrency(params.totalAssets      ?? currentAssets);
  const totalLiabilities = DataSanitizer.extractCurrency(params.totalLiabilities ?? stockPayables);
  const solvencyIndex    = totalLiabilities > 0
    ? totalAssets / totalLiabilities
    : totalAssets > 0 ? 999 : 0;

  const prevTotalAssets      = DataSanitizer.extractCurrency(params.prevTotalAssets      ?? prevCurrentAssets);
  const prevTotalLiabilities = DataSanitizer.extractCurrency(params.prevTotalLiabilities ?? prevStockPayables);
  const prevSolvencyIndex    = prevTotalLiabilities > 0
    ? prevTotalAssets / prevTotalLiabilities
    : prevTotalAssets > 0 ? 999 : 0;

  // ===========================================================================
  // SPARKLINE SERIES — 12-month rolling, balance computed backward
  // ===========================================================================
  const sortedHistory = Array.from(historyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Walk backward from current cashBalance to reconstruct point-in-time balances
  let runningBalance = cashBalance;
  const seriesReversed = [...sortedHistory].reverse().map(([name, data]) => {
    const netFlow            = data.inflow - data.outflow;
    const pointBalance       = runningBalance;
    runningBalance           = addMoney(runningBalance, -netFlow);

    const opCashflow         = data.inflow - data.operationalOutflow;
    const freeCashflow       = opCashflow - data.investmentOutflow; // ← FIXED formula

    return {
      name,
      operationalCashflow: opCashflow,
      freeCashflow,
      cashBalance:  pointBalance,
      liquidity:    stockPayables    > 0 ? addMoney(pointBalance, stockReceivables) / stockPayables    : 0,
      solvency:     totalLiabilities > 0 ? totalAssets / totalLiabilities : 0,
    };
  });
  const series = seriesReversed.reverse();

  // ===========================================================================
  // ID SETS
  // ===========================================================================
  const operationalCashflowIds = [...new Set([...currentReceivedIds, ...currentOperationalOutflowIds])];
  const freeCashflowIds        = [...new Set([...currentReceivedIds, ...currentOperationalOutflowIds, ...currentInvestmentOutflowIds])];
  const cashBalanceIds         = [...new Set([...absoluteReceivedIds, ...absolutePaidIds])];

  // ===========================================================================
  // TABLE SOURCES
  // ===========================================================================
  const mainTableSource    = table.presetKey || table.internalName || params.tableId || 'sales';
  const expenseTableSource = params.expensesTableKey || 'expenses';
  const mixedTableSource   = 'mixed';

  return [
    { name: 'Fluxo de Caixa Operacional', value: currentOperationalCashflow, previousValue: prevOperationalCashflow, recordIds: operationalCashflowIds, tableSource: mixedTableSource,    fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.operationalCashflow } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Fluxo de Caixa Livre',       value: currentFreeCashflow,        previousValue: prevFreeCashflow,        recordIds: freeCashflowIds,        tableSource: mixedTableSource,    fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.freeCashflow        } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Saldo de Caixa',             value: cashBalance,               previousValue: prevCashBalance,         recordIds: cashBalanceIds,         tableSource: mixedTableSource,    fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.cashBalance          } as Record<string, unknown> })), timestamp: Date.now() } },

    { name: 'Contas a Receber Total',             value: stockReceivables,        recordIds: stockReceivablesIds,         tableSource: mainTableSource },
    { name: 'Contas a Receber Vencidas',          value: stockOverdueReceivables, recordIds: stockOverdueReceivablesIds,  tableSource: mainTableSource },
    { name: 'Prazo Médio de Recebimento (dias)',  value: currentAvgCollectionPeriod, previousValue: prevAvgCollectionPeriod, recordIds: currentReceivedIds, tableSource: mainTableSource },

    { name: 'Contas a Pagar Total',               value: stockPayables,           recordIds: stockPayablesIds,            tableSource: expenseTableSource },
    { name: 'Contas a Pagar Vencidas',            value: stockOverduePayables,    recordIds: stockOverduePayablesIds,     tableSource: expenseTableSource },
    { name: 'Prazo Médio de Pagamento (dias)',     value: currentAvgPaymentPeriod, previousValue: prevAvgPaymentPeriod,   recordIds: currentPaidIds,     tableSource: expenseTableSource },

    { name: 'Índice de Liquidez Corrente', value: currentLiquidityRatio, previousValue: prevLiquidityRatio, recordIds: [...stockReceivablesIds, ...stockPayablesIds], tableSource: mixedTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.liquidity } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Índice de Solvência',         value: solvencyIndex,         previousValue: prevSolvencyIndex,  recordIds: [...stockReceivablesIds, ...stockPayablesIds], tableSource: mixedTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.solvency  } as Record<string, unknown> })), timestamp: Date.now() } },
  ];
};
