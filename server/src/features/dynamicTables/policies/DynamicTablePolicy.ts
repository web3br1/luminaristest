import type { UserContext } from '../../../lib/authUtils';
import { IDynamicTable, ITableSchema } from '../models/DynamicTable.model';
import { IDynamicTablePolicy } from './IDynamicTablePolicy';
import { Role } from '../../users/models/User.model';

export class DynamicTablePolicy implements IDynamicTablePolicy {
  // Ninguém pode criar tabelas via API. A criação é gerenciada pelo sistema.
  canCreate(user: UserContext): boolean {
    return false;
  }

  // Apenas o usuário associado ou um admin pode visualizar a tabela.
  canView(user: UserContext, table: IDynamicTable): boolean {
    return user.role === Role.ADMIN || user.id === table.userId;
  }

  // Ninguém pode editar a estrutura de uma tabela via API.
  canUpdate(user: UserContext, table: IDynamicTable): boolean {
    return false;
  }

  // Ninguém pode deletar uma tabela via API.
  canDelete(user: UserContext, table: IDynamicTable): boolean {
    return false;
  }

  // A user can manage data (create, update, delete entries) in a table if they are the owner.
  // System tables (e.g. analyticsDefinitions) are read-only for end-users — only internal
  // system processes (isSystem = true) are authorised to write to them.
  canManageData(user: UserContext, table: IDynamicTable): boolean {
    const presentation = (table.schema as ITableSchema)?.ui?.presentation;
    if (presentation === 'system') return false;
    return user.id === table.userId;
  }
}
