import BeautySalonPreset from '../systems/BeautySalonPreset';
import { packageCatalogModule } from '../modules/finance/PackageCatalogModule';
import { saleItemsMixedModule } from '../modules/finance/SalesItemsMixed';
import { itemType } from '../fields/select/SelectPresets';

describe('P3 — Package catalog preset wiring', () => {
  it('registers a `packages` table in the BeautySalon preset', () => {
    expect(BeautySalonPreset.tables.packages).toBeDefined();
  });

  it('PackageCatalogModule is a minimal monetary catalog (no stock / no components)', () => {
    expect(packageCatalogModule.name).toBe('Packages');
    expect(packageCatalogModule.category).toBe('finance');
    const fieldNames = packageCatalogModule.schema.fields.map((f) => f.name);
    expect(fieldNames).toEqual(expect.arrayContaining(['name', 'price', 'validityDays', 'active']));
    // Guard the cut: catalog carries NO stock / component / entitlement columns.
    expect(hasForbiddenColumn(fieldNames)).toBe(false);
  });

  it('itemType offers Package alongside Service and Product', () => {
    expect(itemType.options).toEqual(expect.arrayContaining(['Service', 'Product', 'Package']));
  });

  it('saleItems carries a packageId relation field', () => {
    const fieldNames = (saleItemsMixedModule.schema.fields ?? []).map((f) => f.name);
    expect(fieldNames).toContain('packageId');
  });
});

// Returns true if any forbidden (H/E-scope) column leaked into the G1 catalog.
function hasForbiddenColumn(fieldNames: string[]): boolean {
  const forbidden = ['stock', 'reserved', 'productId', 'serviceId', 'componentId', 'remainingQuantity', 'kind'];
  return fieldNames.some((n) => forbidden.includes(n));
}
