/**
 * Cost KPI Template
 *
 * Defines the 14 cost KPIs with display metadata.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const costKpiTemplate: AnalyticsTemplate = {
  key: 'costKpis',
  name: 'KPIs de Custos',
  description:
    'Calcula indicadores-chave de custos fixos, variáveis e despesas operacionais a partir da tabela de Expenses.',
  processor: 'costKpis',
  requiredFields: [
    {
      key: 'amountField',
      label: 'Campo de Valor da Despesa',
      types: ['number'],
      description: 'Campo numérico que representa o valor da despesa.',
      required: true,
    },
    {
      key: 'categoryField',
      label: 'Campo de Categoria da Despesa',
      types: ['string', 'select'],
      description: 'Categoria da despesa (Fixed Cost, Variable Cost, Marketing, Personnel, Taxes).',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'paymentDateField',
      label: 'Campo de Data de Pagamento',
      types: ['date'],
      description: 'Campo de data usado para agrupar e filtrar despesas por período.',
      required: false,
    },
    {
      key: 'isPlannedField',
      label: 'Campo de Despesa Planejada',
      types: ['boolean'],
      description: 'Indica se a despesa estava no orçamento planejado.',
      required: false,
    },
    {
      key: 'statusField',
      label: 'Campo de Status do Pagamento (Opcional)',
      types: ['string', 'select'],
      description: 'Campo de status usado para excluir despesas canceladas.',
      required: false,
    },
    {
      key: 'totalAppointmentsPeriod',
      label: 'Atendimentos Totais (Fallback)',
      types: ['number'],
      description: 'Total de atendimentos do período atual usado caso não exista tabela de controle de agendamentos informada em appointmentsTableKey.',
      required: false,
    },
  ],
  defaultOptions: {
    type: 'bar',
    layout: 'kpiGrid',
    metricFormats: {
      'Custo Fixo Total': 'currency',
      'Custo Fixo Médio Mensal': 'currency',
      'Participação dos Custos Fixos (%)': 'percent',
      'Custo Variável Total': 'currency',
      'Custo Variável Médio por Atendimento': 'currency',
      'Participação dos Custos Variáveis (%)': 'percent',
      'Despesas Operacionais Totais': 'currency',
      'Despesas Administrativas (%)': 'percent',
      'Despesas de Manutenção': 'currency',
      'Despesas Não Recorrentes': 'currency',
      'Impostos Totais Pagos': 'currency',
      'Custo Total': 'currency',
      'Custo por Dia Útil': 'currency',
      'Custo Não Planejado (%)': 'percent',
    },
    metricDisplay: {
      'Custo Fixo Total': 'card',
      'Custo Fixo Médio Mensal': 'card',
      'Participação dos Custos Fixos (%)': 'graph',
      'Custo Variável Total': 'graph',
      'Custo Variável Médio por Atendimento': 'graph',
      'Participação dos Custos Variáveis (%)': 'graph',
      'Despesas Operacionais Totais': 'graph',
      'Despesas Administrativas (%)': 'gauge',
      'Despesas de Manutenção': 'card',
      'Despesas Não Recorrentes': 'graph',
      'Impostos Totais Pagos': 'card',
      'Custo Total': 'graph',
      'Custo por Dia Útil': 'card',
      'Custo Não Planejado (%)': 'gauge',
    },
    metricChartTypes: {
      'Custo Fixo Total': 'card',
      'Custo Fixo Médio Mensal': 'card',
      'Participação dos Custos Fixos (%)': 'gauge',
      'Custo Variável Total': 'line',
      'Custo Variável Médio por Atendimento': 'bar',
      'Participação dos Custos Variáveis (%)': 'gauge',
      'Despesas Operacionais Totais': 'line',
      'Despesas Administrativas (%)': 'gauge',
      'Despesas de Manutenção': 'card',
      'Despesas Não Recorrentes': 'bar',
      'Impostos Totais Pagos': 'card',
      'Custo Total': 'line',
      'Custo por Dia Útil': 'card',
      'Custo Não Planejado (%)': 'gauge',
    },
    metricAnalysis: {
      'Custo Fixo Total': 'evolution',
      'Custo Fixo Médio Mensal': 'evolution',
      'Participação dos Custos Fixos (%)': 'composition',
      'Custo Variável Total': 'evolution',
      'Custo Variável Médio por Atendimento': 'comparison',
      'Participação dos Custos Variáveis (%)': 'composition',
      'Despesas Operacionais Totais': 'evolution',
      'Despesas Administrativas (%)': 'composition',
      'Despesas de Manutenção': 'evolution',
      'Despesas Não Recorrentes': 'snapshot',
      'Impostos Totais Pagos': 'evolution',
      'Custo Total': 'evolution',
      'Custo por Dia Útil': 'evolution',
      'Custo Não Planejado (%)': 'comparison',
    },
    metricHybrid: {
      'Participação dos Custos Fixos (%)': true,
      'Custo Variável Total': true,
      'Despesas de Manutenção': true,
      'Impostos Totais Pagos': true,
      'Custo Não Planejado (%)': true,
    },
    metricDescriptions: {
      'Custo Fixo Total': 'Soma de todos os custos que não variam com a produção (aluguel, salários fixos, etc.).',
      'Custo Fixo Médio Mensal': 'Custo fixo dividido pelo número de meses. Mostra o custo base mensal.',
      'Participação dos Custos Fixos (%)': 'Proporção dos custos fixos no custo total. Alta participação reduz flexibilidade.',
      'Custo Variável Total': 'Soma dos custos que variam com a produção (materiais, comissões, etc.).',
      'Custo Variável Médio por Atendimento': 'Custo variável por unidade de atendimento/venda. Meta: reduzir ao longo do tempo.',
      'Participação dos Custos Variáveis (%)': 'Proporção dos custos variáveis no custo total. Indica escala do negócio.',
      'Despesas Operacionais Totais': 'Todas as despesas necessárias para manter a operação funcionando.',
      'Despesas Administrativas (%)': 'Percentual gasto em atividades administrativas vs operacionais.',
      'Despesas de Manutenção': 'Gastos com manutenção de equipamentos, infraestrutura e instalações.',
      'Despesas Não Recorrentes': 'Gastos extraordinários que não se repetem (multas, reparos emergenciais).',
      'Impostos Totais Pagos': 'Soma de todos os tributos pagos no período.',
      'Custo Total': 'Soma de todos os custos (fixos + variáveis + operacionais). O "total cost of operations".',
      'Custo por Dia Útil': 'Custo total dividido pelos dias úteis. Mostra o "burn rate" diário.',
      'Custo Não Planejado (%)': 'Percentual de custos fora do orçamento. Acima de 10% indica problemas de planejamento.',
    },
    metricIdealTargets: {
      'Participação dos Custos Fixos (%)': 40,
      'Participação dos Custos Variáveis (%)': 60,
      'Despesas Administrativas (%)': 15,
      'Custo Não Planejado (%)': 5,
    },
    metricHigherIsBetter: {
      'Custo Fixo Total': false,
      'Custo Fixo Médio Mensal': false,
      'Participação dos Custos Fixos (%)': false,
      'Custo Variável Total': false,
      'Custo Variável Médio por Atendimento': false,
      'Participação dos Custos Variáveis (%)': false,
      'Despesas Operacionais Totais': false,
      'Despesas Administrativas (%)': false,
      'Despesas de Manutenção': false,
      'Despesas Não Recorrentes': false,
      'Impostos Totais Pagos': false,
      'Custo Total': false,
      'Custo por Dia Útil': false,
      'Custo Não Planejado (%)': false,
    },
  },
  defaultParams: {
    period: 'month',
    monthsWindow: 12,
  },
};

registerTemplate(costKpiTemplate);

/**
 * Product Cost KPI Template
 *
 * Calculates product cost KPIs from StockMovements and Sales data.
 */
