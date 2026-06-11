import type { ITableSchema, ISchemaField } from '../models/DynamicTable.model';
import type { DynamicTableCategory } from '../models/TableCategories';

/**
 * Opções de configuração para a criação de uma tabela a partir de um módulo base.
 */
interface IModuleConfig {
  /**
   * Uma lista de nomes de campos a serem removidos do esquema base.
   * @example ['birthDate', 'consentDate']
   */
  omit?: string[];

  /**
   * Uma lista de novos objetos de campo a serem adicionados ao esquema base.
   */
  add?: ISchemaField[];
}

/**
 * Cria uma definição de tabela customizada a partir de um esquema de módulo base.
 *
 * @param baseModule O módulo base exportado pelo módulo.
 * @param config As opções de customização (campos a adicionar ou omitir).
 * @returns Um objeto contendo a definição da tabela pronta para ser usada em um preset.
 */
export function createTableFromModule(
  baseModule: any,
  config: IModuleConfig = {}
): { name: string; category: DynamicTableCategory; schema: ITableSchema; meta?: any; analytics?: any[] } {
  // Clonar profundamente para evitar mutações no objeto original do módulo
  const newModule = JSON.parse(JSON.stringify(baseModule));

  // 1. Omitir campos, se especificado
  if (config.omit && config.omit.length > 0) {
    newModule.schema.fields = newModule.schema.fields.filter(
      (field: ISchemaField) => !config.omit?.includes(field.name)
    );
  }

  // 2. Adicionar novos campos, se especificado
  if (config.add && config.add.length > 0) {
    newModule.schema.fields.push(...config.add);
  }

  return {
    name: newModule.name as string,
    category: newModule.category as DynamicTableCategory,
    schema: newModule.schema as ITableSchema,
    ...(newModule.meta ? { meta: newModule.meta } : {}),
    ...(Array.isArray(newModule.analytics) ? { analytics: newModule.analytics } : {}),
  };
}
