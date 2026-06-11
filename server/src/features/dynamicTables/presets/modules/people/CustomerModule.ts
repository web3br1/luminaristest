import type { ITableSchema } from '../../../models/DynamicTable.model';
import {
  email,
  leadSource,
  lifecycleStageSelect,
  mainUnitId,
  name,
  phone,
  taxId,
  stateRegistration,
  street,
  addressNumber,
  addressComplement,
  neighborhood,
  city,
  stateUF,
  zipCode,
  country,
} from '../../fields';

/**
 * @description
 * Módulo base para a tabela de clientes, com dados pessoais, contato e consentimento (LGPD),
 * estendido com campos de CRM para análises de recorrência, ciclo de vida e rentabilidade.
 */
export const customerModule = {
  name: 'Customers',
  description:
    'Fiscal-grade customer registry for invoices: identity, contact, full address and CRM lifecycle.',
  category: 'people',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...mainUnitId, label: 'Main Unit' },
      { ...name, label: 'Full Name' },
      email,
      phone,
      // Fiscal identifiers
      taxId,
      stateRegistration,
      // Address block
      street,
      addressNumber,
      addressComplement,
      neighborhood,
      city,
      stateUF,
      zipCode,
      country,
      // --- CRM / Lifecycle analytics ---
      { ...lifecycleStageSelect, readOnly: true },
      leadSource,
      {
        name: 'firstSaleAt',
        label: 'First Sale At',
        type: 'date',
        required: false,
        readOnly: true,
        searchable: false,
      },
      {
        name: 'lastSaleAt',
        label: 'Last Sale At',
        type: 'date',
        required: false,
        readOnly: true,
        searchable: false,
      },
      {
        name: 'totalSalesCount',
        label: 'Total Sales Count',
        type: 'number',
        required: false,
        numberFormat: 'integer',
        validation: { minValue: 0 },
        defaultValue: 0,
        readOnly: true,
        searchable: false,
      },
      {
        name: 'totalSalesAmount',
        label: 'Total Sales Amount',
        type: 'number',
        required: false,
        numberFormat: 'currency',
        validation: { minValue: 0 },
        defaultValue: 0,
        readOnly: true,
        searchable: false,
      },
    ],
  } as ITableSchema,
};
