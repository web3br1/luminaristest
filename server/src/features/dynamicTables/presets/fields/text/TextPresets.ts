import type { ISchemaField } from '../../../models/DynamicTable.model';

/**
 * @description Collection of presets for text and textarea fields.
 *
 * Labels are in English by default. The frontend resolves the displayed label
 * via i18n (`database:fields.<name>`) and falls back to this English label
 * when no translation is provided.
 */

// --- Core identity fields ---

export const name: ISchemaField = {
  name: 'name',
  label: 'Name',
  type: 'string',
  required: true,
};

export const description: ISchemaField = {
  name: 'description',
  label: 'Description',
  type: 'textarea',
  required: false,
};

export const notes: ISchemaField = {
  name: 'notes',
  label: 'Notes',
  type: 'textarea',
  required: false,
};

// --- Contact fields ---

export const email: ISchemaField = {
  name: 'email',
  label: 'Email',
  type: 'string',
  format: 'email',
  required: true,
  unique: true,
};

export const phone: ISchemaField = {
  name: 'phone',
  label: 'Phone',
  type: 'string',
  format: 'phone',
  required: false,
};

export const cpf: ISchemaField = {
  name: 'cpf',
  label: 'CPF',
  type: 'string',
  format: 'cpf',
  required: false,
  unique: true,
};

// --- Address / Fiscal fields ---

export const taxId: ISchemaField = {
  name: 'taxId',
  label: 'CPF/CNPJ',
  type: 'string',
  // No format set — accepts either CPF (11 digits) or CNPJ (14 digits).
  required: false,
  unique: true,
};

export const stateRegistration: ISchemaField = {
  name: 'stateRegistration',
  label: 'State Registration',
  type: 'string',
  required: false,
};

export const street: ISchemaField = {
  name: 'street',
  label: 'Street',
  type: 'string',
  required: false,
};

export const addressNumber: ISchemaField = {
  name: 'addressNumber',
  label: 'Number',
  type: 'string',
  required: false,
};

export const addressComplement: ISchemaField = {
  name: 'addressComplement',
  label: 'Complement',
  type: 'string',
  required: false,
};

export const neighborhood: ISchemaField = {
  name: 'neighborhood',
  label: 'Neighborhood',
  type: 'string',
  required: false,
};

export const city: ISchemaField = {
  name: 'city',
  label: 'City',
  type: 'string',
  required: false,
};

export const stateUF: ISchemaField = {
  name: 'state',
  label: 'State',
  type: 'string',
  required: false,
};

export const zipCode: ISchemaField = {
  name: 'zipCode',
  label: 'ZIP Code',
  type: 'string',
  required: false,
};

export const country: ISchemaField = {
  name: 'country',
  label: 'Country',
  type: 'string',
  required: false,
};

// --- Product / Catalog fields ---

export const sku: ISchemaField = {
  name: 'sku',
  label: 'SKU',
  type: 'string',
  required: false,
  unique: true,
};

export const brand: ISchemaField = {
  name: 'brand',
  label: 'Brand',
  type: 'string',
  required: false,
};

export const targetAudience: ISchemaField = {
  name: 'targetAudience',
  label: 'Target Audience',
  type: 'string',
  required: false,
};

export const consumedProducts: ISchemaField = {
  name: 'consumedProducts',
  label: 'Consumed Products (Recipe)',
  type: 'textarea',
  required: false,
  searchable: false,
  description: "Ex.: [{ 'productId': 123, 'quantity': 20, 'unit': 'ml' }]",
};

// --- Goals / Analytics fields ---

export const period: ISchemaField = {
  name: 'period',
  label: 'Period',
  type: 'string',
  required: true,
  description: 'Ex.: 2025-Q3',
};

export const result: ISchemaField = {
  name: 'result',
  label: 'Achieved Result',
  type: 'string',
  required: false,
};

export const metricKey: ISchemaField = {
  name: 'metricKey',
  label: 'Metric Key',
  type: 'string',
  required: false,
  description: 'Metric identifier (e.g.: REVENUE_TOTAL, COST_TOTAL_MONTHLY, PROFIT_NET).',
  searchable: false,
};

export const budgetGroup: ISchemaField = {
  name: 'budgetGroup',
  label: 'Budget Group',
  type: 'string',
  required: false,
  description: 'Budget grouping key (e.g.: COST_TOTAL_MONTHLY).',
  searchable: false,
};

// --- CRM / Marketing fields ---

export const leadSource: ISchemaField = {
  name: 'leadSource',
  label: 'Lead Source',
  type: 'string',
  required: false,
  description: 'Origin of the lead/customer (campaign, digital channel, referral, etc.).',
};

export const privacyPolicyVersion: ISchemaField = {
  name: 'privacyPolicyVersion',
  label: 'Accepted Policy Version',
  type: 'string',
  required: false,
  searchable: false,
};
