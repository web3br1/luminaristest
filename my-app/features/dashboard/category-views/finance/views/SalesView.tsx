'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import type { IDynamicTable } from '../../../components/shared/dynamic-tables.client';
import { useSalesData, useSalesLogic } from '../hooks';
import { SaleRecord } from '../types/sales.types';
import { StandardPagination } from '@/features/dashboard/shared/components/StandardPagination';

import { SalesTable, SaleDetailPanel, SalesFilterBar } from '../components/sales';
import SalesCreateModal from '../components/sales/SalesCreateModal';
import { useTranslation } from 'next-i18next';
import { useFilterPersistence } from '../../shared/hooks/useFilterPersistence';


interface SalesViewProps {
    tables: IDynamicTable[];
    isWidgetMode?: boolean;
    isFilterOpenOverride?: boolean;
    /** Incrementado por FinanceView após criação — dispara refetch aqui */
    refreshKey?: number;
    /** Controlado por FinanceView — abre o modal de criação */
    isCreateOpen?: boolean;
    onCloseCreate?: () => void;
}

export function SalesView({
    tables,
    isWidgetMode,
    isFilterOpenOverride,
    refreshKey,
    isCreateOpen = false,
    onCloseCreate,
}: SalesViewProps) {
    // 1. Hook de Dados (Discovery + Fetch + Normalization + Analytics)
    const {
        salesTable,
        saleItemsTable,
        itemsList,
        analytics,
        isLoading,
        refetch,
        refetchItems,
        productNameMap,
        serviceNameMap,
        customerNameMap,
        unitNameMap,
        salesList,
        stockIndex,
        updating,
        updateSale,
    } = useSalesData(tables);

    // 2. Hook de Lógica (Filtros + Sort + Paginação)
    const {
        query,
        setQuery,
        statusFilter,
        setStatusFilter,
        periodFilter,
        setPeriodFilter,
        periodLabels,
        currentPage,
        setCurrentPage,
        totalPages,
        filteredSales,
        paginatedSales,
        itemsPerPage,
    } = useSalesLogic(salesList, salesTable?.schema);

    // 3. Filter Persistence — FinanceView pode sobrescrever via isFilterOpenOverride
    const { isOpen: localFilterOpen } = useFilterPersistence('finance-sales', false);
    const isFilterOpen = isFilterOpenOverride !== undefined ? isFilterOpenOverride : localFilterOpen;

    // 4. Estado da View
    const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

    const { t } = useTranslation(['common', 'finance_view']);

    // 5. Refetch quando FinanceView cria uma nova venda
    useEffect(() => {
        if (!refreshKey) return;
        refetch();
        refetchItems();
    }, [refreshKey, refetch, refetchItems]);

    // 6. Handler de criação — refetch + fecha modal
    const handleCreated = useCallback(() => {
        refetch();
        refetchItems();
        onCloseCreate?.();
    }, [refetch, refetchItems, onCloseCreate]);

    // 7. Handler estável para o onClose do modal — evita inline arrow no JSX
    const handleCloseCreate = useCallback(() => {
        onCloseCreate?.();
    }, [onCloseCreate]);

    // Subtotal calculado dos itens da venda selecionada
    const computedSubtotal = useMemo(() => {
        if (!selectedSale) return 0;
        return itemsList
            .filter((it) => String(it.saleId || '') === String(selectedSale.id))
            .reduce((sum, it) => {
                const isProduct = !!it.productId && !it.serviceId;
                const qty = isProduct ? Number(it.quantity || 1) : 1;
                const price = Number(it.unitPrice || 0);
                return sum + qty * price;
            }, 0);
    }, [selectedSale, itemsList]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-black">
            {/* Filter Bar */}
            {!isWidgetMode && (
                <SalesFilterBar
                    isOpen={isFilterOpen}
                    query={query}
                    setQuery={setQuery}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    periodFilter={periodFilter}
                    setPeriodFilter={setPeriodFilter}
                    periodLabels={periodLabels}
                    totalRecords={filteredSales.length}
                    totalAmount={analytics.paidTotal}
                />
            )}

            {/* Main content — table (2/3) + detail panel (1/3) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 md:p-6 overflow-hidden">
                {/* Sales table column */}
                <div className="lg:col-span-2 flex flex-col min-h-0 overflow-hidden">
                    <SalesTable
                        sales={paginatedSales}
                        selectedSaleId={selectedSale?.id}
                        saleIdToSubtotal={analytics.saleIdToSubtotal}
                        customerNameMap={customerNameMap}
                        isLoading={isLoading}
                        isUpdating={updating}
                        isWidgetMode={isWidgetMode}
                        onSelectSale={setSelectedSale}
                        onUpdateSale={updateSale}
                        onRefresh={refetch}
                    />
                    {/* Pagination — controlled by useSalesLogic, shown below table */}
                    {!isWidgetMode && filteredSales.length > 0 && (
                        <div className="shrink-0 bg-white dark:bg-neutral-900 border-t border-gray-200 dark:border-gray-800 rounded-b-xl">
                            <StandardPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={filteredSales.length}
                                itemsPerPage={itemsPerPage}
                                onPageChange={setCurrentPage}
                            />
                        </div>
                    )}
                </div>

                {/* Detail panel column */}
                <div className="overflow-y-auto custom-scrollbar">
                    <SaleDetailPanel
                        sale={selectedSale}
                        table={salesTable}
                        items={itemsList}
                        computedSubtotal={computedSubtotal}
                        isUpdating={updating}
                        productNameMap={productNameMap}
                        serviceNameMap={serviceNameMap}
                        customerNameMap={customerNameMap}
                        unitNameMap={unitNameMap}
                        onUpdateSale={updateSale}
                    />
                </div>
            </div>

            {/* Modal de criação — controlado por FinanceView via isCreateOpen/onCloseCreate */}
            {isCreateOpen && salesTable && saleItemsTable && (
                <SalesCreateModal
                    isOpen={isCreateOpen}
                    onClose={handleCloseCreate}
                    salesTable={salesTable}
                    saleItemsTable={saleItemsTable}
                    stockIndex={stockIndex}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
}
