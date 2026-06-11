/**
 * BarLineAreaChart Component
 *
 * Renders bar, line, or area charts using Recharts.
 * Extracted from ChartRenderer for better code organization.
 */

import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import type { ChartDataPoint } from '@/features/dashboard/category-views/finance/types/analytics.types';
import { useTheme } from '@/lib/hooks/useTheme';
import { getTooltipStyles, CHART_COLORS, CHART_MARGINS } from '@/features/dashboard/category-views/finance/utils/chartConstants';
import { formatCompactNumber } from '@/features/dashboard/category-views/finance/utils/kpiHelpers';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';


export interface BarLineAreaChartProps {
  data: ChartDataPoint[];
  title: string;
  chartType: 'bar' | 'line' | 'area';
  colors: string[];
  currency?: string;
  isTemporal?: boolean;
  currentPeriod?: string;
  onPeriodChange?: (period: string) => void;
}




/**
 * BarLineAreaChart - Renders bar, line, or area charts
 */
export default function BarLineAreaChart({
  data,
  title,
  chartType,
  colors,
  currency,
  isTemporal,
  currentPeriod = 'month',
  onPeriodChange,
}: BarLineAreaChartProps) {
  const { theme } = useTheme();
  const formatCurrency = useFormatCurrency();

  /**
   * Format value for tooltip/axis
   */
  const formatValue = (value: number, useCurrency?: string, compact = false): string => {
    if (useCurrency) {
      if (compact && Math.abs(value) >= 1000) {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: useCurrency,
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value);
      }
      return formatCurrency(value);
    }
    if (compact && Math.abs(value) >= 1000) {
      return formatCompactNumber(value);
    }
    return value.toLocaleString('pt-BR');
  };

  const isDark = theme === 'dark';
  const tooltipStyles = getTooltipStyles(isDark);
  const [periodOverride, setPeriodOverride] = useState<string | null>(null);
  const activePeriod = periodOverride || currentPeriod;

  const handlePeriodChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setPeriodOverride(value);
    if (onPeriodChange) {
      await onPeriodChange(value);
    }
  };

  // Handle evolution charts with 0 or 1 data points
  const hasEnoughData = data.length > 1;
  const isEvolutionChart = chartType === 'line' || chartType === 'area';



  const renderChart = (): React.ReactElement => {
    // For evolution charts with insufficient data, show alternative visualization
    if (isEvolutionChart && !hasEnoughData) {
      if (data.length === 0) {
        // Return empty div as fallback (should not happen as NoDataCard handles this)
        return (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
            Sem dados
          </div>
        );
      }

      // Single value: show as a large number card instead of a line
      const singleValue = data[0];
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {formatValue(singleValue.value, currency)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {singleValue.name}
            </div>
            <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              Dados insuficientes para exibir evolução
            </div>
          </div>
        </div>
      );
    }

    const commonProps = {
      data,
      margin: CHART_MARGINS,
    };

    const axisProps = {
      stroke: '#9ca3af',
      fontSize: 11,
    };

    const tooltipProps = {
      formatter: (value: number) => formatValue(value, currency),
      contentStyle: tooltipStyles,
      itemStyle: {
        color: isDark ? '#111827' : '#f3f4f6',
        padding: '2px 0',
      },
      labelStyle: {
        color: isDark ? '#111827' : '#f3f4f6',
        fontWeight: 600,
        marginBottom: '4px',
      },
    };

    if (chartType === 'area') {
      return (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.gradient.start} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_COLORS.gradient.end} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" {...axisProps} tickMargin={8} />
          <YAxis {...axisProps} tickFormatter={(v) => formatValue(v, currency, true)} />
          <Tooltip {...tooltipProps} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS.gradient.start}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
          />
        </AreaChart>
      );
    }

    if (chartType === 'line') {
      return (
        <LineChart {...commonProps}>
          <XAxis dataKey="name" {...axisProps} tickMargin={8} />
          <YAxis {...axisProps} tickFormatter={(v) => formatValue(v, currency, true)} />
          <Tooltip {...tooltipProps} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={colors[0] || '#3b82f6'}
            strokeWidth={2}
            dot={{
              r: 3,
              strokeWidth: 1,
              stroke: '#111827',
            }}
            activeDot={{ r: 5, style: { cursor: 'pointer' } }}
            style={{ cursor: 'pointer' }}
          />
        </LineChart>
      );
    }

    // Calculate Y axis domain to properly handle negative values
    const allValues = data.map(d => d.value);
    const minValueInData = Math.min(...allValues);
    const maxValueInData = Math.max(...allValues);
    
    // For revenue charts, we usually want to start at 0 if no negative values exist
    const domainMin = minValueInData >= 0 ? 0 : minValueInData * 1.1;
    const domainMax = maxValueInData * 1.1 || 1;
    const yDomain: [number, number] = [domainMin, domainMax];

    // Dynamic fill color based on value sign
    const getBarFill = (entry: ChartDataPoint) => {
      if (entry.value < 0) return CHART_COLORS.negative;
      return colors[0] || CHART_COLORS.primary[0];
    };

    // Default: bar chart (vertical bars)
    return (
      <BarChart {...commonProps}>
        <XAxis dataKey="name" {...axisProps} tickMargin={8} />
        <YAxis
          {...axisProps}
          tickFormatter={(v) => formatValue(v, currency, true)}
          domain={yDomain}
        />
        <Tooltip {...tooltipProps} />
        <Bar
          dataKey="value"
          maxBarSize={40}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getBarFill(entry)}
            />
          ))}
        </Bar>
      </BarChart>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-neutral-900 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {isTemporal && onPeriodChange && (
          <select
            value={activePeriod}
            onChange={handlePeriodChange}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-900 px-2 py-0.5 text-[11px] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Selecionar período do gráfico"
          >
            <option value="day">Dia</option>
            <option value="week">Semana</option>
            <option value="month">Mês</option>
            <option value="quarter">Trimestre</option>
            <option value="year">Ano</option>
          </select>
        )}
      </div>
      <div className="relative h-64">
        {hasEnoughData || !isEvolutionChart ? (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full">{renderChart()}</div>
        )}

        {/* Clarification for single-column ranking charts (ERP Standard) */}
        {chartType === 'bar' && data.length === 1 && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <span className="text-[9px] text-gray-400 dark:text-gray-500 bg-gray-50/80 dark:bg-neutral-800/80 px-2 py-1 rounded shadow-sm border border-gray-100 dark:border-gray-700 backdrop-blur-sm">
              Único registro no período selecionado
            </span>
          </div>
        )}
      </div>
    </div>
  );
}





