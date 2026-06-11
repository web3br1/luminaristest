'use client';

/**
 * useGenericData — Hook de dados para a GenericTabbedView
 *
 * @description
 * Extrai toda a lógica de dados (fetch, relation lookups, delete) do GenericTabbedView,
 * seguindo exatamente o padrão estabelecido em useServicesData / useProductsData.
 * Implementa Pattern A (single table por vez) da skill ui-relation-resolving.
 *
 * Relation lookups são resolvidos pelo hook compartilhado useTableRelationLookups,
 * que respeita defaultDisplayField da tabela alvo e aceita allTables para
 * eliminar requests HTTP extras (zero-cost local resolution).
 */

import { useCallback } from 'react';
import {
    useTableData,
    isTableSchema,
    type IDynamicTable,
    type IDynamicTableData,
} from '../../../components/shared/dynamic-tables.client';
import type { ITableSchema } from '../../../components/shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { useTableRelationLookups } from '../../../shared/hooks/useTableRelationLookups';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type GenericRecord = IDynamicTableData;

export interface UseGenericDataReturn {
    /** Fetched records for the active table */
    records: GenericRecord[];
    /** Full table metadata (id, name, internalName, etc.) */
    table: IDynamicTable | null;
    /** Validated ITableSchema or null */
    schema: ITableSchema | null;
    /** Loading state */
    isLoading: boolean;
    /** Error string or null */
    error: string | null;
    /** Re-fetch trigger */
    refetch: () => void;
    /** Relation lookups: fieldName → Map<recordId, displayLabel> */
    relationLookups: Record<string, Map<string, string>>;
    /** Soft delete a record from the active table */
    deleteRecord: (record: GenericRecord) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useGenericData(activeTableId: string, allTables?: IDynamicTable[]): UseGenericDataReturn {
    const { table, records, isLoading, error, refetch } = useTableData(activeTableId || '');

    // Derive validated schema
    const schema = table && isTableSchema(table.schema) ? table.schema : null;

    // Shared hook — resolves defaultDisplayField via allTables (zero extra HTTP calls)
    const { relationLookups, isLoadingRelations } = useTableRelationLookups(table, allTables);

    // --- Soft Delete ---
    const deleteRecord = useCallback(
        async (record: GenericRecord): Promise<void> => {
            if (!activeTableId) throw new Error('No active table selected');
            await DynamicTableService.deleteRecord(activeTableId, record.id);
            refetch();
        },
        [activeTableId, refetch]
    );

    return {
        records,
        table: table ?? null,
        schema,
        isLoading: isLoading || isLoadingRelations,
        error: error ?? null,
        refetch,
        relationLookups,
        deleteRecord,
    };
}

export default useGenericData;
