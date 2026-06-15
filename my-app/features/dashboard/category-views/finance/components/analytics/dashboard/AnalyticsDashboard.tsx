'use client';

import React, { useState } from 'react';
import DashboardKpiCard from './DashboardKpiCard';
import DashboardGaugeCard from './DashboardGaugeCard';
import DashboardProgressCard from './DashboardProgressCard';
import DashboardTrendChart from './DashboardTrendChart';
import DashboardPieChart from './DashboardPieChart';
import DashboardBarComparison from './DashboardBarComparison';
import { useAnalyticsData } from '../../../hooks/analytics/useAnalyticsData';
import type { ChartPreset, ChartData, DatePreset } from '../../../types';
import { useTranslation } from 'next-i18next';

type TimePeriod = 'year' | 'month' | 'week';

interface KpiCardData {
    title: string;
    value: string;
    change: string;
    trend: 'up' | 'down' | 'flat';
    details: { label: string; value: string }[];
    isCurrency: boolean;
    sparklineData?: number[];
    numericValue: number;
}

interface AnalyticsDashboardProps {
    presetKey?: string;
    tables?: Array<{ id: string; name: string; key: string }>;
}

/**
 * Format value for display
 */
function formatValue(value: number, currency?: string): string {
    const absValue = Math.abs(value);

    if (absValue >= 1000000) {
        const formatted = (value / 1000000).toFixed(1);
        return currency === 'BRL' ? `R$ ${formatted}M` : `${formatted}M`;
    }
    if (absValue >= 1000) {
        const formatted = (value / 1000).toFixed(1);
        return currency === 'BRL' ? `R$ ${formatted}K` : `${formatted}K`;
    }

    if (currency === 'BRL') {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }
    return new Intl.NumberFormat('pt-BR').format(value);
}

/**
 * Extract card data from a KPI
 */
function getCardData(kpi: ChartPreset, chartData: ChartData): KpiCardData {
    const data = chartData?.data || [];
    const currency = kpi.options?.currency as string | undefined;
    if (data.length === 0) {
        return { title: kpi.title, value: '—', change: '', trend: 'flat' as const, details: [], isCurrency: currency === 'BRL', numericValue: 0 };
    }

    // Use current and previous values directly from the API if available
    const lastPoint = data[data.length - 1];
    const current = lastPoint?.value || 0;
    const previous = lastPoint?.previousValue ?? (data.length > 1 ? data[data.length - 2]?.value : current);

    const changePercent = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
    const formattedChange = changePercent.toFixed(2);
    // Avoid -0.00%
    const normalizedChange = (formattedChange === '-0.00' || formattedChange === '0.00') ? '0.00' : formattedChange;
    const sign = Number(normalizedChange) > 0 ? '+' : '';

    return {
        title: kpi.title,
        value: formatValue(current, currency),
        change: `${sign}${normalizedChange}%`,
        trend: changePercent > 0 ? 'up' as const : changePercent < 0 ? 'down' as const : 'flat' as const,
        details: data.slice(-3).map(d => ({
            label: d.name || d.label || '',
            value: formatValue(d.value, currency),
        })),
        isCurrency: currency === 'BRL',
        sparklineData: lastPoint?.fullRecords?.records?.map((r: { data?: { value?: number } }) => r.data?.value ?? 0),
        numericValue: current, // For gauges/progress
    };
}

/**
 * AnalyticsDashboard - Dynamic dashboard showing all KPIs grouped by category
 */
