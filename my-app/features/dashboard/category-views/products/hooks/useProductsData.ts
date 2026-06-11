'use client';

/**
 * useProductsData Hook - Encapsula busca e processamento de dados de produtos
 * 
 * @description
 * Gerencia as 3 tabelas necessárias para a view de produtos:
 * - products: catálogo de produtos
 * - productUnits: estoque por unidade
 * - units: unidades de negócio
 */

import { useMemo, useCallback } from 'react';
import { useTableData, isTableSchema } from '../../../components/shared/dynamic-tables.client';
import type { IDynamicTable } from '../../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { useTableRelationLookups } from '../../../shared/hooks/useTableRelationLookups';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Registro dinâmico genérico */
export interface DynamicRecord<T = Record<string, unknown>> {
    id: string;
    data: T;
}

/** Dados de produto */
export interface ProductData {
    name?: string;
    productName?: string;
    sku?: string;
    brand?: string;
    category?: string;
    usageType?: string;
    description?: string;
    [key: string]: unknown;
}

/** Dados de inventário */
export interface InventoryData {
    productId?: string;
    unitId?: string;
    stock?: number;
    reserved?: number;
    salePrice?: number;
    [key: string]: unknown;
}

/** Dados de unidade */
export interface UnitData {
    name?: string;
    [key: string]: unknown;
}

/** Lookup de inventário: productId → unitId → record */
export type InventoryLookup = Record<string, Record<string, DynamicRecord<InventoryData>>>;

/** Retorno do hook */
export interface UseProductsDataReturn {
    // Data
    products: DynamicRecord<ProductData>[];
    units: DynamicRecord<UnitData>[];
    inventoryLookup: InventoryLookup;

    // Schemas
    productSchema: ReturnType<typeof useTableData>['table'];
    inventorySchema: ReturnType<typeof useTableData>['table'];

    // Table objects
    productTable: IDynamicTable | null;

    // Table IDs
    productTableId: string | null;
    inventoryTableId: string | null;

    // State
    isLoading: boolean;

    // Actions
    refetchProducts: () => void;
    refetchInventory: () => void;
    deleteProduct: (product: DynamicRecord<ProductData>) => Promise<void>;

    // Metadata
    categories: string[];
    brands: string[];
    usageTypes: string[];

    // Module Capabilities
    hasInventory: boolean;
    hasUnits: boolean;
    productFieldNames: Set<string>;
    // Relation Lookups
    productRelationLookups: Record<string, Map<string, string>>;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * Hook para gerenciar dados de produtos com inventário
 */
export function useProductsData(tables: IDynamicTable[]): UseProductsDataReturn {
    // --- Table Detection (useMemo — zero extra renders) ---
    const productTable = useMemo(
        () =>
            tables.find(t => t.internalName === 'products') ||
            tables.find(t => t.category === 'products') ||
            tables.find(t => t.name.toLowerCase() === 'products') ||
            null,
        [tables]
    );

    const inventoryTable = useMemo(
        () =>
            tables.find(t => t.internalName === 'productUnits') ||
            tables.find(t => t.category === 'inventory' && t.name.toLowerCase().includes('unit')) ||
            tables.find(t => t.name.toLowerCase() === 'product units') ||
            null,
        [tables]
    );

    const unitsTable = useMemo(
        () =>
            tables.find(t => t.internalName === 'units') ||
            tables.find(t => t.category === 'business' && t.name.toLowerCase() === 'units') ||
            tables.find(t => t.name.toLowerCase() === 'units') ||
            null,
        [tables]
    );

    // IDs derivados — sem useState, sem useEffect
    const productTableId = productTable?.id ?? null;
    const inventoryTableId = inventoryTable?.id ?? null;
    const unitsTableId = unitsTable?.id ?? null;

    // --- Data Fetching ---
    const {
        table: productSchema,
        records: rawProducts,
        isLoading: loadingProducts,
        refetch: refetchProducts
    } = useTableData(productTableId || '');

    const {
        table: inventorySchema,
        records: rawInventory,
        isLoading: loadingInventory,
        refetch: refetchInventory
    } = useTableData(inventoryTableId || '');

    const {
        records: rawUnits,
        isLoading: loadingUnits
    } = useTableData(unitsTableId || '');

    // --- Relation Lookups (schema-driven, respects defaultDisplayField) ---
    const { relationLookups: productRelationLookups, isLoadingRelations } = useTableRelationLookups(
        productTable,
        tables
    );

    const isLoading = loadingProducts || loadingInventory || loadingUnits || isLoadingRelations;

    // --- Typed Records ---
    const products = rawProducts as DynamicRecord<ProductData>[];
    const units = rawUnits as DynamicRecord<UnitData>[];
    const inventoryRecords = rawInventory as DynamicRecord<InventoryData>[];

    // --- Inventory Lookup ---
    const inventoryLookup = useMemo((): InventoryLookup => {
        const map: InventoryLookup = {};
        inventoryRecords.forEach((inv) => {
            const pid = inv.data?.productId;
            const uid = inv.data?.unitId;
            if (pid && uid) {
                if (!map[pid]) map[pid] = {};
                map[pid][uid] = inv;
            }
        });
        return map;
    }, [inventoryRecords]);



    // --- Metadata for Filters ---
    const { categories, brands, usageTypes } = useMemo(() => {
        const cats = new Set<string>();
        const brds = new Set<string>();
        const usgs = new Set<string>();

        products.forEach((r) => {
            const d = r.data || {};
            if (d.category) cats.add(String(d.category));
            if (d.brand) brds.add(String(d.brand));
            if (d.usageType) usgs.add(String(d.usageType));
        });

        return {
            categories: Array.from(cats).sort(),
            brands: Array.from(brds).sort(),
            usageTypes: Array.from(usgs).sort(),
        };
    }, [products]);

    // --- Module Capabilities ---
    const hasInventory = !!inventoryTableId;
    const hasUnits = !!unitsTableId;
    const productFieldNames = useMemo(() => {
        const fields = new Set<string>();
        if (isTableSchema(productSchema?.schema) && Array.isArray(productSchema.schema.fields)) {
            productSchema.schema.fields.forEach(f => fields.add(f.name));
        }
        return fields;
    }, [productSchema]);

    // --- Actions ---
    const deleteProduct = useCallback(async (product: DynamicRecord<ProductData>): Promise<void> => {
        if (!productTableId) throw new Error('Product table not found');
        await DynamicTableService.deleteRecord(productTableId, product.id);
        refetchProducts();
    }, [productTableId, refetchProducts]);

    return {
        products,
        units,
        inventoryLookup,
        productSchema,
        inventorySchema,
        productTable,
        productTableId,
        inventoryTableId,
        isLoading,
        refetchProducts,
        refetchInventory,
        deleteProduct,
        categories,
        brands,
        usageTypes,
        hasInventory,
        hasUnits,
        productFieldNames,
        productRelationLookups,
    };
}
