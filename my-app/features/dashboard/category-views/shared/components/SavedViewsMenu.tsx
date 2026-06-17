'use client';

/**
 * SavedViewsMenu — compact header control for backend-shared Saved Views.
 *
 * Opt-in: rendered by GenericTabbedView only when `enableSavedViews && !isWidgetMode`.
 * Lets the user pick a saved view (apply), capture the current filter/sort state as
 * a new view, and delete the selected view. Pure presentational — all persistence
 * goes through the `useTableViews` hook owned by the parent.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { MdSave, MdDelete } from 'react-icons/md';
import type { SavedView } from '../../../../../lib/services/savedView.service';

interface SavedViewsMenuProps {
  views: SavedView[];
  selectedViewId: string;
  onApply: (id: string) => void;
  onSave: (name: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  loading?: boolean;
}

export function SavedViewsMenu({
  views,
  selectedViewId,
  onApply,
  onSave,
  onDelete,
  loading = false,
}: SavedViewsMenuProps) {
  const { t } = useTranslation(['database', 'common']);
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');

  const handleConfirmSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSave(trimmed);
    setName('');
    setIsNaming(false);
  }, [name, onSave]);

  const handleCancelSave = useCallback(() => {
    setName('');
    setIsNaming(false);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedViewId}
        onChange={(e) => onApply(e.target.value)}
        disabled={loading}
        aria-label={t('database:views.apply', 'Apply view')}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200"
      >
        <option value="">
          {views.length === 0
            ? t('database:views.empty', 'No saved views')
            : t('database:views.none', 'Default view')}
        </option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      {selectedViewId && (
        <button
          type="button"
          onClick={() => onDelete(selectedViewId)}
          disabled={loading}
          aria-label={t('database:views.delete', 'Delete view')}
          title={t('database:views.delete', 'Delete view')}
          className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60"
        >
          <MdDelete size={16} />
        </button>
      )}

      {isNaming ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={name}
            autoFocus
            placeholder={t('database:views.placeholder', 'View name')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConfirmSave();
              if (e.key === 'Escape') handleCancelSave();
            }}
            aria-label={t('database:views.name', 'View name')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200"
          />
          <button
            type="button"
            onClick={() => void handleConfirmSave()}
            disabled={loading || !name.trim()}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {t('database:views.save', 'Save')}
          </button>
          <button
            type="button"
            onClick={handleCancelSave}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800"
          >
            {t('common:cancel', 'Cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsNaming(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200 dark:hover:bg-neutral-700"
        >
          <MdSave size={16} />
          {t('database:views.save_as', 'Save view')}
        </button>
      )}
    </div>
  );
}

export default SavedViewsMenu;
