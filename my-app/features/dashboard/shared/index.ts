/**
 * @module dashboard/shared
 *
 * Shared building-blocks for the Dashboard feature.
 * These are **schema-agnostic** — they accept typed props but carry no
 * business-domain knowledge themselves.
 *
 * Import guidelines
 * -----------------
 * Prefer named imports from this barrel for components/hooks/utils that are
 * used across multiple category-views. For intra-view-only imports (e.g. a
 * component that lives inside `finance/` and is only used there) continue to
 * use direct relative imports to keep bundle splits clean.
 *
 * Deprecated exports
 * ------------------
 * `useRelationLookups` — still exported for the single Finance Analytics
 * caller (`KpiDrillDownDrawer`). Migration to `useTableRelationLookups` is
 * deferred to the Finance Analytics Gold Standard stage. Do NOT add new
 * callers.
 */

// ─── Components ─────────────────────────────────────────────────────────────

/** Animated sidebar that collapses to an icon strip. */
export { CollapsibleSidebar } from './components/CollapsibleSidebar';

/** Modal that asks the user to confirm a destructive delete action. */
export { ConfirmDeleteModal } from './components/ConfirmDeleteModal';

/** Slide-over panel for toggling + reordering table columns. */
export { CustomizeColumnsPanel } from './components/CustomizeColumnsPanel';

/** Standardised empty-state illustration + message. */
export { EmptyState } from './components/EmptyState';

/** Draggable sidebar panel with min/max width constraints. */
export { ResizableSidebar } from './components/ResizableSidebar';

/** Single draggable column-toggle row (used inside CustomizeColumnsPanel). */
export { SortableColumnItem } from './components/SortableColumnItem';

/** Accessible pagination bar with page numbers and prev/next controls. */
export { StandardPagination } from './components/StandardPagination';

/** Truncates long strings with a "…show more" toggle. */
export { TruncatedText } from './components/TruncatedText';

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Returns a `renderCell` function aware of the active locale and currency.
 * Use this in table columns to format typed values consistently.
 */
export { useRenderTypedValue } from './hooks/useRenderTypedValue';

/**
 * Resolves relation FK values into human-readable display strings.
 * Fetches data for every `relation`-typed field in the provided schema.
 *
 * @param table  - The `IDynamicTable` whose schema drives the fetch.
 * @param tables - Full table list (used to resolve target table IDs).
 */
export { useTableRelationLookups } from './hooks/useTableRelationLookups';

/**
 * @deprecated Use `useTableRelationLookups` instead.
 * Kept only for `KpiDrillDownDrawer` in Finance Analytics — do not add
 * new callers.
 */
export { useRelationLookups } from './hooks/useRelationLookups';

// ─── Utils ───────────────────────────────────────────────────────────────────

/**
 * Pure formatting helpers: `formatDate`, `formatCurrency`, `formatNumber`,
 * `renderTypedValue`, and friends.
 * Re-exported wholesale — individual names are stable and tree-shaken.
 */
export * from './utils/formatters';
