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

export interface LeadNotesState {
  loading: boolean;
  error: string | null;
  notes: CrmRecord[];
  activitiesTableId: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads the `leadActivities` table (resolved by stable `internalName`, never by
 * index), fetches all rows and narrows them to a single lead's notes
 * (`type === 'note'`). Sorted by `createdAt` descending (newest first). Returns
 * the resolved table id so the panel can create notes via the generic service.
 * Degrades gracefully when the table is not installed in the tenant.
 *
 * A note is one `leadActivities` row `{ leadId, type: 'note', message, actorId? }`
 * — no schema change (mirrors `useLeadTasks`).
 */
export function useLeadNotes(leadId: string): LeadNotesState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activitiesTableId, setActivitiesTableId] = useState<string | null>(null);
  const [rows, setRows] = useState<CrmRecord[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tablesRes = await DynamicTableService.getTables();
      const tables: DynTable[] = (tablesRes?.data ?? []) as DynTable[];
      const activitiesTable = tables.find((x) => x?.internalName === 'leadActivities') ?? null;
      setActivitiesTableId(activitiesTable?.id ?? null);
      if (!activitiesTable?.id) {
        // leadActivities table not installed in this tenant — degrade gracefully.
        setRows([]);
        return;
      }
      setRows((await fetchAllRows(activitiesTable.id)) as CrmRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar notas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Narrow to this lead's notes, then sort by createdAt desc (newest first).
  // Memoized so re-renders of the modal don't recompute (contract §3).
  const notes = useMemo(() => {
    return rows
      .filter((r) => String(r.data?.leadId ?? '') === leadId && String(r.data?.type ?? '') === 'note')
      .sort((a, b) => {
        const ca = String(a.createdAt ?? '');
        const cb = String(b.createdAt ?? '');
        if (ca === cb) return 0;
        return ca < cb ? 1 : -1;
      });
  }, [rows, leadId]);

  return { loading, error, notes, activitiesTableId, reload };
}
