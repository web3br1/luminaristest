import type { ITableSchema } from '../../../models/DynamicTable.model';
import { amount, dateRange, description, goalResultSelect, metricKey, periodSelect, unitId } from '../../fields';

/**
 * @description Strategic Goals Module.
 * Defines and tracks goals per business unit, including numeric KPI targets.
 */
export const goalsModule = {
  name: 'Goals',
  description: 'Defines and tracks strategic goals per unit.',
  category: 'operations',
  schema: {
    defaultDisplayField: 'description',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...description, type: 'textarea', required: true, label: 'Description' },
      periodSelect,
      ...dateRange,
      goalResultSelect,
      metricKey,
      {
        ...amount,
        name: 'targetAmount',
        label: 'Target Amount',
        required: false,
      },
      {
        ...amount,
        name: 'actualAmount',
        label: 'Actual Amount',
        required: false,
        description: 'Amount achieved so far.',
      },
    ],
    compare: [
      {
        left: 'endDate',
        op: 'gt',
        right: 'startDate',
        errorMessage: 'End date must be after start date.',
      },
    ],
  } as ITableSchema,
};
