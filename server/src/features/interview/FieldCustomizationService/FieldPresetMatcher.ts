import { logger } from '../../../lib/logger';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { ISchemaField } from '../../../features/dynamicTables/models/DynamicTable.model';
import { fieldPresetKnowledgeBase, IFieldPresetKnowledge } from '../../../features/dynamicTables/presets/fields/FieldPresetKnowledgeBase';

/**
 * Classe responsável por encontrar presets de campos adequados
 * com base na descrição do usuário
 */
export class FieldPresetMatcher {
  private openaiService: OpenAIService;
  
  constructor() {
    this.openaiService = OpenAIService.getInstance();
    logger.info('[FieldPresetMatcher] Inicializado');
  }
  
  /**
   * Busca um preset de campo pelo nome exato ou com correspondência aproximada.
   * @param fieldName Nome do campo a ser buscado (ex: "email", "telefone")
   * @returns O preset encontrado ou null se não houver correspondência
   */
  public findExactFieldMatch(fieldName: string): ISchemaField | null {
    // Normaliza o nome do campo (remove acentos, converte para lowercase)
    const normalizedFieldName = fieldName.toLowerCase().trim();
    
    // Busca por correspondência exata na chave
    const exactMatch = fieldPresetKnowledgeBase.find(preset => 
      preset.key === normalizedFieldName
    );
    
    if (exactMatch) {
      logger.info(`[FieldPresetMatcher] Correspondência exata encontrada para "${fieldName}": ${exactMatch.key}`);
      return exactMatch.preset;
    }
    
    // Busca por correspondência em sinônimos
    const synonymMatch = fieldPresetKnowledgeBase.find(preset => 
      preset.synonyms.some(synonym => 
        synonym.toLowerCase() === normalizedFieldName
      )
    );
    
    if (synonymMatch) {
      logger.info(`[FieldPresetMatcher] Correspondência por sinônimo encontrada para "${fieldName}": ${synonymMatch.key}`);
      return synonymMatch.preset;
    }
    
    logger.info(`[FieldPresetMatcher] Nenhuma correspondência exata encontrada para "${fieldName}"`);
    return null;
  }
  
  /**
   * Verifica se um campo já existe na tabela para evitar duplicidade.
   * @param fieldName Nome do campo a verificar
   * @param existingFields Array de campos existentes na tabela
   * @returns true se o campo já existir, false caso contrário
   */
  public fieldExists(fieldName: string, existingFields: ISchemaField[]): boolean {
    const normalizedFieldName = fieldName.toLowerCase().trim();
    
    // Verifica se existe um campo com nome igual ou similar
    const exists = existingFields.some(field => 
      field.name.toLowerCase() === normalizedFieldName || 
      field.label.toLowerCase() === normalizedFieldName
    );
    
    if (exists) {
      logger.info(`[FieldPresetMatcher] Campo "${fieldName}" já existe na tabela`);
    }
    
    return exists;
  }
  
  /**
   * Busca semanticamente um preset de campo com base na descrição do usuário.
   * @param fieldDescription Descrição do campo desejado pelo usuário
   * @param existingFields Campos já existentes na tabela (para evitar duplicação)
   * @returns O preset encontrado ou null se não houver correspondência
   */
  public async findFieldPreset(
    fieldDescription: string, 
    existingFields: ISchemaField[]
  ): Promise<{
    found: boolean;
    preset: ISchemaField | null;
    exactMatch: boolean;
    matchedKey?: string;
    customRecommendation?: ISchemaField | null;
  }> {
    try {
      // 1. Primeiro tenta busca exata pelo nome/sinônimos
      const words = fieldDescription.toLowerCase().split(/\s+/);
      
      // Tenta encontrar pelo nome exato ou sinônimo
      for (const word of words) {
        if (word.length < 3) continue; // Ignora palavras muito curtas
        
        const exactMatch = this.findExactFieldMatch(word);
        if (exactMatch) {
          // Verifica se o campo já existe na tabela
          if (this.fieldExists(exactMatch.name, existingFields)) {
            return {
              found: false,
              preset: null,
              exactMatch: true,
              matchedKey: exactMatch.name,
            };
          }
          
          return {
            found: true,
            preset: exactMatch,
            exactMatch: true,
            matchedKey: exactMatch.name,
          };
        }
      }
      
      // 2. Se não encontrou correspondência exata, usa IA para busca semântica
      logger.info(`[FieldPresetMatcher] Realizando busca semântica para: "${fieldDescription}"`);
      
      // Prepara o prompt para a IA
      const promptTemplate = `
        Você é um assistente especializado em encontrar o campo mais adequado para uma tabela de banco de dados.
        
        Abaixo está uma lista de campos disponíveis no sistema, com suas descrições:
        
        ${fieldPresetKnowledgeBase.map(field => 
          `- ${field.key} (${field.type}): ${field.aiDescription}`
        ).join('\n')}
        
        O usuário está solicitando um campo com a seguinte descrição:
        "${fieldDescription}"
        
        Responda com o seguinte formato JSON:
        {
          "matchFound": true/false, // Se encontrou um campo adequado
          "fieldKey": "nome_do_campo", // Nome do campo encontrado, se houver
          "confidence": 0-100, // Nível de confiança da correspondência (0-100)
          "reasoning": "Explicação breve do porquê este campo é adequado ou não"
        }
        
        Se nenhum campo existente for adequado, retorne matchFound: false e sugira um nome e configuração para um novo campo personalizado.
      `;
      
      const response = await this.openaiService.getChatCompletion(
        JSON.stringify([{ role: 'system', content: promptTemplate }]),
        'gpt-4-turbo'
      );
      
      // Extrai o JSON da resposta
      if (!response) {
        logger.error('[FieldPresetMatcher] Resposta nula da IA');
        return { found: false, preset: null, exactMatch: false };
      }
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('[FieldPresetMatcher] Falha ao extrair JSON da resposta da IA');
        return { found: false, preset: null, exactMatch: false };
      }
      
      try {
        const result = JSON.parse(jsonMatch[0]);
        
        if (result.matchFound && result.fieldKey && result.confidence > 70) {
          const matchedPreset = fieldPresetKnowledgeBase.find(p => p.key === result.fieldKey);
          
          if (matchedPreset) {
            // Verifica se o campo já existe na tabela
            if (this.fieldExists(matchedPreset.preset.name, existingFields)) {
              return {
                found: false,
                preset: null,
                exactMatch: false,
                matchedKey: matchedPreset.key,
              };
            }
            
            logger.info(`[FieldPresetMatcher] Correspondência semântica encontrada: ${matchedPreset.key} (confiança: ${result.confidence}%)`);
            
            return {
              found: true,
              preset: matchedPreset.preset,
              exactMatch: false,
              matchedKey: matchedPreset.key,
            };
          }
        } else {
          // Se não encontrou um preset adequado, a IA pode sugerir um campo personalizado
          logger.info(`[FieldPresetMatcher] Nenhum preset adequado encontrado para: "${fieldDescription}"`);
          return {
            found: false,
            preset: null,
            exactMatch: false,
            customRecommendation: null // Aqui poderíamos ter uma sugestão personalizada da IA
          };
        }
      } catch (error) {
        logger.error(`[FieldPresetMatcher] Erro ao analisar JSON da resposta: ${error}`);
        return { found: false, preset: null, exactMatch: false };
      }
      
      return { found: false, preset: null, exactMatch: false };
    } catch (error) {
      logger.error(`[FieldPresetMatcher] Erro ao buscar preset de campo: ${error}`);
      return { found: false, preset: null, exactMatch: false };
    }
  }
}
