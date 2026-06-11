'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import Sparkline from './Sparkline';
import BarLineAreaChart from '../charts/BarLineAreaChart';
import PieDonutChart from '../charts/PieDonutChart';
import SpeedometerChart from '../charts/SpeedometerChart';
import { useAnalyticsData } from '../../../hooks/analytics/useAnalyticsData';
import { ResizableSidebar } from '@/features/dashboard/shared/components/ResizableSidebar';

import { CHART_COLORS } from '../../../utils/chartConstants';
import type { ChartPreset, AnalyticsPresetGroup } from '../../../types';
import KpiValueHeader from './KpiValueHeader';
import KpiInfoFooter from './KpiInfoFooter';
import PeriodSelector from './PeriodSelector';
import KpiDrillDownDrawer from './KpiDrillDownDrawer';
import { formatKpiDisplayValue, getTrend } from './kpiUtils';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';

interface MasterDetailDashboardProps {
    presetKey?: string;
    tables?: unknown[];
}

interface FlatKpiItem {
    id: string;
    name: string;
    value: number;
    previousValue?: number;
    displayMode: string;
    chartType: string;
    analysisKind: string;
    format: string;
    description: string;
    idealTarget?: number;
    higherIsBetter?: boolean;
    currency?: string;
    parentKey: string;
    parentPreset: ChartPreset;
    section: string;
    isTemporal?: boolean;
    fullRecords?: { records: any[] };
    recordIds?: string[];
    tableSource?: string;
}

const SECTION_KEYS: Record<string, string> = {
    revenueKpis: 'Receitas & Vendas',
    costKpis: 'Custos & Despesas',
    productCostKpis: 'Custos de Produtos',
    profitKpis: 'Lucratividade Global',
    profitByDimension: 'Lucratividade por Margem/Dimensão',
    cashflowKpis: 'Análise de Fluxo de Caixa',
    salesProfitByProductOverTime: 'Análise de Vendas no Tempo',
    temporalAggregation: 'Agregações Temporais',
    statusDistribution: 'Distribuição por Status',
    formulaCalculation: 'Cálculos de Fórmulas',
    aggregatePipeline: 'Pipelines Agregados Customizados',
    default: 'Outros Indicadores',
};

function DisplayModeIcon({ mode, chartType, format }: { mode: string; chartType?: string; format?: string }) {
    const iconClass = "w-3 h-3 text-gray-400 shrink-0";
    if (format === 'percent') return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Velocímetro</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    if (mode === 'alert') return <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Alerta</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    if (mode === 'graph' || chartType === 'line' || chartType === 'area' || chartType === 'bar' || chartType === 'donut' || chartType === 'pie') return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Gráfico</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012-2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
    return <svg className="w-3 h-3 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><title>Card</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>;
}

