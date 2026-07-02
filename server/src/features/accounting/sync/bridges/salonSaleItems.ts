/**
 * Shared sale-item classifier for the salon accounting bridges (Incremento G P4/P5).
 *
 * The all-Package routing decision MUST be proven from the actual `saleItems`, not
 * inferred from the sale header. Both the anti-revenue gate (in the finalized bridge)
 * and the package-origin bridge use this single source of truth. P5 also needs the
 * distinct packageIds to credit the right balance (MVP: exactly one per package sale).
 *
 * Reads via the DynamicTable REPOSITORY only (one indexed lookup + one row query) — it
 * never touches DynamicTableService/RuleContext/RulePlugin (§2.1 boundary holds; the
 * dependency points accounting → repository, never the reverse).
 */

import { getFactory } from '../../../../lib/factory';

export type SaleItemsKind = 'Product' | 'Service' | 'Package' | 'Mixed' | 'Empty';

export interface SalePackageInfo {
  kind: SaleItemsKind;
  /** Distinct packageIds across the sale's Package items (MVP expects length ≤ 1). */
  packageIds: string[];
}

/** Load + classify a sale's items by querying the tenant's `saleItems` table for that saleId. */
export async function loadSalePackageInfo(userId: string, saleId: string): Promise<SalePackageInfo> {
  const repo = getFactory().getDynamicTableRepository();
  const itemsTable = await repo.findTableByInternalName(userId, 'saleItems');
  if (!itemsTable) return { kind: 'Empty', packageIds: [] };

  const rows = await repo.findRowsByFieldValue(itemsTable.id, 'saleId', saleId);
  if (rows.length === 0) return { kind: 'Empty', packageIds: [] };

  const kinds = new Set<string>();
  const packageIds = new Set<string>();
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    if (d.productId || String(d.type ?? '') === 'Product') {
      kinds.add('Product');
    } else if (d.serviceId || String(d.type ?? '') === 'Service') {
      kinds.add('Service');
    } else if (d.packageId || String(d.type ?? '') === 'Package') {
      kinds.add('Package');
      if (d.packageId) packageIds.add(String(d.packageId));
    } else {
      kinds.add('Unknown');
    }
  }

  let kind: SaleItemsKind = 'Mixed';
  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === 'Product' || only === 'Service' || only === 'Package') kind = only;
  }
  return { kind, packageIds: [...packageIds] };
}

/** True only when every item is a Package item (the prepaid-origin routing condition). */
export async function isAllPackageSale(userId: string, saleId: string): Promise<boolean> {
  return (await loadSalePackageInfo(userId, saleId)).kind === 'Package';
}
