import type { ITableSchema } from '../../../models/DynamicTable.model';
import {
  amount,
  budgetGroup,
  expenseCategory,
  description,
  dueDate,
  isPlanned,
  paymentDate,
  unitId,
} from '../../fields';
import { paymentStatus as paymentStatusSelect } from '../../fields/select/SelectPresets';
import type { AnalyticsConfiguration } from '@/features/analytics/core/models/AnalyticsConfiguration';

/**
 * @description Módulo base para a tabela "expenses" (despesas operacionais),
 * estendido para suportar análises de custos fixos/variáveis, planejado x realizado
 * e contas a pagar.
 */
export const expensesModule = {
  name: 'Expenses',
  category: 'finance',
  description: 'Records all operational expenses (fixed and variable) per unit.',
  schema: {
    defaultDisplayField: 'description',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...description, label: 'Description', type: 'string', required: true },
      { ...amount, label: 'Amount' },
      {
        ...paymentDate,
        label: 'Payment Date',
        required: false,
        requiredIf: { field: 'paymentStatus', op: 'eq', value: 'Paid' },
      },
      { ...expenseCategory, label: 'Category' },
      isPlanned,
      {
        ...budgetGroup,
        requiredIf: { field: 'isPlanned', op: 'eq', value: true },
      },
      dueDate,
      {
        ...paymentStatusSelect,
        required: false,
      },
    ],
    immutableAfter: [
      {
        condition: { field: 'paymentStatus', op: 'eq', value: 'Paid' },
        scope: ['amount', 'unitId', 'paymentDate', 'category', 'budgetGroup'],
        errorMessage: 'Paid expenses cannot have financial fields modified.',
      },
    ],
  } as ITableSchema,
  analytics: [
    {
      templateKey: 'costKpis',
      key: 'costKpis',
      title: '2. CUSTOS - KPIs de Custos (Despesas)',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        amountField: 'amount',
        categoryField: 'category',
        paymentDateField: 'paymentDate',
        isPlannedField: 'isPlanned',
      },
      params: {
        period: 'month',
        monthsWindow: 12,
        appointmentsTableKey: '@@PRESET_TABLE_KEY::appointments',
      },
      options: {
        currency: 'BRL',
        defaultImportantFields: ['paymentDate', 'amount', 'category', 'isPlanned', 'status'],
        importantFields: {
          'Custo Fixo Total': ['paymentDate', 'amount', 'category', 'isPlanned'],
          'Custo Variável Total': ['paymentDate', 'amount', 'category', 'isPlanned'],
          'Custo Total': ['paymentDate', 'amount', 'category', 'isPlanned', 'status'],
          'Despesas Operacionais Totais': ['paymentDate', 'amount', 'category'],
          'Custo Não Planejado (%)': ['paymentDate', 'amount', 'isPlanned', 'category'],
        },
      },
    } as AnalyticsConfiguration,
    // --- 2.1 Custos Fixos – melhor como cards / participação em donut ---
    {
      templateKey: 'aggregatePipeline',
      key: 'costFixedVsVariable',
      title: '2.1 Custos Fixos – Participação vs Variáveis',
      type: 'donut',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'composition',
        metricLabel: 'Participação',
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::expenses' },
          // Simple classification based on category text matching
          // Ideally we'd have a 'costType' field, but using category for now.
          dimensions: [{ type: 'field', field: 'category', label: 'Categoria' }],
          measures: [{ type: 'sum', field: 'amount', alias: 'Custo' }],
        },
        // Mapping specific categories to broader groups if possible, 
        // or just letting categories show.
      },
    } as AnalyticsConfiguration,
    // --- 2.4 Estrutura de Custos – Custo Total (Linha / Coluna) ---
    {
      templateKey: 'temporalAggregation',
      key: 'costTotalEvolution',
      title: '2.4 Estrutura de Custos – Custo Total (Evolução Mensal)',
      type: 'line',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        amountField: 'amount',
        dateField: 'paymentDate',
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
        analysisKind: 'evolution',
        metricLabel: 'Custo Total',
      },
      params: {
        period: 'month',
        limit: 12,
      },
    } as AnalyticsConfiguration,
    // --- 2.4 Estrutura de Custos – Custo por Categoria ---
    {
      templateKey: 'aggregatePipeline',
      key: 'costByCategory',
      title: '2.4 Estrutura de Custos – Custo por Categoria',
      type: 'bar', // Bar is better for many categories than donut
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'composition',
        metricLabel: 'Custo por Categoria',
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::expenses' },
          dimensions: [{ type: 'field', field: 'category', label: 'Categoria' }],
          measures: [{ type: 'sum', field: 'amount', alias: 'Custo' }],
          sort: { by: 'measure', dir: 'desc' },
        },
      },
    } as AnalyticsConfiguration,
    // --- 2.4 Estrutura de Custos – Planejado vs Não Planejado ---
    {
      templateKey: 'aggregatePipeline',
      key: 'costPlannedVsUnplanned',
      title: '2.4 Estrutura de Custos – Planejado vs Não Planejado',
      type: 'donut',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Planejamento',
        colors: ['#10b981', '#ef4444'], // Green for Planned, Red for Unplanned
        labelMap: {
          true: 'Planejado',
          false: 'Não Planejado',
        },
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::expenses' },
          dimensions: [{ type: 'field', field: 'isPlanned', label: 'Planejado?' }],
          measures: [{ type: 'sum', field: 'amount', alias: 'Custo' }],
        },
      },
    } as AnalyticsConfiguration,
  ],
};
