import type { ITableSchema } from '../../../models/DynamicTable.model';
import {
  brand,
  description,
  name,
  productId,
  salePrice,
  sku,
  stock,
  unitId,
  usageType,
} from '../../fields';

/**
 * @description Base module for the "products" table (master catalog).
 */
export const productModule = {
  name: 'Products',
  description: 'Master catalog of all products offered.',
  category: 'products',
  meta: {
    providesCapabilities: ['catalog.products'],
  },
  schema: {
    defaultDisplayField: 'name',
    fields: [
      name,
      brand,
      description,
      sku,
      {
        name: 'category',
        label: 'Category',
        type: 'string',
        required: false,
      },
      usageType,
    ],
    deleteConstraints: [
      {
        type: 'RESTRICT_IF_AGGREGATE',
        targetTable: '@@PRESET_TABLE_KEY::productUnits',
        aggregate: { field: 'stock', operator: 'gt', value: 0 },
        errorMessage: 'Cannot deactivate: you still have physical stock. Deplete inventory first.'
      },
      {
        type: 'CASCADE',
        targetTable: '@@PRESET_TABLE_KEY::productUnits',
        cascadeCondition: 'ALWAYS'
      },
      {
        type: 'RESTRICT',
        targetTable: '@@PRESET_TABLE_KEY::saleItems',
        errorMessage: 'Cannot deactivate this product because it is linked to active sales transactions.'
      },
      {
        type: 'IGNORE',
        targetTable: '@@PRESET_TABLE_KEY::stockMovements'
      }
    ]
  } as ITableSchema,
};

/**
 * @description Relational module NxN or 1xN 'products_units'.
 * Manages price, stock, and status of a product in a specific unit.
 * Essential for franchise networks or multiple branches.
 */
export const productUnitModule = {
  name: 'Product Units',
  description: 'Manages price and stock of products per unit.',
  category: 'inventory',
  meta: {
    providesCapabilities: ['inventory.stock'],
  },
  schema: {
    defaultDisplayField: 'productId',
    fields: [
      { ...productId, label: 'Product', readOnly: true, hidden: true },
      { ...unitId,    label: 'Unit',    readOnly: true, hidden: true },
      salePrice,
      { ...stock,    readOnly: true },   // managed exclusively via StockMovements
      {
        name: 'reserved',
        label: 'Reserved',
        type: 'number',
        required: false,
        numberFormat: 'integer',
        defaultValue: 0,
        readOnly: true,                   // managed exclusively by the system
      },
    ],
    compositeUnique: [
      {
        fields: ['productId', 'unitId'],
        errorMessage: 'A stock record for this product already exists in the selected unit.',
      },
    ],
  } as ITableSchema,
};
