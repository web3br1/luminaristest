'use client';

import { useEffect, useMemo, useState } from 'react';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { fetchAllRows } from '../lib/crmFetch';
import { isTableSchema, type ITableSchema } from '../../dashboard/components/shared/dynamic-tables.client';

export interface ActorOption {
  id: string;
  name: string;
  email: string;
}

/**
 * Display name for an employee/actor row, with the canonical fallback chain used
 * across the CRM panels and `useOwnerFilter`. Returns `fallbackId` when nothing
 * usable is present.
 */
export function pickDisplayName(data: Record<string, unknown> | undefined, fallbackId: string): string {
  const dd = data ?? {};
  const first = String(dd.firstName ?? '').trim();
  const last = String(dd.lastName ?? '').trim();
  const full = String(dd.fullName ?? '').trim();
  const email = String(dd.email ?? '').trim();
  return (
    full ||
    [first, last].filter(Boolean).join(' ').trim() ||
    String(dd.name ?? '').trim() ||
    String(dd.username ?? '').trim() ||
    email ||
    fallbackId
  );
}

export interface ActorNamesState {
  /** The resolved actor rows (id + display name + email). */
  actors: ActorOption[];
  /** id → display name lookup ('' when unknown/empty). */
  actorName: (id: unknown) => string;
  /** The host table schema, so callers can derive capability flags without re-fetching. */
  schema: ITableSchema | null;
}

/**
 * Resolves the relation `relationField` on `tableId` to its target (employees)
 * table, loads it once, and exposes an id → name lookup. Replaces the per-panel
 * copies in LeadNotes/Tasks/TimelinePanel (same logic, only the relation field
 * name varied). Returns the host schema so panels keep their capability checks
 * (supportsNotes / supportsLeadLink) off a single fetch. Degrades gracefully.
 */
export function useActorNames(tableId: string | null, relationField: string): ActorNamesState {
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [schema, setSchema] = useState<ITableSchema | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tableId) {
        setActors([]);
        setSchema(null);
        return;
      }
      try {
        const meta = await DynamicTableService.getTableById(tableId);
        const sch = (meta as { schema?: unknown })?.schema;
        if (!isTableSchema(sch)) {
          if (!cancelled) {
            setActors([]);
            setSchema(null);
          }
          return;
        }
        if (!cancelled) setSchema(sch);
        const field = sch.fields.find((f) => f.name === relationField && f.type === 'relation');
        const targetTable = field?.relation?.targetTable ?? null;
        if (!targetTable) {
          if (!cancelled) setActors([]);
          return;
        }
        const rows = await fetchAllRows(targetTable);
        const mapped = rows.map((row) => {
          const dd = (row?.data ?? {}) as Record<string, unknown>;
          return { id: String(row.id), name: pickDisplayName(dd, String(row.id)), email: String(dd.email ?? '').trim() };
        });
        if (!cancelled) setActors(mapped);
      } catch {
        if (!cancelled) {
          setActors([]);
          setSchema(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId, relationField]);

  const actorName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of actors) map.set(a.id, a.name);
    return (id: unknown): string => {
      const key = String(id ?? '');
      if (!key) return '';
      return map.get(key) ?? '';
    };
  }, [actors]);

  return { actors, actorName, schema };
}
