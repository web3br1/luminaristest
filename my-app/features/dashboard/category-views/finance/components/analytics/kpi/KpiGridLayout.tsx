'use client';

import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import type { KpiGridLayoutProps, MetricFormat, MetricDisplayMode, ChartDataPoint } from '@/features/dashboard/category-views/finance/types/analytics.types';
import {
  getKpiGroups,
  filterKpisByGroup,
  getKpiVisualMeta,
  formatKpiValue,
  isExpandableKpi,
} from '@/features/dashboard/category-views/finance/utils/kpiHelpers';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';

import KpiTooltip from './KpiTooltip';

// =============================================================================
// CONSTANTS
// =============================================================================

const DONUT_COLORS = {
  value: '#10b981', // lumi-success (was #22c55e green-500, aligned to lumi-success emerald-500)
  rest: 'rgba(31, 41, 55, 0.25)', // lumi-text at 25% opacity
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface MiniDonutProps {
  value: number;
  expanded: boolean;
}

function MiniDonut({ value, expanded }: MiniDonutProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const restValue = 100 - clampedValue;

  return (
    <PieChart width={expanded ? 72 : 40} height={expanded ? 72 : 40}>
      <Pie
        data={[
          { name: 'value', value: clampedValue },
          { name: 'rest', value: restValue },
        ]}
        innerRadius={14}
        outerRadius={expanded ? 32 : 18}
        paddingAngle={0}
        dataKey="value"
        stroke="none"
      >
        <Cell fill={DONUT_COLORS.value} />
        <Cell fill={DONUT_COLORS.rest} />
      </Pie>
    </PieChart>
  );
}

interface MagnitudeBarProps {
  value: number;
  maxValue: number;
  expanded: boolean;
}

function MagnitudeBar({ value, maxValue, expanded }: MagnitudeBarProps) {
  const widthPct = maxValue > 0 ? Math.max(8, (Math.abs(value) / maxValue) * 100) : 0;
  const isNegative = value < 0;

  return (
    <div
      className={`mt-2 w-full rounded-full bg-gray-200/60 dark:bg-neutral-800/60 overflow-hidden ${expanded ? 'h-2.5' : 'h-2'
        }`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${isNegative
          ? 'bg-gradient-to-r from-red-500 to-orange-500'
          : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500'
          }`}
        style={{ width: `${widthPct}%` }}
        aria-label={`Magnitude relativa: ${widthPct.toFixed(0)}%`}
      />
    </div>
  );
}

interface TrendIndicatorProps {
  trend: 'up' | 'down' | 'flat' | null;
}

function TrendIndicator({ trend }: TrendIndicatorProps) {
  if (!trend) return null;

  const icons = {
    up: '▲',
    down: '▼',
    flat: '▬',
  };

  return (
    <span className="text-[10px]" aria-label={`Tendência: ${trend}`}>
      {icons[trend]}
    </span>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * KpiGridLayout - Renders KPIs in a responsive grid with filtering
 */
export default function KpiGridLayout({ chart, data, useCurrency, highlightMetric }: KpiGridLayoutProps) {
  const formatCurrency = useFormatCurrency();
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);
  const [tooltipKpi, setTooltipKpi] = useState<string | null>(null);

  // Extract metadata from chart options
  const { metricFormats, metricDisplay, metricHybrid, metricAnalysis } = useMemo(() => {
    const opts = chart.options || {};
    return {
      metricFormats: (opts.metricFormats || {}) as Record<string, MetricFormat>,
      metricDisplay: (opts.metricDisplay || {}) as Record<string, MetricDisplayMode>,
      metricHybrid: (opts.metricHybrid || {}) as Record<string, boolean>,
      metricAnalysis: (opts.metricAnalysis || {}) as Record<string, string>,
    };
  }, [chart.options]);

  // Get available groups based on processor
  const groups = useMemo(() => getKpiGroups(chart.processor), [chart.processor]);

  // Filter data by selected group
  const filteredData = useMemo(
    () => filterKpisByGroup(activeFilter, data, metricAnalysis),
    [activeFilter, data, metricAnalysis]
  );

  // Ensure all KPIs appear in the grid
  const visibleKpis = useMemo(
    () => filteredData,
    [filteredData]
  );

  // Calculate max value for magnitude bars
  const maxAbsValue = useMemo(() => {
    const values = visibleKpis.map((k) => Math.abs(k.value || 0));
    return values.length > 0 ? Math.max(...values) : 0;
  }, [visibleKpis]);

  // Toggle expansion for hybrid KPIs
  const handleKpiClick = (kpi: ChartDataPoint) => {
    const displayMode = metricDisplay[kpi.name] || 'card';
    const expandable = isExpandableKpi(kpi.name, displayMode, metricHybrid);

    // Toggle tooltip
    if (tooltipKpi === kpi.name) {
      setTooltipKpi(null);
    } else {
      setTooltipKpi(kpi.name);
    }

    // Toggle expansion for hybrid KPIs
    if (expandable) {
      setExpandedKpi(expandedKpi === kpi.name ? null : kpi.name);
    }
  };

  // Hide tooltip on mouse leave
  const handleKpiMouseLeave = () => {
    setTooltipKpi(null);
  };

  return (
    <div className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-neutral-900 p-5 shadow-sm">
      {/* Header with title and filter */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {chart.title}
        </h3>
        {groups.length > 1 && (
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            aria-label="Filtrar KPIs por grupo"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleKpis.map((kpi) => {
          const format = metricFormats[kpi.name] || 'number';
          const displayMode = (metricDisplay[kpi.name] || 'card') as MetricDisplayMode;
          const isExpanded = expandedKpi === kpi.name;
          const expandable = isExpandableKpi(kpi.name, displayMode, metricHybrid);

          const displayValue = formatKpiValue(kpi.value, format, useCurrency, formatCurrency);

          const { trend, colorClass, cardClass } = getKpiVisualMeta(
            kpi.name,
            kpi.value,
            format,
            displayMode
          );

          const isHighlighted = highlightMetric === kpi.name;

          return (
            <div
              key={kpi.name}
              className={`relative overflow-hidden ${cardClass} cursor-pointer hover:border-blue-400/60 dark:hover:border-blue-500/50 hover:shadow-md transition-all duration-200
                ${isExpanded ? 'ring-2 ring-blue-400/50 dark:ring-blue-500/40 shadow-lg' : ''}
                ${isHighlighted ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-500 dark:border-indigo-400 scale-[1.02] z-10' : ''}`}
              onClick={() => handleKpiClick(kpi)}
              onMouseLeave={handleKpiMouseLeave}
              role="button"
              tabIndex={0}
              aria-label={`${kpi.name}: ${displayValue}`}
              aria-expanded={expandable ? isExpanded : undefined}
            >
              {/* KPI Name */}
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 leading-tight mb-1.5 block">
                {kpi.name}
              </span>

              {/* Value with trend indicator */}
              <div className="flex items-baseline gap-1.5 mb-2 overflow-hidden">
                <span className={`text-lg font-bold ${colorClass} tracking-tight truncate max-w-full`} title={displayValue}>
                  {displayValue}
                </span>
                <TrendIndicator trend={trend} />
              </div>

              {/* Mini donut for percentage KPIs */}
              {displayMode !== 'card' && format === 'percent' && (
                <div className={`mt-2 flex items-center ${isExpanded ? 'justify-center' : ''}`}>
                  <MiniDonut value={kpi.value} expanded={isExpanded} />
                </div>
              )}

              {/* Magnitude bar */}
              {maxAbsValue > 0 && (
                <MagnitudeBar
                  value={kpi.value}
                  maxValue={maxAbsValue}
                  expanded={isExpanded}
                />
              )}

              {/* Tooltip */}
              <KpiTooltip
                kpiName={kpi.name}
                isVisible={tooltipKpi === kpi.name}
              />
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {visibleKpis.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p>Nenhum KPI encontrado para este filtro.</p>
        </div>
      )}
    </div>
  );
}