export default function AnalyticsDashboard({ presetKey, tables }: AnalyticsDashboardProps) {
    const { t } = useTranslation(['common', 'finance_view', 'analytics']);
    const { presetGroups, chartData, loading, errors, discoverKPIs, datePreset, setDatePreset } = useAnalyticsData({
        presetKey,
    });

    const [selectedTable, setSelectedTable] = useState<string>('');
    const [discoverLoading, setDiscoverLoading] = useState(false);

    // Handle discovery trigger
    const handleDiscover = async () => {
        if (!selectedTable) return;
        setDiscoverLoading(true);
        try {
            await discoverKPIs(selectedTable);
        } finally {
            setDiscoverLoading(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {t('common:loading', 'Carregando relatórios...')}
                    </span>
                </div>
            </div>
        );
    }

    // Error state
    if (errors.general) {
        return (
            <div className="min-h-[200px] flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400">{errors.general}</p>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-gray-50 dark:bg-neutral-950 -m-4 md:-m-6 lg:-m-8 p-4 md:p-6 lg:p-8">
            {/* Header */}
            <header className="flex flex-col gap-6 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {t('finance_view:analytics.title', 'Visão Geral Consolidada')}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {t('finance_view:analytics.subtitle', 'Acompanhe todos os seus indicadores de performance em tempo real.')}
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Time Filter */}
                        <select
                            value={datePreset}
                            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                            className="px-4 py-2 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                        >
                            <option value="today">Hoje</option>
                            <option value="thisWeek">Esta Semana</option>
                            <option value="thisMonth">Este Mês</option>
                            <option value="last30Days">Últ. 30 Dias</option>
                            <option value="lastMonth">Mês Passado</option>
                            <option value="thisYear">Este Ano (YTD)</option>
                        </select>
                    </div>
                </div>

                {/* Discovery Controls */}
                <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                {t('analytics:discovery.title', 'Descoberta Inteligente')}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t('analytics:discovery.subtitle', 'Selecione uma tabela para descobrir novos KPIs automaticamente')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <select
                            value={selectedTable}
                            onChange={(e) => setSelectedTable(e.target.value)}
                            className="flex-1 md:w-64 px-3 py-2 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="">{t('analytics:discovery.select_table', 'Selecione uma tabela...')}</option>
                            {tables?.map((table) => (
                                <option key={table.id || table.key} value={table.id || table.key}>
                                    {table.name}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={handleDiscover}
                            disabled={!selectedTable || discoverLoading}
                            className={`
                                px-6 py-2 rounded-lg text-sm font-bold transition-all
                                ${!selectedTable || discoverLoading
                                    ? 'bg-gray-200 dark:bg-neutral-800 text-gray-400 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
                                }
                                flex items-center gap-2
                            `}
                        >
                            {discoverLoading ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>{t('analytics:discovery.discovering', 'Analisando...')}</span>
                                </>
                            ) : (
                                <span>{t('analytics:discovery.discover_btn', 'Descobrir KPIs')}</span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Render Groups and their KPIs dynamically */}
            {presetGroups?.length === 0 && (
                <div className="py-20 text-center bg-white dark:bg-neutral-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum indicador disponível nesta categoria.</p>
                    <p className="text-xs text-gray-400 mt-1">Altere a categoria ou use a descoberta inteligente.</p>
                </div>
            )}

            {presetGroups?.map((group, index) => {
                const kpis = group.charts;
                // Determine whether a KPI should be displayed as a card.
                // It's a card if its metricDisplay explicitly says 'card' or 'hybrid', 
                // or if it doesn't specify any tight visualization type constraint.
                const cardKpis = kpis.filter(k => {
                    const displayMode = k.options?.metricDisplay?.[k.title] as string | undefined;
                    return displayMode === 'card' || displayMode === 'hybrid' || displayMode === undefined;
                });
                // Find charts that strictly map to large visual panels
                const chartKpis = kpis.filter(k => k.type && ['line', 'bar', 'pie', 'donut', 'area'].includes(k.type));

                if (kpis.length === 0) return null;

                return (
                    <div key={group.key} className="mb-20">
                        {/* Group Title Section - Premium ERP Style */}
                        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100 dark:border-neutral-800">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-indigo-600 text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
                                    {(index + 1).toString().padStart(2, '0')}
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                                        {group.title}
                                    </h2>
                                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                                        Seção de Indicadores
                                    </span>
                                </div>
                            </div>
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-neutral-800 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tighter">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                Real-time Data
                            </div>
                        </div>

                        {/* Cards Row (Metrics) */}
                        {cardKpis.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                {cardKpis.map(kpi => {
                                    const data = chartData[kpi.key];
                                    const cardProps = data ? getCardData(kpi, data) : null;
                                    const displayTitle = t(`analytics:kpi.titles.${kpi.title}`, kpi.title);
                                    if (cardProps) cardProps.title = displayTitle || cardProps.title;

                                    if (!cardProps) {
                                        return (
                                            <div key={kpi.key} className="h-[120px] rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-neutral-900/50 flex flex-col items-center justify-center animate-pulse gap-2">
                                                <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                                <span className="text-xs text-gray-400 font-medium">{displayTitle}</span>
                                            </div>
                                        );
                                    }

                                    // Determine visualization type
                                    const title = kpi.title.toLowerCase();
                                    const isGauge = title.includes('participação') || title.includes('não planejado');
                                    const isProgress = title.includes('administrativas (%)');

                                    if (isGauge) {
                                        return <DashboardGaugeCard key={kpi.key} {...cardProps} higherIsBetter={!title.includes('custo')} />;
                                    }

                                    if (isProgress) {
                                        return <DashboardProgressCard key={kpi.key} {...cardProps} color="#6366f1" /* lumi-secondary */ />;
                                    }

                                    const analysisType = (kpi.options?.metricAnalysis as Record<string, string>)?.[kpi.title] || 'snapshot';
                                    // Só esconde o gráfico se for explicitamente 'snapshot'
                                    const showGraph = analysisType !== 'snapshot';

                                    return (
                                        <DashboardKpiCard key={kpi.key} {...cardProps} showGraph={showGraph} />
                                    );
                                })}
                            </div>
                        )}

                        {/* Charts Row (Lines, Pies, Bars) */}
                        {chartKpis.length > 0 && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {chartKpis.map(kpi => {
                                    const data = chartData[kpi.key];
                                    const displayTitle = t(`analytics:kpi.titles.${kpi.title}`, kpi.title);

                                    if (!data) {
                                        return (
                                            <div key={kpi.key} className="h-[320px] rounded-xl border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-neutral-900/50 flex flex-col items-center justify-center animate-pulse gap-2">
                                                <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                                <span className="text-xs text-gray-400 font-medium opacity-80">{displayTitle}</span>
                                            </div>
                                        );
                                    }

                                    if (kpi.type === 'line' || kpi.type === 'area') {
                                        const trendData = data.data?.map(d => ({ name: d.name || d.label || '', value: d.value })) || [];
                                        return (
                                            <div key={kpi.key} className="col-span-1 lg:col-span-2 xl:col-span-2">
                                                <DashboardTrendChart title={displayTitle} data={trendData} period={datePreset === 'thisYear' ? 'year' : datePreset === 'thisWeek' ? 'week' : 'month'} />
                                            </div>
                                        );
                                    }

                                    if (kpi.type === 'pie' || kpi.type === 'donut') {
                                        // lumi-secondary and its tints — replace hardcoded hex with tokens where possible
                                        const colors = ['#6366f1' /* lumi-secondary */, '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff'];
                                        const pieData = data.data?.map((d, i) => ({ name: d.name || d.label || '', value: d.value, count: d.count || d.value, color: colors[i % colors.length] })) || [];
                                        return (
                                            <div key={kpi.key} className="col-span-1 border border-gray-100 dark:border-gray-800 rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                <DashboardPieChart title={displayTitle} data={pieData} />
                                            </div>
                                        );
                                    }

                                    if (kpi.type === 'bar') {
                                        const barData = data.data?.map(d => ({ name: d.name || d.label || '', current: d.value, previous: d.previousValue || d.value * 0.8 })) || [];
                                        // A bar chart could occupy 1 column or 2 columns based on available space
                                        return (
                                            <div key={kpi.key} className="col-span-1">
                                                <div className="h-full border border-gray-100 dark:border-gray-800 rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                    <DashboardBarComparison title={displayTitle} data={barData} isHorizontal={false} />
                                                </div>
                                            </div>
                                        );
                                    }

                                    return null;
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
