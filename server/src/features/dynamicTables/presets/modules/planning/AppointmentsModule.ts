import type { ITableSchema } from '../../../models/DynamicTable.model';
import { endAtDateTime, notes, simpleCustomerFlag, startAtDateTime } from '../../fields';
import { customerId, responsibleEmployeeId, serviceId, unitId } from '../../fields/relation/RelationPresets';
import { appointmentStatus } from '../../fields/select/SelectPresets';

export const appointmentsModule = {
  name: 'Appointments',
  description: 'Schedules for services, linking customer, service, professional and unit.',
  category: 'planning',
  meta: {
    requiresTables: ['services', 'customers'],
  },
  schema: {
    defaultDisplayField: 'startAt',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...customerId, required: false },
      { ...simpleCustomerFlag, label: 'Simple Customer' },
      { name: 'simpleCustomerName', label: 'Customer Name', type: 'string', required: false },
      serviceId,
      { ...responsibleEmployeeId, required: false, label: 'Professional' },
      { ...startAtDateTime, label: 'Start Date/Time' },
      { ...endAtDateTime, label: 'End Date/Time' },
      { ...appointmentStatus, label: 'Appointment Status', defaultValue: 'Scheduled' },
      notes,
    ],
    immutableAfter: [
      {
        condition: { field: 'status', op: 'in', value: ['Completed', 'No-Show', 'Cancelled'] },
        scope: ['startAt', 'endAt', 'serviceId', 'customerId', 'responsibleEmployeeId', 'unitId'],
        errorMessage: 'This appointment cannot be rescheduled or reassigned in its current status.',
      },
    ],
    lifecycle: [
      {
        field: 'status',
        transitions: {
          Scheduled: ['Completed', 'No-Show', 'Cancelled'],
          // Completed / No-Show / Cancelled are absent ⇒ terminal states.
        },
        errorMessage: 'Invalid appointment status transition.',
      },
    ],
    compare: [
      {
        left: 'endAt',
        op: 'gt',
        right: 'startAt',
        errorMessage: 'Agendamento inválido: fim deve ser após o início.',
      },
    ],
    noOverlap: [
      {
        startField: 'startAt',
        endField: 'endAt',
        scopeFields: ['unitId', 'responsibleEmployeeId'],
        errorMessage: 'Conflito de agenda: já existe outro compromisso nesse período.',
      },
    ],
  } as ITableSchema,
};
