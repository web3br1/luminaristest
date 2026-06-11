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
      const resTable: { data: IDynamicTable } = await DynamicTableService.getTableById(tableId);
      setTable(resTable.data);

      const resData = await DynamicTableService.getTableData(tableId);
      setRecords(resData.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setIsLoading(false);
    }
  }, [tableId]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  return { table, records, isLoading, error, refetch: fetchAll };
}
