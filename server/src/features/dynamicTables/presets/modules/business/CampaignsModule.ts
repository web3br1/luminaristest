import type { ITableSchema } from '../../../models/DynamicTable.model';
import {
  budget,
  dateRange,
  engagementRate,
  name,
  status,
  targetAudience,
  unitId,
} from '../../fields';

/**
 * @description Módulo base para a tabela "campaigns" (campanhas de marketing).
 */
export const campaignsModule = {
  name: 'Campaigns',
  description: 'Manages marketing campaigns, such as seasonal promotions or loyalty programs.',
  category: 'operations',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...name, label: 'Campaign Name' },
      targetAudience,
      ...dateRange,
      budget,
      {
        name: 'spent',
        label: 'Amount Spent',
        type: 'number',
        required: false,
        numberFormat: 'currency',
        validation: { minValue: 0 },
        searchable: false,
        description: 'Amount effectively spent on the campaign.',
      },
      engagementRate,
      status,
      {
        name: 'channel',
        label: 'Channel',
        type: 'select',
        options: ['Instagram', 'Facebook', 'WhatsApp', 'Email', 'SMS', 'Google Ads', 'TikTok', 'Other'],
        required: false,
      },
      {
        name: 'type',
        label: 'Campaign Type',
        type: 'select',
        options: ['Promotion', 'Seasonal', 'Loyalty', 'Referral', 'Brand Awareness', 'Other'],
        required: false,
      },
    ],
    compare: [
      {
        left: 'endDate',
        op: 'gt',
        right: 'startDate',
        errorMessage: 'End date must be after start date.',
      },
      {
        left: 'spent',
        op: 'lte',
        right: 'budget',
        errorMessage: 'Spent amount cannot exceed the budget.',
      },
    ],
  } as ITableSchema,
};
