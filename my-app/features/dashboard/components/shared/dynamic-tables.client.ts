import React from 'react';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';

export interface IDynamicTableData {
  id: string;
  data: Record<string, unknown>;
}

export interface ISchemaField { name: string; label?: string; type: string; required?: boolean; hidden?: boolean; readOnly?: boolean; options?: Array<string | { label: string; value: string }>; numberFormat?: 'currency' | 'percentage' | 'integer' | 'decimal'; relation?: { targetTable?: string; allowMultiple?: boolean } }
export interface ITableSchema { defaultDisplayField?: string; fields: ISchemaField[]; ui?: { presentation?: 'standalone' | 'embedded' | 'system' } }

export interface IDynamicTable {
  id: string;
  name: string;
  key?: string;
  internalName?: string | null;
  category?: string;
  schema: ITableSchema | null;
}

export function isTableSchema(value: unknown): value is ITableSchema {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { fields?: unknown }).fields);
}

export function useTableData(tableId: string): {
  table: IDynamicTable | null;
  records: IDynamicTableData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [table, setTable] = React.useState<IDynamicTable | null>(null);
  const [records, setRecords] = React.useState<IDynamicTableData[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAll = React.useCallback(async () => {
    // Guard: skip fetch when tableId is missing or empty.
    if (!tableId || typeof tableId !== 'string' || tableId.trim().length === 0) {
      setTable(null);
      setRecords([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const resTable = await DynamicTableService.getTableById(tableId) as unknown as { data: IDynamicTable };
      setTable(resTable.data);

      // The dynamic-tables API caps a page at 200 and defaults to 50 — without
      // paginating, lists/tables silently truncate at 50 rows. Pull every page.
      const PAGE_SIZE = 200;
      const MAX_PAGES = 1000;
      const first = await DynamicTableService.getTableData(tableId, `page=1&limit=${PAGE_SIZE}`).catch(() => null);
      const all: IDynamicTableData[] = Array.isArray(first?.data) ? (first.data as IDynamicTableData[]) : [];
      const totalPages = Math.min(Number((first as { totalPages?: number } | null)?.totalPages ?? 1), MAX_PAGES);
      for (let page = 2; page <= totalPages; page++) {
        // Per-page catch mirrors crmFetch.ts: one failed page must not abort the whole fetch.
        const next = await DynamicTableService.getTableData(tableId, `page=${page}&limit=${PAGE_SIZE}`).catch(() => null);
        if (Array.isArray(next?.data)) all.push(...(next.data as IDynamicTableData[]));
      }
      setRecords(all);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setIsLoading(false);
    }
  }, [tableId]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  return { table, records, isLoading, error, refetch: fetchAll };
}
