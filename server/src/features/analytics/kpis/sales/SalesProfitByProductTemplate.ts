/**
 * Sales Profit By Product Template
 *
 * Analyzes profit from product sales over time.
 * Gold Standard: metricFormats, metricHigherIsBetter, metricDescriptions, metricAnalysis defined.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const salesProfitByProductOverTimeTemplate: AnalyticsTemplate = {
  key: 'salesProfitByProductOverTime',
  name: 'Lucro de Produtos por Período',
  description:
    'Calcula o lucro de vendas de produtos ao longo do tempo, usando custo médio ponderado de entrada do estoque.',
  processor: 'salesProfitByProductOverTime',
  requiredFields: [
    {
      key: 'quantityField',
      label: 'Campo de Quantidade',
      types: ['number'],
      description: 'Campo numérico com a quantidade vendida por item.',
      required: true,
    },
    {
      key: 'unitPriceField',
      label: 'Campo de Preço Unitário',
      types: ['number'],
      description: 'Campo numérico com o preço de venda unitário.',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'headerTableKey',
      label: 'Tabela de Cabeçalho de Vendas',
      types: [],
      description:
        'Chave da tabela de vendas (Sales header) para obter data e status de pagamento. Se ausente, o processor tentará usar saleItemDateField do próprio item.',
      required: false,
    },
    {
      key: 'saleItemDateField',
      label: 'Campo de Data no Item (Fallback)',
      types: ['date'],
      description:
        'Campo de data diretamente no item de venda, usado quando headerTableKey não está configurado.',
      required: false,
    },
    {
      key: 'stockMovementsTableKey',
      label: 'Tabela de Movimentos de Estoque',
      types: [],
      description: 'Chave da tabela de movimentos de estoque para calcular custo médio ponderado de entrada.',
      required: false,
    },
    {
      key: 'productIdField',
      label: 'Campo de ID do Produto',
      types: ['string'],
      description: 'Campo identificador do produto no item de venda, usado para cruzar com custo médio.',
      required: false,
    },
    {
      key: 'itemTypeField',
      label: 'Campo de Tipo do Item',
      types: ['string', 'select'],
      description: 'Campo de tipo do item (ex: "Product", "Service"). Apenas itens do tipo Product são processados.',
      required: false,
    },
  ],
  defaultOptions: {
    type: 'line',
    layout: 'chart',
    isTemporal: true,
    metricFormats: {
      'Lucro por Produto (Período)': 'currency',
    },
    metricHigherIsBetter: {
      'Lucro por Produto (Período)': true,
    },
    metricAnalysis: {
      'Lucro por Produto (Período)': 'evolution',
    },
    metricDescriptions: {
      'Lucro por Produto (Período)': 'Série temporal do lucro de produtos (receita - custo médio de entrada × quantidade vendida) por período. Mede a lucratividade real das vendas de produto.',
    },
  },
  defaultParams: {
    period: 'month',
    monthsWindow: 12,
    includePaymentStatuses: ['Paid'],
    stockCostIsTotal: true,
  },
};

registerTemplate(salesProfitByProductOverTimeTemplate);
