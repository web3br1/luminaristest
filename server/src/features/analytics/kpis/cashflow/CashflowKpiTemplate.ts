/**
 * Cashflow KPI Template
 *
 * Defines the 11 cashflow and solvency KPIs with display metadata.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const cashflowKpiTemplate: AnalyticsTemplate = {
  key: 'cashflowKpis',
  name: 'KPIs de Caixa e Solvência',
  description:
    'Calcula indicadores de fluxo de caixa, contas a receber/pagar e índices de liquidez/solvência.',
  processor: 'cashflowKpis',
  requiredFields: [
    {
      key: 'salesAmountField',
      label: 'Campo de Valor da Venda',
      types: ['number'],
      description: 'Campo numérico que representa o valor total da venda.',
      required: true,
    },
    {
      key: 'salesDateField',
      label: 'Campo de Data da Venda',
      types: ['date'],
      description: 'Campo de data da venda.',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'salesDueDateField',
      label: 'Campo de Vencimento (Vendas)',
      types: ['date'],
      description: 'Data de vencimento do pagamento da venda.',
      required: false,
    },
    {
      key: 'salesPaymentStatusField',
      label: 'Campo de Status de Pagamento (Vendas)',
      types: ['select', 'string'],
      description: 'Status do pagamento (Paid, Pending, etc.).',
      required: false,
    },
    {
      key: 'expensesTableKey',
      label: 'Tabela de Despesas',
      types: [],
      description: 'Chave da tabela de despesas para calcular contas a pagar.',
      required: false,
    },
    {
      key: 'initialCashBalance',
      label: 'Saldo Inicial de Caixa',
      types: ['number'],
      description: 'Saldo de caixa no início do período.',
      required: false,
    },
  ],
  defaultOptions: {
    type: 'bar',
    layout: 'kpiGrid',
    metricFormats: {
      'Fluxo de Caixa Operacional': 'currency',
      'Fluxo de Caixa Livre': 'currency',
      'Saldo de Caixa': 'currency',
      'Contas a Receber Total': 'currency',
      'Contas a Receber Vencidas': 'currency',
      'Prazo Médio de Recebimento (dias)': 'number',
      'Contas a Pagar Total': 'currency',
      'Contas a Pagar Vencidas': 'currency',
      'Prazo Médio de Pagamento (dias)': 'number',
      'Índice de Liquidez Corrente': 'number',
      'Índice de Solvência': 'number',
    },
    metricDisplay: {
      // 4.1 Fluxo de Caixa
      'Fluxo de Caixa Operacional': 'graph',
      'Fluxo de Caixa Livre': 'graph',
      'Saldo de Caixa': 'card',

      // 4.2 Contas a Receber
      'Contas a Receber Total': 'card',
      'Contas a Receber Vencidas': 'card',
      'Prazo Médio de Recebimento (dias)': 'card',

      // 4.3 Contas a Pagar
      'Contas a Pagar Total': 'card',
      'Contas a Pagar Vencidas': 'card',
      'Prazo Médio de Pagamento (dias)': 'card',

      // 4.4 Solvência
      'Índice de Liquidez Corrente': 'gauge',
      'Índice de Solvência': 'gauge',
    },
    metricChartTypes: {
      'Fluxo de Caixa Operacional': 'line',
      'Fluxo de Caixa Livre': 'line',
      'Saldo de Caixa': 'card',
      'Contas a Receber Total': 'card',
      'Contas a Receber Vencidas': 'card',
      'Prazo Médio de Recebimento (dias)': 'line',
      'Contas a Pagar Total': 'card',
      'Contas a Pagar Vencidas': 'card',
      'Prazo Médio de Pagamento (dias)': 'line',
      'Índice de Liquidez Corrente': 'gauge',
      'Índice de Solvência': 'gauge',
    },
    metricAnalysis: {
      'Fluxo de Caixa Operacional': 'evolution',
      'Fluxo de Caixa Livre': 'evolution',
      'Saldo de Caixa': 'evolution',
      'Contas a Receber Total': 'snapshot',
      'Contas a Receber Vencidas': 'comparison',
      'Prazo Médio de Recebimento (dias)': 'evolution',
      'Contas a Pagar Total': 'snapshot',
      'Contas a Pagar Vencidas': 'comparison',
      'Prazo Médio de Pagamento (dias)': 'evolution',
      'Índice de Liquidez Corrente': 'evolution',
      'Índice de Solvência': 'evolution',
    },
    metricHybrid: {
      'Saldo de Caixa': true,
      'Contas a Receber Vencidas': true,
      'Contas a Pagar Vencidas': true,
      'Índice de Liquidez Corrente': true,
      'Índice de Solvência': true,
    },
    metricIdealTargets: {
      'Índice de Liquidez Corrente': 1.5,
      'Índice de Solvência': 1.0,
      'Prazo Médio de Recebimento (dias)': 30,
      'Contas a Receber Vencidas': 0,
      'Contas a Pagar Vencidas': 0,
    },
    metricHigherIsBetter: {
      'Fluxo de Caixa Operacional': true,
      'Fluxo de Caixa Livre': true,
      'Saldo de Caixa': true,
      'Contas a Receber Total': true,
      'Contas a Receber Vencidas': false,
      'Prazo Médio de Recebimento (dias)': false,
      'Contas a Pagar Total': false,
      'Contas a Pagar Vencidas': false,
      'Prazo Médio de Pagamento (dias)': true,
      'Índice de Liquidez Corrente': true,
      'Índice de Solvência': true,
    },
    metricDescriptions: {
      'Fluxo de Caixa Operacional': 'Dinheiro gerado/consumido pelas operações do dia a dia. Positivo = saudável.',
      'Fluxo de Caixa Livre': 'Caixa disponível após pagar todas as obrigações operacionais. Indica capacidade de investimento.',
      'Saldo de Caixa': 'Saldo atual disponível em caixa. Indica liquidez imediata do negócio.',
      'Contas a Receber Total': 'Valor total que clientes devem ao negócio. Representa receita futura.',
      'Contas a Receber Vencidas': 'Valor de recebíveis já vencidos e não pagos. Alerta de inadimplência.',
      'Prazo Médio de Recebimento (dias)': 'Quantos dias, em média, leva para receber após a venda. Menor = melhor.',
      'Contas a Pagar Total': 'Valor total que o negócio deve a fornecedores e credores.',
      'Contas a Pagar Vencidas': 'Valor de pagamentos já vencidos. Indica problemas de fluxo de caixa.',
      'Prazo Médio de Pagamento (dias)': 'Quantos dias, em média, leva para pagar fornecedores. Maior pode ser vantajoso.',
      'Índice de Liquidez Corrente': 'Ativos de curto prazo / Passivos de curto prazo. Acima de 1.0 = pode pagar dívidas.',
      'Índice de Solvência': 'Capacidade de pagar todas as dívidas (curto + longo prazo). Acima de 1.0 = solvente.',
    },
  },
  defaultParams: {
    period: 'month',
    monthsWindow: 12,
    excludeStatuses: ['Cancelled'],
  },
};

registerTemplate(cashflowKpiTemplate);

