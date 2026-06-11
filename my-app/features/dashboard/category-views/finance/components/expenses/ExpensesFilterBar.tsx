'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { MdSearch, MdCalendarToday, MdCategory } from 'react-icons/md';
import { FilterBar } from '@/features/dashboard/category-views/shared/components/FilterBar';
import { FilterGroup } from '@/features/dashboard/category-views/shared/components/FilterGroup';

import type { PeriodFilter, DynamicRecord } from '@/features/dashboard/category-views/finance/types/common.types';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';
import type { SortOption } from '@/features/dashboard/category-views/shared/SortSelect';
import { SortSelect } from '@/features/dashboard/category-views/shared/SortSelect';

interface ExpensesFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    periodFilter: PeriodFilter;
    setPeriodFilter: (p: PeriodFilter) => void;
    categoryFilter: string;
    setCategoryFilter: (c: string) => void;
    periodLabels: Record<string, string>;
    categoryOptions: string[];
    totalRecords: number;
    totalAmount: number;
    sortConfig: SortOption | null;
    setSortConfig: (s: SortOption | null) => void;
    /** Records passed to SortSelect for field auto-detection */
    records: DynamicRecord[];
}

export function ExpensesFilterBar({
    isOpen = true,
    query,
    setQuery,
    periodFilter,
    setPeriodFilter,
    categoryFilter,
    setCategoryFilter,
    periodLabels,
    categoryOptions,
    totalRecords,
    totalAmount,
    sortConfig,
    setSortConfig,
    records,
}: ExpensesFilterBarProps) {
    const { t } = useTranslation(['finance_view', 'common']);
    const formatCurrency = useFormatCurrency();

    return (
        <FilterBar isOpen={isOpen}>
            {/* Search */}
            <FilterGroup
                label={t('common:search', 'Buscar')}
                icon={<MdSearch size={14} />}
                className="flex-[1.5]"
            >
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('finance_view:expenses.filters.search_placeholder', 'Descrição, valor...')}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 text-gray-700 dark:text-white placeholder:text-gray-400/50 transition-all shadow-sm"
                />
            </FilterGroup>

            {/* Sort */}
            <SortSelect
                value={sortConfig}
                onChange={setSortConfig}
                records={records}
                variant="horizontal"
            />

            {/* Period Filter */}
            <FilterGroup
                label={t('finance_view:expenses.filters.period', 'Período')}
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

            {/* Category Filter */}
            {categoryOptions.length > 0 && (
                <FilterGroup
                    label={t('finance_view:expenses.filters.category', 'Categoria')}
                    icon={<MdCategory size={14} />}
                >
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl appearance-none bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="all">{t('common:all', 'Todas')}</option>
                        {categoryOptions.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </FilterGroup>
            )}

            {/* Stats */}
            <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex items-center gap-6">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">
                        {t('common:total', 'Total')}
                    </span>
                    <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">
                        {totalRecords}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-widest leading-none">
                        {t('finance_view:expenses.filters.stats_total', 'Total R$')}
                    </span>
                    <span className="text-lg font-black text-red-600 dark:text-red-400 leading-none mt-1 whitespace-nowrap tabular-nums">
                        {formatCurrency(totalAmount)}
                    </span>
                </div>
            </div>
        </FilterBar>
    );
}
