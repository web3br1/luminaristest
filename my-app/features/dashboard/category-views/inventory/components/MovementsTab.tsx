'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import type { IDynamicTable, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';
import { InventoryHistoryTable } from './InventoryHistoryTable';
import { StandardPagination } from '../../../shared/components/StandardPagination';

interface MovementsTabProps {
    isLoading: boolean;
    filteredMovements: IDynamicTableData[];
    paginatedMovements: IDynamicTableData[];
    productNameMap: Record<string, string>;
    unitNameMap: Record<string, string>;
    movementsRelationLookups: Record<string, Map<string, string>>;
    movementsPage: number;
    setMovementsPage: (page: number) => void;
    movementsTotalPages: number;
    itemsPerPage: number;
    movementsTable: IDynamicTable | null;
}

export function MovementsTab({
    isLoading,
    filteredMovements,
    paginatedMovements,
    productNameMap,
    unitNameMap,
    movementsRelationLookups,
    movementsPage,
    setMovementsPage,
    movementsTotalPages,
    itemsPerPage,
    movementsTable,
}: MovementsTabProps) {
    const { t } = useTranslation(['common', 'inventory_view']);

    return (
        <div className="h-full flex flex-col bg-gray-50/20 dark:bg-neutral-950/20 overflow-hidden">
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3">
                    <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin font-black"></div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('common:loading_data', 'Carregando...')}</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 flex-1 flex flex-col min-h-0">
                        <InventoryHistoryTable
                            movements={paginatedMovements}
                            isLoading={isLoading}
                            productNameMap={productNameMap}
                            unitNameMap={unitNameMap}
                            movementsRelationLookups={movementsRelationLookups}
                            movementsTable={movementsTable}
                        />
                    </div>
                    <StandardPagination
                        currentPage={movementsPage}
                        totalPages={movementsTotalPages}
                        totalItems={filteredMovements.length}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setMovementsPage}
                    />
                </div>
            )}
        </div>
    );
}
