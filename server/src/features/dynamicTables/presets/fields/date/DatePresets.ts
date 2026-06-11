import type { ISchemaField } from '../../../models/DynamicTable.model';

/**
 * @description Collection of presets for date and datetime fields.
 *
 * Labels are in English by default. The frontend resolves the displayed label
 * via i18n (`database:fields.<name>`) and falls back to this English label
 * when no translation is provided.
 */

// --- Generic dates ---

export const date: ISchemaField = {
  name: 'date',
  label: 'Date',
  type: 'date',
  required: true,
  searchable: false,
};

export const dueDate: ISchemaField = {
  name: 'dueDate',
  label: 'Due Date',
  type: 'date',
  required: false,
  searchable: false,
};

export const birthDate: ISchemaField = {
  name: 'birthDate',
  label: 'Birth Date',
  type: 'date',
  required: false,
  searchable: false,
};

export const paymentDate: ISchemaField = {
  name: 'paymentDate',
  label: 'Payment Date',
  type: 'date',
  required: true,
  searchable: false,
};

export const paidAt: ISchemaField = {
  name: 'paidAt',
  label: 'Paid At',
  type: 'datetime',
  required: false,
  searchable: false,
};

export const consentDate: ISchemaField = {
  name: 'consentDate',
  label: 'Consent Date',
  type: 'date',
  required: false,
  searchable: false,
};

// --- Date ranges ---

/** Spread this array directly into a `fields` array: `...dateRange` */
export const dateRange: ISchemaField[] = [
  { name: 'startDate', label: 'Start Date', type: 'date', required: true, searchable: false },
  { name: 'endDate',   label: 'End Date',   type: 'date', required: false, searchable: false },
];

// --- Datetime fields ---

export const startAtDateTime: ISchemaField = {
  name: 'startAt',
  label: 'Start',
  type: 'datetime',
  required: true,
  searchable: false,
};

export const endAtDateTime: ISchemaField = {
  name: 'endAt',
  label: 'End',
  type: 'datetime',
  required: true,
  searchable: false,
};
