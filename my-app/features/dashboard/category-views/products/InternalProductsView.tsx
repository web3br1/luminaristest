'use client';

/**
 * InternalProductsView - Visualização consolidada de produtos com estoque
 * 
 * @description
 * Exibe o catálogo de produtos com filtros dinâmicos e estoque detalhado por unidade.
 * Integra três tabelas do preset: `products`, `productUnits` e `units`.
 * 
 * @example
 * ```tsx
 * <InternalProductsView tables={allDynamicTables} />
 * ```
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import { isTableSchema } from '../../components/shared/dynamic-tables.client';
import FloatingActionButton from '../../components/shared/FloatingActionButton';
import { EmptyState } from '../../shared/components/EmptyState';
import { MdInventory2 } from 'react-icons/md';
import { StandardPagination } from '../../shared/components/StandardPagination';

// Local imports
import { ProductFilterBar } from './ProductFilterBar';
import { ProductsTable } from './components';
import { useProductsData, useProductsLogic } from './hooks';
import CategoryHeader from '../shared/components/CategoryHeader';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ProductsViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function InternalProductsView({ tables, isWidgetMode = false }: ProductsViewProps) {
  const { t } = useTranslation(['common', 'database']);

  // --- Data Hook ---
  const {
    products,
    units,
    inventoryLookup,
    productSchema,
    inventorySchema,
    productTableId,
    inventoryTableId,
    isLoading,
    refetchProducts,
    refetchInventory,
    categories,
    brands,
    usageTypes,
    hasInventory,
    hasUnits,
    deleteProduct,
    productRelationLookups,
  } = useProductsData(tables);

  // --- Logic Hook ---
  const {
    query, setQuery,
    categoryFilter, setCategoryFilter,
    brandFilter, setBrandFilter,
    usageTypeFilter, setUsageTypeFilter,
    sortConfig, setSortConfig,
    currentPage, setCurrentPage,
    paginatedProducts,
    filteredProducts,
    totalPages,
    itemsPerPage,
    stats
  } = useProductsLogic({ products, productRelationLookups, productSchema });

  // --- Filter State ---
  const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('products', false);
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (query) count++;
    if (categoryFilter) count++;
    if (brandFilter) count++;
    if (usageTypeFilter) count++;
    return count;
  }, [query, categoryFilter, brandFilter, usageTypeFilter]);

  // --- Empty State ---
  if (!productTableId && !isLoading) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-neutral-900">
        <MdInventory2 size={64} className="text-gray-300 dark:text-gray-700 mb-4" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
          {t('products_view.not_configured', 'Catálogo de Produtos não configurado')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-center max-w-md">
          {t('products_view.config_warning', 'Certifique-se de que possui uma tabela com a categoria "products" instalada.')}
        </p>
      </div>
    );
  }


  // --- Main Render ---
  return (
    <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
      {/* Header */}
      <CategoryHeader
        title={t('products_view.title', 'Produtos')}
        icon={<MdInventory2 size={20} />}
        iconBgClass="bg-blue-600 shadow-blue-500/20"
        isWidgetMode={isWidgetMode}
        portalId="products-table-actions-portal"
        filterProps={{
          isOpen: isFilterOpen,
          onToggle: toggleFilter,
          activeCount: activeFiltersCount
        }}
      >
        {productTableId && isTableSchema(productSchema?.schema) && (
          <FloatingActionButton
            tableId={productTableId}
            tableSchema={productSchema!.schema}
            onSuccess={refetchProducts}
            modalTitle={t('products_view.register_new_product', 'Cadastrar Novo Produto')}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{t('products_view.new_product', 'Novo Produto')}</span>
            </div>
          </FloatingActionButton>
        )}
      </CategoryHeader>

      {/* Horizontal Filter Bar */}
      {!isWidgetMode && (
        <ProductFilterBar
          isOpen={isFilterOpen}
          query={query}
          setQuery={setQuery}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          brandFilter={brandFilter}
          setBrandFilter={setBrandFilter}
          usageTypeFilter={usageTypeFilter}
          setUsageTypeFilter={setUsageTypeFilter}
          categories={categories}
          brands={brands}
          totalProducts={stats.total}
          sortConfig={sortConfig}
          setSortConfig={setSortConfig}
          products={products}
          schema={productSchema?.schema}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">

        {/* Content */}
        <div className="flex-1 overflow-auto custom-scrollbar bg-gray-50/20 dark:bg-neutral-900/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {t('products_view.loading', 'Carregando dados...')}
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="h-full flex items-center justify-center p-12">
              <EmptyState message={t('products_view.empty_state', 'Nenhum produto atende aos filtros selecionados.')} />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
                <ProductsTable
                  products={paginatedProducts}
                  units={units}
                  inventoryLookup={inventoryLookup}
                  productTableId={productTableId!}
                  productSchema={productSchema}
                  inventoryTableId={inventoryTableId || ''}
                  inventorySchema={inventorySchema}
                  onProductEdit={refetchProducts}
                  onInventoryEdit={refetchInventory}
                  onDeleteConfirm={deleteProduct}
                  activeSortConfig={sortConfig}
                  onSortChange={setSortConfig}
                  isWidgetMode={isWidgetMode}
                  hasInventory={hasInventory}
                  hasUnits={hasUnits}
                  productRelationLookups={productRelationLookups}
                />
              </div>
            </div>
          )}
        </div>

        {/* Global Pagination */}
        {filteredProducts.length > 0 ? (
            !isWidgetMode ? (
                <StandardPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredProducts.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
            ) : (
                <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center shrink-0">
                  <Link href="/dashboard?category=products" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
                    Ver todos os produtos ({filteredProducts.length}) &rarr;
                  </Link>
                </div>
            )
        ) : null}
      </main>
    </div>
  );
}
