'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { MdSearch, MdLocationOn, MdSwapVert } from 'react-icons/md';
import { FilterBar } from '../../shared/components/FilterBar';
import { FilterGroup } from '../../shared/components/FilterGroup';
import type { SortOption } from '../../shared/SortSelect';
import { SortSelect } from '../../shared/SortSelect';
import type { IDynamicTableData } from '../../../components/shared/dynamic-tables.client';

interface InventoryFilterBarProps {
    isOpen?: boolean;
    activeTab: 'stock' | 'movements';
    // Stock filters
    query: string;
    setQuery: (q: string) => void;
    unitFilter?: string;
    setUnitFilter?: (u: string) => void;
    lowStockOnly?: boolean;
    setLowStockOnly?: (l: boolean) => void;
    units?: Array<{ id: string; name: string }>;
    stats?: {
        totalSkus: number;
        totalItems: number;
        criticalItems: number;
        totalValue: number;
    };
    sortConfig?: SortOption | null;
    setSortConfig?: (s: SortOption | null) => void;
    products?: IDynamicTableData[];
    // Movement filters
    movementsQuery?: string;
    setMovementsQuery?: (q: string) => void;
    movementsTypeFilter?: string;
    setMovementsTypeFilter?: (t: string) => void;
    movements?: IDynamicTableData[];
}

export function InventoryFilterBar({
    isOpen = true,
    activeTab,
    query,
    setQuery,
    unitFilter = '',
    setUnitFilter,
    lowStockOnly = false,
    setLowStockOnly,
    units = [],
    stats,
    sortConfig,
    setSortConfig,
    products = [],
    movementsQuery,
    setMovementsQuery,
    movementsTypeFilter,
    setMovementsTypeFilter,
    movements = []
}: InventoryFilterBarProps) {
    const { t } = useTranslation(['inventory_view', 'common']);

    // --- Mode: Stock ---
    if (activeTab === 'stock') {
        return (
            <FilterBar isOpen={isOpen}>
                <FilterGroup
                    label={t('inventory_view:filters.search_label', 'Buscar produto')}
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

                {setSortConfig && (
                    <SortSelect
                        value={sortConfig || null}
                        onChange={setSortConfig}
                        records={products}
                        variant="horizontal"
                    />
                )}

                {units.length > 0 && setUnitFilter && (
                    <FilterGroup
                        label={t('inventory_view:filters.unit', 'Unidade')}
                        icon={<MdLocationOn size={14} />}
                    >
                        <select
                            value={unitFilter}
                            onChange={(e) => setUnitFilter(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-bold rounded-xl appearance-none bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 transition-all cursor-pointer shadow-sm"
                        >
                            <option value="">{t('inventory_view:filters.all_units', 'Todas')}</option>
                            {units.map(unit => (
                                <option key={unit.id} value={unit.id}>{unit.name}</option>
                            ))}
                        </select>
                    </FilterGroup>
                )}

                {setLowStockOnly && (
                    <FilterGroup label={t('inventory_view:filters.low_stock_status', 'Status de Alerta')}>
                        <button
                            onClick={() => setLowStockOnly(!lowStockOnly)}
                            className={`
                                flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-200 gap-2
                                ${lowStockOnly
                                    ? 'bg-red-500 text-white border-red-600 shadow-md shadow-red-500/20'
                                    : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-gray-400 hover:border-red-500/50 hover:text-red-500'
                                }
                            `}
                        >
                            <svg className={`w-3.5 h-3.5 ${lowStockOnly ? 'text-white' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            <span className="text-[10px] font-black uppercase tracking-tight">
                                {t('inventory_view:filters.low_stock', 'Estoque baixo')}
                            </span>
                        </button>
                    </FilterGroup>
                )}

                {stats && (
                    <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex items-center gap-6">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">{t('inventory_view:filters.stats.skus', 'SKUs')}</span>
                            <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">{stats.totalSkus}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">{t('inventory_view:filters.stats.items', 'Itens')}</span>
                            <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">{stats.totalItems}</span>
                        </div>
                        {stats.criticalItems > 0 && (
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest leading-none">{t('inventory_view:filters.stats.critical', 'Críticos')}</span>
                                <span className="text-lg font-black text-red-600 dark:text-red-400 leading-none mt-1">{stats.criticalItems}</span>
                            </div>
                        )}
                    </div>
                )}
            </FilterBar>
        );
    }

    // --- Mode: Movements ---
    const totalMovements = movements.length;
    const incoming = movements.filter(m => (m.data?.type || 'In') === 'In').length;
    const outgoing = movements.filter(m => (m.data?.type || 'In') === 'Out').length;

    return (
        <FilterBar isOpen={isOpen}>
            <FilterGroup
                label={t('inventory_view:movements.search_label', 'Buscar movimentação')}
                icon={<MdSearch size={14} />}
                className="flex-[1.5]"
            >
                <input
                    type="text"
                    value={movementsQuery || ''}
                    onChange={(e) => setMovementsQuery?.(e.target.value)}
                    placeholder={t('common:search_placeholder', 'Pesquisar...')}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 text-gray-700 dark:text-white placeholder:text-gray-400/50 transition-all shadow-sm"
                />
            </FilterGroup>

            {setMovementsTypeFilter && (
                <FilterGroup
                    label={t('inventory_view:movements.type_label', 'Tipo de Fluxo')}
                    icon={<MdSwapVert size={14} />}
                >
                    <select
                        value={movementsTypeFilter || ''}
                        onChange={(e) => setMovementsTypeFilter(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl appearance-none bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="">{t('inventory_view:movements.all_types', 'Todos os Fluxos')}</option>
                        <option value="In">{t('inventory_view:movements.in', 'Entrada')}</option>
                        <option value="Out">{t('inventory_view:movements.out', 'Saída')}</option>
                    </select>
                </FilterGroup>
            )}

            <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex items-center gap-6">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">{t('inventory_view:movements.stats.incoming', 'Entradas')}</span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">{incoming}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">{t('inventory_view:movements.stats.outgoing', 'Saídas')}</span>
                    <span className="text-lg font-black text-red-600 dark:text-red-400 leading-none mt-1">{outgoing}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">{t('inventory_view:movements.stats.total', 'Total')}</span>
                    <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">{totalMovements}</span>
                </div>
            </div>
        </FilterBar>
    );
}

export default InventoryFilterBar;
