import { DynamicTableService } from '../../../lib/services/dynamic-table.service';

export interface DynamicRow {
  id: string;
  data: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

// The dynamic-tables API caps a page at 200 rows and defaults to 50. Without
// pagination, views silently truncate at 50 records — wrong KPIs/board counts
// once a table has volume. fetchAllRows pulls every page.
const PAGE_SIZE = 200;
const MAX_PAGES = 1000;

/** Fetches ALL rows of a dynamic table, paginating past the API's default/cap page size. */
export async function fetchAllRows(tableId: string): Promise<DynamicRow[]> {
  const first = await DynamicTableService.getTableData(tableId, `page=1&limit=${PAGE_SIZE}`).catch(() => null);
  const rows: DynamicRow[] = Array.isArray(first?.data) ? first.data : [];
  const totalPages = Number(first?.totalPages ?? 1);
  const lastPage = Math.min(totalPages, MAX_PAGES);
  for (let page = 2; page <= lastPage; page++) {
    const next = await DynamicTableService.getTableData(tableId, `page=${page}&limit=${PAGE_SIZE}`).catch(() => null);
    if (Array.isArray(next?.data)) rows.push(...next.data);
  }
  return rows;
}
