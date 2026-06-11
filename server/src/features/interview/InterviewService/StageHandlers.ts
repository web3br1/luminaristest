import { IMessage, InterviewStage, IInterviewTurnResult } from '../models/InterviewTypes';
import OpenAI from 'openai';
import { logger } from '../../../lib/logger';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { IPresetKnowledge } from '../../dynamicTables/presets/ai/PresetKnowledgeBase';
import { stageConfig } from './PromptConfig';
import { CustomizationService } from '../CustomizationService/CustomizationService';

/**
 * Classe responsável pelo processamento de estágios específicos da entrevista
 */
export class StageHandlers {
  private openaiService: OpenAIService;
  private customizationService: CustomizationService;

  constructor(openaiService: OpenAIService, customizationService: CustomizationService) {
    this.openaiService = openaiService;
    this.customizationService = customizationService;
  }

  /**
   * Obtém resposta da IA com base no prompt do sistema e mensagens da conversa
   */
  public async getAiResponseWithHistory(systemPrompt: string, messages: IMessage[]): Promise<string | null> {
    try {
      // Converte as mensagens para o formato esperado pelo OpenAI
      const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ 
          role: m.role, 
          content: m.content 
        }))
      ];

      // Solicita a resposta do OpenAI
      return await this.openaiService.getChatCompletionWithHistory(formattedMessages);
    } catch (error) {
      logger.error(`[StageHandlers] Erro ao obter resposta da IA: ${error}`);
      return null;
    }
  }



  /**
   * Processa a confirmação do tipo de criação (direta ou customizada)
   */
  public async handleCreationTypeConfirmation(
    messages: IMessage[], 
    presetKey: string
  ): Promise<IInterviewTurnResult> {
    try {
      logger.info(`[StageHandlers] Processando confirmação do tipo de criação para preset ${presetKey}`);
      
      // Obtém a última mensagem do usuário
      const lastMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastMessage) {
        return {
          response: "Não entendi sua escolha. Por favor, indique se deseja customizar o sistema ou criar diretamente.",
          nextStage: 'AWAITING_CREATION_TYPE_CONFIRMATION'
        };
      }

      const userContent = lastMessage.content.toLowerCase();
      
      // Verifica se o usuário quer customizar o sistema
      const wantsToCustomize = 
        userContent.includes('custom') || 
        userContent.includes('personaliz') || 
        userContent.match(/option\s*1/i) || 
        userContent.match(/op[çc][ãa]o\s*1/i);
        
      // Se o usuário não quer customizar, vai direto para a conclusão
      if (!wantsToCustomize) {
        logger.info('[StageHandlers] Usuário escolheu criar diretamente');
        return {
          response: "Ótimo! Seu sistema será criado diretamente com as configurações padrão.",
          nextStage: 'COMPLETED',
          presetKey
        };
      }
      
      // Cria uma sessão de customização
      logger.info('[StageHandlers] Usuário escolheu customizar o sistema');
      
      // Gera um sessionId para a customização
      const sessionId = this.customizationService.generateSessionId();
      
      // Cria a sessão de customização
      const customizationState = this.customizationService.createCustomizationSession(presetKey, sessionId);
      
      if (!customizationState) {
        logger.error(`[StageHandlers] Falha ao criar sessão de customização para preset ${presetKey}`);
        return {
          response: "Desculpe, houve um erro ao preparar a customização. Vamos criar seu sistema com as configurações padrão.",
          nextStage: 'COMPLETED',
          presetKey
        };
      }
      
      // Gera a apresentação das tabelas e ajusta o prompt
      const tablesPresentation = await this.customizationService.generateTablesPresentation(sessionId, true);
      
      // Avança para o estágio de customização em andamento
      return {
        response: tablesPresentation,
        nextStage: 'CUSTOMIZATION_IN_PROGRESS',
        presetKey,
        startCustomization: true,
        sessionId,
        customizationState
      };
    } catch (error) {
      logger.error(`[StageHandlers] Erro ao processar confirmação do tipo de criação: ${error}`);
      return {
        response: "Desculpe, houve um erro ao processar sua escolha. Vamos criar o sistema com as configurações padrão.",
        nextStage: 'COMPLETED',
        presetKey
      };
    }
  }
}
