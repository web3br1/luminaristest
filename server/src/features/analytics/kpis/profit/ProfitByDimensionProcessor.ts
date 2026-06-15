/**
 * Profit By Dimension Processor
 *
 * Calculates profit, cost, or margin by a dimension (customer, campaign, channel, etc.).
 * Uses proportional cost allocation based on revenue share.
 */

import type { AnalyticsProcessor, ChartDataPoint, TableDataRow } from '../../core';
import { addMoney } from '../../utils/CurrencyUtils';
import type { ISchemaField } from '@/features/dynamicTables/models/DynamicTable.model';

type PeriodMode = 'month' | 'year';

function makePeriodKey(date: Date, period: PeriodMode): string {
  if (period === 'year') return `${date.getFullYear()}`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const profitByDimensionProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, fetchByPresetTableKey, fetchByTableId, schema, table } = context;

  const amountField = params.revenueAmountField || params.amountField || 'totalAmount';
  const dateField = params.revenueDateField || params.dateField || 'date';
  const dimensionField = params.dimensionField || 'customerId';
  const statusField = params.statusField || 'status';
  const excludeStatuses: string[] = Array.isArray(params.excludeStatuses)
    ? params.excludeStatuses
    : ['Cancelled'];
  const period: PeriodMode = params.period || 'month';

  const now = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const currentPeriodKey = makePeriodKey(now, period);
  
  const prevDate = new Date(now);
  if (period === 'year') prevDate.setFullYear(prevDate.getFullYear() - 1);
  else prevDate.setMonth(prevDate.getMonth() - 1);
  const prevPeriodKey = makePeriodKey(prevDate, period);

  // Resolve relationship field to display names (e.g., customerId -> customer name)
  let dimensionNameMap: Map<string, string> | null = null;
  if (schema?.fields) {
    const dimensionFieldSchema = schema.fields.find((f: ISchemaField) => f.name === dimensionField);
    if (dimensionFieldSchema?.type === 'relation' && dimensionFieldSchema.relation?.targetTable) {
      try {
        const targetTableRef = String(dimensionFieldSchema.relation.targetTable);
        let displayField = 'name';
        let relatedRows: TableDataRow[] = [];

        // Handle preset table keys
        if (targetTableRef.startsWith('@@PRESET_TABLE_KEY::') && fetchByPresetTableKey) {
          const presetKey = targetTableRef.replace('@@PRESET_TABLE_KEY::', '');
          const result = await fetchByPresetTableKey(presetKey);
          relatedRows = result.rows;
          if (result.schema?.defaultDisplayField) displayField = result.schema.defaultDisplayField;
        }
        // Handle direct table IDs
        else if (fetchByTableId && !targetTableRef.startsWith('@@')) {
          const result = await fetchByTableId(targetTableRef);
          relatedRows = result.rows;
          if (result.schema?.defaultDisplayField) displayField = result.schema.defaultDisplayField;
        }

        if (relatedRows.length > 0) {
          dimensionNameMap = new Map<string, string>();
          for (const relRow of relatedRows) {
            const id = String(relRow.id);
            const displayValue = relRow.data?.[displayField] || relRow.data?.name || id;
            dimensionNameMap.set(id, String(displayValue));
          }
        }
      } catch (err) {
        console.warn(`[profitByDimensionProcessor] Failed to load relation lookup for ${dimensionField}:`, err);
      }
    }
  }

  const revenueByDimension = new Map<string, number>();
  const prevRevenueByDimension = new Map<string, number>();
  const recordIdsByDimension = new Map<string, string[]>();
  const expenseIds: string[] = [];

  // Calculate revenue by dimension
  for (const row of rows) {
    const data = row.data || {};

    if (statusField) {
      const st = String(data[statusField] || '').toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
        continue;
      }
    }

    const amount = Number(data[amountField] ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const rawDate = data[dateField];
    const date = rawDate ? new Date(rawDate) : null;
    if (!date || !Number.isFinite(date.getTime())) continue;

    const key = makePeriodKey(date, period);
    if (key !== currentPeriodKey && key !== prevPeriodKey) continue;

    const dimRaw = data[dimensionField];
    const dimId = String(dimRaw || '').trim();
    
    // Use name from lookup map if available, otherwise use ID or 'Outros'
    const dimKey = dimensionNameMap?.get(dimId) || dimId || 'Outros';

    if (key === currentPeriodKey) {
      revenueByDimension.set(dimKey, addMoney(revenueByDimension.get(dimKey) || 0, amount));
      if (!recordIdsByDimension.has(dimKey)) {
        recordIdsByDimension.set(dimKey, []);
      }
      recordIdsByDimension.get(dimKey)!.push(row.id);
    } else if (key === prevPeriodKey) {
      prevRevenueByDimension.set(dimKey, addMoney(prevRevenueByDimension.get(dimKey) || 0, amount));
    }
  }

  let totalRevenue = 0;
  for (const v of revenueByDimension.values()) {
    totalRevenue = addMoney(totalRevenue, v);
  }

  // Calculate costs from expenses
  let variableCostTotal = Number(params.variableCostTotal ?? 0);
  let fixedCostTotal = Number(params.fixedCostTotal ?? 0);
  let taxesTotal = Number(params.taxesTotal ?? 0);
  
  let prevVariableCostTotal = 0;
  let prevFixedCostTotal = 0;
  let prevTaxesTotal = 0;

  if (fetchByPresetTableKey && typeof params.costSourceTableKey === 'string') {
    try {
      const { rows: expenseRows } = await fetchByPresetTableKey(params.costSourceTableKey);
      const expenseAmountField = params.expenseAmountField || 'amount';
      const expenseCategoryField = params.expenseCategoryField || 'category';
      const expenseDateField = params.expenseDateField || 'paymentDate';

      for (const row of expenseRows) {
        const data = row.data || {};
        const rawAmount = Number(data[expenseAmountField] ?? 0);
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

        const rawDate = data[expenseDateField];
        const date = rawDate ? new Date(rawDate) : null;
        if (!date || !Number.isFinite(date.getTime())) continue;

        const key = makePeriodKey(date, period);
        if (key !== currentPeriodKey && key !== prevPeriodKey) continue;

        if (key === currentPeriodKey) expenseIds.push(row.id);

        const categoryRaw = String(data[expenseCategoryField] || '').toLowerCase();

        if (categoryRaw.includes('variable') || categoryRaw.includes('marketing')) {
          if (key === currentPeriodKey) variableCostTotal = addMoney(variableCostTotal, rawAmount);
          else prevVariableCostTotal = addMoney(prevVariableCostTotal, rawAmount);
        } else if (
          categoryRaw.includes('fixed') ||
          categoryRaw.includes('personnel') ||
          categoryRaw.includes('aluguel')
        ) {
          if (key === currentPeriodKey) fixedCostTotal = addMoney(fixedCostTotal, rawAmount);
          else prevFixedCostTotal = addMoney(prevFixedCostTotal, rawAmount);
        } else if (categoryRaw.includes('tax') || categoryRaw.includes('imposto')) {
          if (key === currentPeriodKey) taxesTotal = addMoney(taxesTotal, rawAmount);
          else prevTaxesTotal = addMoney(prevTaxesTotal, rawAmount);
        }
      }
    } catch (err) {
      console.warn('[profitByDimensionProcessor] Failed to integrate expenses:', err);
    }
  }

  const totalCosts = addMoney(addMoney(variableCostTotal, fixedCostTotal), taxesTotal);
  const prevTotalCosts = addMoney(addMoney(prevVariableCostTotal, prevFixedCostTotal), prevTaxesTotal);
  const prevTotalRevenue = Array.from(prevRevenueByDimension.values()).reduce((sum, v) => addMoney(sum, v), 0);

  const metricMode: 'profit' | 'cost' | 'margin' = (params.metricMode as any) || 'profit';

  const result: ChartDataPoint[] = [];

  if (totalRevenue <= 0 || revenueByDimension.size === 0) {
    return result;
  }

  // Calculate metric for each dimension
  for (const [dimKey, rev] of revenueByDimension.entries()) {
    if (rev <= 0) continue;

    const share = totalRevenue > 0 ? rev / totalRevenue : 0;
    const allocatedCost = totalCosts * share;
    const netProfit = rev - allocatedCost;
    
    const prevRev = prevRevenueByDimension.get(dimKey) || 0;
    const prevShare = prevTotalRevenue > 0 ? prevRev / prevTotalRevenue : 0;
    const prevAllocatedCost = prevTotalCosts * prevShare;
    const prevNetProfit = prevRev - prevAllocatedCost;

    let value = 0;
    let previousValue: number | undefined = undefined;
    
    if (metricMode === 'profit') {
      value = netProfit;
      previousValue = prevTotalRevenue > 0 || prevRev > 0 ? prevNetProfit : undefined;
    } else if (metricMode === 'cost') {
      value = allocatedCost;
      previousValue = prevTotalRevenue > 0 || prevRev > 0 ? prevAllocatedCost : undefined;
    } else if (metricMode === 'margin') {
      value = rev > 0 ? (netProfit / rev) * 100 : 0;
      previousValue = prevRev > 0 ? (prevNetProfit / prevRev) * 100 : undefined;
    }

    // Combine revenue and expense IDs for this dimension
    const revenueIds = recordIdsByDimension.get(dimKey) || [];
    const allIds = [...new Set([...revenueIds, ...expenseIds])];

    result.push({
      name: dimKey || 'Outros',
      value,
      previousValue,
      recordIds: allIds.length > 0 ? allIds : undefined,
      tableSource: table.presetKey || params.tableId || 'sales',
    });
  }

  result.sort((a, b) => b.value - a.value);
  return result;
};

