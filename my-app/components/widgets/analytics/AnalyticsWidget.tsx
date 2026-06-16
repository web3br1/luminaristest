'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { HiOutlineChartPie, HiX, HiOutlineCog } from 'react-icons/hi';
import { useTranslation } from 'next-i18next';

import { useWidgetAnalyticsData } from '@/features/dashboard/category-views/finance/hooks';
import ChartRenderer from '@/features/dashboard/category-views/finance/components/analytics/charts/ChartRenderer';
import GoldKpiWidgetView from './GoldKpiWidgetView';
import type { ChartDataPoint, ChartPreset } from '@/features/dashboard/category-views/finance/types';

type AnalyticsConfig = { chartKey?: string | null; kpiName?: string | null; [key: string]: unknown };

interface AnalyticsWidgetProps {
    id: string;
    onClose?: () => void;
    initialConfig?: AnalyticsConfig;
    onConfigChange?: (config: AnalyticsConfig) => void;
}

export default function AnalyticsWidget({ id, onClose, initialConfig, onConfigChange }: AnalyticsWidgetProps) {
    const { t } = useTranslation(['common', 'analytics']);
    const [config, setConfig] = useState<AnalyticsConfig>(initialConfig || {});
    // Start configuring if no chartKey is present
    const [isConfiguring, setIsConfiguring] = useState(!initialConfig?.chartKey);

    // Fetch analytics presets and specific chart data cleanly (Lazy Loading pattern)
    const { presetGroups, chartData, loadingPresets, loadingData } = useWidgetAnalyticsData({ 
        chartKey: config.chartKey ?? undefined
    });

    const handleSaveConfig = () => {
        setIsConfiguring(false);
        if (onConfigChange) {
            onConfigChange(config);
        }
    };

    // Find the specific chart preset the user selected
    const chartPreset = useMemo(() => {
        if (!config?.chartKey || !presetGroups) return null;
        for (const group of presetGroups) {
            const match = group.charts.find(c => c.key === config.chartKey);
            if (match) return match;
        }
        return null;
    }, [presetGroups, config]);

    // Data for the targeted chart
    const data = chartData && chartPreset ? chartData : null;

    const isKpiGrid = chartPreset?.options?.layout === 'kpiGrid';
    const needsKpiSelection = isKpiGrid && !config.kpiName;

    // Isolate the explicitly selected KPI
    const targetKpi: ChartDataPoint | null = useMemo(() => {
        if (!isKpiGrid || !config.kpiName || !data?.data) return null;
        return data.data.find(d => d.name === config.kpiName) || null;
    }, [isKpiGrid, config.kpiName, data]);

    const titleText = useMemo(() => {
        if (!chartPreset) return t('dashboard.widgets.kpi.newMetric', 'Nova Métrica') as string;
        const defaultTitle = t(`analytics:kpi.titles.${chartPreset.title}`, chartPreset.title) as string;
        if (isKpiGrid && targetKpi) return targetKpi.name;
        if (isKpiGrid && needsKpiSelection) return `${defaultTitle} - Configuração`;
        return defaultTitle;
    }, [t, chartPreset, isKpiGrid, targetKpi, needsKpiSelection]);

    // Force configure mode if user selected a KPI Grid preset but hasn't selected the internal KPI yet
    useEffect(() => {
        if (needsKpiSelection && !isConfiguring) {
            setIsConfiguring(true);
        }
    }, [needsKpiSelection, isConfiguring]);

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm flex flex-col h-full w-full overflow-hidden border border-gray-200 dark:border-gray-800">
            
            {/* Header (Strictly Standardized) */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/50 dark:bg-neutral-800/30 border-b border-gray-200 dark:border-gray-800 cursor-move drag-handle group">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <HiOutlineChartPie className="w-4 h-4 text-indigo-500" />
                    <h3 className="font-semibold text-xs tracking-wide uppercase truncate max-w-[200px]" title={titleText}>
                        {titleText}
                    </h3>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isConfiguring && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsConfiguring(true);
                            }}
                            className="widget-action-btn p-1 rounded text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                            title={t('dashboard.widgets.common.settings', 'Configurações')}
                        >
                            <HiOutlineCog className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="widget-action-btn p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title={t('dashboard.widgets.common.close', 'Fechar')}
                        >
                            <HiX className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-grow overflow-hidden flex flex-col relative bg-transparent">
                {isConfiguring ? (
                    <div className="flex flex-col h-full p-4">
                        {needsKpiSelection ? (
                            // STEP 2: KPI SELECTION
                            <>
                                <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                                    Escolha o indicador exato para exibir no widget:
                                </label>
                                {loadingData ? (
                                    <div className="flex-grow flex items-center justify-center">
                                        <p className="text-gray-500 animate-pulse text-sm">Buscando indicadores...</p>
                                    </div>
                                ) : (
                                    <div className="flex-grow overflow-y-auto custom-scrollbar mt-2 pr-2 pb-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {data?.data?.map((kpi: ChartDataPoint) => (
                                                <button
                                                    key={kpi.name}
                                                    onClick={() => {
                                                        const newConfig = { ...config, kpiName: kpi.name };
                                                        setConfig(newConfig);
                                                        setIsConfiguring(false);
                                                        if (onConfigChange) onConfigChange(newConfig);
                                                    }}
                                                    className="p-3 text-left border rounded transition-all hover:shadow-sm border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-neutral-800/50 hover:border-blue-300 hover:ring-1 hover:ring-blue-300 dark:hover:border-blue-600 dark:hover:ring-blue-600"
                                                >
                                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                                                        {kpi.name}
                                                    </span>
                                                    {(kpi.value || kpi.value === 0) && (
                                                        <span className="text-[10px] text-gray-500 font-mono bg-white dark:bg-neutral-900 px-1 py-0.5 rounded">
                                                            {typeof kpi.value === 'number' && kpi.value > 1000 ? `${(kpi.value/1000).toFixed(1)}k` : kpi.value}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                                            <button 
                                                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                                                onClick={() => setConfig({ ...config, chartKey: null, kpiName: null })}
                                            >
                                                &larr; Voltar para Categorias
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            // STEP 1: PRESET SELECTION
                            <>
                                <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                                    {t('dashboard.widgets.kpi.selectMetric', 'Escolha uma métrica para exibir:')}
                                </label>
                                {loadingPresets ? (
                                    <div className="flex-grow flex items-center justify-center">
                                        <p className="text-gray-500 animate-pulse text-sm">Carregando métricas disponíveis...</p>
                                    </div>
                                ) : (
                                    <div className="flex-grow overflow-y-auto custom-scrollbar mt-2 pr-2 pb-4">
                                        <div className="space-y-5">
                                            {presetGroups.map((group) => (
                                                <div key={group.key}>
                                                    <h4 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 pl-1">
                                                        {group.title}
                                                    </h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {group.charts.map(chart => (
                                                            <button
                                                                key={chart.key}
                                                                onClick={() => {
                                                                    const newConfig = { ...config, chartKey: chart.key, kpiName: null };
                                                                    setConfig(newConfig);
                                                                    if (chart.options?.layout !== 'kpiGrid') {
                                                                        setIsConfiguring(false);
                                                                        if (onConfigChange) onConfigChange(newConfig);
                                                                    }
                                                                }}
                                                                className={`p-3 text-left border rounded transition-all flex flex-col group hover:shadow-sm
                                                                    ${config.chartKey === chart.key
                                                                        ? 'border-gray-900 dark:border-white bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-white ring-1 ring-gray-900 dark:ring-white'
                                                                        : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-neutral-800/50 hover:border-gray-300 dark:hover:border-gray-600'
                                                                    }`}
                                                            >
                                                                <span className={`text-sm font-medium ${config.chartKey === chart.key ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                                                    {(t(`analytics:kpi.titles.${chart.title}`, chart.title) as string)}
                                                                </span>
                                                                <span className={`text-[10px] mt-1 line-clamp-2 ${config.chartKey === chart.key ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                    {(t(`analytics:kpi.descriptions.${chart.title}`, 'Exibir indicador no dashboard') as string)}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full w-full">
                        {loadingData || !data ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm animate-pulse">
                                Carregando dados...
                            </p>
                        ) : (
                            isKpiGrid && targetKpi ? (
                                <GoldKpiWidgetView kpi={targetKpi} chartPreset={chartPreset as ChartPreset} />
                            ) : (
                                <div className="p-4 w-full h-full relative" onMouseDownCapture={(e) => e.stopPropagation()}>
                                    <ChartRenderer chart={chartPreset as ChartPreset} data={data} />
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
