import { useCallback, useEffect, useState } from 'react';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { fetchAllRows } from '../lib/crmFetch';
import type { CrmRecord } from './useCrmData';

interface DynTable {
  id: string;
  internalName?: string;
  schema?: unknown;
}

export interface CrmTableState {
  loading: boolean;
  error: string | null;
  table: DynTable | null;
  rows: CrmRecord[];
  reload: () => Promise<void>;
}

/**
 * Generic loader for a single CRM/preset table, resolved by its stable
 * `internalName` (e.g. 'crmContacts', 'leadProposals'). Returns the rows so
 * list screens can render them without bespoke fetching logic.
 */
export function useCrmTable(internalName: string): CrmTableState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState<DynTable | null>(null);
  const [rows, setRows] = useState<CrmRecord[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tablesRes = await DynamicTableService.getTables();
      const tables: DynTable[] = tablesRes?.data ?? tablesRes ?? [];
      const t = tables.find((x) => x?.internalName === internalName) ?? null;
      setTable(t);
      if (!t?.id) {
        setRows([]);
        return;
      }
      setRows((await fetchAllRows(t.id)) as CrmRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [internalName]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loading, error, table, rows, reload };
}
