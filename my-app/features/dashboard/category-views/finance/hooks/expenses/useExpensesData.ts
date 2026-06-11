'use client';

import { useCallback } from 'react';
import type { IDynamicTable } from '../../../../components/shared/dynamic-tables.client';
import { useTableData } from '../../../../components/shared/dynamic-tables.client';
import { useTableRelationLookups } from '../../../../shared/hooks/useTableRelationLookups';
import { DynamicTableService } from '../../../../../../lib/services/dynamic-table.service';
import { ExpenseRecord } from '../../types/expenses.types';

export function useExpensesData(expensesTable: IDynamicTable, allTables?: IDynamicTable[]) {
    const { table: tableData, records, isLoading: isLoadingData, error, refetch } = useTableData(expensesTable.id || '');

    // Shared hook — resolves defaultDisplayField via allTables (zero extra HTTP calls)
    const { relationLookups, isLoadingRelations } = useTableRelationLookups(tableData, allTables);

    // Delete delegated to hook — view stays HTTP-free
    const deleteRecord = useCallback(async (record: { id: string }) => {
        await DynamicTableService.deleteRecord(expensesTable.id, record.id);
        refetch();
    }, [expensesTable.id, refetch]);

    return {
        tableData,
        records: records as ExpenseRecord[] | null,
        isLoading: isLoadingData || isLoadingRelations,
        error,
        refetch,
        relationLookups,
        deleteRecord,
    };
}
