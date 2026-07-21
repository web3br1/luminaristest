// fetchAllRows moved to the shared my-app/lib/dynamicTableFetch so CRM and the
// dashboard share a single pagination loop (single source of truth). Re-exported
// here to preserve this module's public surface — every CRM hook imports
// fetchAllRows from '../lib/crmFetch'.
export type { DynamicRow } from '../../../lib/dynamicTableFetch';
export { fetchAllRows } from '../../../lib/dynamicTableFetch';
