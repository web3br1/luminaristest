'use client';

/**
 * GenericTabbedView.tsx
 *
 * @description
 * Componente padronizado para exibir categorias com navegação por abas.
 * Reformulado para o Gold Standard: useGenericData + GenericTable + sort +
 * relation resolution + column customization + soft delete.
 *
 * Usado como fallback para qualquer categoria sem view especializada.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import type { IDynamicTable, ITableSchema } from '../../components/shared/dynamic-tables.client';
import FloatingActionButton from '../../components/shared/FloatingActionButton';
import { EmptyState } from '../../shared/components/EmptyState';
import { MdFolder, MdTableChart } from 'react-icons/md';
import { GenericFilterBar } from './components/GenericFilterBar';
import CategoryHeader from './components/CategoryHeader';
import CategoryTabs from './components/CategoryTabs';
import { useFilterPersistence } from './hooks/useFilterPersistence';
import { StandardPagination } from '../../shared/components/StandardPagination';
import { sortRecords, type SortOption } from './SortSelect';
import { getSearchableFields } from './utils/sortUtils';
import { useGenericData } from './hooks/useGenericData';
import { GenericTable } from './components/GenericTable';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GenericTabbedViewProps {
    tables: IDynamicTable[];
    title: string;
    description: string;
    addButtonLabel?: string;
    isWidgetMode?: boolean;
    categoryKey?: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 25;

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function GenericTabbedView({
    tables,
    title,
    description,
    addButtonLabel,
    isWidgetMode = false,
    categoryKey,
}: GenericTabbedViewProps) {
    const { t } = useTranslation(['common', 'database']);
    const [activeTableId, setActiveTableId] = useState<string>('');
    const [query, setQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<SortOption | null>(null);
    const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});

    // --- Filter Persistence ---
    const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('generic-tabbed', false);
    const activeFiltersCount = (query.trim() ? 1 : 0) + Object.keys(fieldFilters).length;

    // --- Reset state on table set change (category navigation) ---
    // Reseta também fieldFilters (paridade com handleTabChange) para evitar filtros
    // fantasmas de uma categoria persistirem ao navegar para outra com schema diferente.
    useEffect(() => {
        if (tables.length > 0) {
            setActiveTableId(tables[0].id);
            setQuery('');
            setFieldFilters({});
            setCurrentPage(1);
            setSortConfig(null);
        } else {
            setActiveTableId('');
        }
    }, [tables]);

    // --- Data Hook (Gold Standard Pattern A) ---
    const {
        table,
        records,
        schema,
        isLoading,
        error,
        refetch,
        relationLookups,
        deleteRecord,
    } = useGenericData(activeTableId, tables);

    // --- Tab change ---
    const handleTabChange = useCallback((id: string) => {
        setActiveTableId(id);
        setQuery('');
        setFieldFilters({});
        setCurrentPage(1);
        setSortConfig(null);
    }, []);

    // --- Filter handlers — resetam paginação inline (padrão Gold Standard) ---
    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        setCurrentPage(1);
    }, []);

    // Aceita tanto valor direto quanto functional updater — GenericFilterBar usa o segundo
    const handleFieldFiltersChange = useCallback<React.Dispatch<React.SetStateAction<Record<string, string>>>>((updater) => {
        setFieldFilters(updater);
        setCurrentPage(1);
    }, []);

    const handleClearQuery = useCallback(() => {
        setQuery('');
    }, []);

    // --- Filter → Sort → Paginate ---
    const filteredRecords = useMemo(() => {
        if (!Array.isArray(records)) return [];
        let result = records;

        // 1. Text Search Query
        if (query.trim()) {
            const q = query.toLowerCase();
            const searchableFields = getSearchableFields(schema);
            
            result = result.filter((r) => {
                if (!searchableFields) {
                    // Fallback se não tiver schema
                    return JSON.stringify(r.data).toLowerCase().includes(q);
                }
                
                // Procura apenas nos campos permitidos
                return searchableFields.some(fieldName => {
                    const val = r.data[fieldName];
                    return val != null && String(val).toLowerCase().includes(q);
                });
            });
        }

        // 2. Dynamic Field Filters
        const filterKeys = Object.keys(fieldFilters);
        if (filterKeys.length > 0) {
            result = result.filter(r => {
                return filterKeys.every(key => {
                    const expectedVal = fieldFilters[key];
                    const actualVal = r.data[key];
                    return String(actualVal) === expectedVal;
                });
            });
        }

        return result;
    }, [records, query, fieldFilters]);

    const sortedRecords = useMemo(
        () => sortRecords(filteredRecords, sortConfig, relationLookups),
        [filteredRecords, sortConfig, relationLookups]
    );

    const totalPages = Math.ceil(sortedRecords.length / ITEMS_PER_PAGE);
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [sortedRecords, currentPage]);

    // --- Empty category state ---
    if (tables.length === 0) {
        return (
            <div className="p-8 h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-neutral-900">
                <MdFolder size={64} className="text-gray-300 dark:text-gray-700 mb-4" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                    {t('database:generic_view.no_tables', 'No tables found')}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-center max-w-md">
                    {t('database:generic_view.no_tables_desc', 'This category does not have tables configured yet.')}
                </p>
            </div>
        );
    }

    // --- Render ---
    return (
        <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
            {/* Header */}
            {!isWidgetMode && (
                <CategoryHeader
                    title={title}
                    icon={<MdFolder size={20} />}
                    iconBgClass="bg-purple-600 shadow-purple-500/20"
                    isWidgetMode={isWidgetMode}
                    portalId="generic-table-actions-portal"
                    filterProps={{
                        isOpen: isFilterOpen,
                        onToggle: toggleFilter,
                        activeCount: activeFiltersCount
                    }}
                >
                    {table && schema && (
                        <FloatingActionButton
                            tableId={table.id}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            tableSchema={schema as ITableSchema}
                            onSuccess={refetch}
                            modalTitle={t('common:new_record', 'New Record')}
                        >
                            {addButtonLabel || t('common:new_record', 'New Record')}
                        </FloatingActionButton>
                    )}
                </CategoryHeader>
            )}

            {/* Horizontal Filter Bar */}
            {!isWidgetMode && (
                <GenericFilterBar
                    isOpen={isFilterOpen}
                    query={query}
                    setQuery={handleQueryChange}
                    recordCount={filteredRecords.length}
                    schema={schema || undefined}
                    fieldFilters={fieldFilters}
                    setFieldFilters={handleFieldFiltersChange}
                />
            )}

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">

                {/* Tabs Navigation (Separated from Header) */}
                {!isWidgetMode && (
                    <CategoryTabs
                        tabs={tables.map((tab) => ({
                            id: tab.id,
                            label: tab.internalName ? t(`database:tables.${tab.internalName}`, tab.name) : tab.name,
                            icon: MdTableChart
                        }))}
                        activeTabId={activeTableId}
                        onTabChange={handleTabChange}
                        colorTheme="purple"
                    />
                )}

                {/* Content */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-gray-50/20 dark:bg-neutral-900/20">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-3">
                            <div className="w-8 h-8 border-2 border-purple-600/30 border-t-purple-600 rounded-full animate-spin" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                {t('common:loading_data', 'Loading data...')}
                            </p>
                        </div>
                    ) : error ? (
                        <div className="h-full flex flex-col items-center justify-center p-12">
                            <EmptyState message={`${t('common:errorLoading', 'Error loading')}: ${error}`} />
                        </div>
                    ) : !schema ? (
                        <div className="h-full flex flex-col items-center justify-center p-12">
                            <EmptyState message={t('common:no_records_in_table', 'No records in this table.')} />
                        </div>
                    ) : sortedRecords.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-12">
                            <EmptyState
                                message={
                                    query
                                        ? t('common:no_records_found_filters', 'No records found with the applied filters.')
                                        : t('common:no_records_in_table', 'No records in this table.')
                                }
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={handleClearQuery}
                                    className="mt-3 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                                >
                                    {t('common:clear_filters', 'Clear filters')}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="p-3 h-full flex flex-col">
                            <GenericTable
                                records={paginatedRecords}
                                schema={schema}
                                tableId={activeTableId}
                                relationLookups={relationLookups}
                                onEditSuccess={refetch}
                                onDeleteConfirm={deleteRecord}
                                activeSortConfig={sortConfig}
                                onSortChange={setSortConfig}
                                isWidgetMode={isWidgetMode}
                            />
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {isWidgetMode ? (
                    <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center shrink-0">
                        <Link
                            href={`/dashboard?category=${categoryKey || ''}`}
                            className="text-sm font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 hover:underline"
                        >
                            {t('common:see_all', 'See All')} &rarr;
                        </Link>
                    </div>
                ) : (
                    <StandardPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={sortedRecords.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={setCurrentPage}
                    />
                )}
            </main>
        </div>
    );
}
