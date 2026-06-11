import type { ISchemaField } from '../../../models/DynamicTable.model';

/**
 * @description Collection of presets for numeric fields.
 *
 * Labels are in English by default. The frontend resolves the displayed label
 * via i18n (`database:fields.<name>`) and falls back to this English label
 * when no translation is provided.
 *
 * Grouped by numberFormat: currency → integer → percentage.
 */

// --- Currency fields ---

export const amount: ISchemaField = {
  name: 'amount',
  label: 'Amount',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const total: ISchemaField = {
  name: 'total',
  label: 'Total Amount',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const price: ISchemaField = {
  name: 'price',
  label: 'Price',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const unitPrice: ISchemaField = {
  name: 'unitPrice',
  label: 'Unit Price',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const salePrice: ISchemaField = {
  name: 'salePrice',
  label: 'Sale Price',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const costPrice: ISchemaField = {
  name: 'costPrice',
  label: 'Cost Price',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const cost: ISchemaField = {
  name: 'cost',
  label: 'Cost',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const budget: ISchemaField = {
  name: 'budget',
  label: 'Budget',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};

export const subtotal: ISchemaField = {
  name: 'subtotal',
  label: 'Subtotal',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  defaultValue: 0,
  searchable: false,
};

export const discountAmount: ISchemaField = {
  name: 'discountAmount',
  label: 'Discount',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  defaultValue: 0,
  searchable: false,
};

export const taxAmount: ISchemaField = {
  name: 'taxAmount',
  label: 'Taxes',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  defaultValue: 0,
  searchable: false,
};

export const totalAmount: ISchemaField = {
  name: 'totalAmount',
  label: 'Total Amount',
  type: 'number',
  required: true,
  numberFormat: 'currency',
  defaultValue: 0,
  searchable: false,
};

export const commission: ISchemaField = {
  name: 'commission',
  label: 'Commission Amount',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  defaultValue: 0,
  validation: { minValue: 0 },
  searchable: false,
};

export const commissionRate: ISchemaField = {
  name: 'rate',
  label: 'Commission Rate %',
  type: 'number',
  required: false,
  numberFormat: 'percentage',
  validation: { minValue: 0, maxValue: 100 },
  description: 'Commission percentage applied.',
  searchable: false,
};

// --- Integer fields ---

export const quantity: ISchemaField = {
  name: 'quantity',
  label: 'Quantity',
  type: 'number',
  required: true,
  numberFormat: 'integer',
  defaultValue: 1,
  validation: { minValue: 1 },
  searchable: false,
};

export const stock: ISchemaField = {
  name: 'stock',
  label: 'Current Stock',
  type: 'number',
  required: true,
  numberFormat: 'integer',
  validation: { minValue: 0 },
  searchable: false,
};

export const reorderPoint: ISchemaField = {
  name: 'reorderPoint',
  label: 'Reorder Point',
  type: 'number',
  required: false,
  numberFormat: 'integer',
  validation: { minValue: 0 },
  searchable: false,
};

export const duration: ISchemaField = {
  name: 'duration',
  label: 'Duration (min)',
  type: 'number',
  required: true,
  numberFormat: 'integer',
  validation: { minValue: 1 },
  searchable: false,
};

// --- Percentage fields ---

export const engagementRate: ISchemaField = {
  name: 'engagementRate',
  label: 'Engagement Rate',
  type: 'number',
  required: false,
  numberFormat: 'percentage',
  validation: { minValue: 0, maxValue: 100 },
  searchable: false,
};
