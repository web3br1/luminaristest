import { ITableSchema } from '../models/DynamicTable.model';

/**
 * Type guard para verificar se um objeto é um schema de tabela válido.
 * @param schema - O objeto a ser verificado.
 * @returns `true` se o objeto for um ITableSchema válido, caso contrário `false`.
 */
export function isTableSchema(schema: any): schema is ITableSchema {
  return schema !== null && typeof schema === 'object' && Array.isArray((schema as ITableSchema).fields);
}
