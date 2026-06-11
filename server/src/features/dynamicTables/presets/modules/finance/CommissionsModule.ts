import type { ITableSchema } from '../../../models/DynamicTable.model';
import { amount, commissionRate, notes, employeeId, saleId, saleItemId, paidAt } from '../../fields';

/**
 * @description Commissions Module.
 * Tracks detailed commissions per employee per sale, with payment status.
 */
export const commissionsModule = {
  name: 'Commissions',
  description: 'Detailed commission tracking per employee per sale.',
  category: 'finance',
  meta: {
    requiresTables: ['sales', 'saleItems'],
  },
  schema: {
    defaultDisplayField: 'status',
    fields: [
      employeeId,
      saleId,
      saleItemId,
      { ...amount, label: 'Commission Amount' },
      commissionRate,
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['Pending', 'Paid', 'Cancelled'],
        required: true,
        defaultValue: 'Pending',
      },
      paidAt,
      notes,
    ],
    immutableAfter: [
      {
        condition: { field: 'status', op: 'eq', value: 'Paid' },
        scope: 'all',
        errorMessage: 'Paid commissions cannot be edited.'
      }
    ],
    lifecycle: [
      {
        field: 'status',
        transitions: {
          Pending: ['Paid', 'Cancelled'],
          // Paid and Cancelled are absent ⇒ terminal states.
        },
        errorMessage: 'Invalid commission status transition.',
      },
    ],
  } as ITableSchema,
};
