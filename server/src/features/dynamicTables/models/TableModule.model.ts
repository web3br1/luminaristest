import type { ISchemaField, ITableSchema } from './DynamicTable.model';
import type { DynamicTableCategory } from './TableCategories';

/**
 * Define a configuração que pode ser passada para a função de criação de um módulo.
 * Permite adicionar ou omitir campos do schema base.
 */
export interface ITableModuleConfig {
  addFields?: ISchemaField[];
  omitFields?: string[];
}

/**
 * Define a estrutura de uma tabela final gerada por um módulo.
 * Este é o objeto que será usado nos presets de sistema.
 */
export interface IPresetTable {
  name: string;
  description: string;
  category: DynamicTableCategory;
  schema: ITableSchema;
}

/**
 * A interface genérica para um Módulo de Tabela.
 * Garante que todo módulo seja auto-descritivo (expondo seus schemas)
 * e tenha uma função de criação padronizada que pode retornar um conjunto de tabelas.
 */
export interface ITableModule {
  schemas: Record<string, ISchemaField[]>;
  create: (config?: ITableModuleConfig) => Record<string, IPresetTable>;
}
