import type { IDynamicTable, ITableSchema } from '../models/DynamicTable.model';
import type { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';

export type RuleOperation = 'create' | 'update' | 'delete';

export interface RuleContext {
  userId: string;
  table: IDynamicTable;
  schema: ITableSchema;
  operation: RuleOperation;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  repository: IDynamicTableRepository;
  isSystem?: boolean;
}

export interface RulePlugin {
  name: string;
  supports(ctx: RuleContext): boolean;
  beforeCreate?(ctx: RuleContext): Promise<void> | void;
  afterCreate?(ctx: RuleContext): Promise<void> | void;
  beforeUpdate?(ctx: RuleContext): Promise<void> | void;
  afterUpdate?(ctx: RuleContext): Promise<void> | void;
  beforeDelete?(ctx: RuleContext): Promise<void> | void;
  afterDelete?(ctx: RuleContext): Promise<void> | void;
}


