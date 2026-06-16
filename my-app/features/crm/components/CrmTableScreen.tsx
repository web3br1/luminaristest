'use client';

/**
 * CrmTableScreen.tsx
 *
 * @description
 * Canonical CRM list screen. Resolves a single preset table by its stable
 * `internalName` (NEVER by index) and hands it to the canonical
 * `GenericTabbedView`, so create/edit/delete/filter/sort/pagination and
 * relation-lookups all come from the shared dashboard table stack instead of a
 * bespoke read-only table.
 *
 * Table-loading mirrors the dashboard mechanism exactly:
 *   - `DynamicTableService.getTables()` → list (cast to `IDynamicTable[]`),
 *     find by `internalName`.
 *   - `GenericTabbedView` re-fetches the full schema per active table via
 *     `useGenericData → useTableData → DynamicTableService.getTableById`, so the
 *     `tables` prop only needs the resolved table reference.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import type { IDynamicTable } from '../../dashboard/components/shared/dynamic-tables.client';

// GenericTabbedView pulls in the full canonical table stack (dnd-free) and is a
// heavy client-only component — load it dynamically like the dashboard does.
const GenericTabbedView = dynamic(
  () => import('../../dashboard/category-views/shared/GenericTabbedView'),
  { ssr: false },
);

type CrmInternalName = 'crmContacts' | 'crmAccounts' | 'leadProposals';

// Human-readable name fallback (mirrors the canonical resolvers in
// useLeadsView.ts / useFinanceData.ts: `internalName === X || name === 'Human Name'`).
const NAME_FALLBACK: Record<CrmInternalName, string> = {
  crmContacts: 'CRM Contacts',
  crmAccounts: 'CRM Accounts',
  leadProposals: 'Lead Proposals',
};

interface CrmTableScreenProps {
  internalName: CrmInternalName;
  titleKey: string;
  descriptionKey: string;
}

export function CrmTableScreen({ internalName, titleKey, descriptionKey }: CrmTableScreenProps) {
  const { t } = useTranslation('crm');

  const [tables, setTables] = useState<IDynamicTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await DynamicTableService.getTables();
      const list = Array.isArray(res?.data) ? (res.data as unknown as IDynamicTable[]) : [];
      setTables(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tables');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Resolve the target table by stable internalName (PRIMARY), falling back to the
  // human-readable name — never by index [0] (API order varies).
  const table = useMemo(
    () =>
      tables.find(
        (x) => x.internalName === internalName || x.name === NAME_FALLBACK[internalName],
      ) ?? null,
    [tables, internalName],
  );

  const title = t(titleKey);
  const description = t(descriptionKey);

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600/30 border-t-blue-600" />
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {t('common.loading', 'Loading…')}
        </p>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
        {error}
      </div>
    );
  }

  // --- Not-installed state (table missing) ---
  if (!table) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm font-semibold text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
        {t(`${internalName === 'crmContacts' ? 'contacts' : internalName === 'crmAccounts' ? 'accounts' : 'proposals'}.empty`, 'Install the CRM module to get started.')}
      </div>
    );
  }

  // --- Canonical table stack ---
  // CrmLayout's body is a flex column, so `flex-1 min-h-0` lets GenericTabbedView
  // (flex h-full) fill the available height without a magic-number calc; rounded-2xl
  // + dark border keeps it on-brand.
  return (
    <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <GenericTabbedView tables={[table]} title={title} description={description} />
    </div>
  );
}

export default CrmTableScreen;
