/**
 * Shared sale-item classifier for the salon accounting bridges (Incremento G P4).
 *
 * The all-Package routing decision MUST be proven from the actual `saleItems`, not
 * inferred from the sale header. Both the anti-revenue gate (in the finalized bridge)
 * and the package-origin bridge use this single source of truth.
 *
 * Reads via the DynamicTable REPOSITORY only (one indexed lookup + one row query) — it
 * never touches DynamicTableService/RuleContext/RulePlugin (§2.1 boundary holds; the
 * dependency points accounting → repository, never the reverse).
 */

import { getFactory } from '../../../../lib/factory';

export type SaleItemsKind = 'Product' | 'Service' | 'Package' | 'Mixed' | 'Empty';

/** Classify a sale's items by querying the tenant's `saleItems` table for that saleId. */
export async function classifySaleItems(userId: string, saleId: string): Promise<SaleItemsKind> {
  const repo = getFactory().getDynamicTableRepository();
  const itemsTable = await repo.findTableByInternalName(userId, 'saleItems');
  if (!itemsTable) return 'Empty';

  const rows = await repo.findRowsByFieldValue(itemsTable.id, 'saleId', saleId);
  if (rows.length === 0) return 'Empty';

  const kinds = new Set<string>();
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    if (d.productId || String(d.type ?? '') === 'Product') kinds.add('Product');
    else if (d.serviceId || String(d.type ?? '') === 'Service') kinds.add('Service');
    else if (d.packageId || String(d.type ?? '') === 'Package') kinds.add('Package');
    else kinds.add('Unknown');
  }

  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === 'Product' || only === 'Service' || only === 'Package') return only;
  }
  return 'Mixed';
}

/** True only when every item is a Package item (the prepaid-origin routing condition). */
export async function isAllPackageSale(userId: string, saleId: string): Promise<boolean> {
  return (await classifySaleItems(userId, saleId)) === 'Package';
}
