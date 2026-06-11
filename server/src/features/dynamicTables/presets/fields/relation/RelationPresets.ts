import type { ISchemaField } from '../../../models/DynamicTable.model';

/**
 * @description Collection of presets for relation (foreign key) fields.
 *
 * Labels are in English by default. The frontend resolves the displayed label
 * via i18n (`database:fields.<name>`) and falls back to this English label
 * when no translation is provided.
 *
 * All `targetTable` values use the `@@PRESET_TABLE_KEY::` marker so the
 * installer can resolve them to real table IDs at runtime.
 */

// --- Core / Org structure ---

export const unitId: ISchemaField = {
  name: 'unitId',
  label: 'Unit',
  type: 'relation',
  required: true,
  relation: { targetTable: '@@PRESET_TABLE_KEY::units' },
  searchable: false,
};

export const mainUnitId: ISchemaField = {
  name: 'mainUnitId',
  label: 'Main Unit',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::units' },
  searchable: false,
};

// --- People ---

export const employeeId: ISchemaField = {
  name: 'employeeId',
  label: 'Employee (Commission)',
  type: 'relation',
  required: true,
  relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
  description: 'ID of the employee who performed the service, used for commission calculation.',
  searchable: false,
};

export const responsibleEmployeeId: ISchemaField = {
  name: 'responsibleEmployeeId',
  label: 'Responsible',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
  description: 'Employee responsible for executing the service.',
  searchable: false,
};

export const qualifiedEmployees: ISchemaField = {
  name: 'qualifiedEmployees',
  label: 'Qualified Employees',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::employees', allowMultiple: true },
  description: 'Link services to all qualified employees.',
  searchable: false,
};

export const customerId: ISchemaField = {
  name: 'customerId',
  label: 'Customer',
  type: 'relation',
  required: true,
  relation: { targetTable: '@@PRESET_TABLE_KEY::customers' },
  searchable: false,
};

// --- Products & Inventory ---

export const productId: ISchemaField = {
  name: 'productId',
  label: 'Product',
  type: 'relation',
  required: true,
  relation: { targetTable: '@@PRESET_TABLE_KEY::products' },
  searchable: false,
};

export const associatedProducts: ISchemaField = {
  name: 'associatedProducts',
  label: 'Associated Products',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::products', allowMultiple: true },
  description: 'Products that may be used while executing the service.',
  searchable: false,
};

export const supplierId: ISchemaField = {
  name: 'supplierId',
  label: 'Supplier',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::suppliers' },
  searchable: false,
};

// --- Services ---

export const serviceId: ISchemaField = {
  name: 'serviceId',
  label: 'Service',
  type: 'relation',
  required: true,
  relation: { targetTable: '@@PRESET_TABLE_KEY::services' },
  searchable: false,
};

// --- Sales ---

export const saleId: ISchemaField = {
  name: 'saleId',
  label: 'Sale',
  type: 'relation',
  required: true,
  relation: { targetTable: '@@PRESET_TABLE_KEY::sales' },
  searchable: false,
};

export const saleItemId: ISchemaField = {
  name: 'saleItemId',
  label: 'Sale Item',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::saleItems' },
  searchable: false,
};

export const campaignId: ISchemaField = {
  name: 'campaignId',
  label: 'Campaign',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::campaigns' },
  description: 'Marketing campaign linked to this record.',
  searchable: false,
};

// --- Planning ---

export const appointmentId: ISchemaField = {
  name: 'appointmentId',
  label: 'Appointment',
  type: 'relation',
  required: false,
  relation: { targetTable: '@@PRESET_TABLE_KEY::appointments' },
  searchable: false,
};
