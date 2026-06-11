import type { ITableSchema } from '../../../models/DynamicTable.model';
import { email, phone, taxId, street, addressNumber, addressComplement, neighborhood, city, stateUF, zipCode, country, notes } from '../../fields/text/TextPresets';

/**
 * @description Suppliers Module.
 * Category: people
 */
export const suppliersModule = {
  name: 'Suppliers',
  description: 'Vendor registry with contact and billing info.',
  category: 'people',
  schema: {
    defaultDisplayField: 'supplierName',
    fields: [
      { name: 'supplierName', label: 'Supplier Name', type: 'string', required: true, unique: true },
      { name: 'contactPerson', label: 'Contact Person', type: 'string', required: true },
      { ...email, required: true },
      { ...phone, required: true },
      { ...taxId, label: 'Tax ID', required: true },
      // Address
      { ...street, required: true },
      { ...addressNumber, required: true },
      { ...addressComplement, required: false },
      { ...neighborhood, required: true },
      { ...city, required: true },
      { ...stateUF, required: true },
      { ...zipCode, required: true },
      { ...country, required: true },
      // Additional Information
      notes,
    ],
  } as ITableSchema,
};
