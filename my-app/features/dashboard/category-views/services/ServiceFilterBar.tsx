'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { MdSearch, MdCategory, MdCheckCircle, MdBlock, MdDashboard } from 'react-icons/md';
import { FilterBar } from '../shared/components/FilterBar';
import { FilterGroup } from '../shared/components/FilterGroup';
import type { SortOption } from '../shared/SortSelect';
import { SortSelect } from '../shared/SortSelect';
import { getSchemaAllowedSortFields } from '../shared/utils/sortUtils';
import { isTableSchema } from '../../components/shared/dynamic-tables.client';

interface ServiceFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    categoryFilter: string;
    setCategoryFilter: (c: string) => void;
    statusFilter: string;
    setStatusFilter: (s: string) => void;
    categories: string[];
    totalServices: number;
    activeServices: number;
    sortConfig: SortOption | null;
    setSortConfig: (sort: SortOption | null) => void;
    services: Array<{ id: string; data?: object | null }>;
    schema?: unknown;
}

export function ServiceFilterBar({
    isOpen = true,
    query,
    setQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    categories,
    totalServices,
    activeServices,
    sortConfig,
    setSortConfig,
    services,
    schema
}: ServiceFilterBarProps) {
    const { t } = useTranslation(['common', 'database']);

    const allowedFields = useMemo(() => getSchemaAllowedSortFields(schema), [schema]);

    const fieldLabels = useMemo<Record<string, string>>(() => {
        if (!isTableSchema(schema)) return {};
        return Object.fromEntries(schema.fields.map(f => [f.name, f.label || f.name]));
    }, [schema]);

    return (
        <FilterBar isOpen={isOpen}>
            {/* Search */}
            <FilterGroup
                label={t('common:search', 'Search')}
                icon={<MdSearch size={14} />}
                className="flex-[1.5]"
            >
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('common:search_placeholder', 'Search...')}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 text-gray-700 dark:text-white placeholder:text-gray-400/50 transition-all shadow-sm"
                />
            </FilterGroup>

            {/* Sort */}
            <SortSelect
                value={sortConfig}
                onChange={setSortConfig}
                records={services}
                variant="horizontal"
                fieldLabels={fieldLabels}
                allowedFields={allowedFields}
            />

            {/* Status */}
            <FilterGroup
                label={t('database:fields.status')}
                icon={<MdDashboard size={14} />}
            >
                <div className="flex gap-1.5 min-w-[300px]">
                    {[
                        { id: '', label: t('common:all', 'Todos'), icon: MdDashboard },
                        { id: 'active', label: t('database:options.Active'), icon: MdCheckCircle, activeColor: 'bg-emerald-500' },
                        { id: 'inactive', label: t('database:options.Inactive'), icon: MdBlock, activeColor: 'bg-red-500' },
                    ].map(status => {
                        const Icon = status.icon;
                        const isActive = statusFilter === status.id;
                        return (
                            <button
                                key={status.id}
                                onClick={() => setStatusFilter(status.id)}
                                className={`
                                    flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold rounded-xl transition-all duration-200
                                    ${isActive
                                        ? `${status.activeColor || 'bg-blue-600'} text-white shadow-md`
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-900 border border-transparent hover:border-gray-200 dark:hover:border-neutral-800'
                                    }
                                `}
                            >
                                <Icon size={14} className={isActive ? 'text-white' : 'text-gray-400'} />
                                {status.label}
                            </button>
                        );
                    })}
                </div>
            </FilterGroup>

            {/* Category */}
            {categories.length > 0 && (
                <FilterGroup
                    label={t('database:fields.category')}
                    icon={<MdCategory size={14} />}
                >
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl appearance-none bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="">{t('common:all', 'All')}</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </FilterGroup>
            )}

            {/* Stats Footer (Horizontal) */}
            <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex items-center gap-6">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">
                        {t('common:total', 'Total')}
                    </span>
                    <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">
                        {totalServices}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">
                        {t('database:options.Active', 'Ativos')}
                    </span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">
                        {activeServices}
                    </span>
                </div>
            </div>
        </FilterBar>
    );
}

export default ServiceFilterBar;
