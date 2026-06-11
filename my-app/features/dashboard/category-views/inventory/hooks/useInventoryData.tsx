'use client';

import { useMemo, useCallback } from 'react';
import type { IDynamicTable, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';
import { useTableData } from '../../../components/shared/dynamic-tables.client';
import { useTableRelationLookups } from '../../../shared/hooks/useTableRelationLookups';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';

const MOVEMENTS_EXCLUDED_RELATION_FIELDS = ['productId', 'unitId'];

export function useInventoryData(tables: IDynamicTable[]) {
    // --- Table Detection ---
    const movementsTable    = useMemo(() => tables.find(t => t.category === 'inventory' && t.name.toLowerCase().includes('movemen')), [tables]);
    const productsTable     = useMemo(() => tables.find(t => t.category === 'products' || t.name.toLowerCase() === 'products'), [tables]);
    const unitsTable        = useMemo(() => tables.find(t => t.name.toLowerCase() === 'units'), [tables]);
    const productUnitsTable = useMemo(() => tables.find(t => t.category === 'inventory' && (t.name.toLowerCase().includes('unit') || t.name.toLowerCase() === 'product units')), [tables]);
    const suppliersTable    = useMemo(() => tables.find(t =>
        t.name.toLowerCase().includes('supplier') ||
        t.name.toLowerCase().includes('fornec') ||
        (t.category === 'people' && t.name.toLowerCase() === 'suppliers')
    ), [tables]);

    // --- Data Fetching ---
    const { records: movementRecords,  isLoading: loadingMovements,  refetch: refetchMovements  } = useTableData(movementsTable?.id    || '');
    const { records: productsRecords,  isLoading: loadingProducts                               } = useTableData(productsTable?.id     || '');
    const { records: unitsRecords,     isLoading: loadingUnits                                  } = useTableData(unitsTable?.id        || '');
    const { records: inventoryRecords, isLoading: loadingInventory,  refetch: refetchInventory  } = useTableData(productUnitsTable?.id  || '');

    // --- Relation Lookups (auto-resolved from schema relation fields) ---
    const { relationLookups: movementsRelationLookups, isLoadingRelations: isLoadingMovementsRelations } = useTableRelationLookups(movementsTable, tables, MOVEMENTS_EXCLUDED_RELATION_FIELDS);
    const { relationLookups: inventoryRelationLookups, isLoadingRelations: isLoadingInventoryRelations  } = useTableRelationLookups(productUnitsTable, tables);

    // --- Inventory Lookup Map: productId → unitId → IDynamicTableData ---
    const inventoryLookup = useMemo(() => {
        const map: Record<string, Record<string, IDynamicTableData>> = {};
        for (const inv of inventoryRecords) {
            const d = inv.data;
            const pid = String((d.productId as Record<string, unknown>)?.id ?? d.productId ?? '');
            const uid = String((d.unitId    as Record<string, unknown>)?.id ?? d.unitId    ?? '');
            if (pid && uid) {
                if (!map[pid]) map[pid] = {};
                map[pid][uid] = inv;
            }
        }
        return map;
    }, [inventoryRecords]);

    // --- Name Maps ---
    const productNameMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const p of productsRecords) {
            m[p.id] = String(p.data.name || '—');
        }
        return m;
    }, [productsRecords]);

    const unitNameMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const u of unitsRecords) {
            m[u.id] = String(u.data.name || '—');
        }
        return m;
    }, [unitsRecords]);

    // --- Mutations (Gold Standard pattern — HTTP only in data hook) ---

    const saveInlinePrice = useCallback(async (invRecordId: string, newPrice: number): Promise<void> => {
        if (!productUnitsTable?.id) throw new Error('Inventory table not found');
        await DynamicTableService.updateRecord(productUnitsTable.id, invRecordId, { data: { salePrice: newPrice } });
        refetchInventory();
    }, [productUnitsTable?.id, refetchInventory]);

    const createMovement = useCallback(async (body: Record<string, unknown>): Promise<void> => {
        if (!movementsTable?.id) throw new Error('Movements table not found');
        await DynamicTableService.createRecord(movementsTable.id, { data: body });
        // Refetch both: stock affected by movements + movements list itself
        await Promise.all([refetchInventory(), refetchMovements()]);
    }, [movementsTable?.id, refetchInventory, refetchMovements]);

    return {
        // Tables
        movementsTable,
        productsTable,
        inventoryTable: productUnitsTable,
        suppliersTable,
        movementsTableId:  movementsTable?.id    ?? null,
        productsTableId:   productsTable?.id     ?? null,
        inventoryTableId:  productUnitsTable?.id ?? null,
        suppliersTableId:  suppliersTable?.id    ?? null,

        // Data
        products:         productsRecords,
        inventoryRecords: inventoryRecords,
        units:            unitsRecords,
        movements:        movementRecords,

        // Lookups
        inventoryLookup,
        productNameMap,
        unitNameMap,
        movementsRelationLookups,
        inventoryRelationLookups,

        // Status
        isLoading: loadingProducts || loadingUnits || loadingInventory || loadingMovements
            || isLoadingMovementsRelations || isLoadingInventoryRelations,

        // Actions
        refetchInventory,
        refetchMovements,
        saveInlinePrice,
        createMovement,
    };
}
