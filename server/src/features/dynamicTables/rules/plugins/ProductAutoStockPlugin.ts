/**
 * ProductAutoStockPlugin
 *
 * Provisioning helper for inventory: when a new Product is created, automatically
 * creates per-unit stock rows (stock=0) on the Product Units table for all existing units.
 * Idempotent at unit level through UnitAutoStockPlugin when units are added later.
 */
import type { RulePlugin } from '../RuleTypes';
import { resolveTable, tableMatches } from '../shared/tableFinder';

const SCHEMA_KEYS = {
  PRODUCTS: 'products',
  PRODUCT_UNITS: 'productUnits',
  UNITS: 'units',
};

// Creates Product Units rows per existing unit after product creation
export const ProductAutoStockPlugin: RulePlugin = {
  name: 'ProductAutoStockPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, { categories: ['products'], internalNames: [SCHEMA_KEYS.PRODUCTS], names: ['Products', 'products', 'Produtos'] });
  },
  async afterCreate(ctx) {
    const productId = String((ctx.after as any)?.id || '');
    if (!productId) return;
    // Descobre a tabela de estoque (Product Units)
    const productUnitsTable = await resolveTable(ctx, {
      internalName: SCHEMA_KEYS.PRODUCT_UNITS,
      category: 'inventory',
      schemaMatch: (fields) => {
        const names = new Set(fields.map(f => f.name));
        return names.has('stock') && names.has('productId');
      },
    });
    if (!productUnitsTable) return; // sistema sem estoque
    const productUnitsTableId = productUnitsTable.id;
    // Descobre unidades (se existirem) para criar estoque por unidade
    const unitTable = await resolveTable(ctx, {
      internalName: SCHEMA_KEYS.UNITS,
      names: ['Units', 'units', 'Unidades'],
    });
    // Units são obrigatórias para criar estoque: se não houver, não cria nada
    if (!unitTable) return;
    const { data: units } = await ctx.repository.findDataByTableId(unitTable.id);
    if (!Array.isArray(units) || units.length === 0) return;
    for (const u of units) {
      await ctx.repository.createData(productUnitsTableId, { productId, unitId: String(u.id), stock: 0 });
    }
  },
};


