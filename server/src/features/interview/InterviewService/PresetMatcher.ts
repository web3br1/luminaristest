import { IMessage } from '../models/InterviewTypes';
import { IPresetKnowledge, presetKnowledgeBase } from '../../dynamicTables/presets/ai/PresetKnowledgeBase';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { logger } from '../../../lib/logger';

/**
 * Classe responsável por encontrar o preset mais adequado com base na descrição do negócio
 */
export class PresetMatcher {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
  }

  /**
   * Encontra o preset mais adequado com base nas mensagens da conversa
   */
  public async findMatchingPreset(messages: IMessage[]): Promise<IPresetKnowledge | null> {
    try {
      logger.info('[PresetMatcher] Procurando preset compatível com o negócio do usuário');

      // Extraímos o conteúdo completo da conversa para análise
      const businessDescription = messages.map(m => m.content).join('\n');
      
      // Criamos um prompt para identificar o preset adequado com base em toda a conversa
      const systemPrompt = `Based on the following conversation, which of these presets is the best fit? Respond with only the 'key' of the best-matching preset, or 'none' if no good match is found.\n\nConversation:\n${businessDescription}\n\nPresets:\n${JSON.stringify(presetKnowledgeBase, null, 2)}`;

      // Consulta o OpenAI para obter o preset mais adequado
      // Nota: usamos getAiResponseWithHistory que é equivalente ao getAiResponse original
      const aiResponse = await this.openaiService.getChatCompletionWithHistory([
        { role: 'system', content: systemPrompt },
      ]);

      if (!aiResponse) {
        logger.error('[PresetMatcher] Não foi possível obter resposta da IA');
        return null;
      }

      logger.info(`[PresetMatcher] Resposta da IA: ${aiResponse}`);
      
      // Extrair a chave do formato possível "key: beautySalon" ou apenas "beautySalon"
      let keyToMatch = aiResponse.trim().toLowerCase();
      
      // Remove aspas simples ou duplas
      keyToMatch = keyToMatch.replace(/['"]/g, '');
      
      // Se estiver no formato "key: valor", extrai apenas o valor
      const keyValueMatch = keyToMatch.match(/key\s*:\s*([\w]+)/);
      if (keyValueMatch && keyValueMatch[1]) {
        keyToMatch = keyValueMatch[1];
      }
      
      logger.info(`[PresetMatcher] Chave extraída para busca: ${keyToMatch}`);
      
      // Verificação case-insensitive com a chave processada
      if (keyToMatch && keyToMatch.toLowerCase() !== 'none') {
        const matchedPreset = presetKnowledgeBase.find(p => 
          p.key.toLowerCase() === keyToMatch
        );
        
        if (matchedPreset) {
          logger.info(`[PresetMatcher] Preset encontrado: ${matchedPreset.name} (${matchedPreset.key})`);
          return matchedPreset;
        }
      }
      
      logger.error('[PresetMatcher] Nenhum preset adequado encontrado');
      return null;
    } catch (error) {
      logger.error(`[PresetMatcher] Erro ao encontrar preset: ${error}`);
      return null;
    }
  }

  /**
   * Extrai os nomes das tabelas mencionadas na descrição do preset
   */
  public extractTablesInfo(description: string): string[] {
    try {
      // Encontra a seção de tabelas na descrição
      const tableMatches = description.match(/tabelas[^:]*:([^.]+)/i);
      if (!tableMatches || !tableMatches[1]) return [];

      // Processa a string que contém os nomes das tabelas
      return tableMatches[1]
        .split(/,\s+|\s+e\s+/)
        .map(tableName => {
          // Remove parênteses e informações adicionais
          return tableName.trim().replace(/\s*\([^)]*\)\s*/g, '');
        })
        .filter(Boolean);
    } catch (error) {
      logger.error(`[PresetMatcher] Erro ao extrair tabelas: ${error}`);
      return [];
    }
  }
}
