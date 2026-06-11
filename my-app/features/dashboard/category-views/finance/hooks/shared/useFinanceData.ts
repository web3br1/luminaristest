'use client';

/**
 * useFinanceData - Data Hook for Finance module
 * Handles discovery of Expenses, Sales, and SaleItems tables
 * based on internalName, category+name pattern, or display name.
 */

import { useMemo } from 'react';
import type { IDynamicTable } from '../../../../components/shared/dynamic-tables.client';

export function useFinanceData(tables: IDynamicTable[]) {
    // Single useMemo — one iteration per [tables] change for all three discoveries
    const { expensesTable, salesTable, saleItemsTable } = useMemo(() => ({
        expensesTable: tables.find(t =>
            t.internalName === 'expenses' ||
            (t.category === 'finance' && /^expenses?$/i.test(t.name)) ||
            t.name.toLowerCase().includes('despesa')
        ) ?? null,

        salesTable: tables.find(t =>
            t.internalName === 'sales' ||
            (t.category === 'finance' && /^sales?$/i.test(t.name)) ||
            t.name.toLowerCase().includes('venda')
        ) ?? null,

        saleItemsTable: tables.find(t =>
            t.internalName === 'saleItems' ||
            (t.category === 'finance' && /^sale[ -]?items$/i.test(t.name)) ||
            t.name.toLowerCase().includes('item')
        ) ?? null,
    }), [tables]);

    return {
        expensesTable,
        salesTable,
        saleItemsTable,
        hasTables: Boolean(expensesTable || salesTable),
    };
}
