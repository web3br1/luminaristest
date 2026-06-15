// --- Utilities for handling table relationships (backend version) ---
import type { IDynamicTable, IDynamicTableData } from '../models/DynamicTable.model';
import { getFactory } from '../../../lib/factory';

/**
 * Carrega os dados de uma tabela relacionada para uso em campos de relação
 * @param targetTableId ID da tabela relacionada
 * @returns Lista de dados da tabela relacionada ou null em caso de erro
 */
export async function fetchRelatedTableData(targetTableId: string): Promise<IDynamicTableData[] | null> {
  if (!targetTableId || targetTableId.startsWith('@@PRESET_TABLE_KEY::')) {
    console.warn('fetchRelatedTableData: ID da tabela inválido ou não resolvido:', targetTableId);
    return null;
  }

  try {
    const repo = getFactory().getDynamicTableRepository();
    const { data } = await repo.findDataByTableId(targetTableId);
    return data;
  } catch (err) {
    console.error('Erro ao buscar dados relacionados:', err);
    return null;
  }
}

/**
 * Carrega os detalhes de uma tabela específica
 * @param tableId ID da tabela
 * @returns Detalhes da tabela ou null em caso de erro
 */
export async function fetchTableDetails(tableId: string): Promise<IDynamicTable | null> {
  if (!tableId || tableId.startsWith('@@PRESET_TABLE_KEY::')) {
    console.warn('fetchTableDetails: ID da tabela inválido ou não resolvido:', tableId);
    return null;
  }

  try {
    const repo = getFactory().getDynamicTableRepository();
    const table = await repo.findTableById(tableId);
    return table;
  } catch (err) {
    console.error(`Erro ao buscar detalhes da tabela ${tableId}:`, err);
    return null;
  }
}

/**
 * Formata um valor de exibição para um registro relacionado
 * @param record Registro relacionado
 * @param displayField Campo a ser exibido
 * @returns String formatada para exibição
 */
export function formatRelatedDisplayValue(record: IDynamicTableData | null, displayField: string): string {
  if (!record || !record.data) {
    return '(Não especificado)';
  }
  
  // Trata data como Record<string, unknown> para permitir acesso dinâmico
  const data = record.data as Record<string, unknown>;
  
  // Se o displayField não estiver presente, tenta usar um campo padrão
  let displayValue: unknown;
  
  if (data[displayField] !== undefined) {
    displayValue = data[displayField];
  } else if (data['name'] !== undefined) {
    displayValue = data['name'];
  } else if (data['title'] !== undefined) {
    displayValue = data['title'];
  } else if (data['id'] !== undefined) {
    displayValue = data['id'];
  } else {
    displayValue = '(Sem identificação)';
  }
  
  return String(displayValue);
}
