'use client';

/**
 * ExpensesView - View Shell for Finance Expenses
 * 
 * @description
 * Acts as a container for the Expenses domain.
 * Delegates data fetching to useExpensesData and UI logic to useExpensesLogic.
 * Renders the InternalExpensesView with the resolved data and logic.
 */

import React from 'react';
import type { IDynamicTable } from '../../../components/shared/dynamic-tables.client';
// Hooks
import { useExpensesData } from '../hooks/expenses/useExpensesData';
import { useExpensesLogic } from '../hooks/expenses/useExpensesLogic';
import { InternalExpensesView } from './InternalExpensesView';

interface ExpensesViewProps {
    expensesTable: IDynamicTable;
    allTables?: IDynamicTable[];
    isWidgetMode?: boolean;
    isFilterOpenOverride?: boolean;
    /** Incrementado por FinanceView após criação — dispara refetch aqui */
    refreshKey?: number;
}

export function ExpensesView({ expensesTable, allTables, isWidgetMode, isFilterOpenOverride, refreshKey }: ExpensesViewProps) {
    // 1. Fetch & Resolve Data (Schema + Records + Relations)
    const {
        tableData: tSchema,
        records,
        refetch,
        isLoading,
        error,
        relationLookups,
        deleteRecord,
    } = useExpensesData(expensesTable, allTables);

    // 2. Initialize Business Logic (Filtering + Pagination + Sort)
    const logic = useExpensesLogic(tSchema, records, relationLookups);

    // 3. Render Internal View
    return (
        <InternalExpensesView
            tSchema={tSchema}
            refetch={refetch}
            isLoading={isLoading}
            error={error}
            logic={logic}
            relationLookups={relationLookups}
            deleteRecord={deleteRecord}
            isWidgetMode={isWidgetMode}
            isFilterOpenOverride={isFilterOpenOverride}
            refreshKey={refreshKey}
        />
    );
}
