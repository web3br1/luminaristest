'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { FilterBar } from '../../shared/components/FilterBar';
import { FilterGroup } from '../../shared/components/FilterGroup';
import type { SortOption } from '../../shared/SortSelect';
import { SortSelect } from '../../shared/SortSelect';
import type { PersonRecord } from '../hooks/usePeopleData';

interface PeopleFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    statusFilter: string;
    setStatusFilter: (s: string) => void;
    sortConfig: SortOption | null;
    setSortConfig: (s: SortOption | null) => void;
    people: PersonRecord[];
    stats: {
        total: number;
        active: number;
        inactive: number;
    };
}

export function PeopleFilterBar({
    isOpen = true,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sortConfig,
    setSortConfig,
    people,
    stats
}: PeopleFilterBarProps) {
    const { t } = useTranslation(['common', 'database']);

    return (
        <FilterBar isOpen={isOpen}>
            {/* Search */}
            <FilterGroup
                label={t('common:search', 'Pesquisar')}
                className="flex-[1.5]"
            >
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('common:search_placeholder', 'Nome, email, telefone...')}
                    className="w-full px-3 py-2.5 text-sm rounded-xl bg-gray-50/80 dark:bg-neutral-800/40 border border-gray-200/60 dark:border-neutral-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 dark:focus:ring-blue-400/30 dark:focus:border-blue-400/50 text-gray-900 dark:text-white placeholder:text-gray-400/70 transition-all"
                />
            </FilterGroup>

            {/* Sort */}
            <SortSelect
                value={sortConfig}
                onChange={setSortConfig}
                records={people}
                variant="horizontal"
                fieldLabels={{
                    name: t('database:fields.name', 'Nome'),
                    email: t('database:fields.email', 'Email'),
                    role: t('database:fields.role', 'Cargo/Função'),
                    phone: t('database:fields.phone', 'Telefone'),
                    createdAt: t('database:fields.createdAt', 'Data Cadastro'),
                    tableId: t('database:fields.category', 'Categoria')
                }}
            />

            {/* Status Filter */}
            <FilterGroup label={t('database:fields.status', 'Status')}>
                <div className="flex gap-1 min-w-[240px]">
                    {[
                        { id: '', label: t('common:all', 'Todos') },
                        { id: 'active', label: t('database:options.Active', 'Ativos') },
                        { id: 'inactive', label: t('database:options.Inactive', 'Inativos') },
                    ].map(status => (
                        <button
                            key={status.id}
                            onClick={() => setStatusFilter(status.id)}
                            className={`
                                flex-1 text-center px-2 py-2 text-xs font-medium rounded-lg transition-all duration-150
                                ${statusFilter === status.id
                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700/50 border border-gray-200 dark:border-gray-700'
                                }
                            `}
                        >
                            {status.label}
                        </button>
                    ))}
                </div>
            </FilterGroup>

            {/* Quick Stats Footer (Stats) */}
            <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex items-center gap-4">
                <div className="flex flex-col items-center">
                    <span className="text-lg font-bold text-gray-900 dark:text-white leading-none">{stats.total}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none mt-1">{t('common:total', 'Total')}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-none">{stats.active}</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide leading-none mt-1">{t('database:options.Active', 'Ativos')}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-lg font-bold text-gray-500 dark:text-gray-400 leading-none">{stats.inactive}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none mt-1">{t('database:options.Inactive', 'Inativos')}</span>
                </div>
            </div>
        </FilterBar>
    );
}

export default PeopleFilterBar;
