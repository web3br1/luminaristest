import { logger } from '../../../lib/logger';
import { z } from 'zod';
import { IStructuredAiResponse, IFieldModification } from './Types';

/**
 * Esquema de validação para o campo
 */
const fieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  hidden: z.boolean().optional(),
  description: z.string().optional()
});

/**
 * Esquema de validação para uma modificação
 */
const fieldModificationSchema = z.object({
  action: z.enum(['add', 'remove', 'update']),
  field: fieldSchema,
  originalFieldName: z.string().optional()
}).refine(data => {
  // Para ações de remove e update, originalFieldName é obrigatório
  if (data.action === 'remove' || data.action === 'update') {
    return !!data.originalFieldName;
  }
  return true;
}, {
  message: "Campo 'originalFieldName' é obrigatório para ações de 'remove' e 'update'"
});

/**
 * Esquema de validação para resposta da IA
 */
const aiResponseSchema = z.object({
  modifications: z.array(fieldModificationSchema),
  friendlyMessage: z.string()
});

/**
 * Responsável por analisar a resposta da IA e convertê-la em um objeto estruturado.
 */
export class FieldIntentParser {
  /**
   * Converte a resposta em string da IA (esperada como JSON) em um objeto IStructuredAiResponse.
   * @param aiResponse A resposta em string da IA.
   * @returns Um objeto IStructuredAiResponse ou null em caso de erro.
   */
  public parse(aiResponse: string): IStructuredAiResponse | null {
    try {
      // Extrair o bloco JSON da resposta da IA
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        logger.error('[FieldIntentParser] Nenhum JSON encontrado na resposta');
        return null;
      }
      
      const jsonString = jsonMatch[0];
      const jsonResponse = JSON.parse(jsonString);
      
      // Validar a estrutura do objeto com Zod
      const validationResult = aiResponseSchema.safeParse(jsonResponse);
      
      if (!validationResult.success) {
        logger.error(`[FieldIntentParser] Validação falhou: ${validationResult.error.toString()}`);
        return null;
      }
      
      return validationResult.data;
    } catch (error) {
      logger.error(`[FieldIntentParser] Erro ao analisar a resposta da IA: ${error}`);
      return null;
    }
  }

  /**
   * Verifica se uma resposta contém modificações válidas.
   * @param response A resposta estruturada da IA
   * @returns True se a resposta contém modificações válidas
   */
  public hasValidModifications(response: IStructuredAiResponse | null): boolean {
    return !!response && Array.isArray(response.modifications) && response.modifications.length > 0;
  }
}
