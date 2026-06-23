'use client';

import { useEffect, useMemo, useState } from 'react';
import { isTableSchema, type IDynamicTableData } from '../../dashboard/components/shared/dynamic-tables.client';
import { useAuth } from '../../../lib/context/AuthContext';
import { fetchAllRows } from '../lib/crmFetch';
import { pickDisplayName } from './useActorNames';
import type { CrmRecord } from './useCrmData';

export const OWNER_FILTER_ALL = '__all__';

export interface OwnerOption {
  id: string;
  name: string;
  /** The employee row's email (for "Meus registros" self-resolution). */
  email: string;
}

export interface OwnerFilterState {
  /** The detected owner relation field name (`assigneeId`/`ownerId`), or null. */
  ownerField: string | null;
  /** Selectable owners (id → name), built from the related employees table. */
  options: OwnerOption[];
  /** Currently selected owner id, or `OWNER_FILTER_ALL`. */
  selectedOwnerId: string;
  setSelectedOwnerId: (id: string) => void;
  /** True when more than one distinct owner exists AND the options are loaded. */
  hasMultipleOwners: boolean;
  /** Resolved owner (employee) id of the current auth user, or null. */
  myOwnerId: string | null;
  /** True when the current user maps to a known owner (the "mine" toggle is usable). */
  canUseMine: boolean;
  /** "Meus registros" toggle — when on (and resolvable), restricts to myOwnerId. */
  mine: boolean;
  setMine: (mine: boolean) => void;
  /** Filters a record list by the selected owner (client-side, memoize at call). */
  filterByOwner: <T extends CrmRecord>(records: T[]) => T[];
}

/**
 * Auto-detects the owner relation field (`assigneeId`/`ownerId`) on a leads-like
 * schema, loads the related employees table to populate a `<select>`, and exposes
 * a client-side filter. Mirrors the ownerMap auto-detection in `useLeadsView`.
 *
 * Also resolves the current auth user to an owner (employee) id by matching email
 * (fallback name) against the loaded employee options, powering a "Meus registros"
 * toggle that overrides the select.
 */
export function useOwnerFilter(schema: unknown, records: CrmRecord[]): OwnerFilterState {
  const { user } = useAuth();
  const [options, setOptions] = useState<OwnerOption[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(OWNER_FILTER_ALL);
  const [mine, setMine] = useState<boolean>(false);

  // Resolve the owner relation field + its target (employees) table id from schema.
  const owner = useMemo(() => {
    if (!isTableSchema(schema)) return { field: null as string | null, targetTable: null as string | null };
    const field = schema.fields.find(
      (f) => (f.name === 'assigneeId' || f.name === 'ownerId') && f.type === 'relation',
    );
    return { field: field?.name ?? null, targetTable: field?.relation?.targetTable ?? null };
  }, [schema]);

  // Load the employees table once we know the target, build id → {name,email} (mirror
  // of useLeadsView's ownerMap construction). Paginate (fetch-all) so owners past the
  // API's default 50-row page are not silently dropped (contract §3).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!owner.targetTable) {
        setOptions([]);
        return;
      }
      try {
        const rows = (await fetchAllRows(owner.targetTable)) as IDynamicTableData[];
        const mapped = rows.map((row) => {
          const d = (row?.data ?? {}) as Record<string, unknown>;
          return { id: String(row.id), name: pickDisplayName(d, String(row.id)), email: String(d.email ?? '').trim() };
        });
        if (!cancelled) setOptions(mapped);
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner.targetTable]);

  // Distinct owners present in the data. Gate the visible filter additionally on
  // options.length > 1 so a failed employees fetch (only "All" available) hides it.
  const hasMultipleOwners = useMemo(() => {
    if (!owner.field || options.length <= 1) return false;
    const seen = new Set<string>();
    for (const r of records) {
      const v = String(r.data?.[owner.field] ?? '');
      if (v) seen.add(v);
    }
    return seen.size > 1;
  }, [records, owner.field, options.length]);

  // Resolve the current user to an owner id: case-insensitive email match, falling
  // back to name. user.id is the auth-account id (NOT the employee row id), so we
  // must match by email/name against the employee options.
  const myOwnerId = useMemo<string | null>(() => {
    const email = user?.email?.trim().toLowerCase();
    const name = user?.name?.trim().toLowerCase();
    if (email) {
      const byEmail = options.find((o) => o.email.trim().toLowerCase() === email);
      if (byEmail) return byEmail.id;
    }
    if (name) {
      const byName = options.find((o) => o.name.trim().toLowerCase() === name);
      if (byName) return byName.id;
    }
    return null;
  }, [user?.email, user?.name, options]);

  const canUseMine = myOwnerId !== null;

  const filterByOwner = useMemo(() => {
    const field = owner.field;
    // "Mine" overrides the select when the current user resolves to an owner.
    const effectiveOwnerId = mine && myOwnerId ? myOwnerId : selectedOwnerId;
    return <T extends CrmRecord>(list: T[]): T[] => {
      if (!field || effectiveOwnerId === OWNER_FILTER_ALL) return list;
      return list.filter((r) => String(r.data?.[field] ?? '') === effectiveOwnerId);
    };
  }, [owner.field, selectedOwnerId, mine, myOwnerId]);

  return {
    ownerField: owner.field,
    options,
    selectedOwnerId,
    setSelectedOwnerId,
    hasMultipleOwners,
    myOwnerId,
    canUseMine,
    mine,
    setMine,
    filterByOwner,
  };
}
