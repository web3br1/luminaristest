import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, email, cpf, phone } from '../../fields/text/TextPresets';
import { birthDate } from '../../fields/date/DatePresets';
import { isActive } from '../../fields/boolean/BooleanPresets';
import { unitId } from '../../fields/relation/RelationPresets';

/**
 * @description Core module for the "employees" table.
 * Manages employee identity, contact, role, unit assignment, commission rates and work schedule.
 */
export const employeesModule = {
  name: 'Employees',
  description: 'Employee registry with contact, role, unit and commission data.',
  category: 'people',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...name, label: 'Full Name' },
      { name: 'role', label: 'Role', type: 'string', required: true },
      { ...email, label: 'Work Email' },
      { ...cpf, label: 'CPF' },
      { ...phone, label: 'Phone' },
      { ...birthDate, label: 'Birth Date' },
      { name: 'startDate', label: 'Start Date', type: 'date', required: false, searchable: false },
      { ...unitId, required: false, label: 'Assigned Unit' },
      {
        name: 'serviceCommission',
        label: 'Service Commission %',
        type: 'number',
        numberFormat: 'percentage',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        searchable: false,
      },
      {
        name: 'productCommission',
        label: 'Product Commission %',
        type: 'number',
        numberFormat: 'percentage',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        searchable: false,
      },
      {
        name: 'monthlyCost',
        label: 'Monthly Cost',
        type: 'number',
        numberFormat: 'currency',
        required: false,
        validation: { minValue: 0 },
        searchable: false,
      },
      { ...isActive, label: 'Active' },
      {
        name: 'workSchedule',
        label: 'Work Schedule',
        type: 'json',
        required: false,
        searchable: false,
        description: 'Ex: { "monday": { "start": "09:00", "end": "18:00" } }',
      },
    ],
  } as ITableSchema,
};
