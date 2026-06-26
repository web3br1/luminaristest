import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, price } from '../../fields';

/**
 * @description Catalog of prepaid packages the salon sells (Incremento G — monetary).
 *
 * Operational ORIGIN only: this is a runtime-configured price list, like Products and
 * Services. It carries NO financial invariant on the row — the per-customer balance and
 * the accounting liability (2.1.1) live in Prisma (CustomerPackageBalance), NOT here.
 *
 * A package is monetary credit, NOT an itemized combo: there is no component/entitlement
 * list and no stock — those belong to the future H arc (entitlements) and to Incremento E
 * (inventory/CMV). A `Package` sale item references one of these rows via `packageId`.
 */
export const packageCatalogModule = {
  name: 'Packages',
  description: 'Catalog of prepaid packages sold as monetary credit.',
  category: 'finance',
  meta: {
    providesCapabilities: ['catalog.packages'],
  },
  schema: {
    defaultDisplayField: 'name',
    fields: [
      name,
      { ...price, label: 'Package Price' },
      {
        name: 'validityDays',
        label: 'Validity (days)',
        type: 'number',
        required: false,
        numberFormat: 'integer',
        validation: { minValue: 0 },
        searchable: false,
      },
      {
        name: 'active',
        label: 'Active',
        type: 'boolean',
        required: false,
        defaultValue: true,
        searchable: false,
      },
    ],
  } as ITableSchema,
};
