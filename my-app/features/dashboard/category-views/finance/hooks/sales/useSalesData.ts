'use client';

import { useMemo, useState, useCallback } from 'react';
import type { IDynamicTable } from '../../../../components/shared/dynamic-tables.client';
import { useTableData } from '../../../../components/shared/dynamic-tables.client';
import { normalizeRows } from '../../utils/normalizers';
import { useSalesAnalytics } from '../analytics/useSalesAnalytics';
import { useFinanceData } from '../shared/useFinanceData';
import { useTableRelationLookups } from '../../../../shared/hooks/useTableRelationLookups';
import { FinanceService } from '../../services/FinanceService';
import { SaleRecord, SaleItemRecord } from '../../types/sales.types';
import type { StockIndexEntry } from '../../components/sales/create/types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function mapToRecord(m?: Map<string, string>): Record<string, string> {
    return m ? Object.fromEntries(m) : {};
}

// ─────────────────────────────────────────────────────────────

/**
 * Hook para gerenciar o carregamento e normalização de dados de vendas
 */
export function useSalesData(tables: IDynamicTable[]) {
    // 1. Descoberta de tabelas
    const { salesTable, saleItemsTable } = useFinanceData(tables);

    // 2. Descoberta da tabela de product units (para stock lookup no wizard)
    const productUnitsTable = useMemo(
        () => tables.find(t =>
            t.name === 'Product Units' ||
            t.name === 'productUnits' ||
            (t.category === 'inventory' && t.name.toLowerCase().includes('unit'))
        ) || null,
        [tables]
    );

    // 3. Fetch de dados
    const {
        records: saleRecords,
        isLoading: isLoadingSales,
        refetch
    } = useTableData(salesTable?.id || '');

    const {
        table: saleItemsData,
        records: saleItemRecords,
        isLoading: isLoadingItems,
        refetch: refetchItems
    } = useTableData(saleItemsTable?.id || '');

    const { records: rawProductUnits } = useTableData(productUnitsTable?.id || '');

    // 4. Normalização
    const salesList = useMemo(() => normalizeRows<SaleRecord>(saleRecords || []), [saleRecords]);
    const itemsList = useMemo(() => normalizeRows<SaleItemRecord>(saleItemRecords || []), [saleItemRecords]);

    // 5. Stock index — flat map `${productId}|${unitId}` → { stock, reserved, salePrice }
    const stockIndex = useMemo((): Record<string, StockIndexEntry> => {
        const idx: Record<string, StockIndexEntry> = {};
        (rawProductUnits || []).forEach(pu => {
            // useTableData always returns IDynamicTableData — pu.data is Record<string, unknown>
            const d = pu.data;
            if (!d?.productId || !d?.unitId) return;
            const key = `${String(d.productId)}|${String(d.unitId)}`;
            idx[key] = {
                stock: Number(d.stock ?? 0),
                reserved: Number(d.reserved ?? 0),
                salePrice: Number(d.salePrice ?? 0),
            };
        });
        return idx;
    }, [rawProductUnits]);

    // 6. Analytics
    const analytics = useSalesAnalytics(saleRecords || [], saleItemRecords || []);

    // 7. Relation Maps — useTableRelationLookups (Gold Standard)
    const { relationLookups: salesLookups, isLoadingRelations: isLoadingSalesRel } =
        useTableRelationLookups(salesTable, tables);
    const { relationLookups: itemsLookups, isLoadingRelations: isLoadingItemsRel } =
        useTableRelationLookups(saleItemsData, tables);
    const isLoadingRelations = isLoadingSalesRel || isLoadingItemsRel;

    const customerNameMap = useMemo(() => mapToRecord(salesLookups.customerId), [salesLookups]);
    const unitNameMap     = useMemo(() => mapToRecord(salesLookups.unitId),     [salesLookups]);
    const productNameMap  = useMemo(() => mapToRecord(itemsLookups.productId),  [itemsLookups]);
    const serviceNameMap  = useMemo(() => mapToRecord(itemsLookups.serviceId),  [itemsLookups]);

    // 8. Mutation: updateSale
    const [updating, setUpdating] = useState<string | null>(null);

    const updateSale = useCallback(async (
        saleId: string,
        payload: Record<string, unknown>,
        successMessage?: string
    ): Promise<void> => {
        if (!salesTable?.id) return;
        try {
            setUpdating(saleId);
            await FinanceService.updateSale(salesTable.id, saleId, payload, successMessage);
            await Promise.all([refetch(), refetchItems()]);
        } catch {
            // Erro notificado pelo apiClient
        } finally {
            setUpdating(null);
        }
    }, [salesTable?.id, refetch, refetchItems]);

    const isLoading = isLoadingSales || isLoadingItems || isLoadingRelations;

    return {
        salesTable,
        saleItemsTable,
        salesList,
        itemsList,
        analytics,
        stockIndex,
        productNameMap,
        serviceNameMap,
        customerNameMap,
        unitNameMap,
        isLoading,
        refetch,
        refetchItems,
        updating,
        updateSale,
    };
}