function flattenKpis(presetGroups: AnalyticsPresetGroup[], chartData: Record<string, { data: any[] }>): Record<string, FlatKpiItem[]> {
    const sections: Record<string, FlatKpiItem[]> = {};
    for (const group of presetGroups) {
        for (const chart of group.charts) {
            const section = chart.processor || 'default';
            if (!sections[section]) sections[section] = [];
            const opts = chart.options || {};
            const layout = opts.layout as string | undefined;
            const currency = opts.currency as string | undefined;
            const isTemporal = Boolean(opts.isTemporal);
            if (layout === 'kpiGrid') {
                const data = chartData[chart.key]?.data || [];
                for (const item of data) {
                    const metricName = item.name;
                    sections[section].push({
                        id: `${chart.key}::${metricName}`,
                        name: metricName,
                        value: item.value,
                        previousValue: item.previousValue,
                        displayMode: ((opts as any).metricDisplay || {})[metricName] || 'card',
                        chartType: ((opts as any).metricChartTypes || {})[metricName] || chart.type || 'bar',
                        analysisKind: ((opts as any).metricAnalysis || {})[metricName] || 'snapshot',
                        format: ((opts as any).metricFormats || {})[metricName] || 'number',
                        description: ((opts as any).metricDescriptions || {})[metricName] || '',
                        idealTarget: ((opts as any).metricIdealTargets || {})[metricName],
                        higherIsBetter: ((opts as any).metricHigherIsBetter || {})[metricName] ?? true,
                        currency, parentKey: chart.key, parentPreset: chart, section, isTemporal,
                        fullRecords: item.fullRecords, recordIds: item.recordIds, tableSource: item.tableSource,
                    });
                }
            } else {
                const data = chartData[chart.key]?.data || [];
                const lastItem = data.length > 0 ? data[data.length - 1] : undefined;
                sections[section].push({
                    id: chart.key, name: chart.title, value: lastItem?.value || 0,
                    previousValue: data.length > 1 ? data[data.length - 2]?.value : undefined,
                    displayMode: 'graph', chartType: chart.type || 'bar', analysisKind: 'evolution',
                    format: currency === 'BRL' ? 'currency' : 'number', description: chart.description || '',
                    currency, parentKey: chart.key, parentPreset: chart, section, isTemporal,
                    fullRecords: lastItem?.fullRecords, recordIds: lastItem?.recordIds, tableSource: lastItem?.tableSource,
                });
            }
        }
    }
    return sections;
}

