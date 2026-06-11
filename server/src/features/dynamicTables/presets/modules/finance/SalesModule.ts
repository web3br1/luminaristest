import type { ITableSchema } from '../../../models/DynamicTable.model';
import type { AnalyticsConfiguration } from '@/features/analytics/core/models/AnalyticsConfiguration';
import {
  campaignId,
  channelSelect,
  customerId,
  date,
  dueDate,
  revenueTypeSelect,
  simpleCustomerFlag,
  unitId,
} from '../../fields';
import { saleStatus, paymentStatus, paymentMethod } from '../../fields/select/SelectPresets';
import { subtotal, discountAmount, taxAmount, totalAmount } from '../../fields/number/NumberPresets';

/**
 * @description Módulo base para a tabela "sales" (cabeçalho da nota fiscal).
 */
export const salesModule = {
  name: 'Sales',
  description: 'Records each financial transaction (invoice header).',
  category: 'finance',
  meta: {
    requiresTables: ['saleItems'],
  },
  schema: {
    defaultDisplayField: 'date',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...date, label: 'Sale Date' },
      { ...saleStatus, defaultValue: 'Draft' },
      { ...paymentStatus, label: 'Payment Status', defaultValue: 'Pending' },
      { ...paymentMethod, required: false },
      {
        name: 'paymentTermDays',
        label: 'Payment Term (days)',
        type: 'number',
        required: false,
        numberFormat: 'integer',
        validation: { minValue: 0 },
        searchable: false,
      },
      { ...dueDate, description: 'Payment due date.' },
      // Customer handling: either relational customer or simple typed name
      simpleCustomerFlag,
      { name: 'simpleCustomerName', label: 'Simple Customer Name', type: 'string', required: false },
      // Optional relational customer (not required if simpleCustomer === true)
      { ...customerId, required: false },
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      // --- Revenue segmentation fields for analytics ---
      channelSelect,
      revenueTypeSelect,
      {
        name: 'revenueSource',
        label: 'Revenue Source',
        type: 'string',
        required: false,
        description:
          'Main revenue source (key customer, contract, unit, group, etc.).',
      },
      {
        name: 'isNewCustomer',
        label: 'Is New Customer',
        type: 'boolean',
        required: false,
        defaultValue: false,
        readOnly: true,
        searchable: false,
        description:
          'Automatically flagged when the sale is the first one for the customer (used for new-revenue KPIs).',
      },
      {
        name: 'isLoyalCustomer',
        label: 'Is Loyal Customer',
        type: 'boolean',
        required: false,
        defaultValue: false,
        readOnly: true,
        searchable: false,
        description:
          'Automatically flagged when the customer is in a loyalty lifecycle stage (used for recurring-revenue KPIs).',
      },
      { ...campaignId, description: 'Marketing campaign linked to the sale (used for incremental revenue analysis).' },
    ],
    immutableAfter: [
      {
        condition: { field: 'paymentStatus', op: 'eq', value: 'Paid' },
        scope: ['totalAmount', 'subtotal', 'discountAmount', 'taxAmount', 'customerId', 'unitId'],
        errorMessage: 'Paid sales cannot have financial or customer fields modified.'
      },
      {
        condition: { field: 'status', op: 'in', value: ['Finalized', 'Cancelled', 'Returned'] },
        scope: 'all',
        errorMessage: 'Finalized, cancelled or returned sales cannot be edited.'
      }
    ],
  } as ITableSchema,

  analytics: [
    {
      templateKey: 'revenueKpis',
      key: 'revenueKpis',
      title: 'KPIs de Receita (Vendas)',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        amountField: 'totalAmount',
        discountField: 'discountAmount',
        taxField: 'taxAmount',
        dateField: 'date',
        statusField: 'status',
        customerIdField: 'customerId',
        categoryField: 'channel',
        isNewCustomerField: 'isNewCustomer',
        isLoyalCustomerField: 'isLoyalCustomer',
        revenueTypeField: 'revenueType',
      },
      options: {
        currency: 'BRL',
        defaultImportantFields: ['date', 'totalAmount', 'status', 'paymentStatus', 'customerId', 'campaignId'],
        importantFields: {
          'Receita Bruta': ['date', 'totalAmount', 'status', 'paymentStatus'],
          'Receita Líquida': ['date', 'totalAmount', 'discountAmount', 'taxAmount', 'status'],
          'Receita por Cliente': ['date', 'totalAmount', 'customerId', 'status'],
          'Receita Operacional': ['date', 'totalAmount', 'revenueType', 'status'],
          'Receita Nova (%)': ['date', 'totalAmount', 'isNewCustomer', 'status'],
          'Receita Recorrente (%)': ['date', 'totalAmount', 'isLoyalCustomer', 'status'],
        },
      },
      params: {
        period: 'month',
        monthsWindow: 12,
        excludeStatuses: ['Cancelled'],
      },
    } as AnalyticsConfiguration,
    // --- 1.6 Custos de Produtos (para completar custos variáveis) ---
    {
      templateKey: 'productCostKpis',
      key: 'productCostKpis',
      title: '1.6 Custos de Produtos',
      type: 'bar',
      tableKey: '@@PRESET_TABLE_KEY::stockMovements',
      fieldMapping: {},
      options: {
        currency: 'BRL',
      },
      params: {
        period: 'month',
        monthsWindow: 12,
        saleTableKey: '@@PRESET_TABLE_KEY::sales',
        saleItemsTableKey: '@@PRESET_TABLE_KEY::saleItems',
        stockMovementsTableKey: '@@TABLE_SELF@@',
      },
    } as AnalyticsConfiguration,
    // --- 3.x Lucro e Custo por Cliente (rateio proporcional de custos) ---
    {
      templateKey: 'profitByDimension',
      key: 'profitByCustomer',
      title: '3.x Lucro por Cliente (Rateado por Receita)',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        revenueAmountField: 'totalAmount',
        revenueDateField: 'date',
        dimensionField: 'customerId',
        statusField: 'status',
      },
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Lucro estimado por cliente (com rateio de custos)',
      },
      params: {
        period: 'month',
        excludeStatuses: ['Cancelled'],
        metricMode: 'profit',
        costSourceTableKey: '@@PRESET_TABLE_KEY::expenses',
        expenseAmountField: 'amount',
        expenseCategoryField: 'category',
        expenseDateField: 'paymentDate',
      },
    } as AnalyticsConfiguration,
    {
      templateKey: 'profitByDimension',
      key: 'costByCustomer',
      title: '3.x Custo Rateado por Cliente',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        revenueAmountField: 'totalAmount',
        revenueDateField: 'date',
        dimensionField: 'customerId',
        statusField: 'status',
      },
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Custo estimado por cliente (rateio proporcional)',
      },
      params: {
        period: 'month',
        excludeStatuses: ['Cancelled'],
        metricMode: 'cost',
        costSourceTableKey: '@@PRESET_TABLE_KEY::expenses',
        expenseAmountField: 'amount',
        expenseCategoryField: 'category',
        expenseDateField: 'paymentDate',
      },
    } as AnalyticsConfiguration,
    // --- 3.x Rentabilidade por Campanha / Retorno sobre Esforço ---
    {
      templateKey: 'profitByDimension',
      key: 'profitByCampaign',
      title: '3.x Rentabilidade por Campanha (Lucro Rateado)',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        revenueAmountField: 'totalAmount',
        revenueDateField: 'date',
        dimensionField: 'campaignId',
        statusField: 'status',
      },
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Lucro estimado por campanha (receita - custos rateados)',
      },
      params: {
        period: 'month',
        excludeStatuses: ['Cancelled'],
        metricMode: 'profit',
        costSourceTableKey: '@@PRESET_TABLE_KEY::expenses',
        expenseAmountField: 'amount',
        expenseCategoryField: 'category',
        expenseDateField: 'paymentDate',
      },
    } as AnalyticsConfiguration,
    {
      templateKey: 'profitKpis',
      key: 'profitKpis',
      title: 'KPIs de Lucros e Margens',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        revenueAmountField: 'totalAmount',
        revenueDateField: 'date',
      },
      options: {
        currency: 'BRL',
        defaultImportantFields: ['date', 'totalAmount', 'status'],
        importantFields: {
          'Lucro Bruto': ['date', 'totalAmount', 'status'],
          'Lucro Líquido': ['date', 'totalAmount', 'status'],
          'Lucro por Cliente': ['date', 'totalAmount', 'customerId', 'status'],
          'Margem Bruta (%)': ['date', 'totalAmount', 'status'],
          'Margem Líquida (%)': ['date', 'totalAmount', 'status'],
        },
      },
      params: {
        period: 'month',
        monthsWindow: 12,
        excludeStatuses: ['Cancelled'],
        // Integração com custos: usa tabela de Expenses para calcular
        // custos variáveis/fixos/impostos do mesmo período de receita.
        costSourceTableKey: '@@PRESET_TABLE_KEY::expenses',
        expenseAmountField: 'amount',
        expenseCategoryField: 'category',
        expenseDateField: 'paymentDate',
      },
    } as AnalyticsConfiguration,
    // --- 1.1 Receita Global – Gráficos de evolução ---
    {
      templateKey: 'temporalAggregation',
      key: 'revenueGrossEvolution',
      title: '1.1 Receita Global – Receita Bruta (Linha Mensal)',
      type: 'line',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        amountField: 'totalAmount',
        dateField: 'date',
        statusField: 'status',
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
        analysisKind: 'evolution',
        metricLabel: 'Receita Bruta',
      },
      params: {
        period: 'month',
        limit: 12,
        excludeStatuses: ['Cancelled'],
      },
    } as AnalyticsConfiguration,
    {
      templateKey: 'formulaCalculation',
      key: 'revenueNetEvolution',
      title: '1.1 Receita Global – Receita Líquida (Linha Mensal)',
      type: 'line',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        total: 'totalAmount',
        discount: 'discountAmount',
        tax: 'taxAmount',
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
        analysisKind: 'evolution',
        metricLabel: 'Receita Líquida',
      },
      params: {
        formula: 'total - discount - tax',
        groupBy: 'period',
        period: 'month',
        dateField: 'date',
        excludeStatuses: ['Cancelled'],
        statusField: 'status',
      },
    } as AnalyticsConfiguration,
    // --- 1.2 Receita por Origem – Comparação (barras / pizza) ---
    {
      templateKey: 'aggregatePipeline',
      key: 'revenueByType',
      title: '1.2 Receita por Origem – Operacional vs Não Operacional',
      type: 'donut',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'composition',
        metricLabel: 'Receita por Tipo',
        labelMap: {
          Operational: 'Operacional',
          NonOperational: 'Não Operacional',
        },
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
          filters: [{ field: 'status', op: 'ne', value: 'Cancelled' }],
          dimensions: [{ type: 'field', field: 'revenueType', label: 'Tipo' }],
          measures: [{ type: 'sum', field: 'totalAmount', alias: 'Receita' }],
          sort: { by: 'measure', dir: 'desc' },
        },
      },
    } as AnalyticsConfiguration,
    {
      templateKey: 'aggregatePipeline',
      key: 'revenueNewVsRecurring',
      title: '1.2 Receita por Origem – Receita Nova vs Recorrente',
      type: 'donut',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'composition',
        metricLabel: 'Composição da Receita',
        labelMap: {
          true: 'Cliente Novo',
          false: 'Recorrente/Outros',
        },
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
          filters: [{ field: 'status', op: 'ne', value: 'Cancelled' }],
          dimensions: [{ type: 'field', field: 'isNewCustomer', label: 'Cliente Novo?' }],
          measures: [{ type: 'sum', field: 'totalAmount', alias: 'Receita' }],
        },
      },
    } as AnalyticsConfiguration,
    // --- 1.3 Receita por Cliente – Análise de comportamento ---
    {
      templateKey: 'aggregatePipeline',
      key: 'revenueByCustomerTop',
      title: '1.3 Receita por Cliente – Top 10 Clientes por Receita',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Receita Acumulada',
        layout: 'full', // Suggest full width in grid if supported
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
          filters: [{ field: 'status', op: 'ne', value: 'Cancelled' }],
          // customerId is a relation field - AggregatePipelineProcessor will automatically resolve to customer names
          dimensions: [{ type: 'field', field: 'customerId', label: 'Cliente' }],
          measures: [{ type: 'sum', field: 'totalAmount', alias: 'Receita' }],
          sort: { by: 'measure', dir: 'desc' },
          limit: 10,
        },
      },
    } as AnalyticsConfiguration,
    // --- 1.4 Receita por Tempo – Evolução em linha ---
    {
      templateKey: 'temporalAggregation',
      key: 'revenueByBusinessDay',
      title: '1.4 Receita por Tempo – Receita por Dia (Tendência)',
      type: 'line',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        amountField: 'totalAmount',
        dateField: 'date',
        statusField: 'status',
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
        analysisKind: 'evolution',
      },
      params: {
        period: 'day',
        limit: 30, // Last 30 days
        excludeStatuses: ['Cancelled'],
      },
    } as AnalyticsConfiguration,
    // --- 1.5 Receita por Categoria – Comparação e sazonalidade ---
    {
      templateKey: 'aggregatePipeline',
      key: 'revenueByChannel',
      title: '1.5 Receita por Categoria – Receita por Canal',
      type: 'donut',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'composition',
        metricLabel: 'Participação por Canal',
        labelMap: {
          InStore: 'Loja física',
          Online: 'Online',
          Phone: 'Telefone',
          App: 'App',
          Other: 'Outros',
        },
      },
      params: {
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
          filters: [{ field: 'status', op: 'ne', value: 'Cancelled' }],
          dimensions: [{ type: 'field', field: 'channel', label: 'Canal' }],
          measures: [{ type: 'sum', field: 'totalAmount', alias: 'Receita' }],
          sort: { by: 'measure', dir: 'desc' },
        },
      },
    } as AnalyticsConfiguration,
    // --- 4. CAIXA E SOLVÊNCIA – KPIs de Fluxo de Caixa ---
    {
      templateKey: 'cashflowKpis',
      key: 'cashflowKpis',
      title: '4. CAIXA – KPIs de Fluxo de Caixa e Solvência',
      type: 'bar',
      tableKey: '@@TABLE_SELF@@',
      fieldMapping: {
        salesAmountField: 'totalAmount',
        salesDateField: 'date',
        salesDueDateField: 'dueDate', // Changed from paymentTermDays (number) to dueDate (date)
        salesPaymentStatusField: 'paymentStatus',
        salesStatusField: 'status',
      },
      options: {
        currency: 'BRL',
        defaultImportantFields: ['date', 'totalAmount', 'paymentStatus', 'status'],
        importantFields: {
          'Fluxo de Caixa Operacional': ['date', 'totalAmount', 'paymentStatus', 'status'],
          'Contas a Receber Total': ['date', 'totalAmount', 'paymentStatus', 'status'],
          'Contas a Pagar Total': ['date', 'amount', 'paymentStatus'],
        },
      },
      params: {
        period: 'month',
        monthsWindow: 12,
        excludeStatuses: ['Cancelled'],
        expensesTableKey: '@@PRESET_TABLE_KEY::expenses',
        expenseAmountField: 'amount',
        expenseDateField: 'paymentDate',
        expenseDueDateField: 'dueDate',
        expensePaymentStatusField: 'paymentStatus',
      },
    } as AnalyticsConfiguration,
  ],
};
