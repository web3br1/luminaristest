/**
 * Normalizers - Utilities for normalizing dynamic table data.
 *
 * @description
 * These utilities produce **flat** records where all fields from `data` are
 * hoisted to the top level alongside `id`. This is the Finance module's
 * domain pattern for Sales and Expenses — it differs intentionally from the
 * Gold Standard `IDynamicTableData` pattern used in Generic/Inventory views
 * (where data is always accessed as `record.data.fieldName`).
 *
 * Use `normalizeRows<T>` only in contexts where the flat domain type
 * (e.g. `SaleRecord`, `SaleItemRecord`) is expected by consumers.
 * For generic table rendering, use `IDynamicTableData` directly.
 */

/**
 * Extract the data object from a table row.
 * Handles both `{ id, data: {...} }` and flat `{ id, ...fields }` formats.
 */
export function extractRowData<T = Record<string, unknown>>(row: unknown): T & { id?: string } {
    if (!row || typeof row !== 'object') {
        return {} as T & { id?: string };
    }

    const r = row as Record<string, unknown>;

    // If row has a nested data object, extract it
    if (r.data && typeof r.data === 'object') {
        return {
            ...(r.data as T),
            id: r.id as string | undefined,
        } as T & { id?: string };
    }

    // Otherwise, row is already flat
    return r as T & { id?: string };
}

/**
 * Normalize an array of table rows to flat objects with id.
 */
export function normalizeRows<T = Record<string, unknown>>(rows: unknown[]): Array<T & { id: string }> {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
        const extracted = extractRowData<T>(row);
        return {
            ...extracted,
            id: extracted.id || (row as Record<string, unknown>)?.id as string || '',
        } as T & { id: string };
    });
}

/**
 * Build a lookup map from table rows.
 * @param rows Array of table rows
 * @param displayField Field to use as the display value (default: 'name')
 */
export function buildLookupMap(
    rows: unknown[],
    displayField: string = 'name'
): Record<string, string> {
    const map: Record<string, string> = {};
    for (const row of rows) {
        const data = extractRowData(row);
        const id = data.id || (row as Record<string, unknown>)?.id;
        if (!id) continue;
        const display = (data as Record<string, unknown>)?.[displayField] || (data as Record<string, unknown>)?.name || id;
        map[String(id)] = String(display);
    }
    return map;
}
