'use client';

import React from 'react';

export interface KpiTooltipProps {
    kpiName: string;
    isVisible: boolean;
}

// Direct mapping of KPI descriptions (pt-BR)
// Using hardcoded descriptions for reliability
const KPI_DESCRIPTIONS: Record<string, string> = {
    // Revenue KPIs
    'Receita Bruta': 'Receita total de todas as vendas antes de qualquer dedução.',
    'Receita Líquida': 'Receita após dedução de descontos e impostos.',
    'Crescimento da Receita (%)': 'Variação percentual da receita em relação ao período anterior.',
    'Receita Total Anual': 'Receita acumulada na janela de tempo configurada.',
    'Receita Operacional': 'Receita das operações principais do negócio.',
    'Receita Não Operacional': 'Receita de atividades não essenciais.',
    'Receita Média Mensal': 'Média mensal da receita calculada sobre a janela de tempo.',
    'Receita Média por Dia Útil': 'Média da receita por dia útil no período atual.',
    'Receita por Hora Operacional': 'Receita dividida pelas horas operacionais (8h/dia útil).',
    'Receita por Cliente': 'Receita média por cliente único no período.',
    'Receita Máxima por Cliente': 'Maior receita total vinda de um único cliente.',
    'Receita por Categoria': 'Receita média por categoria de produto/serviço.',
    'Dependência de Receita de Fonte Única (%)': 'Percentual da receita vindo da maior fonte. Valores altos indicam risco.',
    'Receita Nova (%)': 'Percentual da receita de novos clientes.',
    'Receita Recorrente (%)': 'Percentual da receita de clientes fiéis.',
    'Receita Sazonal (Índice)': 'Receita do período vs. média. Valores >100 = acima da média.',
    'Receita Incremental por Campanha': 'Receita adicional atribuída a campanhas de marketing.',

    // Cost KPIs
    'Custo Fixo Total': 'Total de custos fixos (aluguel, salários) no período.',
    'Custo Fixo Médio Mensal': 'Média mensal dos custos fixos.',
    'Participação dos Custos Fixos (%)': 'Custos fixos como percentual do custo total.',
    'Custo Variável Total': 'Total de custos que variam com produção/vendas.',
    'Custo Variável Médio por Atendimento': 'Custo variável médio por atendimento.',
    'Participação dos Custos Variáveis (%)': 'Custos variáveis como percentual do total.',
    'Despesas Operacionais Totais': 'Soma de despesas administrativas e variáveis.',
    'Despesas Administrativas (%)': 'Custos administrativos como percentual do total.',
    'Despesas de Manutenção': 'Total de despesas com manutenção e reparos.',
    'Despesas Não Recorrentes': 'Despesas únicas que não devem se repetir.',
    'Impostos Totais Pagos': 'Total de impostos pagos no período.',
    'Custo Total': 'Soma de todos os custos e despesas.',
    'Custo por Dia Útil': 'Custo médio por dia útil no mês atual.',
    'Custo Não Planejado (%)': 'Despesas não planejadas como percentual do total.',

    // Profit KPIs
    'Lucro Bruto': 'Receita menos custos variáveis. Mostra eficiência de produção.',
    'Lucro Operacional': 'Lucro bruto menos custos fixos.',
    'Lucro Líquido': 'Lucro final após todas as despesas e impostos.',
    'Lucro por Cliente': 'Lucro líquido dividido pelo número de clientes.',
    'Lucro por Funcionário': 'Lucro líquido dividido pelo número de funcionários.',
    'Lucro por Hora Trabalhada': 'Lucro líquido dividido pelo total de horas.',
    'Margem Bruta (%)': 'Lucro bruto como percentual da receita.',
    'Margem Operacional (%)': 'Lucro operacional como percentual da receita.',
    'Margem Líquida (%)': 'Lucro líquido como percentual da receita.',
    'Margem de Contribuição (%)': 'Receita menos custos variáveis, em percentual.',
    'Rentabilidade Geral (%)': 'Retorno sobre patrimônio.',
    'Crescimento do Lucro (%)': 'Variação percentual do lucro vs. período anterior.',
    'Produtividade do Lucro': 'Lucro líquido por hora trabalhada.',
    'Eficiência do Lucro (Lucro/Custo)': 'Lucro dividido pelos custos. >1 = lucrativo.',
    'Índice de Qualidade do Lucro': 'Lucro recorrente como percentual do total.',
    'Resultado Financeiro Final': 'Resultado financeiro após todos os ajustes.',
    'Lucro Ajustado': 'Lucro líquido menos itens não recorrentes.',
    'Lucro Acumulado': 'Lucro acumulado ao longo do tempo.',

    // Cashflow KPIs
    'Fluxo de Caixa Operacional': 'Caixa das operações (recebido - pago).',
    'Fluxo de Caixa Livre': 'Fluxo operacional menos investimentos.',
    'Saldo de Caixa': 'Saldo atual de caixa.',
    'Contas a Receber Total': 'Total de recebíveis pendentes de clientes.',
    'Contas a Receber Vencidas': 'Recebíveis vencidos. Requer ação de cobrança.',
    'Prazo Médio de Recebimento (dias)': 'Média de dias para receber pagamento.',
    'Contas a Pagar Total': 'Total de contas a pagar para fornecedores.',
    'Contas a Pagar Vencidas': 'Contas vencidas após data de vencimento.',
    'Prazo Médio de Pagamento (dias)': 'Média de dias para pagar fornecedores.',
    'Índice de Liquidez Corrente': 'Ativos / passivos circulantes. >1 = pode pagar dívidas.',
    'Índice de Solvência': 'Ativos / passivos totais. Saúde financeira de longo prazo.',
};

/**
 * KpiTooltip - Shows KPI description on click
 * Appears below the KPI card and closes when mouse leaves
 */
export default function KpiTooltip({ kpiName, isVisible }: KpiTooltipProps) {
    if (!isVisible) return null;

    const description = KPI_DESCRIPTIONS[kpiName];

    // If no description found, don't render
    if (!description) {
        return null;
    }

    return (
        <div
            className="absolute z-50 left-0 right-0 top-full mt-2 p-3 bg-gray-900 dark:bg-neutral-800 text-white text-xs rounded-lg shadow-lg border border-gray-700"
            role="tooltip"
        >
            <div className="absolute -top-2 left-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-900 dark:border-b-gray-800" />
            <p className="leading-relaxed">{description}</p>
        </div>
    );
}

