import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name } from '../../fields/text/TextPresets';
import { isActive } from '../../fields/boolean/BooleanPresets';
import { unitId } from '../../fields/relation/RelationPresets';

/**
 * @description Core module for the "leadPipelines" table.
 * Each pipeline is a named sales funnel belonging to a business unit.
 */
export const leadPipelinesModule = {
  name: 'Lead Pipelines',
  description: 'Sales funnels (pipelines) per business unit.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...name, label: 'Pipeline Name' },
      { ...isActive, name: 'isDefault', label: 'Default', defaultValue: false },
    ],
    compositeUnique: [
      { fields: ['unitId', 'name'], errorMessage: 'A pipeline with this name already exists for this unit.' },
    ],
  } as ITableSchema,
};
