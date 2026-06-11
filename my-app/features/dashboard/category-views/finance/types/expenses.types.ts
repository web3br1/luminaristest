/**
 * Expenses Types - Domain-specific types for the Expenses feature
 */

export interface ExpenseData {
    description?: string;
    amount?: number;
    valor?: number;
    date?: string;
    category?: string;
    paymentStatus?: string;
    status?: string;
    isPlanned?: boolean;
    [key: string]: unknown;
}

/**
 * Finance-domain record for expenses.
 * Structurally compatible with IDynamicTableData — `data` field is typed as
 * ExpenseData for domain-specific field access in ExpensesRow/ExpensesTable.
 * The index signature was intentionally removed: it undermined type safety by
 * making every property access return `unknown` regardless of declared type.
 */
export interface ExpenseRecord {
    id: string;
    data: ExpenseData;
}
