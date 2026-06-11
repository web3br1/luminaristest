'use client';

import React, { useState, useCallback } from 'react';
import { MdInventory2, MdHistory } from 'react-icons/md';
import type { IDynamicTable, IDynamicTableData } from '../../components/shared/dynamic-tables.client';
import { InventoryFilterBar } from './components/InventoryFilterBar';
import MovementModal from './components/MovementModal';
import GenericDataSidebar from '../../components/shared/GenericDataSidebar';
import CategoryHeader from '../shared/components/CategoryHeader';
import CategoryTabs from '../shared/components/CategoryTabs';
import { useInventoryData, useInventoryLogic } from './hooks';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';
import { useTranslation } from 'next-i18next';

// Tab Components
import { StockTab } from './components/StockTab';
import { MovementsTab } from './components/MovementsTab';

interface InternalInventoryViewProps {
    tables: IDynamicTable[];
    isWidgetMode?: boolean;
}

export default function InternalInventoryView({ tables, isWidgetMode = false }: InternalInventoryViewProps) {
    const { t } = useTranslation(['common', 'inventory_view']);
    const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');

    // --- Data Hook ---
    const {
        products,
        units,
        movements,
        inventoryLookup,
        productNameMap,
        unitNameMap,
        productsTable,
        movementsTable,
        inventoryTable,
        suppliersTableId,
        refetchInventory,
        isLoading,
        movementsRelationLookups,
        inventoryRelationLookups,
        saveInlinePrice,
        createMovement,
    } = useInventoryData(tables);

    // --- Sidebar State ---
    const [selectedItem, setSelectedItem] = useState<{
        record: IDynamicTableData | null;
        table: IDynamicTable | null;
    } | null>(null);

    // --- Stock + Movements Logic Hook ---
    const {
        query, setQuery,
        unitFilter, setUnitFilter,
        lowStockOnly, setLowStockOnly,
        movementModal, setMovementModal,
        editingPriceId, setEditingPriceId,
        editingPriceValue, setEditingPriceValue,
        isSavingPrice,
        filteredProducts,
        paginatedProducts,
        stockPage, setStockPage,
        totalStockPages,
        unitOptions,
        stats,
        activeUnits,
        handleSaveInlinePrice,
        sortConfig, setSortConfig,
        movementsQuery, setMovementsQuery,
        movementsTypeFilter, setMovementsTypeFilter,
        movementsPage, setMovementsPage,
        filteredMovements,
        paginatedMovements,
        movementsTotalPages,
        ITEMS_PER_PAGE,
    } = useInventoryLogic({
        products,
        inventoryLookup,
        units,
        movements,
        onSaveInlinePrice: saveInlinePrice,
        productsSchema: productsTable?.schema,
        movementsSchema: movementsTable?.schema,
    });

    // --- Filter Persistence ---
    const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('inventory', false);
    const activeFiltersCount = (query ? 1 : 0) + (unitFilter ? 1 : 0) + (lowStockOnly ? 1 : 0);

    // --- Stable callbacks ---
    const handleTabChange = useCallback(
        (id: string) => setActiveTab(id as 'stock' | 'movements'),
        []
    );

    const handleCloseMovementModal = useCallback(
        () => setMovementModal({ open: false, row: null }),
        [setMovementModal]
    );

    const handleMovementSuccess = useCallback(
        () => setMovementModal({ open: false, row: null }),
        [setMovementModal]
    );

    const handleCloseSidebar = useCallback(() => setSelectedItem(null), []);

    return (
        <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
            {!isWidgetMode && (
                <CategoryHeader
                    title={activeTab === 'stock' ? t('inventory_view:title', 'Estoque') : t('inventory_view:history.title', 'Histórico de Movimentações')}
                    icon={activeTab === 'stock' ? <MdInventory2 size={20} /> : <MdHistory size={20} />}
                    iconBgClass="bg-blue-600 shadow-blue-500/20"
                    isWidgetMode={isWidgetMode}
                    portalId="inventory-table-actions-portal"
                    filterProps={{
                        isOpen: isFilterOpen,
                        onToggle: toggleFilter,
                        activeCount: activeFiltersCount
                    }}
                />
            )}

            <InventoryFilterBar
                isOpen={isFilterOpen}
                activeTab={activeTab}
                // Stock props
                query={query}
                setQuery={setQuery}
                unitFilter={unitFilter}
                setUnitFilter={setUnitFilter}
                lowStockOnly={lowStockOnly}
                setLowStockOnly={setLowStockOnly}
                units={unitOptions}
                stats={stats}
                sortConfig={sortConfig}
                setSortConfig={setSortConfig}
                products={products}
                // Movements props
                movementsQuery={movementsQuery}
                setMovementsQuery={setMovementsQuery}
                movementsTypeFilter={movementsTypeFilter}
                setMovementsTypeFilter={setMovementsTypeFilter}
                movements={movements}
            />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">
                {!isWidgetMode && (
                    <CategoryTabs
                        tabs={[
                            { id: 'stock',     label: t('inventory_view:tabs.stock',     'Estoque'),        icon: MdInventory2 },
                            { id: 'movements', label: t('inventory_view:tabs.movements', 'Movimentações'),  icon: MdHistory    }
                        ]}
                        activeTabId={activeTab}
                        onTabChange={handleTabChange}
                        colorTheme="blue"
                    />
                )}

                <div className="flex-1 min-h-0 relative">
                    {activeTab === 'stock' ? (
                        <StockTab
                            isLoading={isLoading}
                            products={products}
                            filteredProducts={filteredProducts}
                            paginatedProducts={paginatedProducts}
                            activeUnits={activeUnits}
                            inventoryLookup={inventoryLookup}
                            unitFilter={unitFilter}
                            editingPriceId={editingPriceId}
                            editingPriceValue={editingPriceValue}
                            isSavingPrice={isSavingPrice}
                            setEditingPriceId={setEditingPriceId}
                            setEditingPriceValue={setEditingPriceValue}
                            handleSaveInlinePrice={handleSaveInlinePrice}
                            sortConfig={sortConfig}
                            setSortConfig={setSortConfig}
                            isWidgetMode={isWidgetMode}
                            stockPage={stockPage}
                            setStockPage={setStockPage}
                            totalStockPages={totalStockPages}
                            itemsPerPage={ITEMS_PER_PAGE}
                            setMovementModal={setMovementModal}
                            setSelectedItem={setSelectedItem}
                            productTable={productsTable ?? null}
                            inventoryTable={inventoryTable ?? null}
                            inventoryRelationLookups={inventoryRelationLookups}
                        />
                    ) : (
                        <MovementsTab
                            isLoading={isLoading}
                            filteredMovements={filteredMovements}
                            paginatedMovements={paginatedMovements}
                            productNameMap={productNameMap}
                            unitNameMap={unitNameMap}
                            movementsRelationLookups={movementsRelationLookups}
                            movementsPage={movementsPage}
                            setMovementsPage={setMovementsPage}
                            movementsTotalPages={movementsTotalPages}
                            itemsPerPage={ITEMS_PER_PAGE}
                            movementsTable={inventoryTable ?? null}
                        />
                    )}
                </div>
            </main>

            {movementModal.open && movementModal.row && (
                <MovementModal
                    isOpen={movementModal.open}
                    onClose={handleCloseMovementModal}
                    row={movementModal.row}
                    suppliersTableId={suppliersTableId ?? ''}
                    onCreateMovement={createMovement}
                    onSuccess={handleMovementSuccess}
                />
            )}

            <GenericDataSidebar
                isOpen={!!selectedItem}
                onClose={handleCloseSidebar}
                table={selectedItem?.table ?? null}
                record={selectedItem?.record ?? null}
                onRefresh={refetchInventory}
            />
        </div>
    );
}
