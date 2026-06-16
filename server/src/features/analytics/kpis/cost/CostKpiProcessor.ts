/**
 * Cost KPI Processor
 *
 * Calculates 14 cost KPIs in a single pass for optimal performance.
 *
 * KPIs included:
 * 1.  Custo Fixo Total
 * 2.  Custo Fixo Médio Mensal
 * 3.  Participação dos Custos Fixos (%)
 * 4.  Custo Variável Total
 * 5.  Custo Variável Médio por Atendimento
 * 6.  Participação dos Custos Variáveis (%)
 * 7.  Despesas Operacionais Totais
 * 8.  Despesas Administrativas (%)
 * 9.  Despesas de Manutenção
 * 10. Despesas Não Recorrentes
 * 11. Impostos Totais Pagos
 * 12. Custo Total
 * 13. Custo por Dia Útil
 * 14. Custo Não Planejado (%)
 */

import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { countBusinessDaysInMonth, getPeriodBoundaries, isDateWithinWindow, getZonedPeriodKey } from '../../utils/DateUtils';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { addMoney } from '../../utils/CurrencyUtils';

// =============================================================================
// HELPERS
// =============================================================================

// REMOVED: Using DateUtils getZonedPeriodKey and timeZone params instead

// =============================================================================
// PROCESSOR
// =============================================================================

