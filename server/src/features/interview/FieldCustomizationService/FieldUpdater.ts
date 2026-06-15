import { logger } from '../../../lib/logger';
import { ICustomizableTable } from '../models/InterviewTypes';
import { IFieldModification, IField } from './Types';
import type { ISchemaField } from '../../dynamicTables/models/DynamicTable.model';

/**
 * Aplica as modificações de campo em uma determinada tabela (funcionalidade).
 */
export class FieldUpdater {
  /**
   * Atualiza os campos de uma tabela com base em uma lista de modificações.
   * @param table A tabela original a ser modificada.
   * @param modifications A lista de modificações extraídas da intenção do usuário.
   * @returns Um objeto contendo a nova versão da tabela e se houve modificações.
   */
  public update(table: ICustomizableTable, modifications: IFieldModification[]): { 
    updatedTable: ICustomizableTable;
    modified: boolean;
  } {
    try {
      if (!modifications.length) {
        return { 
          updatedTable: table, 
          modified: false 
        };
      }

      let updatedFields: IField[] = [...(table.fields || [])] as unknown as IField[];
      let modificationsMade = false;

      logger.info(`[FieldUpdater] Aplicando ${modifications.length} modificações à tabela ${table.key}`);

      modifications.forEach(mod => {
        switch (mod.action) {
          case 'add':
            // Verificar se o campo já existe para evitar duplicação
            if (!this.fieldExists(updatedFields, mod.field.name)) {
              // Lógica para adicionar um novo campo
              updatedFields.push(this.sanitizeField(mod.field));
              logger.debug(`[FieldUpdater] Campo adicionado: ${mod.field.name}`);
              modificationsMade = true;
            } else {
              logger.warn(`[FieldUpdater] Campo já existe, ignorando adição: ${mod.field.name}`);
            }
            break;
            
          case 'remove':
            // Verificar se o campo existe antes de remover
            if (this.fieldExists(updatedFields, mod.originalFieldName)) {
              // Lógica para remover um campo
              const initialLength = updatedFields.length;
              updatedFields = updatedFields.filter(f => f.name !== mod.originalFieldName);
              
              if (initialLength !== updatedFields.length) {
                logger.debug(`[FieldUpdater] Campo removido: ${mod.originalFieldName}`);
                modificationsMade = true;
              }
            } else {
              logger.warn(`[FieldUpdater] Campo não encontrado para remoção: ${mod.originalFieldName}`);
            }
            break;
            
          case 'update':
            // Verificar se o campo existe antes de atualizar
            if (this.fieldExists(updatedFields, mod.originalFieldName)) {
              // Lógica para atualizar um campo existente
              updatedFields = updatedFields.map(f => 
                f.name === mod.originalFieldName ? this.mergeFields(f, mod.field) : f
              );
              logger.debug(`[FieldUpdater] Campo atualizado: ${mod.originalFieldName} -> ${mod.field.name}`);
              modificationsMade = true;
            } else {
              logger.warn(`[FieldUpdater] Campo não encontrado para atualização: ${mod.originalFieldName}`);
            }
            break;
        }
      });

      return {
        updatedTable: {
          ...table,
          fields: updatedFields as unknown as ISchemaField[],
        },
        modified: modificationsMade
      };
    } catch (error) {
      logger.error(`[FieldUpdater] Erro ao atualizar campos: ${error}`);
      return { 
        updatedTable: table,
        modified: false 
      }; // Retorna a tabela original sem modificações em caso de erro
    }
  }

  /**
   * Verifica se um campo existe na lista de campos pelo nome
   */
  private fieldExists(fields: IField[], fieldName?: string): boolean {
    if (!fieldName) return false;
    return fields.some(f => f.name === fieldName);
  }

  /**
   * Sanitiza um campo para garantir que possui todos os atributos necessários
   */
  private sanitizeField(field: IField): IField {
    return {
      name: field.name,
      label: field.label || field.name,
      type: field.type || 'string',
      required: typeof field.required === 'boolean' ? field.required : false,
      hidden: false,
      description: field.description || ''
    };
  }

  /**
   * Combina dois objetos de campo, mantendo os valores originais quando não especificados
   */
  private mergeFields(original: IField, update: IField): IField {
    return {
      ...original,
      ...update,
      // Manter valores originais se não especificados
      label: update.label || original.label,
      type: update.type || original.type,
      required: typeof update.required === 'boolean' ? update.required : original.required,
      hidden: typeof update.hidden === 'boolean' ? update.hidden : original.hidden,
      description: update.description || original.description || ''
    };
  }
}
