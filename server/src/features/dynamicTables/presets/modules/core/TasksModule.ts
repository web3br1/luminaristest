import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, description } from '../../fields/text/TextPresets';
import { date } from '../../fields/date/DatePresets';

/**
 * @description Core module for the "tasks" Kanban table.
 * Provides a generic task board with status, priority, assignee and ordering.
 */
export const tasksModule = {
  name: 'Tasks',
  description: 'Kanban task board with status, priority, assignee and due date.',
  category: 'kanban',
  schema: {
    fields: [
      { ...name, label: 'Task Title' },
      description,
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: ['To Do', 'In Progress', 'In Review', 'Done'],
        defaultValue: 'To Do',
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        required: false,
        options: ['Low', 'Medium', 'High', 'Urgent'],
        defaultValue: 'Medium',
      },
      {
        name: 'assigneeId',
        label: 'Assignee',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
        searchable: false,
      },
      { ...date, label: 'Due Date' },
      {
        // Optional CRM link: a task can belong to a lead. `leads` is a core table
        // (auto-installed) so the preset marker resolves even without the CRM module.
        name: 'leadId',
        label: 'Lead',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leads' },
        searchable: false,
      },
      {
        name: 'reminderAt',
        label: 'Reminder At',
        type: 'datetime',
        required: false,
        searchable: false,
      },
      {
        name: 'order',
        label: 'Order',
        type: 'number',
        numberFormat: 'integer',
        required: true,
        defaultValue: 0,
        hidden: true,
        searchable: false,
      },
    ],
  } as ITableSchema,
};
