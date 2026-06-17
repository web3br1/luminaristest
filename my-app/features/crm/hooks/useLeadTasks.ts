'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { fetchAllRows } from '../lib/crmFetch';
import type { CrmRecord } from './useCrmData';

interface DynTable {
  id: string;
  internalName?: string;
  schema?: unknown;
}

export interface LeadTasksState {
  loading: boolean;
  error: string | null;
  tasks: CrmRecord[];
  tasksTableId: string | null;
  reload: () => Promise<void>;
}

// Status ordering for the secondary sort (open work first, Done last).
const STATUS_ORDER: Record<string, number> = {
  'To Do': 0,
  'In Progress': 1,
  'In Review': 2,
  Done: 3,
};

/**
 * Loads the `tasks` table (resolved by stable `internalName`, never by index),
 * fetches all rows and narrows them to a single lead. Sorted by due date (`date`)
 * ascending, then by status so open work surfaces first. Returns the resolved
 * table id so the panel can create/update records via the generic service.
 */
export function useLeadTasks(leadId: string): LeadTasksState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasksTableId, setTasksTableId] = useState<string | null>(null);
  const [rows, setRows] = useState<CrmRecord[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tablesRes = await DynamicTableService.getTables();
      const tables: DynTable[] = (tablesRes?.data ?? []) as DynTable[];
      const tasksTable = tables.find((x) => x?.internalName === 'tasks') ?? null;
      setTasksTableId(tasksTable?.id ?? null);
      if (!tasksTable?.id) {
        // tasks table not installed in this tenant — degrade gracefully.
        setRows([]);
        return;
      }
      setRows((await fetchAllRows(tasksTable.id)) as CrmRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Narrow to this lead, then sort by due date asc, status as tiebreaker.
  // Memoized so re-renders of the modal don't recompute (contract §3).
  const tasks = useMemo(() => {
    return rows
      .filter((r) => String(r.data?.leadId ?? '') === leadId)
      .sort((a, b) => {
        const da = String(a.data?.date ?? '');
        const db = String(b.data?.date ?? '');
        if (da !== db) return da < db ? -1 : 1;
        const sa = STATUS_ORDER[String(a.data?.status ?? '')] ?? 99;
        const sb = STATUS_ORDER[String(b.data?.status ?? '')] ?? 99;
        return sa - sb;
      });
  }, [rows, leadId]);

  return { loading, error, tasks, tasksTableId, reload };
}