export const costKpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => {
  const { rows, params, table, fetchByPresetTableKey } = context;

  const amountField = (params.amountField as string | undefined) ?? 'amount';
  const categoryField = (params.categoryField as string | undefined) ?? 'category';
  const paymentDateField = (params.paymentDateField as string | undefined) ?? 'paymentDate';
  const isPlannedField = (params.isPlannedField as string | undefined) ?? undefined; // No fallback: undefined means feature is disabled

  const datePreset = (params.datePreset as string | undefined) ?? 'thisMonth';
  const monthsWindow = typeof params.monthsWindow === 'number' && params.monthsWindow > 0
    ? params.monthsWindow
    : 12;

  // Time baseline: use referenceDate from params (crucial for audits/history) or current time
  const now = params.referenceDate ? new Date(params.referenceDate as string | number | Date) : new Date();
  const boundaries = getPeriodBoundaries(datePreset, now);

  // Cross-table data: fetch appointment counts if table key is provided
  const appointmentsTableKey = params.appointmentsTableKey as string | undefined;
  let totalAppointmentsPeriod = 0;
  let prevAppointmentsPeriod = 0;

  if (appointmentsTableKey && fetchByPresetTableKey) {
    try {
      const appointmentsData = await fetchByPresetTableKey(appointmentsTableKey.replace('@@PRESET_TABLE_KEY::', ''));
      const apptDateField = (params.appointmentsDateField as string | undefined) ?? 'date';
      
      const currentAppointments = appointmentsData.rows.filter(row => {
        const rawDate = row.data?.[apptDateField];
        if (!rawDate) return false;
        const d = new Date(rawDate as string | number | Date);
        return !isNaN(d.getTime()) && isDateWithinWindow(d, boundaries.currentStart, boundaries.currentEnd);
      });
      totalAppointmentsPeriod = currentAppointments.length;

      const prevAppointments = appointmentsData.rows.filter(row => {
        const rawDate = row.data?.[apptDateField];
        if (!rawDate) return false;
        const d = new Date(rawDate as string | number | Date);
        return !isNaN(d.getTime()) && isDateWithinWindow(d, boundaries.prevStart, boundaries.prevEnd);
      });
      prevAppointmentsPeriod = prevAppointments.length;
    } catch (err) {
      console.warn(`[CostKpiProcessor] Error fetching appointments from ${appointmentsTableKey}:`, err);
      totalAppointmentsPeriod = Number(params.totalAppointmentsPeriod ?? 0);
    }
  } else {
    totalAppointmentsPeriod = Number(params.totalAppointmentsPeriod ?? 0);
  }

  // Dynamic categorization (avoiding hardcoded strings)
  const fixedKeywords = Array.isArray(params.fixedCategoryNames)
    ? (params.fixedCategoryNames as string[]).map((k) => k.toLowerCase())
    : ['fixed', 'fixo', 'aluguel', 'personnel', 'folha'];

  const variableKeywords = Array.isArray(params.variableCategoryNames)
    ? (params.variableCategoryNames as string[]).map((k) => k.toLowerCase())
    : ['variable', 'variável', 'marketing', 'suprimentos', 'comissão'];

  const adminKeywords = Array.isArray(params.adminCategoryNames)
    ? (params.adminCategoryNames as string[]).map((k) => k.toLowerCase())
    : ['admin', 'administrativo', 'personnel', 'office'];

  const maintenanceKeywords = Array.isArray(params.maintenanceCategoryNames)
    ? (params.maintenanceCategoryNames as string[]).map((k) => k.toLowerCase())
    : ['maintenance', 'manutenção', 'reparo'];

  const nonRecurringKeywords = Array.isArray(params.nonRecurringCategoryNames)
    ? (params.nonRecurringCategoryNames as string[]).map((k) => k.toLowerCase())
    : ['nonrecurring', 'não recorrente', 'avulso'];

  const taxKeywords = Array.isArray(params.taxCategoryNames)
    ? (params.taxCategoryNames as string[]).map((k) => k.toLowerCase())
    : ['tax', 'imposto', 'tributo'];

  // History tracking for sparklines (24 months trailing for YoY)
  const historyMap = new Map<string, { 
    total: number, 
    fixed: number, 
    variable: number, 
    admin: number,
    maintenance: number,
    taxes: number,
    unplanned: number
  }>();
  
  const tz = (params.timeZone as string | undefined) ?? 'America/Sao_Paulo';
  const limitWindow = Math.max(12, monthsWindow, 24); // Ensure at least 24 months for historyMap
  for (let i = 0; i < limitWindow; i++) {
    const d = new Date(now);
    d.setDate(1); // Anti-leap-month lock
    d.setMonth(d.getMonth() - i);
    historyMap.set(getZonedPeriodKey(d, 'month', tz), { total: 0, fixed: 0, variable: 0, admin: 0, maintenance: 0, taxes: 0, unplanned: 0 });
  }

  // Accumulators (CURRENT)
  let fixedTotal = 0;
  let variableTotal = 0;
  let adminTotal = 0;
  let maintenanceTotal = 0;
  let nonRecurringTotal = 0;
  let taxesTotal = 0;
  let plannedTotal = 0;
  let unplannedTotal = 0;
  let overallTotal = 0;

  // Accumulators (PREVIOUS)
  let prevFixedTotal = 0;
  let prevVariableTotal = 0;
  let prevAdminTotal = 0;
  let prevMaintenanceTotal = 0;
  let prevNonRecurringTotal = 0;
  let prevTaxesTotal = 0;
  let prevUnplannedTotal = 0;
  let prevOverallTotal = 0;

  // Record IDs collectors
  const fixedIds: string[] = [];
  const variableIds: string[] = [];
  const adminIds: string[] = [];
  const maintenanceIds: string[] = [];
  const nonRecurringIds: string[] = [];
  const taxesIds: string[] = [];
  const plannedIds: string[] = [];
  const unplannedIds: string[] = [];
  const overallIds: string[] = [];

  const excludeStatuses: string[] = Array.isArray(params.excludeStatuses)
    ? params.excludeStatuses as string[]
    : ['Cancelled'];
  const statusField = params.statusField as string | undefined;

  for (const row of rows) {
    const data = row.data || {};

    // Check excluded statuses
    if (statusField) {
      const st = String(data[statusField] || '').toLowerCase();
      if (excludeStatuses.some((s) => st === String(s).toLowerCase())) {
        continue;
      }
    }

    const rawAmountValue = data[amountField] ?? 0;
    const rawAmount = DataSanitizer.extractCurrency(rawAmountValue);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

    const rawDate = paymentDateField ? data[paymentDateField] : null;
    const date = rawDate ? new Date(rawDate as string | number | Date) : null;
    if (!date || isNaN(date.getTime())) continue;

    const isCurrent = isDateWithinWindow(date, boundaries.currentStart, boundaries.currentEnd);
    const isPrev = isDateWithinWindow(date, boundaries.prevStart, boundaries.prevEnd);

    // Update History (sparklines)
    const monthKey = getZonedPeriodKey(date, 'month', tz);
    if (historyMap.has(monthKey)) {
      const h = historyMap.get(monthKey)!;
      h.total = addMoney(h.total, rawAmount);
      const cat = String(data[categoryField] || '').toLowerCase();
      if (fixedKeywords.some(k => cat.includes(k))) h.fixed = addMoney(h.fixed, rawAmount);
      if (variableKeywords.some(k => cat.includes(k))) h.variable = addMoney(h.variable, rawAmount);
      if (adminKeywords.some(k => cat.includes(k))) h.admin = addMoney(h.admin, rawAmount);
      if (maintenanceKeywords.some(k => cat.includes(k))) h.maintenance = addMoney(h.maintenance, rawAmount);
      if (taxKeywords.some(k => cat.includes(k))) h.taxes = addMoney(h.taxes, rawAmount);
      if (isPlannedField && !data[isPlannedField]) h.unplanned = addMoney(h.unplanned, rawAmount);
    }

    if (!isCurrent && !isPrev) continue;

    const categoryRaw = String(data[categoryField] || '').toLowerCase();
    const isPlanned = isPlannedField ? Boolean(data[isPlannedField]) : false;

    if (isCurrent) {
      overallTotal = addMoney(overallTotal, rawAmount);
      overallIds.push(row.id);

      // Category classification
      if (fixedKeywords.some(k => categoryRaw.includes(k))) {
        fixedTotal = addMoney(fixedTotal, rawAmount);
        fixedIds.push(row.id);
      }
      if (variableKeywords.some(k => categoryRaw.includes(k))) {
        variableTotal = addMoney(variableTotal, rawAmount);
        variableIds.push(row.id);
      }
      if (adminKeywords.some(k => categoryRaw.includes(k))) {
        adminTotal = addMoney(adminTotal, rawAmount);
        adminIds.push(row.id);
      }
      if (maintenanceKeywords.some(k => categoryRaw.includes(k))) {
        maintenanceTotal = addMoney(maintenanceTotal, rawAmount);
        maintenanceIds.push(row.id);
      }
      if (nonRecurringKeywords.some(k => categoryRaw.includes(k))) {
        nonRecurringTotal = addMoney(nonRecurringTotal, rawAmount);
        nonRecurringIds.push(row.id);
      }
      if (taxKeywords.some(k => categoryRaw.includes(k))) {
        taxesTotal = addMoney(taxesTotal, rawAmount);
        taxesIds.push(row.id);
      }

      // Planned vs unplanned
      if (isPlanned) {
        plannedTotal = addMoney(plannedTotal, rawAmount);
        plannedIds.push(row.id);
      } else {
        unplannedTotal = addMoney(unplannedTotal, rawAmount);
        unplannedIds.push(row.id);
      }
    } else if (isPrev) {
      prevOverallTotal = addMoney(prevOverallTotal, rawAmount);
      if (fixedKeywords.some(k => categoryRaw.includes(k))) prevFixedTotal = addMoney(prevFixedTotal, rawAmount);
      if (variableKeywords.some(k => categoryRaw.includes(k))) prevVariableTotal = addMoney(prevVariableTotal, rawAmount);
      if (adminKeywords.some(k => categoryRaw.includes(k))) prevAdminTotal = addMoney(prevAdminTotal, rawAmount);
      if (maintenanceKeywords.some(k => categoryRaw.includes(k))) prevMaintenanceTotal = addMoney(prevMaintenanceTotal, rawAmount);
      if (nonRecurringKeywords.some(k => categoryRaw.includes(k))) prevNonRecurringTotal = addMoney(prevNonRecurringTotal, rawAmount);
      if (taxKeywords.some(k => categoryRaw.includes(k))) prevTaxesTotal = addMoney(prevTaxesTotal, rawAmount);
      // Track prev unplanned for trend arrow on 'Custo Não Planejado (%)'
      const wasPrevPlanned = isPlannedField ? Boolean(data[isPlannedField]) : true;
      if (!wasPrevPlanned) prevUnplannedTotal = addMoney(prevUnplannedTotal, rawAmount);
    }
  }

  // Format series for sparklines early to calculate avg
  const series = Array.from(historyMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Calculate derived metrics
  const monthsWithFixedCosts = series.filter(s => s.fixed > 0).length;
  const fixedAvgMonthly = monthsWithFixedCosts > 0 
    ? series.reduce((acc, s) => addMoney(acc, s.fixed), 0) / monthsWithFixedCosts 
    : 0;
    
  const fixedSharePct = overallTotal > 0 ? (fixedTotal / overallTotal) * 100 : 0;
  const variableSharePct = overallTotal > 0 ? (variableTotal / overallTotal) * 100 : 0;
  const unplannedSharePct = !isPlannedField ? 0 : (overallTotal > 0 ? (unplannedTotal / overallTotal) * 100 : 0);
  const adminSharePct = overallTotal > 0 ? (adminTotal / overallTotal) * 100 : 0;

  // Previous metrics for trend arrows
  const prevFixedSharePct = prevOverallTotal > 0 ? (prevFixedTotal / prevOverallTotal) * 100 : undefined;
  const prevVariableSharePct = prevOverallTotal > 0 ? (prevVariableTotal / prevOverallTotal) * 100 : undefined;
  const prevUnplannedSharePct = !isPlannedField || prevOverallTotal === 0 ? undefined : (prevOverallTotal > 0 ? (prevUnplannedTotal / prevOverallTotal) * 100 : 0);
  const prevAdminSharePct = prevOverallTotal > 0 ? (prevAdminTotal / prevOverallTotal) * 100 : undefined;

  // Cost per business day
  let costPerBusinessDay = 0;
  if (overallTotal > 0) {
    const businessDays = countBusinessDaysInMonth(boundaries.currentStart);
    costPerBusinessDay = overallTotal / (businessDays || 1);
  }
  
  let prevCostPerBusinessDay = 0;
  if (prevOverallTotal > 0) {
    const prevBusinessDays = countBusinessDaysInMonth(boundaries.prevStart);
    prevCostPerBusinessDay = prevOverallTotal / (prevBusinessDays || 1);
  }

  // Variable cost per appointment
  const variableCostPerAppointment = totalAppointmentsPeriod > 0
    ? variableTotal / totalAppointmentsPeriod
    : 0;
    
  const prevVariableCostPerAppointment = prevAppointmentsPeriod > 0
    ? prevVariableTotal / prevAppointmentsPeriod
    : 0;

  // Combine IDs for operational expenses (admin + maintenance + variable)
  const operationalIds = [...new Set([...adminIds, ...maintenanceIds, ...variableIds])];
  const operationalTotal = addMoney(addMoney(adminTotal, maintenanceTotal), variableTotal);
  const prevOperationalTotal = addMoney(addMoney(prevAdminTotal, prevMaintenanceTotal), prevVariableTotal);

  // Determine table source
  const mainTableSource = table.presetKey || (params.tableId as string | undefined) || 'expenses';

  // (series already declared above for avg computation)

  // Return all KPIs with recordIds, tableSource and fullRecords (for sparklines)
  return [
    { name: 'Custo Fixo Total', value: fixedTotal, previousValue: prevFixedTotal, recordIds: fixedIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.fixed } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo Fixo Médio Mensal', value: fixedAvgMonthly, recordIds: fixedIds, tableSource: mainTableSource },
    { name: 'Participação dos Custos Fixos (%)', value: fixedSharePct, previousValue: prevFixedSharePct, recordIds: overallIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.fixed / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo Variável Total', value: variableTotal, previousValue: prevVariableTotal, recordIds: variableIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.variable } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo Variável Médio por Atendimento', value: variableCostPerAppointment, previousValue: prevVariableCostPerAppointment, recordIds: variableIds, tableSource: mainTableSource },
    { name: 'Participação dos Custos Variáveis (%)', value: variableSharePct, previousValue: prevVariableSharePct, recordIds: overallIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.variable / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Despesas Operacionais Totais', value: operationalTotal, previousValue: prevOperationalTotal, recordIds: operationalIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.admin + s.maintenance + s.variable } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Despesas Administrativas (%)', value: adminSharePct, previousValue: prevAdminSharePct, recordIds: adminIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.admin / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Despesas de Manutenção', value: maintenanceTotal, previousValue: prevMaintenanceTotal, recordIds: maintenanceIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.maintenance } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Despesas Não Recorrentes', value: nonRecurringTotal, previousValue: prevNonRecurringTotal, recordIds: nonRecurringIds, tableSource: mainTableSource },
    { name: 'Impostos Totais Pagos', value: taxesTotal, previousValue: prevTaxesTotal, recordIds: taxesIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.taxes } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo Total', value: overallTotal, previousValue: prevOverallTotal, recordIds: overallIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total } as Record<string, unknown> })), timestamp: Date.now() } },
    { name: 'Custo por Dia Útil', value: costPerBusinessDay, previousValue: prevCostPerBusinessDay, recordIds: overallIds, tableSource: mainTableSource },
    { name: 'Custo Não Planejado (%)', value: unplannedSharePct, previousValue: prevUnplannedSharePct, recordIds: unplannedIds, tableSource: mainTableSource, fullRecords: { records: series.map(s => ({ id: s.name, data: { value: s.total > 0 ? (s.unplanned / s.total) * 100 : 0 } as Record<string, unknown> })), timestamp: Date.now() } },
  ];
};
