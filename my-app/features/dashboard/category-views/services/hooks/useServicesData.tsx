'use client';

/**
 * useServicesData - Hook para dados de serviços
 * 
 * @description
 * Extrai lógica de dados do InternalServicesView seguindo o padrão de useProductsData.
 */

import { useMemo, useCallback } from 'react';
import type { IDynamicTable, ITableSchema } from '../../../components/shared/dynamic-tables.client';
import { useTableData, isTableSchema } from '../../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { useTableRelationLookups } from '../../../shared/hooks/useTableRelationLookups';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ServiceData {
    name?: string;
    serviceName?: string;
    category?: string;
    salePrice?: number;
    price?: number;
    costPrice?: number;
    cost?: number;
    duration?: string;
    isActive?: boolean;
    [key: string]: unknown;
}

export interface ServiceRecord {
    id: string;
    data: ServiceData;
}

export interface ServiceStats {
    total: number;
    active: number;
    inactive: number;
}

// ─────────────────────────────────────────────────────────────
// Return Type
// ─────────────────────────────────────────────────────────────

export interface UseServicesDataReturn {
    // Data
    services: ServiceRecord[];
    categories: string[];


    // Schema & IDs
    serviceTable: IDynamicTable | null;
    tableId: string | null;
    schema: ITableSchema | null;
    serviceFieldNames: Set<string>;

    // State
    isLoading: boolean;

    // Actions
    refetch: () => void;
    deleteService: (service: ServiceRecord) => Promise<void>;
    // Relation Lookups
    serviceRelationLookups: Record<string, Map<string, string>>;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useServicesData(tables: IDynamicTable[]) {
    // --- Table Detection (useMemo — zero extra renders) ---
    const serviceTable = useMemo(
        () =>
            tables.find(t => t.category === 'services') ||
            tables.find(t => t.name.toLowerCase() === 'services') ||
            null,
        [tables]
    );

    const selectedTableId = serviceTable?.id ?? null;

    // Data fetching
    const { table: tableSchema, records, isLoading, refetch } = useTableData(selectedTableId || '');

    // Extract categories from records
    const categories = useMemo(() => {
        const cats = new Set<string>();
        (records as ServiceRecord[]).forEach((r) => {
            if (r.data?.category) cats.add(String(r.data.category));
        });
        return Array.from(cats).sort();
    }, [records]);



    // Get schema for creating/editing — memoized for stable reference
    const schema = useMemo(
        () => tableSchema && isTableSchema(tableSchema.schema) ? tableSchema.schema : null,
        [tableSchema]
    );

    // --- Module Capabilities ---
    const serviceFieldNames = useMemo(() => {
        const fields = new Set<string>();
        if (schema && Array.isArray(schema.fields)) {
            schema.fields.forEach(f => fields.add(f.name));
        }
        return fields;
    }, [schema]);

    // --- Actions ---
    const deleteService = useCallback(async (service: ServiceRecord): Promise<void> => {
        if (!selectedTableId) throw new Error('Services table not found');
        await DynamicTableService.deleteRecord(selectedTableId, service.id);
        refetch();
    }, [selectedTableId, refetch]);

    // --- Relation Lookups (schema-driven, respects defaultDisplayField) ---
    const { relationLookups: serviceRelationLookups, isLoadingRelations } = useTableRelationLookups(
        serviceTable,
        tables
    );

    return {
        // Data
        services: records as ServiceRecord[],
        categories,

        // Schema & IDs
        serviceTable,
        tableId: selectedTableId,
        schema,
        serviceFieldNames,

        // State
        isLoading: isLoading || isLoadingRelations,
        refetch,
        deleteService,
        serviceRelationLookups,
    };
}

export default useServicesData;
