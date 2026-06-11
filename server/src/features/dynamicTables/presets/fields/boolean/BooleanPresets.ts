import type { ISchemaField } from '../../../models/DynamicTable.model';

/**
 * @description Collection of presets for boolean (true/false) fields.
 *
 * Labels are in English by default. The frontend resolves the displayed label
 * via i18n (`database:fields.<name>`) and falls back to this English label
 * when no translation is provided.
 */

export const isActive: ISchemaField = {
  name: 'isActive',
  label: 'Active',
  type: 'boolean',
  required: false,
  defaultValue: true,
  searchable: false,
};

export const isPlanned: ISchemaField = {
  name: 'isPlanned',
  label: 'Planned',
  type: 'boolean',
  required: false,
  defaultValue: false,
  searchable: false,
};

export const simpleCustomerFlag: ISchemaField = {
  name: 'simpleCustomer',
  label: 'Simple Customer',
  type: 'boolean',
  required: false,
  defaultValue: false,
  searchable: false,
};
