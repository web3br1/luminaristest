'use client';

import React from 'react';
import { MdInventory2 } from 'react-icons/md';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { InventoryTable } from './InventoryTable';
import { StandardPagination } from '../../../shared/components/StandardPagination';
import { EmptyState } from '../../../shared/components/EmptyState';
import type { IDynamicTable, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';
import type { SortOption } from '../../shared/SortSelect';

interface StockTabProps {
    isLoading: boolean;
    products: IDynamicTableData[];
    filteredProducts: IDynamicTableData[];
    paginatedProducts: IDynamicTableData[];
    activeUnits: IDynamicTableData[];
    inventoryLookup: Record<string, Record<string, IDynamicTableData>>;
    unitFilter: string;
    editingPriceId: string | null;
    editingPriceValue: string;
    isSavingPrice: boolean;
    setEditingPriceId: (id: string | null) => void;
    setEditingPriceValue: (val: string) => void;
    handleSaveInlinePrice: (id: string, price: number) => void;
    sortConfig: SortOption | null;
    setSortConfig: (config: SortOption | null) => void;
    isWidgetMode: boolean;
    stockPage: number;
    setStockPage: (page: number) => void;
    totalStockPages: number;
    itemsPerPage: number;
    setMovementModal: (state: { open: boolean; row: IDynamicTableData | null }) => void;
    setSelectedItem: (item: { record: IDynamicTableData | null; table: IDynamicTable | null }) => void;
    productTable: IDynamicTable | null;
    inventoryTable: IDynamicTable | null;
    inventoryRelationLookups: Record<string, Map<string, string>>;
}

export function StockTab({
    isLoading,
    products,
    filteredProducts,
    paginatedProducts,
    activeUnits,
    inventoryLookup,
    unitFilter,
    editingPriceId,
    editingPriceValue,
    isSavingPrice,
    setEditingPriceId,
    setEditingPriceValue,
    handleSaveInlinePrice,
    sortConfig,
    setSortConfig,
    isWidgetMode,
    stockPage,
    setStockPage,
    totalStockPages,
    itemsPerPage,
    setMovementModal,
    setSelectedItem,
    productTable,
    inventoryTable,
    inventoryRelationLookups
}: StockTabProps) {
    const { t } = useTranslation(['common', 'inventory_view']);

    if ((!products || products.length === 0) && !isLoading) {
        return (
            <div className="p-8 h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-neutral-900">
                <MdInventory2 size={64} className="text-gray-300 dark:text-gray-700 mb-4" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 uppercase tracking-tighter">{t('inventory_view:no_data_found', 'Nenhum dado encontrado')}</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-center max-w-md italic font-semibold">{t('inventory_view:check_tables', 'Verifique se as tabelas de Produtos e Unidades estão instaladas e populadas.')}</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-gray-50/20 dark:bg-neutral-950/20 overflow-hidden">
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-3">
                    <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin font-black"></div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('inventory_view:syncing_levels', 'Sincronizando níveis...')}</p>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="h-full flex items-center justify-center p-12">
                    <EmptyState message={t('inventory_view:no_items_found', 'Nenhum item encontrado nos parâmetros atuais.')} />
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 flex-1 flex flex-col min-h-0">
                        <InventoryTable
                            filteredProducts={isWidgetMode ? paginatedProducts.slice(0, 5) : paginatedProducts}
                            activeUnits={activeUnits}
                            inventoryLookup={inventoryLookup}
                            unitFilter={unitFilter}
                            editingPriceId={editingPriceId}
                            editingPriceValue={editingPriceValue}
                            isSavingPrice={isSavingPrice}
                            setEditingPriceId={setEditingPriceId}
                            setEditingPriceValue={setEditingPriceValue}
                            onSavePrice={handleSaveInlinePrice}
                            activeSortConfig={sortConfig}
                            onSortChange={setSortConfig}
                            isWidgetMode={isWidgetMode}
                            onOpenMovementModal={(product, unit, productName, unitName) =>
                                setMovementModal({ open: true, row: { id: product.id, data: { productId: product.id, unitId: unit.id, productName, unitName } } })
                            }
                            onSelectProduct={(p) => setSelectedItem({ record: p, table: productTable })}
                            onSelectInventory={(i) => setSelectedItem({ record: i, table: inventoryTable })}
                            inventoryTable={inventoryTable}
                            inventoryRelationLookups={inventoryRelationLookups}
                        />
                    </div>
                    {!isWidgetMode ? (
                        <StandardPagination
                            currentPage={stockPage}
                            totalPages={totalStockPages}
                            totalItems={filteredProducts.length}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setStockPage}
                        />
                    ) : (
                        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center">
                            <Link href="/dashboard?category=inventory" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
                                Ver todo o estoque ({filteredProducts.length}) &rarr;
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
