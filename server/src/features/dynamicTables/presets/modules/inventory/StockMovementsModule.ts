import type { ITableSchema } from '../../../models/DynamicTable.model';
import { cost, quantity } from '../../fields/number/NumberPresets';
import { date } from '../../fields/date/DatePresets';
import { productId, responsibleEmployeeId, supplierId, unitId } from '../../fields/relation/RelationPresets';
import { paymentMethod, paymentStatus } from '../../fields/select/SelectPresets';

export const stockMovementsModule = {
  name: 'Stock Movements',
  description: 'Records product entries and exits from stock for auditing purposes.',
  category: 'inventory',
  meta: {
    providesCapabilities: ['inventory.movements'],
    requiresCapabilities: ['inventory.stock'],
  },
  schema: {
    defaultDisplayField: 'date',
    fields: [
      { ...productId, label: 'Product' },
      { ...unitId, label: 'Unit' },
      { name: 'type', label: 'Type', type: 'select', options: ['In', 'Out'], required: true },
      quantity,
      { ...date, label: 'Movement Date', type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'reason', label: 'Reason', type: 'select', options: ['Purchase', 'Sale', 'Internal Use', 'Return', 'Adjustment'], required: true },
      { ...cost, label: 'Cost (Total)' },
      supplierId,
      { ...paymentMethod, required: false },
      { ...paymentStatus, required: false },
      { ...responsibleEmployeeId, label: 'Responsible User' },
      { name: 'sourceId', label: 'Sale', type: 'relation', required: false, relation: { targetTable: '@@PRESET_TABLE_KEY::sales' }, searchable: false },
      { name: 'detailKey', label: 'Detail Key', type: 'string', required: false, hidden: true, searchable: false },
    ],
  } as ITableSchema,
};

