import type { ITableSchema } from '../../../models/DynamicTable.model';
import { appointmentId, responsibleEmployeeId, saleId, serviceId } from '../../fields/relation/RelationPresets';
import { description } from '../../fields/text/TextPresets';
import { unitPrice, commission } from '../../fields/number/NumberPresets';

export const saleItemsServicesOnlyModule = {
  name: 'Sale Items',
  description: 'Details each service item of a sale.',
  category: 'finance',
  meta: {
    requiresTables: ['services'],
  },
  schema: {
    defaultDisplayField: 'description',
    ui: { presentation: 'embedded' },
    fields: [
      saleId,
      serviceId,
      { ...description, label: 'Description' },
      unitPrice,
      { name: 'requiresAppointment', label: 'Schedule now', type: 'boolean', required: false, defaultValue: false, searchable: false },
      { ...appointmentId, required: false },
      responsibleEmployeeId,
      commission,
    ],
  } as ITableSchema,
};
