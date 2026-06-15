import type { RulePlugin } from '../RuleTypes';
import type { IDynamicTableData } from '../../models/DynamicTable.model';
import { resolveTable, tableMatches } from '../shared/tableFinder';

const SCHEMA_KEYS = {
  UNITS: 'units',
  PRODUCTS: 'products',
  PRODUCT_UNITS: 'productUnits',
};

/**
 * Ensures per-unit stock entries exist for all products when a new Unit is created.
 * Behavior:
 * - On unit creation, if the inventory table (Product Units) exists, create stock rows (stock=0)
 *   for every existing product for the new unit.
 * - Idempotent: skips creation when a (productId, unitId) stock row already exists.
 */
export const UnitAutoStockPlugin: RulePlugin = {
  name: 'UnitAutoStockPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, { internalNames: [SCHEMA_KEYS.UNITS], names: ['Units', 'units', 'Unidades'] });
  },
  async afterCreate(ctx) {
    const unitId = String(ctx.after?.id || '');
    if (!unitId) return;

    // Locate products table to iterate and ensure inventory provisioning per product
    const productsTable = await resolveTable(ctx, {
      internalName: SCHEMA_KEYS.PRODUCTS,
      category: 'products',
      names: ['Products', 'products', 'Produtos'],
    });
    if (!productsTable) return;

    // Locate product units (inventory) table; skip if inventory is not enabled
    const productUnitsTable = await resolveTable(ctx, {
      internalName: SCHEMA_KEYS.PRODUCT_UNITS,
      category: 'inventory',
      schemaMatch: (fields) => {
        const names = new Set(fields.map(f => f.name));
        return names.has('stock') && names.has('productId') && names.has('unitId');
      },
    });
    if (!productUnitsTable) return; // no inventory system → nothing to provision
    const productUnitsTableId = productUnitsTable.id;

    // All products (need each) + only this unit's existing stock rows (indexed, for idempotency).
    const [products, existingStock] = await Promise.all([
      ctx.repository.findDataByTableId(productsTable.id),
      ctx.repository.findRowsByFieldValue(productUnitsTableId, 'unitId', unitId),
    ]);

    const hasRow = (productId: string) => existingStock.some((r: IDynamicTableData) => {
      const d = (r?.data as Record<string, unknown>) || {}; return String(d?.productId || '') === productId;
    });

    for (const p of products.data) {
      const productId = String(p?.id || '');
      if (!productId) continue;
      if (hasRow(productId)) continue; // idempotent
      await ctx.repository.createData(productUnitsTableId, { productId, unitId, stock: 0, reserved: 0 });
    }
  },
};


