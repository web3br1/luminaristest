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

/**
 * Raw per-nature line subtotals in reais (Σ quantity×unitPrice), for the revenue split
 * (ADR-INCR-REVENUE-SPLIT). Bucketed by the SAME classification the `kind` uses (relation-id
 * first), so an item's amount lands in whichever bucket the classifier already picked. Package
 * lines contribute to neither (their revenue is prepaid/deferred — out of scope). Kept RAW
 * (reais, float); the mapper is the single money boundary that converts to cents and splits.
 */
export interface RevenueByNature {
  serviceReais: number;
  productReais: number;
}

export interface SalePackageInfo {
  kind: SaleItemsKind;
  /** Distinct packageIds across the sale's Package items (MVP expects length ≤ 1). */
  packageIds: string[];
  /** Per-nature line subtotals for the revenue split. */
  revenueByNature: RevenueByNature;
}

/** Numeric coercion that never propagates NaN into the money math (missing/garbage → 0). */
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Load + classify a sale's items by querying the tenant's `saleItems` table for that saleId. */
export async function loadSalePackageInfo(userId: string, saleId: string): Promise<SalePackageInfo> {
  const repo = getFactory().getDynamicTableRepository();
  const itemsTable = await repo.findTableByInternalName(userId, 'saleItems');
  if (!itemsTable) return { kind: 'Empty', packageIds: [], revenueByNature: { serviceReais: 0, productReais: 0 } };

  const rows = await repo.findRowsByFieldValue(itemsTable.id, 'saleId', saleId);
  if (rows.length === 0) return { kind: 'Empty', packageIds: [], revenueByNature: { serviceReais: 0, productReais: 0 } };

  const kinds = new Set<string>();
  const packageIds = new Set<string>();
  let serviceReais = 0;
  let productReais = 0;
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const lineReais = toNum(d.quantity) * toNum(d.unitPrice);
    if (d.productId || String(d.type ?? '') === 'Product') {
      kinds.add('Product');
      productReais += lineReais;
    } else if (d.serviceId || String(d.type ?? '') === 'Service') {
      kinds.add('Service');
      serviceReais += lineReais;
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
  return { kind, packageIds: [...packageIds], revenueByNature: { serviceReais, productReais } };
}

/** True only when every item is a Package item (the prepaid-origin routing condition). */
export async function isAllPackageSale(userId: string, saleId: string): Promise<boolean> {
  return (await loadSalePackageInfo(userId, saleId)).kind === 'Package';
}
