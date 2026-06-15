/**
 * presentationUtils.ts
 *
 * Single source of truth for table presentation classification.
 * Reads schema.ui.presentation; defaults to 'standalone' when absent.
 *
 * Rules:
 *  - 'standalone' → appears in category views, navigable.
 *  - 'embedded'   → child/detail of another table (e.g. saleItems); not navigable standalone.
 *  - 'system'     → internal infrastructure; never navigable by end-users.
 */

import type { IDynamicTable, ITableSchema } from '../../../components/shared/dynamic-tables.client';

export type TablePresentation = 'standalone' | 'embedded' | 'system';

/**
 * Returns the presentation classification of a table.
 * Defaults to 'standalone' when the field is absent (non-breaking).
 */
export function getTablePresentation(table: IDynamicTable): TablePresentation {
  const p = (table.schema as ITableSchema)?.ui?.presentation;
  if (p === 'embedded' || p === 'system') return p;
  return 'standalone';
}

/**
 * Returns true when the table should appear as a standalone navigable view.
 * Filters out embedded (detail tables) and system (infra) tables.
 */
export function isNavigable(table: IDynamicTable): boolean {
  return getTablePresentation(table) === 'standalone';
}
