import type { ITableSchema } from '../../../models/DynamicTable.model';
import {
  consumedProducts,
  cost,
  duration,
  isActive,
  name,
  price,
  qualifiedEmployees,
  associatedProducts,
} from '../../fields';

/**
 * @description
 * Service module base.
 */
export const serviceModule = {
  name: 'Services',
  description: 'Service catalog with price, duration and consumed products.',
  category: 'services',
  meta: {
    providesCapabilities: ['services.catalog'],
  },
  schema: {
    defaultDisplayField: 'name',
    fields: [
      name,
      {
        name: 'category',
        label: 'Category',
        type: 'string',
        required: true,
      },
      price,
      { ...cost, label: 'Service Cost', description: 'Estimated service cost (materials, time, etc.).' },
      duration,
      consumedProducts,
      associatedProducts,
      qualifiedEmployees,
      isActive,
    ],
  } as ITableSchema,
};
