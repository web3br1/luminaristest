'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { MdSearch, MdCategory, MdBrandingWatermark, MdLabel } from 'react-icons/md';
import { FilterBar } from '../shared/components/FilterBar';
import { FilterGroup } from '../shared/components/FilterGroup';
import { SortSelect, SortOption } from '../shared/SortSelect';
import { getSchemaAllowedSortFields } from '../shared/utils/sortUtils';
import { isTableSchema } from '../../components/shared/dynamic-tables.client';

interface ProductFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    categoryFilter: string;
    setCategoryFilter: (c: string) => void;
    brandFilter: string;
    setBrandFilter: (b: string) => void;
    usageTypeFilter: string;
    setUsageTypeFilter: (u: string) => void;
    categories: string[];
    brands: string[];
    totalProducts: number;
    sortConfig: SortOption | null;
    setSortConfig: (sort: SortOption | null) => void;
    products: Array<{ id: string; data?: object | null }>;
    schema?: unknown;
}

export function ProductFilterBar({
    isOpen = true,
    query,
    setQuery,
    categoryFilter,
    setCategoryFilter,
    brandFilter,
    setBrandFilter,
    usageTypeFilter,
    setUsageTypeFilter,
    categories,
    brands,
    totalProducts,
    sortConfig,
    setSortConfig,
    products,
    schema
}: ProductFilterBarProps) {
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
                label={t('products_view.filters.search', 'Buscar')}
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
                records={products}
                variant="horizontal"
                fieldLabels={fieldLabels}
                allowedFields={allowedFields}
            />

            {/* Category */}
            {categories.length > 0 && (
                <FilterGroup
                    label={t('products_view.filters.category', 'Categoria')}
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

            {/* Brand */}
            {brands.length > 0 && (
                <FilterGroup
                    label={t('products_view.filters.brand', 'Marca')}
                    icon={<MdBrandingWatermark size={14} />}
                >
                    <select
                        value={brandFilter}
                        onChange={(e) => setBrandFilter(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl appearance-none bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="">{t('common:all', 'All')}</option>
                        {brands.map(brand => (
                            <option key={brand} value={brand}>{brand}</option>
                        ))}
                    </select>
                </FilterGroup>
            )}

            {/* Usage Type */}
            <FilterGroup
                label={t('products_view.filters.usage_type', 'Tipo de Uso')}
                icon={<MdLabel size={14} />}
                className="min-w-[220px]"
            >
                <div className="flex gap-1.5 w-full">
                    {[
                        { id: '', label: t('common:all', 'All') },
                        { id: 'Sale', label: t('products_view.filters.sale', 'Venda') },
                        { id: 'Internal', label: t('products_view.filters.internal_use', 'Uso Interno') },
                    ].map(type => (
                        <button
                            key={type.id}
                            onClick={() => setUsageTypeFilter(type.id)}
                            className={`
                                flex-1 text-center px-3 py-2 text-[10px] font-bold rounded-xl transition-all duration-200
                                ${usageTypeFilter === type.id
                                    ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-500/20'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 border border-gray-100 dark:border-neutral-800'
                                }
                            `}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </FilterGroup>

            {/* Total Footer (Stats) */}
            <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex flex-col justify-center gap-1 min-w-[80px]">
                <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">
                    {t('common:total', 'Total')}
                </span>
                <span className="text-lg font-black text-gray-900 dark:text-white leading-none">
                    {totalProducts}
                </span>
            </div>
        </FilterBar>
    );
}

export default ProductFilterBar;
