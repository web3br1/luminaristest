'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import type { IDynamicTable } from '@/features/dashboard/components/shared/dynamic-tables.client';
import GenericDataSidebar from '@/features/dashboard/components/shared/GenericDataSidebar';
import { ExpensesFilterBar } from '../components/expenses/ExpensesFilterBar';
import { ExpensesTable } from '../components/expenses/ExpensesTable';
import { useExpensesLogic } from '../hooks/expenses/useExpensesLogic';
import { ExpenseRecord } from '../types/expenses.types';
import type { DynamicRecord } from '../types/common.types';
import { useFilterPersistence } from '../../shared/hooks/useFilterPersistence';
import { StandardPagination } from '@/features/dashboard/shared/components/StandardPagination';

interface InternalExpensesViewProps {
    /** Fetched table metadata (id, name, schema, etc.) */
    tSchema: IDynamicTable | null | undefined;
    refetch: () => void;
    isLoading: boolean;
    error: unknown;
    logic: ReturnType<typeof useExpensesLogic>;
    relationLookups: Record<string, Map<string, string>>;
    deleteRecord: (record: { id: string }) => Promise<void>;
    isWidgetMode?: boolean;
    isFilterOpenOverride?: boolean;
    /** Incrementado por FinanceView após criação — dispara refetch */
    refreshKey?: number;
}

export function InternalExpensesView({
    tSchema,
    refetch,
    isLoading,
    error,
    logic,
    relationLookups,
    deleteRecord,
    isWidgetMode = false,
    isFilterOpenOverride,
    refreshKey,
}: InternalExpensesViewProps) {
    const { t } = useTranslation(['common', 'finance_view']);
    const [selectedRecord, setSelectedRecord] = useState<DynamicRecord | null>(null);

    const {
        query,
        setQuery,
        periodFilter,
        setPeriodFilter,
        categoryFilter,
        setCategoryFilter,
        totalPages,
        currentPage,
        setCurrentPage,
        categoryOptions,
        filteredRecords,
        paginatedRecords,
        totalAmount,
        periodLabels,
        itemsPerPage,
        sortConfig,
        setSortConfig,
    } = logic;

    // Boundary cast — useExpensesLogic returns DynamicRecord[] (generic logic layer);
    // ExpensesTable renders domain-specific fields. DynamicRecord and ExpenseRecord
    // are structurally identical ({ id, data }), so this downcast is safe.
    const paginatedExpenses = paginatedRecords as ExpenseRecord[];

    // Refetch quando FinanceView cria uma nova despesa
    useEffect(() => {
        if (!refreshKey) return;
        refetch();
    }, [refreshKey, refetch]);

    const { isOpen: localFilterOpen } = useFilterPersistence('finance-expenses', false);
    const isFilterOpen = isFilterOpenOverride !== undefined ? isFilterOpenOverride : localFilterOpen;

    // Handler estável para o Sidebar — evita inline arrow no JSX
    const handleCloseSidebar = useCallback(() => setSelectedRecord(null), []);

    return (
        <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
            {/* Horizontal Filter Bar */}
            {!isWidgetMode && (
                <ExpensesFilterBar
                    isOpen={isFilterOpen}
                    query={query}
                    setQuery={setQuery}
                    periodFilter={periodFilter}
                    setPeriodFilter={setPeriodFilter}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    periodLabels={periodLabels}
                    categoryOptions={categoryOptions}
                    totalRecords={filteredRecords.length}
                    totalAmount={totalAmount}
                    sortConfig={sortConfig}
                    setSortConfig={setSortConfig}
                    records={filteredRecords}
                />
            )}

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">

                {/* Content Area */}
                <div className="flex-1 min-h-0 relative flex flex-col bg-gray-50/20 dark:bg-neutral-950/20">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-3">
                            <div className="w-8 h-8 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                {t('common:loading', 'Carregando dados...')}
                            </p>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-64 text-red-500">{String(error)}</div>
                    ) : (
                        <div className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
                            <ExpensesTable
                                tableData={tSchema}
                                records={paginatedExpenses}
                                onSelectRecord={setSelectedRecord}
                                onEditSuccess={refetch}
                                onDeleteConfirm={deleteRecord}
                                relationLookups={relationLookups}
                                isWidgetMode={isWidgetMode}
                                activeSortConfig={sortConfig}
                                onSortChange={setSortConfig}
                            />
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {!isWidgetMode && paginatedRecords.length > 0 && (
                    <div className="bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800">
                        <StandardPagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredRecords.length}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                )}

                {/* Sidebar Details — only rendered when tSchema is available (avoids cast) */}
                {tSchema && (
                    <GenericDataSidebar
                        isOpen={!!selectedRecord}
                        onClose={handleCloseSidebar}
                        table={tSchema}
                        record={selectedRecord}
                        onRefresh={refetch}
                    />
                )}
            </main>
        </div>
    );
}
