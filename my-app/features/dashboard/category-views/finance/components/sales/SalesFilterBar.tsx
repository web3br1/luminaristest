'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { MdSearch, MdCalendarToday, MdOutlineFilterList } from 'react-icons/md';
import { FilterBar } from '@/features/dashboard/category-views/shared/components/FilterBar';
import { FilterGroup } from '@/features/dashboard/category-views/shared/components/FilterGroup';
import type { PeriodFilter } from '../../types/common.types';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';

interface SalesFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    statusFilter: string;
    setStatusFilter: (s: string) => void;
    periodFilter: PeriodFilter;
    setPeriodFilter: (p: PeriodFilter) => void;
    periodLabels: Record<string, string>;
    totalRecords: number;
    totalAmount: number;
}

export function SalesFilterBar({
    isOpen = true,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    periodFilter,
    setPeriodFilter,
    periodLabels,
    totalRecords,
    totalAmount
}: SalesFilterBarProps) {
    const { t } = useTranslation(['finance_view', 'common']);
    const formatCurrency = useFormatCurrency();

    return (
        <FilterBar isOpen={isOpen}>
            <div className="flex flex-col xl:flex-row xl:items-center gap-6 w-full">
                {/* Search */}
                <FilterGroup
                    label={t('finance_view:sales.filters.search_label', 'Buscar')}
                    icon={<MdSearch size={14} />}
                    className="flex-1 min-w-[200px]"
                >
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('finance_view:sales.filters.search_placeholder', 'Cliente, ID, status...')}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 dark:text-white transition-all shadow-sm"
                    />
                </FilterGroup>

                {/* Status Filter */}
                <FilterGroup
                    label={t('finance_view:sales.filters.status', 'Status')}
                    icon={<MdOutlineFilterList size={14} />}
                >
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full min-w-[140px] px-3 py-2 text-xs font-bold rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="all">{t('common:status.all', 'Todos')}</option>
                        <option value="Draft">{t('finance_view:status.draft', 'Rascunho')}</option>
                        <option value="Finalized">{t('finance_view:status.finalized', 'Finalizada')}</option>
                        <option value="Cancelled">{t('finance_view:status.cancelled', 'Cancelada')}</option>
                    </select>
                </FilterGroup>

                {/* Period Filter */}
                <FilterGroup
                    label={t('finance_view:sales.filters.period', 'Período')}
                    icon={<MdCalendarToday size={14} />}
                >
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        {Object.entries(periodLabels).map(([period, label]) => {
                            const isActive = periodFilter === period;
                            return (
                                <button
                                    key={period}
                                    type="button"
                                    onClick={() => setPeriodFilter(period as PeriodFilter)}
                                    className={`
                                        whitespace-nowrap px-3 py-2 text-[10px] font-bold rounded-xl transition-all border
                                        ${isActive
                                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800'
                                        }
                                    `}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </FilterGroup>

                {/* Stats */}
                <div className="xl:ml-auto flex items-center gap-6 pl-6 border-l border-gray-100 dark:border-neutral-800 shrink-0">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">
                            {t('finance_view:sales.filters.stats_records', 'Vendas')}
                        </span>
                        <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">
                            {totalRecords}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">
                            {t('finance_view:sales.filters.stats_total', 'Total Pago')}
                        </span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1 whitespace-nowrap tabular-nums">
                            {formatCurrency(totalAmount)}
                        </span>
                    </div>
                </div>
            </div>
        </FilterBar>
    );
}
