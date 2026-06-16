'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import DashboardKpiCard from '../../../dashboard/category-views/finance/components/analytics/dashboard/DashboardKpiCard';
import ChartRenderer from '../../../dashboard/category-views/finance/components/analytics/charts/ChartRenderer';
import type {
  ChartPreset,
  ChartData,
  ChartType,
} from '../../../dashboard/category-views/finance/types/analytics.types';
import { useCrmAnalytics } from '../../hooks/useCrmAnalytics';
import type { ChartDataPoint, CrmDatePreset } from '../../../../lib/services/crm.service';

/** Luminaris analytics palette (shared with the rest of the dashboard charts). */
const PALETTE = ['#3b82f6', '#14b8a6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#ef4444', '#6366f1'];

const PERIODS: { key: CrmDatePreset; labelKey: string; fallback: string }[] = [
  { key: 'thisMonth', labelKey: 'analytics.period.this_month', fallback: 'This month' },
  { key: 'lastMonth', labelKey: 'analytics.period.last_month', fallback: 'Last month' },
  { key: 'thisYear', labelKey: 'analytics.period.this_year', fallback: 'This year' },
];

/** Currency cards (BRL). */
const CURRENCY_CARDS = new Set(['pipelineValue', 'forecast', 'avgTicket']);
/** Percent cards. */
const PERCENT_CARDS = new Set(['winRate']);
/** Day-count cards. */
const DAYS_CARDS = new Set(['avgCycleDays']);

interface KpiSpec {
  name: string;
  titleKey: string;
  fallback: string;
}

/** The 8 KPI cards surfaced by the bundle (`bundle.cards` is keyed by `name`). */
const KPI_SPECS: KpiSpec[] = [
  { name: 'totalLeads', titleKey: 'analytics.cards.total_leads', fallback: 'Total Leads' },
  { name: 'newLeads', titleKey: 'analytics.cards.new_leads', fallback: 'New Leads' },
  { name: 'wonLeads', titleKey: 'analytics.cards.won_leads', fallback: 'Won' },
  { name: 'winRate', titleKey: 'analytics.cards.win_rate', fallback: 'Win Rate' },
  { name: 'pipelineValue', titleKey: 'analytics.cards.pipeline_value', fallback: 'Pipeline Value' },
  { name: 'forecast', titleKey: 'analytics.cards.forecast', fallback: 'Weighted Forecast' },
  { name: 'avgTicket', titleKey: 'analytics.cards.avg_ticket', fallback: 'Average Ticket' },
  { name: 'avgCycleDays', titleKey: 'analytics.cards.avg_cycle', fallback: 'Average Cycle' },
];

interface KpiCardModel {
  key: string;
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'flat';
  isCurrency: boolean;
}

const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

/** Adapter: a single bundle card (ChartDataPoint) → DashboardKpiCard props. */
function toKpiModel(spec: KpiSpec, card: ChartDataPoint | undefined, title: string): KpiCardModel {
  const isCurrency = CURRENCY_CARDS.has(spec.name);
  const value = card?.value ?? 0;

  let display: string;
  if (isCurrency) display = brl(value);
  else if (PERCENT_CARDS.has(spec.name)) display = `${value}%`;
  else if (DAYS_CARDS.has(spec.name)) display = `${value}d`;
  else display = value.toLocaleString('pt-BR');

  // change/trend from previousValue — empty-safe (guard prev===0, null, undefined).
  const prev = card?.previousValue;
  let change = '';
  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (prev != null && prev !== 0) {
    const pct = ((value - prev) / Math.abs(prev)) * 100;
    trend = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const sign = pct > 0 ? '+' : '';
    change = `${sign}${pct.toFixed(2)}%`;
  }

  return { key: spec.name, title, value: display, change, trend, isCurrency };
}

interface ChartSpec {
  key: string;
  series: ChartDataPoint[];
  type: ChartType;
  titleKey: string;
  fallback: string;
}

/** Adapter: a bundle series → synthesized { chart, data } for ChartRenderer (Path A). */
function toChartInputs(spec: ChartSpec, title: string): { chart: ChartPreset; data: ChartData } {
  const chart: ChartPreset = {
    key: spec.key,
    title,
    type: spec.type,
    processor: 'crm',
    options: {
      isTemporal: false,
      colors: PALETTE,
    },
  };
  // ChartRenderer reads `data.data` (ChartDataPoint[]); bundle points are already {name,value}.
  return { chart, data: { chart, data: spec.series } };
}

export function CrmAnalyticsDashboard() {
  const { t } = useTranslation('crm');
  const { datePreset, setDatePreset, data, loading, error } = useCrmAnalytics();

  const cardMap = useMemo(
    () => new Map(data.cards.map((c) => [c.name, c])),
    [data.cards],
  );

  const kpiModels = useMemo(
    () =>
      KPI_SPECS.map((spec) =>
        toKpiModel(spec, cardMap.get(spec.name), t(spec.titleKey, spec.fallback)),
      ),
    [cardMap, t],
  );

  const chartSpecs = useMemo<ChartSpec[]>(
    () => [
      { key: 'funnel', series: data.funnel, type: 'bar', titleKey: 'analytics.charts.funnel', fallback: 'Conversion funnel' },
      { key: 'source', series: data.source, type: 'donut', titleKey: 'analytics.charts.source', fallback: 'Source attribution' },
      { key: 'status', series: data.status, type: 'donut', titleKey: 'analytics.charts.status', fallback: 'Leads by status' },
      // BANT values are percentages (% of strong leads). The canonical bar leaf has no
      // percent axis, so we convey it in the panel title rather than a (dropped) metricLabel.
      { key: 'bant', series: data.bant, type: 'bar', titleKey: 'analytics.charts.bant', fallback: 'BANT strength (%)' },
      { key: 'proposals', series: data.proposals, type: 'bar', titleKey: 'analytics.charts.proposals', fallback: 'Proposals by status' },
      { key: 'activities', series: data.activities, type: 'bar', titleKey: 'analytics.charts.activities', fallback: 'Activities by type' },
    ],
    [data, t],
  );

  const chartInputs = useMemo(
    () => chartSpecs.map((spec) => ({ id: spec.key, ...toChartInputs(spec, t(spec.titleKey, spec.fallback)) })),
    [chartSpecs, t],
  );

  return (
    <div className="space-y-6">
      {/* Date-preset selector */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setDatePreset(p.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
              datePreset === p.key
                ? 'bg-blue-600 text-white'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800'
            }`}
          >
            {t(p.labelKey, p.fallback)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              {t('common.loading', 'Loading…')}
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* KPI grid — mirrors AnalyticsDashboard layout */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiModels.map((m) => (
              <DashboardKpiCard
                key={m.key}
                title={m.title}
                value={m.value}
                change={m.change}
                trend={m.trend}
                details={[]}
                isCurrency={m.isCurrency}
                showGraph={false}
              />
            ))}
          </div>

          {/* Chart grid — canonical ChartRenderer per panel */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {chartInputs.map((c) => (
              <ChartRenderer key={c.id} chart={c.chart} data={c.data} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
