import type { ITableSchema } from '../../../models/DynamicTable.model';
import { saleId, productId, serviceId, responsibleEmployeeId, appointmentId } from '../../fields/relation/RelationPresets';
import { description } from '../../fields/text/TextPresets';
import { quantity, unitPrice, commission } from '../../fields/number/NumberPresets';
import { itemType } from '../../fields/select/SelectPresets';

export const saleItemsMixedModule = {
  name: 'Sale Items',
  description: 'Details each item (service or product) of a sale.',
  category: 'finance',
  schema: {
    defaultDisplayField: 'description',
    ui: { presentation: 'embedded' },
    fields: [
      saleId,
      itemType,
      { ...productId, required: false },
      { ...serviceId, required: false },
      { ...description, label: 'Description' },
      quantity,
      unitPrice,
      { name: 'requiresAppointment', label: 'Schedule now', type: 'boolean', required: false, defaultValue: false, searchable: false },
      appointmentId,
      responsibleEmployeeId,
      commission,
    ],
  } as ITableSchema,
  analytics: [
    // Serviço x Produto (somatório do valor, apenas vendas pagas) via pipeline
    {
      templateKey: 'aggregatePipeline',
      key: 'typeComparison',
      title: 'Serviços x Produtos (Recebido)',
      type: 'donut',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        labelMap: {
          Service: 'Serviços',
          Product: 'Produtos',
        },
      },
      params: {
        deriveItemType: true,
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::saleItems' },
          joins: [
            { leftField: 'saleId', rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' }, rightField: 'id', alias: 'header' }
          ],
          filters: [
            { field: 'header.paymentStatus', op: 'eq', value: 'Paid' }
          ],
          dimensions: [
            { type: 'field', field: 'itemType' }
          ],
          measures: [
            { type: 'formula', expression: 'q * p', variables: { q: 'quantity', p: 'unitPrice' } }
          ]
        }
      },
    },
    // Total mensal recebido - Serviços via pipeline
    {
      templateKey: 'aggregatePipeline',
      key: 'servicesMonthlyReceived',
      title: 'Serviços - Total Recebido por Mês',
      type: 'line',
      fieldMapping: {},
      params: {
        deriveItemType: true,
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::saleItems' },
          joins: [
            { leftField: 'saleId', rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' }, rightField: 'id', alias: 'header' }
          ],
          filters: [
            { field: 'header.paymentStatus', op: 'eq', value: 'Paid' },
            { field: 'itemType', op: 'eq', value: 'Service' }
          ],
          dimensions: [
            { type: 'period', dateField: 'header.date', period: 'month' }
          ],
          measures: [
            { type: 'formula', expression: 'q * p', variables: { q: 'quantity', p: 'unitPrice' } }
          ]
        }
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
      },
    },
    // Total mensal recebido - Produtos via pipeline
    {
      templateKey: 'aggregatePipeline',
      key: 'productsMonthlyReceived',
      title: 'Produtos - Total Recebido por Mês',
      type: 'line',
      fieldMapping: {},
      params: {
        deriveItemType: true,
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::saleItems' },
          joins: [
            { leftField: 'saleId', rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' }, rightField: 'id', alias: 'header' }
          ],
          filters: [
            { field: 'header.paymentStatus', op: 'eq', value: 'Paid' },
            { field: 'itemType', op: 'eq', value: 'Product' }
          ],
          dimensions: [
            { type: 'period', dateField: 'header.date', period: 'month' }
          ],
          measures: [
            { type: 'formula', expression: 'q * p', variables: { q: 'quantity', p: 'unitPrice' } }
          ]
        }
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
      },
    },
    // Lucro mensal de produtos (se estoque existir)
    {
      templateKey: 'salesProfitByProductOverTime',
      key: 'productsProfitMonthly',
      title: 'Produtos - Lucro Mensal',
      type: 'line',
      fieldMapping: {
        itemTypeField: 'type',
        productIdField: 'productId',
        quantityField: 'quantity',
        unitPriceField: 'unitPrice',
        saleIdField: 'saleId',
      },
      params: {
        headerTableKey: '@@PRESET_TABLE_KEY::sales',
        headerDateField: 'date',
        headerPaymentStatusField: 'paymentStatus',
        includePaymentStatuses: ['Paid'],
        period: 'month',
        stockMovementsTableKey: '@@PRESET_TABLE_KEY::stockMovements',
        stockTypeField: 'type',
        stockProductIdField: 'productId',
        stockQuantityField: 'quantity',
        stockCostField: 'cost',
      },
      options: {
        currency: 'BRL',
        isTemporal: true,
      },
    },
    // --- KPIs avançados: custo e lucro estimados por serviço (rateio por esforço do profissional) ---
    {
      templateKey: 'aggregatePipeline',
      key: 'serviceEstimatedCost',
      title: '3.x Custo Estimado por Serviço (Tempo x Custo Mensal)',
      type: 'bar',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Custo de execução por serviço (aprox.)',
      },
      params: {
        deriveItemType: true,
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::saleItems' },
          joins: [
            {
              leftField: 'saleId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
              rightField: 'id',
              alias: 'header',
            },
            {
              leftField: 'responsibleEmployeeId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::employees' },
              rightField: 'id',
              alias: 'employee',
            },
            {
              leftField: 'serviceId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::services' },
              rightField: 'id',
              alias: 'service',
            },
          ],
          filters: [
            { field: 'header.paymentStatus', op: 'eq', value: 'Paid' },
            { field: 'itemType', op: 'eq', value: 'Service' },
          ],
          dimensions: [{ type: 'field', field: 'service.name', label: 'Serviço' }],
          measures: [
            {
              type: 'formula',
              // duration (min) -> horas; monthlyCost / 160h -> custo/hora
              // custo serviço = (dur/60) * (mc/160) * quantidade
              expression: '(dur / 60) * (mc / 160) * q',
              variables: {
                dur: 'service.duration',
                mc: 'employee.monthlyCost',
                q: 'quantity',
              },
              alias: 'CustoEstimado',
            },
          ],
        },
      },
    },
    {
      templateKey: 'aggregatePipeline',
      key: 'serviceEstimatedProfit',
      title: '3.x Lucro Estimado por Serviço (Receita - Custo Estimado)',
      type: 'bar',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Lucro estimado por serviço (aprox.)',
      },
      params: {
        deriveItemType: true,
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::saleItems' },
          joins: [
            {
              leftField: 'saleId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
              rightField: 'id',
              alias: 'header',
            },
            {
              leftField: 'responsibleEmployeeId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::employees' },
              rightField: 'id',
              alias: 'employee',
            },
            {
              leftField: 'serviceId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::services' },
              rightField: 'id',
              alias: 'service',
            },
          ],
          filters: [
            { field: 'header.paymentStatus', op: 'eq', value: 'Paid' },
            { field: 'itemType', op: 'eq', value: 'Service' },
          ],
          dimensions: [{ type: 'field', field: 'service.name', label: 'Serviço' }],
          measures: [
            {
              type: 'formula',
              // lucro item = receita - custoEstimado
              // receita = q * p
              // custoEstimado = (dur/60) * (mc/160) * q
              expression: 'q * p - (dur / 60) * (mc / 160) * q',
              variables: {
                q: 'quantity',
                p: 'unitPrice',
                dur: 'service.duration',
                mc: 'employee.monthlyCost',
              },
              alias: 'LucroEstimado',
            },
          ],
        },
      },
    },
    // --- Retorno sobre esforço por colaborador (lucro estimado por funcionário) ---
    {
      templateKey: 'aggregatePipeline',
      key: 'employeeServiceProfit',
      title: '3.x Retorno por Esforço - Lucro Estimado por Colaborador',
      type: 'bar',
      fieldMapping: {},
      options: {
        currency: 'BRL',
        analysisKind: 'comparison',
        metricLabel: 'Lucro líquido aproximado por colaborador em serviços',
      },
      params: {
        deriveItemType: true,
        pipeline: {
          source: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::saleItems' },
          joins: [
            {
              leftField: 'saleId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::sales' },
              rightField: 'id',
              alias: 'header',
            },
            {
              leftField: 'responsibleEmployeeId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::employees' },
              rightField: 'id',
              alias: 'employee',
            },
            {
              leftField: 'serviceId',
              rightRef: { kind: 'presetTable', key: '@@PRESET_TABLE_KEY::services' },
              rightField: 'id',
              alias: 'service',
            },
          ],
          filters: [
            { field: 'header.paymentStatus', op: 'eq', value: 'Paid' },
            { field: 'itemType', op: 'eq', value: 'Service' },
          ],
          dimensions: [{ type: 'field', field: 'employee.name', label: 'Colaborador' }],
          measures: [
            {
              type: 'formula',
              expression: 'q * p - (dur / 60) * (mc / 160) * q',
              variables: {
                q: 'quantity',
                p: 'unitPrice',
                dur: 'service.duration',
                mc: 'employee.monthlyCost',
              },
              alias: 'LucroEstimado',
            },
          ],
        },
      },
    },
  ],
};


