'use client';

import React from 'react';
import { getReadablePeriodInfo } from './kpiUtils';

// =============================================================================
// TYPES
// =============================================================================

interface KpiInfoFooterProps {
    /** Date preset for period info */
    datePreset: string;
    /** Chart type for display label */
    chartType: string;
    /** Format type: 'currency' | 'percent' | 'number' */
    format: string;
    /** Whether this metric is temporal */
    isTemporal: boolean;
    /** Analysis kind: 'evolution' | 'composition' | 'comparison' | 'snapshot' */
    analysisKind: string;
    /** Human-readable description */
    description: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DISPLAY_TYPE_LABELS: Record<string, string> = {
    bar: 'Gráfico de Colunas',
    line: 'Gráfico de Linhas',
    area: 'Gráfico de Área',
    donut: 'Gráfico Donut',
    pie: 'Gráfico de Pizza',
    gauge: 'Velocímetro',
    card: 'Card Numérico',
    alert: 'Alerta',
};

const ANALYSIS_KIND_LABELS: Record<string, string> = {
    evolution: 'Evolução Temporal',
    comparison: 'Comparação',
    composition: 'Composição',
    snapshot: 'Snapshot (Estoque)',
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * KpiInfoFooter — Displays period info and KPI description in the detail panel.
 */
export default function KpiInfoFooter({
    datePreset,
    chartType,
    format,
    isTemporal,
    analysisKind,
    description,
}: KpiInfoFooterProps) {
    const periodInfo = getReadablePeriodInfo(datePreset);
    const kpiDisplayType = format === 'percent' ? 'gauge' : (chartType || 'bar');
    const isStock = !isTemporal || analysisKind === 'snapshot';

    return (
        <>
            {/* Period Info Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Informações do Período
                    </h4>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5">Período Atual</p>
                        <p className="text-gray-700 dark:text-gray-200 font-medium">
                            {isStock ? 'Snapshot (Absoluto)' : periodInfo.current}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5">Comparando com</p>
                        <p className="text-gray-700 dark:text-gray-200 font-medium">
                            {isStock ? '(Métrica sem período base)' : periodInfo.previous}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5">Tipo</p>
                        <p className="text-gray-700 dark:text-gray-200 font-medium">
                            {isStock ? 'Snapshot (Estoque)' : (ANALYSIS_KIND_LABELS[analysisKind] || analysisKind)}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-[10px] uppercase font-bold mb-0.5">Exibição</p>
                        <p className="text-gray-700 dark:text-gray-200 font-medium">
                            {DISPLAY_TYPE_LABELS[kpiDisplayType] || kpiDisplayType}
                        </p>
                    </div>
                </div>
            </div>

            {/* Description Card */}
            {description && (
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Sobre este Indicador
                        </h4>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        {description}
                    </p>
                </div>
            )}
        </>
    );
}
