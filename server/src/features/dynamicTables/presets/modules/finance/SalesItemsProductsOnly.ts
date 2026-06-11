import type { ITableSchema } from '../../../models/DynamicTable.model';
import { saleId } from '../../fields/relation/RelationPresets';
import { description } from '../../fields/text/TextPresets';
import { quantity, unitPrice } from '../../fields/number/NumberPresets';
import { productId } from '../../fields/relation/RelationPresets';

export const saleItemsProductsOnlyModule = {
  name: 'Sale Items',
  description: 'Details each product item of a sale.',
  category: 'finance',
  meta: {
    requiresCapabilities: ['inventory.stock'],
  },
  schema: {
    defaultDisplayField: 'description',
    ui: { presentation: 'embedded' },
    fields: [
      saleId,
      productId,
      { ...description, label: 'Description' },
      quantity,
      unitPrice,
    ],
  } as ITableSchema,
};


