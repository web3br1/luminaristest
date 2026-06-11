import type { UserContext } from '../../../lib/authUtils';
import { IDynamicTable } from '../models/DynamicTable.model';

export interface IDynamicTablePolicy {
  canCreate(user: UserContext): boolean;
  canView(user: UserContext, table: IDynamicTable): boolean;
  canUpdate(user: UserContext, table: IDynamicTable): boolean;
  canDelete(user: UserContext, table: IDynamicTable): boolean;
  canManageData(user: UserContext, table: IDynamicTable): boolean;
}
