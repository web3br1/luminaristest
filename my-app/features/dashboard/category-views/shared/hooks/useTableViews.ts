'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SavedViewService,
  type SavedView,
  type SavedViewConfig,
} from '../../../../../lib/services/savedView.service';

/**
 * useTableViews — backend-shared Saved Views for the canonical table stack.
 *
 * Opt-in: only loads/mutates when `enabled` is true (and a real tableId exists).
 * SSR-safe (no window/localStorage; fetch is effect-gated). When disabled it is a
 * no-op shell so callers can call it unconditionally (Rules of Hooks).
 *
 * The "view" payload is the serializable GenericTabbedView state:
 *   { query, fieldFilters, sortConfig }.
 */
export interface UseTableViewsResult {
  views: SavedView[];
  loading: boolean;
  saveView: (name: string, config: SavedViewConfig) => Promise<void>;
  applyView: (id: string) => SavedViewConfig | null;
  deleteView: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useTableViews(tableId: string, enabled: boolean): UseTableViewsResult {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);

  const active = enabled && Boolean(tableId);

  const reload = useCallback(async () => {
    if (!active) {
      setViews([]);
      return;
    }
    setLoading(true);
    try {
      const res = await SavedViewService.listViews(tableId);
      setViews(res.success ? res.data : []);
    } catch {
      setViews([]);
    } finally {
      setLoading(false);
    }
  }, [active, tableId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!active) {
        setViews([]);
        return;
      }
      setLoading(true);
      try {
        const res = await SavedViewService.listViews(tableId);
        if (!cancelled) setViews(res.success ? res.data : []);
      } catch {
        if (!cancelled) setViews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, tableId]);

  const saveView = useCallback(
    async (name: string, config: SavedViewConfig) => {
      if (!active) return;
      await SavedViewService.createView({ tableId, name, config });
      await reload();
    },
    [active, tableId, reload],
  );

  const applyView = useCallback(
    (id: string): SavedViewConfig | null => {
      const view = views.find((v) => v.id === id);
      return view ? view.config : null;
    },
    [views],
  );

  const deleteView = useCallback(
    async (id: string) => {
      if (!active) return;
      await SavedViewService.deleteView(id);
      await reload();
    },
    [active, reload],
  );

  return { views, loading, saveView, applyView, deleteView, reload };
}

export default useTableViews;
