'use client';

/**
 * InternalServicesView - Catálogo de serviços com filtros dinâmicos
 * 
 * @description
 * Exibe a lista de serviços oferecidos com preços, custos e status.
 * Refatorado para usar useServicesData hook.
 */

import { useServicesData, useServicesLogic, type ServiceRecord } from './hooks';
import { ServicesTable } from './components';
import { StandardPagination } from '../../shared/components/StandardPagination';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import FloatingActionButton from '../../components/shared/FloatingActionButton';
import { EmptyState } from '../../shared/components/EmptyState';
import { ServiceFilterBar } from './ServiceFilterBar';
import { MdDesignServices } from 'react-icons/md';
import CategoryHeader from '../shared/components/CategoryHeader';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ServicesViewProps {
    tables: IDynamicTable[];
    isWidgetMode?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function InternalServicesView({ tables, isWidgetMode = false }: ServicesViewProps) {
    const { t } = useTranslation(['common', 'database']);

    // --- Data Hook ---
    const {
        services,
        categories,
        tableId,
        schema,
        isLoading,
        refetch,
        deleteService,
        serviceRelationLookups,
    } = useServicesData(tables);

    // --- Logic Hook ---
    const {
        query, setQuery,
        categoryFilter, setCategoryFilter,
        statusFilter, setStatusFilter,
        sortConfig, setSortConfig,
        currentPage, setCurrentPage,
        filteredRecords,
        paginatedServices,
        totalPages,
        itemsPerPage,
        stats
    } = useServicesLogic({ services, serviceRelationLookups, serviceSchema: schema });

    // --- Filter State ---
    const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('services', false);
    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (query) count++;
        if (categoryFilter && categoryFilter !== '') count++;
        if (statusFilter && statusFilter !== '') count++;
        return count;
    }, [query, categoryFilter, statusFilter]);

    // --- Empty State ---
    if (!tableId && !isLoading) {
        return (
            <div className="p-8 h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-neutral-900">
                <MdDesignServices size={64} className="text-gray-300 dark:text-gray-700 mb-4" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('database:services_view.not_found')}</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-center max-w-md">{t('database:services_view.install_module')}</p>
            </div>
        );
    }


    // --- Main Render ---
    return (
        <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
            <CategoryHeader
                title={t('database:services_view.title')}
                icon={<MdDesignServices size={20} />}
                iconBgClass="bg-blue-600 shadow-blue-500/20"
                isWidgetMode={isWidgetMode}
                portalId="services-table-actions-portal"
                filterProps={{
                    isOpen: isFilterOpen,
                    onToggle: toggleFilter,
                    activeCount: activeFiltersCount
                }}
            >
                {tableId && schema && (
                    <FloatingActionButton
                        tableId={tableId}
                        tableSchema={schema}
                        onSuccess={refetch}
                        modalTitle={t('database:services_view.register_new')}
                    >
                        <span className="text-sm font-bold">{t('database:services_view.new_service')}</span>
                    </FloatingActionButton>
                )}
            </CategoryHeader>

            {/* Horizontal Filter Bar */}
            {!isWidgetMode && (
                <ServiceFilterBar
                    isOpen={isFilterOpen}
                    query={query}
                    setQuery={setQuery}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    categories={categories}
                    totalServices={stats.total}
                    activeServices={stats.active}
                    sortConfig={sortConfig}
                    setSortConfig={setSortConfig}
                    services={services}
                    schema={schema}
                />
            )}

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">

                {/* Content */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-gray-50/20 dark:bg-neutral-950/20">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-3">
                            <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('database:services_view.loading')}</p>
                        </div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="h-full flex items-center justify-center p-12">
                            <EmptyState message={t('database:services_view.no_results', 'Nenhum serviço atende aos critérios.')} />
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="p-3 flex-1 overflow-auto custom-scrollbar">
                                <ServicesTable
                                    services={paginatedServices}
                                    tableId={tableId}
                                    schema={schema}
                                    activeSortConfig={sortConfig}
                                    onSortChange={setSortConfig}
                                    isWidgetMode={isWidgetMode}
                                    onEditSuccess={refetch}
                                    onDeleteConfirm={deleteService}
                                    serviceRelationLookups={serviceRelationLookups}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Global Pagination */}
                {filteredRecords.length > 0 ? (
                    !isWidgetMode ? (
                        <StandardPagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredRecords.length}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                        />
                    ) : (
                        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center shrink-0">
                            <Link href="/dashboard?category=services" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
                                Ver todos os serviços ({filteredRecords.length}) &rarr;
                            </Link>
                        </div>
                    )
                ) : null}
            </main>
        </div>
    );
}