export default function MasterDetailDashboard({ presetKey }: MasterDetailDashboardProps) {
    const { t } = useTranslation(['finance_view']);
    const formatCurrencyFn = useFormatCurrency();
    const { presetGroups, chartData, loading, errors, refetchChart, datePreset, setDatePreset } = useAnalyticsData({ presetKey });

    const [selectedKpiId, setSelectedKpiId] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const [searchQuery] = useState('');
    const [displayTypeFilter] = useState('all');
    const [groupFilter] = useState('all');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);

    const sections = useMemo(() => flattenKpis(presetGroups, chartData), [presetGroups, chartData]);

    const getDisplayType = useCallback((kpi: FlatKpiItem) => {
        if (kpi.format === 'percent') return 'gauge';
        if (kpi.displayMode === 'alert') return 'alert';
        if (kpi.chartType === 'line' || kpi.chartType === 'area') return 'line';
        if (kpi.chartType === 'bar') return 'bar';
        if (kpi.chartType === 'donut' || kpi.chartType === 'pie') return 'donut';
        return 'card';
    }, []);

    const filteredSections = useMemo(() => {
        const result: Record<string, FlatKpiItem[]> = {};
        const query = searchQuery.toLowerCase().trim();
        for (const [key, kpis] of Object.entries(sections)) {
            if (groupFilter !== 'all' && key !== groupFilter) continue;
            const filtered = kpis.filter(kpi =>
                (!query || kpi.name.toLowerCase().includes(query)) &&
                (displayTypeFilter === 'all' || getDisplayType(kpi) === displayTypeFilter)
            );
            if (filtered.length > 0) result[key] = filtered;
        }
        return result;
    }, [sections, searchQuery, displayTypeFilter, groupFilter, getDisplayType]);

    const filteredSectionKeys = Object.keys(filteredSections);
    const totalKpis = useMemo(() => Object.values(sections).reduce((a, kpis) => a + kpis.length, 0), [sections]);
    const filteredKpiCount = useMemo(() => Object.values(filteredSections).reduce((a, kpis) => a + kpis.length, 0), [filteredSections]);

    const selectedKpi = useMemo(() => {
        if (!selectedKpiId) return null;
        for (const kpis of Object.values(sections)) {
            const found = kpis.find(k => k.id === selectedKpiId);
            if (found) return found;
        }
        return null;
    }, [selectedKpiId, sections]);

    const getSectionLabel = useCallback((processor: string) => {
        return t(`finance_view:analytics.sections.${processor}`, SECTION_KEYS[processor] || SECTION_KEYS.default);
    }, [t]);

    const toggleSection = (key: string) => setExpandedSections(p => ({ ...p, [key]: !(p[key] ?? true) }));

    if (loading) return (
        <div className="flex h-[600px] bg-white dark:bg-neutral-900 overflow-hidden">
            <div className="flex-1 p-4 space-y-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-neutral-800 rounded animate-pulse" />)}
            </div>
        </div>
    );

    if (errors.general) return (
        <div className="flex items-center justify-center h-[400px] bg-red-50 dark:bg-red-900/20">
            <p className="text-red-500">{errors.general}</p>
        </div>
    );

    const renderSelectedChart = () => {
        if (!selectedKpi) return null;
        const parentData = chartData[selectedKpi.parentKey]?.data || [];
        const layout = selectedKpi.parentPreset.options?.layout as string | undefined;
        if (layout === 'kpiGrid') {
            if (selectedKpi.format === 'percent') {
                return <SpeedometerChart value={selectedKpi.value} title={selectedKpi.name} idealTarget={selectedKpi.idealTarget} higherIsBetter={selectedKpi.higherIsBetter} />;
            }
            if (selectedKpi.analysisKind !== 'snapshot' && selectedKpi.fullRecords?.records && selectedKpi.fullRecords.records.length > 0) {
                const records = selectedKpi.fullRecords.records.map((r: { id: string; data?: { value?: number } }) => ({ name: r.id, value: r.data?.value ?? 0 }));
                if (selectedKpi.chartType === 'donut' || selectedKpi.chartType === 'pie') {
                    return <PieDonutChart data={records} title={selectedKpi.name} isDonut={selectedKpi.chartType === 'donut'} colors={[...CHART_COLORS.soft] as string[]} currency={selectedKpi.currency} isComposition={true} />;
                }
                if (['line', 'area', 'bar'].includes(selectedKpi.chartType)) {
                    return <BarLineAreaChart data={records} title={selectedKpi.name} chartType={selectedKpi.chartType as 'bar' | 'line' | 'area'} colors={[...CHART_COLORS.primary]} currency={selectedKpi.currency} isTemporal={true} />;
                }
                return <div className="p-6"><div className="bg-gray-50 dark:bg-neutral-900/50 rounded-xl p-6"><Sparkline data={records.map((d: any) => d.value)} height={120} showTrend={true} /></div></div>;
            }
            return null;
        }
        const isAllZeros = parentData.length > 0 && parentData.every(d => Number(d.value) === 0);
        if (parentData.length === 0 || isAllZeros) return <div className="py-20 text-center text-gray-500">Sem dados suficientes.</div>;
        const chartType = selectedKpi.chartType;
        if (chartType === 'donut' || chartType === 'pie') {
            return <PieDonutChart data={parentData} title={selectedKpi.name} isDonut={chartType === 'donut'} colors={[...CHART_COLORS.soft] as string[]} currency={selectedKpi.currency} isComposition={true} />;
        }
        return <BarLineAreaChart data={parentData} title={selectedKpi.name} chartType={chartType as 'bar' | 'line' | 'area'} colors={[...CHART_COLORS.primary] as string[]} currency={selectedKpi.currency} isTemporal={selectedKpi.isTemporal} onPeriodChange={(period) => refetchChart(selectedKpi.parentKey, { period })} />;
    };

    return (
        <div className="flex h-full min-h-[500px] overflow-hidden bg-white dark:bg-neutral-900">
            <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200 dark:border-gray-800">
                <div className="flex flex-col bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-neutral-950 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">KPIs</h2>
                            <span className="text-[10px] text-gray-500 bg-gray-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded-sm">{filteredKpiCount}/{totalKpis}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <PeriodSelector value={datePreset} onChange={setDatePreset} />
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredSectionKeys.length === 0 && <div className="py-12 text-center text-gray-400">Nenhum encontrado</div>}
                    {filteredSectionKeys.map(key => {
                        const isExpanded = expandedSections[key] ?? true;
                        return (
                            <div key={key} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                                <button onClick={() => toggleSection(key)} className="w-full flex items-center gap-2 px-4 py-3 text-left bg-gray-100/60 dark:bg-neutral-800/60 hover:bg-gray-200/50 dark:hover:bg-neutral-800/80 transition-colors">
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex-1">{getSectionLabel(key)}</span>
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-neutral-700 font-medium px-2 py-0.5 rounded">{filteredSections[key].length}</span>
                                </button>
                                {isExpanded && (
                                    <div className="pb-1">
                                        {filteredSections[key].map(kpi => {
                                            const isSelected = selectedKpiId === kpi.id;
                                            const trend = getTrend(kpi.value, kpi.previousValue, kpi.higherIsBetter);
                                            return (
                                                <button key={kpi.id} onClick={() => setSelectedKpiId(isSelected ? null : kpi.id)} className={`w-full flex items-center gap-2 px-4 py-1.5 text-left group ${isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-600 dark:bg-indigo-900/20' : 'hover:bg-gray-50 dark:hover:bg-neutral-800/50 border-l-2 border-l-transparent'}`}>
                                                    <DisplayModeIcon mode={kpi.displayMode} chartType={kpi.chartType} format={kpi.format} />
                                                    <span className={`flex-1 text-xs truncate ${isSelected ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>{kpi.name}</span>
                                                    <div className="flex flex-col items-end min-w-[60px]">
                                                        <span className={`text-xs font-mono ${isSelected ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{formatKpiDisplayValue(kpi.value, kpi.format, kpi.currency, formatCurrencyFn)}</span>
                                                        {trend && <span className={`text-[10px] font-medium tracking-tight ${trend.isGood ? 'text-emerald-500' : 'text-rose-500'}`}>{trend.formatted}</span>}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <ResizableSidebar minWidth={400} maxWidth={800} defaultWidth={500} position="right">
                <div className="flex flex-col h-full bg-white dark:bg-neutral-950">
                    <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-neutral-800">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedKpi ? selectedKpi.name : 'Selecione um KPI'}</h2>
                        {selectedKpi && <button onClick={() => setSelectedKpiId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">✕</button>}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {selectedKpi ? (
                            <div className="p-5 space-y-6">
                                <KpiValueHeader value={selectedKpi.value} previousValue={selectedKpi.previousValue} format={selectedKpi.format} currency={selectedKpi.currency} displayMode={selectedKpi.displayMode} higherIsBetter={selectedKpi.higherIsBetter} name={selectedKpi.name} datePreset={datePreset} />
                                {(() => { const chart = renderSelectedChart(); return chart ? <div className="mt-2">{chart}</div> : null; })()}
                                <KpiInfoFooter datePreset={datePreset} chartType={selectedKpi.chartType} format={selectedKpi.format} isTemporal={Boolean(selectedKpi.isTemporal)} analysisKind={selectedKpi.analysisKind} description={selectedKpi.description} />
                                {selectedKpi.recordIds && selectedKpi.recordIds.length > 0 && selectedKpi.tableSource && (
                                    <div className="mt-6 flex justify-center">
                                        <button onClick={() => setIsDrillDownOpen(true)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                                            Visualizar Registros Brutos ({selectedKpi.recordIds.length})
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center p-8 h-full text-center text-gray-500">Clique em um indicador à esquerda.</div>
                        )}
                    </div>
                </div>
            </ResizableSidebar>

            {selectedKpi && selectedKpi.recordIds && selectedKpi.tableSource && (
                <KpiDrillDownDrawer isOpen={isDrillDownOpen} onClose={() => setIsDrillDownOpen(false)} tableId={selectedKpi.tableSource} recordIds={selectedKpi.recordIds} kpiName={selectedKpi.name} />
            )}
        </div>
    );
}