export const productCostKpiTemplate: AnalyticsTemplate = {
  key: 'productCostKpis',
  name: 'KPIs de Custos de Produtos',
  description:
    'Calcula indicadores de custos de produtos baseados em movimentações de estoque e vendas.',
  processor: 'productCostKpis',
  // No required fields in fieldMapping since table references are passed via params
  requiredFields: [],
  optionalFields: [
    {
      key: 'saleTableKey',
      label: 'Tabela de Vendas',
      types: [],
      description: 'Chave da tabela de vendas (passado em params).',
      required: false,
    },
    {
      key: 'saleItemsTableKey',
      label: 'Tabela de Itens de Venda',
      types: [],
      description: 'Chave da tabela de itens de venda (passado em params).',
      required: false,
    },
    {
      key: 'stockMovementsTableKey',
      label: 'Tabela de Movimentações de Estoque',
      types: [],
      description: 'Chave da tabela de movimentações (passado em params).',
      required: false,
    },
  ],
  defaultOptions: {
    type: 'bar',
    layout: 'kpiGrid',
    metricFormats: {
      'Custo Variável Total': 'currency',
      'Custo Médio por Produto': 'currency',
      'Margem de Contribuição por Produto': 'currency',
      'Custo Variável por Venda': 'currency',
    },
    metricDisplay: {
      'Custo Variável Total': 'graph',
      'Custo Médio por Produto': 'graph',
      'Margem de Contribuição por Produto': 'graph',
      'Custo Variável por Venda': 'graph',
    },
    metricChartTypes: {
      'Custo Variável Total': 'area',
      'Custo Médio por Produto': 'line',
      'Margem de Contribuição por Produto': 'line',
      'Custo Variável por Venda': 'area',
    },
    metricAnalysis: {
      'Custo Variável Total': 'evolution',
      'Custo Médio por Produto': 'evolution',
      'Margem de Contribuição por Produto': 'evolution',
      'Custo Variável por Venda': 'evolution',
    },
    metricDescriptions: {
      'Custo Variável Total': 'Soma total dos custos variáveis de produtos (matéria-prima, embalagem, etc.).',
      'Custo Médio por Produto': 'Custo médio unitário por produto no estoque. Base para precificação.',
      'Margem de Contribuição por Produto': 'Receita menos custo variável por produto. Indica rentabilidade unitária.',
      'Custo Variável por Venda': 'Custo variável médio associado a cada venda realizada.',
    },
    metricIdealTargets: {
      'Margem de Contribuição por Produto': 30,
    },
    metricHigherIsBetter: {
      'Custo Variável Total': false,
      'Custo Médio por Produto': false,
      'Margem de Contribuição por Produto': true,
      'Custo Variável por Venda': false,
    },
  },
  defaultParams: {
    period: 'month',
    monthsWindow: 12,
  },
};

registerTemplate(productCostKpiTemplate);

