/**
 * Utilitários para gerenciar dependências entre tabelas dinâmicas
 */

import type { ISchemaField } from '../models/DynamicTable.model';
import { fetchRelatedTableData, fetchTableDetails } from './RelationUtils';

/**
 * Informações sobre uma tabela relacionada
 */
interface IRelatedTable {
  id: string;         // ID da tabela relacionada
  name: string;       // Nome da tabela relacionada
  recordCount: number; // Número de registros na tabela
  url: string;        // URL para acessar a tabela
}

/**
 * Verifica dependências de uma tabela
 * @param schema Schema da tabela
 * @returns Mapa de campos com suas dependências
 */
export async function checkTableDependencies(schema: { fields: ISchemaField[] }): Promise<Map<string, IRelatedTable>> {
  const dependencies = new Map<string, IRelatedTable>();
  
  // Se não houver schema ou campos, retorna mapa vazio
  if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
    return dependencies;
  }

  // Busca campos do tipo relation
  const relationFields = schema.fields.filter(function(field) {
    return field.type === 'relation' && field.relation && field.relation.targetTable;
  });

  if (relationFields.length === 0) {
    return dependencies;
  }

  // Para cada campo de relação, busca informações da tabela relacionada
  for (let i = 0; i < relationFields.length; i++) {
    const field = relationFields[i];
    
    if (field.relation && field.relation.targetTable) {
      try {
        const relatedTableInfo = await getRelatedTableInfo(field.relation.targetTable);
        
        if (relatedTableInfo) {
          dependencies.set(field.name, relatedTableInfo);
        }
      } catch (error) {
        console.error(`Erro ao verificar dependência para o campo ${field.name}:`, error);
      }
    }
  }

  return dependencies;
}

/**
 * Busca informações sobre uma tabela relacionada
 * @param tableId ID da tabela
 * @returns Informações da tabela relacionada
 */
async function getRelatedTableInfo(tableId: string): Promise<IRelatedTable | null> {
  try {
    // 1. Busca os detalhes da tabela para obter o nome.
    const tableDetails = await fetchTableDetails(tableId);
    if (!tableDetails) {
      console.warn(`getRelatedTableInfo: Detalhes não encontrados para a tabela ${tableId}.`);
      return null;
    }

    // 2. Busca os dados para contar os registros.
    const relatedData = await fetchRelatedTableData(tableId);
    if (relatedData === null) {
      // O erro já foi logado dentro da função chamada.
      return null;
    }

    // 3. Monta e retorna o objeto com as informações da dependência.
    return {
      id: tableId,
      name: tableDetails.name,
      recordCount: relatedData.length,
      url: `/dashboard/tables/${tableId}`,
    };

  } catch (error) {
    console.error(`Erro ao processar dependência da tabela ${tableId}:`, error);
    return null;
  }
}

/**
 * Verifica se todas as dependências de uma tabela têm registros
 * @param schema Schema da tabela
 * @returns true se todas as dependências têm registros
 */
export async function hasAllRequiredDependencies(schema: { fields: ISchemaField[] }): Promise<boolean> {
  const dependencies = await checkTableDependencies(schema);
  
  // Verifica se todas as dependências têm pelo menos um registro
  let allDependenciesHaveRecords = true;
  
  dependencies.forEach(function(relatedTable) {
    if (relatedTable.recordCount === 0) {
      allDependenciesHaveRecords = false;
    }
  });
  
  return allDependenciesHaveRecords;
}
