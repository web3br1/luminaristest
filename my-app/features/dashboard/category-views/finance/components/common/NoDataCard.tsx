'use client';

import React from 'react';
import type { ChartPreset, NoDataCardProps } from '../../types';

// =============================================================================
// HELPERS
// =============================================================================

interface EmptyStateInfo {
  explanation: string;
  details: string[];
}

/**
 * Get contextual empty state information based on processor type
 */
function getEmptyStateInfo(
  processor: string,
  params: Record<string, unknown>
): EmptyStateInfo {
  const details: string[] = [];
  let explanation = 'Nenhum dado foi retornado para esta análise com os critérios atuais.';

  switch (processor) {
    case 'aggregatePipeline': {
      // Type-narrow params.pipeline em vez de cast com any
      const pipeline = params.pipeline as { filters?: unknown } | undefined;
      if (pipeline?.filters) {
        explanation = 'Nenhum registro encontrado que atenda aos filtros desta análise.';
        try {
          const filters = Array.isArray(pipeline.filters) ? pipeline.filters : [];
          for (const f of filters) {
            const fr = f as { field?: unknown; op?: unknown; value?: unknown };
            if (typeof fr.field !== 'string') continue;
            const op = typeof fr.op === 'string' ? fr.op : 'eq';
            details.push(`• ${fr.field} ${op} ${JSON.stringify(fr.value)}`);
          }
        } catch {
          // Silently ignore parsing errors
        }
      }
      break;
    }

    case 'statusComparison':
    case 'statusDistribution': {
      const statusField = String(params.statusField ?? params.paymentStatusField ?? 'status');
      explanation =
        'Não há registros com valores positivos para esta combinação de status e valores.';
      details.push(`• Campo de status analisado: "${statusField}"`);
      if (Array.isArray(params.excludeStatuses)) {
        details.push(`• Status excluídos: ${params.excludeStatuses.join(', ')}`);
      }
      break;
    }

    case 'temporalAggregation': {
      const amountField = String(params.amountField ?? 'totalAmount');
      const dateField = String(params.dateField ?? 'date');
      explanation =
        'Nenhum valor foi encontrado dentro do período e critérios configurados.';
      details.push(`• Campo de valor: "${amountField}"`);
      details.push(`• Campo de data: "${dateField}"`);
      if (Array.isArray(params.excludeStatuses)) {
        details.push(`• Status excluídos: ${params.excludeStatuses.join(', ')}`);
      }
      break;
    }

    case 'formulaCalculation':
    case 'multiTableCalculation': {
      explanation =
        'A fórmula foi aplicada, mas o resultado agregado ficou zerado para todos os registros.';
      if (typeof params.formula === 'string') {
        details.push(`• Fórmula: ${params.formula}`);
      }
      if (params.fieldMapping && typeof params.fieldMapping === 'object') {
        const vars = Object.entries(params.fieldMapping as Record<string, unknown>)
          .map(([k, v]) => `${k} → ${v}`)
          .join(', ');
        if (vars) {
          details.push(`• Variáveis mapeadas: ${vars}`);
        }
      }
      if (params.groupBy === 'period') {
        details.push('• Agrupamento: período');
      } else if (params.groupBy === 'status') {
        details.push('• Agrupamento: status');
      }
      break;
    }

    case 'revenueKpis':
    case 'costKpis':
    case 'profitKpis':
    case 'cashflowKpis': {
      explanation =
        'Não há dados suficientes para calcular os KPIs. Verifique se existem registros válidos na tabela.';
      if (Array.isArray(params.excludeStatuses)) {
        details.push(`• Status excluídos: ${params.excludeStatuses.join(', ')}`);
      }
      break;
    }

    case 'profitByDimension': {
      explanation =
        'Não há receita no período atual para calcular lucro/custo por dimensão.';
      if (params.dimensionField) {
        details.push(`• Dimensão: ${String(params.dimensionField)}`);
      }
      break;
    }

    default:
      // Use default explanation
      break;
  }

  return { explanation, details };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * NoDataCard - Displays contextual empty state messages for analytics charts
 */
export default function NoDataCard({ chart }: Omit<NoDataCardProps, 'data'>) {
  const processor = chart.processor;
  const params = chart.params || {};
  const tableKey =
    typeof params.tableId === 'string' ? params.tableId : undefined;

  const { explanation, details } = getEmptyStateInfo(processor, params);

  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-neutral-900/60 p-4">
      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
        {chart.title}
      </h3>

      {/* Table Key (if available) */}
      {tableKey && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
          Origem:{' '}
          <span className="font-mono">
            {tableKey.replace('@@PRESET_TABLE_KEY::', '')}
          </span>
        </p>
      )}

      {/* Empty State Icon */}
      <div className="flex justify-center py-4">
        <svg
          className="w-12 h-12 text-gray-300 dark:text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>

      {/* Explanation */}
      <p className="text-xs text-gray-600 dark:text-gray-300 text-center">
        {explanation}
      </p>

      {/* Details */}
      {details.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {details.map((d, idx) => (
            <li key={idx}>{d}</li>
          ))}
        </ul>
      )}

      {/* Action Hint */}
      <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500 text-center">
        Crie registros que atendam a esses critérios para visualizar o gráfico.
      </p>
    </div>
  );
}
