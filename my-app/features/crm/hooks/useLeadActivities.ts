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

export interface LeadActivitiesState {
  loading: boolean;
  error: string | null;
  activities: CrmRecord[];
  activitiesTableId: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads the `leadActivities` table (resolved by stable `internalName`, never by
 * index), fetches all rows and narrows them to a single lead's activities of ALL
 * types (stage_change, meeting, proposal, meeting_no_show, email, note, call, …),
 * not just notes. Sorted by `createdAt` descending (newest first). Returns the
 * resolved table id so consumers can resolve relations via the generic service.
 * Degrades gracefully when the table is not installed in the tenant.
 *
 * An activity is one `leadActivities` row `{ leadId, type, message, actorId? }`
 * — no schema change (mirrors `useLeadNotes`, which narrows to `type === 'note'`).
 */
export function useLeadActivities(leadId: string, type?: string): LeadActivitiesState {
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
      setError(e instanceof Error ? e.message : 'Falha ao carregar atividades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Narrow to this lead's activities (optionally a single `type`), then sort by
  // createdAt desc (newest first). Memoized so modal re-renders don't recompute.
  const activities = useMemo(() => {
    return rows
      .filter((r) => String(r.data?.leadId ?? '') === leadId && (!type || String(r.data?.type ?? '') === type))
      .sort((a, b) => {
        const ca = String(a.createdAt ?? '');
        const cb = String(b.createdAt ?? '');
        if (ca === cb) return 0;
        return ca < cb ? 1 : -1;
      });
  }, [rows, leadId, type]);

  return { loading, error, activities, activitiesTableId, reload };
}
