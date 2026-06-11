import type { ISchemaField } from '../../../models/DynamicTable.model';

/**
 * @description Collection of presets for select (option list) fields.
 *
 * Labels are in English by default. The frontend resolves the displayed label
 * via i18n (`database:fields.<name>`) and falls back to this English label
 * when no translation is provided.
 */

// --- Generic status ---

export const status: ISchemaField = {
  name: 'status',
  label: 'Status',
  type: 'select',
  options: ['Planned', 'Active', 'Completed'],
  required: true,
  searchable: false,
};

// --- Finance ---

export const expenseCategory: ISchemaField = {
  name: 'category',
  label: 'Category',
  type: 'select',
  options: ['Fixed Cost', 'Variable Cost', 'Marketing', 'Personnel', 'Taxes'],
  required: true,
};

export const saleStatus: ISchemaField = {
  name: 'status',
  label: 'Status',
  type: 'select',
  options: ['Draft', 'Finalized', 'Cancelled', 'Returned'],
  required: true,
};

export const paymentMethod: ISchemaField = {
  name: 'paymentMethod',
  label: 'Payment Method',
  type: 'select',
  options: ['Credit Card', 'Debit Card', 'Cash', 'Pix', 'Package Balance'],
  required: true,
};

export const paymentStatus: ISchemaField = {
  name: 'paymentStatus',
  label: 'Payment Status',
  type: 'select',
  options: ['Paid', 'Pending'],
  required: true,
};

// --- Products / Services ---

export const usageType: ISchemaField = {
  name: 'usageType',
  label: 'Usage Type',
  type: 'select',
  options: ['Sale', 'Internal Use', 'Both'],
  required: true,
  searchable: false,
};

export const itemType: ISchemaField = {
  name: 'type',
  label: 'Item Type',
  type: 'select',
  options: ['Service', 'Product'],
  required: true,
  searchable: false,
};

// --- Planning ---

export const appointmentStatus: ISchemaField = {
  name: 'status',
  label: 'Status',
  type: 'select',
  options: ['Scheduled', 'Completed', 'No-Show', 'Cancelled'],
  required: true,
};

// --- Reports ---

export const reportType: ISchemaField = {
  name: 'type',
  label: 'Report Type',
  type: 'select',
  options: [
    'Monthly Revenue',
    'Customer Retention',
    'Campaign Performance',
    'NPS Analysis',
    'Professional Occupancy',
  ],
  required: true,
  searchable: false,
};

// --- CRM / Analytics ---

export const lifecycleStageSelect: ISchemaField = {
  name: 'lifecycleStage',
  label: 'Lifecycle Stage',
  type: 'select',
  required: false,
  options: ['Prospect', 'New', 'Active', 'Loyal', 'AtRisk', 'Churned'],
  searchable: false,
};

export const channelSelect: ISchemaField = {
  name: 'channel',
  label: 'Sales Channel',
  type: 'select',
  required: false,
  options: ['InStore', 'Online', 'Phone', 'App', 'Other'],
  searchable: false,
};

export const revenueTypeSelect: ISchemaField = {
  name: 'revenueType',
  label: 'Revenue Type',
  type: 'select',
  required: false,
  options: ['Operational', 'NonOperational'],
  searchable: false,
};

// --- Goals ---

export const periodSelect: ISchemaField = {
  name: 'period',
  label: 'Period',
  type: 'select',
  required: true,
  options: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'],
  searchable: false,
};

export const goalResultSelect: ISchemaField = {
  name: 'result',
  label: 'Result',
  type: 'select',
  required: false,
  options: ['Reached', 'Partial', 'Not Reached'],
  searchable: false,
};
