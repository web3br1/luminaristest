/**
 * ChartRenderer Component
 *
 * Main orchestrator for rendering different chart types.
 * Delegates to specialized chart components (PieDonutChart, BarLineAreaChart).
 */

'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { ChartRendererProps, ChartDataPoint } from '@/features/dashboard/category-views/finance/types/analytics.types';
import NoDataCard from '../../common/NoDataCard';
import KpiGridLayout from '../kpi/KpiGridLayout';
import PieDonutChart from './PieDonutChart';
import BarLineAreaChart from './BarLineAreaChart';
import { CHART_COLORS } from '@/features/dashboard/category-views/finance/utils/chartConstants';


/**
 * Apply temporal filter to limit data points based on time range
 */
function applyTemporalFilter(
  data: ChartDataPoint[],
  isTemporal: boolean,
  period: string,
  timeRange: 'auto' | '3m' | '6m' | '12m'
): ChartDataPoint[] {
  if (!isTemporal || timeRange === 'auto') return data;

  // Don't filter daily/weekly/quarterly - they have their own limits
  if (period === 'day' || period === 'week' || period === 'quarter') {
    return data;
  }

  const limit = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
  if (data.length <= limit) return data;

  return data.slice(-limit);
}

/**
 * ChartRenderer - Renders different chart types with proper styling and empty states
 */
export default function ChartRenderer({
  chart,
  data,
  timeRange = 'auto',
  onPeriodChange,
  highlightMetric,
}: ChartRendererProps) {
  const { t } = useTranslation(['analytics']);

  // 1. Extract and sanitize properties
  const options = chart.options || {};
  const isTemporal = Boolean(options.isTemporal);
  const period = (chart.params?.period as string) || 'month';
  const currency = options.currency as string | undefined;
  const layout = options.layout as string | undefined;
  const metricLabel = options.metricLabel as string | undefined;
  const colors = (options.colors as string[]) || CHART_COLORS.primary;
  const analysisKind = options.analysisKind as string | undefined;

  // 2. Memoize configuration objects to avoid unnecessary re-renders
  const labelMap = useMemo(() =>
    (options.labelMap || chart.params?.labelMap || {}) as Record<string, string>,
    [options.labelMap, chart.params?.labelMap]
  );

  // 3. Process Data (Always call hooks before early returns)
  const chartData = useMemo(() => {
    let filtered = data.data || [];
    filtered = applyTemporalFilter(filtered, isTemporal, period, timeRange);

    // Apply labelMap to transform boolean/raw values to readable labels
    if (Object.keys(labelMap).length > 0) {
      filtered = filtered.map((point) => ({
        ...point,
        name: labelMap[point.name] || labelMap[String(point.name)] || point.name,
      }));

      // For composition/comparison charts, ensure all expected groups appear (even with 0 value)
      const isCompositionChart = chart.type === 'donut' || chart.type === 'pie';
      const shouldEnsureAllGroups =
        analysisKind === 'composition' ||
        analysisKind === 'comparison' ||
        (isCompositionChart && Object.keys(labelMap).length > 0);

      if (shouldEnsureAllGroups) {
        const expectedNames = new Set(Object.values(labelMap));
        const existingNames = new Set(filtered.map((p) => p.name));
        const missingNames = Array.from(expectedNames).filter((name) => !existingNames.has(name));

        // Add missing groups with 0 value
        for (const missingName of missingNames) {
          filtered.push({ name: missingName, value: 0 });
        }
      }
    }

    return filtered;
  }, [data.data, isTemporal, period, timeRange, labelMap, analysisKind, chart.type]);

  // Calculate total for empty state check
  const totalValue = useMemo(
    () => chartData.reduce((sum, item) => sum + (typeof item.value === 'number' ? item.value : 0), 0),
    [chartData]
  );

  // Show NoDataCard if no data or all values are zero
  // Exception: composition/comparison charts may have zero values intentionally
  const isCompositionOrComparison = useMemo(
    () =>
      analysisKind === 'composition' ||
      analysisKind === 'comparison' ||
      ((chart.type === 'donut' || chart.type === 'pie') && Object.keys(labelMap).length > 0),
    [analysisKind, chart.type, labelMap]
  );

  // 4. Early returns for error and empty states
  if (data.error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {t(`analytics:kpi.titles.${chart.title}`, chart.title)}
        </h3>
        <p className="text-sm text-red-600 dark:text-red-400">{data.error}</p>
      </div>
    );
  }

  if (chartData.length === 0 || (!isCompositionOrComparison && totalValue === 0)) {
    return <NoDataCard chart={chart} />;
  }

  // Special layout: KPI Grid
  if (layout === 'kpiGrid') {
    return <KpiGridLayout chart={chart} data={chartData} useCurrency={currency} highlightMetric={highlightMetric} />;
  }

  // Handle period change
  const handlePeriodChange = onPeriodChange
    ? (newPeriod: string) => onPeriodChange(chart.key, newPeriod)
    : undefined;

  // Determine if chart is composition
  const isComposition =
    analysisKind === 'composition' ||
    analysisKind === 'comparison' ||
    (Object.keys(labelMap).length > 0 && (chart.type === 'donut' || chart.type === 'pie'));

  // Render based on chart type
  switch (chart.type) {
    case 'pie':
    case 'donut':
      return (
        <PieDonutChart
          data={chartData}
          title={t(`analytics:kpi.titles.${chart.title}`, chart.title)}
          isDonut={chart.type === 'donut'}
          colors={chart.type === 'donut' ? [...CHART_COLORS.soft] : colors}
          currency={currency}
          metricLabel={metricLabel}
          labelMap={labelMap}
          isComposition={isComposition}
        />
      );

    case 'area':
      return (
        <BarLineAreaChart
          data={chartData}
          title={t(`analytics:kpi.titles.${chart.title}`, chart.title)}
          chartType="area"
          colors={colors}
          currency={currency}
          isTemporal={isTemporal}
          currentPeriod={period}
          onPeriodChange={handlePeriodChange}
        />
      );

    case 'line':
      return (
        <BarLineAreaChart
          data={chartData}
          title={t(`analytics:kpi.titles.${chart.title}`, chart.title)}
          chartType="line"
          colors={colors}
          currency={currency}
          isTemporal={isTemporal}
          currentPeriod={period}
          onPeriodChange={handlePeriodChange}
        />
      );

    case 'bar':
    default:
      return (
        <BarLineAreaChart
          data={chartData}
          title={t(`analytics:kpi.titles.${chart.title}`, chart.title)}
          chartType="bar"
          colors={colors}
          currency={currency}
          isTemporal={isTemporal}
          currentPeriod={period}
          onPeriodChange={handlePeriodChange}
        />
      );
  }
}

