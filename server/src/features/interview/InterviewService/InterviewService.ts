import { logger } from '../../../lib/logger';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { IMessage, InterviewStage, IInterviewTurnResult, ProcessableStage } from '../models/InterviewTypes';
import { PresetMatcher } from './PresetMatcher';
import { StageHandlers } from './StageHandlers';
import { stageConfig } from './PromptConfig';
import { CustomizationService } from '../CustomizationService/CustomizationService';

/**
 * Serviço responsável por orquestrar todo o processo de entrevista com IA
 */
export class InterviewService {
  private static instance: InterviewService;
  private openaiService: OpenAIService;
  private presetMatcher: PresetMatcher;
  private stageHandlers: StageHandlers;
  private customizationService: CustomizationService;

  private constructor() {
    this.openaiService = OpenAIService.getInstance();
    this.customizationService = CustomizationService.getInstance();
    this.presetMatcher = new PresetMatcher(this.openaiService);
    this.stageHandlers = new StageHandlers(this.openaiService, this.customizationService);
    logger.info('[InterviewService] Initialized');
  }

  public static getInstance(): InterviewService {
    if (!InterviewService.instance) {
      InterviewService.instance = new InterviewService();
    }
    return InterviewService.instance;
  }

  /**
   * Verifica se um estágio é processável com lógica específica
   */
  private isProcessableStage(stage: InterviewStage): stage is ProcessableStage {
    return Object.keys(stageConfig).includes(stage);
  }

  /**
   * Processa um turno da entrevista, avançando o estágio se necessário
   */
  public async processTurn(
    stage: InterviewStage, 
    messages: IMessage[], 
    presetKey?: string, 
    sessionId?: string
  ): Promise<IInterviewTurnResult> {
    try {
      logger.info(`[InterviewService] Processando turno no estágio: ${stage}`);
      
      // Estágios especiais que não seguem o fluxo padrão
      if (stage === 'GREETING') {
        return {
          response: "Olá! Para começarmos, por favor me conte sobre o seu negócio ou projeto para que eu possa entender como melhor ajudá-lo com a configuração do sistema.",
          nextStage: 'DISCOVERING_BUSINESS'
        };
      } 
      
      else if (stage === 'MATCHING_PRESET') {
        const matchedPreset = await this.presetMatcher.findMatchingPreset(messages);
        
        if (!matchedPreset) {
          return {
            response: "Não encontrei um preset que se encaixe perfeitamente no seu negócio. Mas não se preocupe, podemos criar um sistema totalmente personalizado. Vamos começar definindo as principais funcionalidades que você precisa.",
            nextStage: 'IDENTIFYING_ENTITIES'
          };
        }
        
        const tablesInfo = this.presetMatcher.extractTablesInfo(matchedPreset.aiDescription);
        const tablesFormatted = tablesInfo.length > 0 ? 
          `Ele inclui as seguintes tabelas principais: ${tablesInfo.join(', ')}.` : '';
        
        // Criar um prompt para a IA gerar uma mensagem amigável
        const systemPrompt = `Você é um assistente especializado em sistemas de gestão para pequenos negócios.

Um cliente acabou de descrever seu negócio, e você identificou o sistema "${matchedPreset.name}" como ideal para ele.

Este sistema inclui as seguintes funcionalidades: ${tablesInfo.join(', ')}.

Crie uma mensagem acolhedora e entusiasmada (em primeira pessoa) explicando ao cliente que você encontrou este sistema, destacando o que ele poderá fazer com ele em termos práticos para o negócio dele (sem mencionar "tabelas", apenas funcionalidades).

Ao final, pergunte se ele gostaria de criar o sistema diretamente ou customizá-lo primeiro.

Sua mensagem deve ter tom conversacional, ser breve (máximo 5 linhas) e incluir as opções em negrito: **criar o sistema agora** ou **customizar**.`;
        
        // Obter resposta da IA
        const aiResponse = await this.stageHandlers.getAiResponseWithHistory(systemPrompt, []);
        
        // Fallback se a IA não responder corretamente
        const response = aiResponse || `Ótimo! Encontrei um sistema de **${matchedPreset.name}** que combina com o que você precisa.

Com ele você poderá gerenciar ${tablesInfo.slice(0, 3).join(', ')} e muito mais.

Gostaria de **criar o sistema agora** ou prefere **customizar** primeiro?`;
        
        return { 
          response, 
          nextStage: 'AWAITING_CREATION_TYPE_CONFIRMATION', 
          presetKey: matchedPreset.key 
        };
      } 
      
      else if (stage === 'AWAITING_CREATION_TYPE_CONFIRMATION' && presetKey) {
        return await this.stageHandlers.handleCreationTypeConfirmation(messages, presetKey);
      } 
      
      else if (stage === 'CUSTOMIZATION_IN_PROGRESS' && sessionId) {
        return await this.customizationService.processCustomizationStep(sessionId, messages);
      }
      
      else if (stage === 'CUSTOMIZATION_COMPLETED') {
        return {
          response: "Sua customização foi concluída com sucesso! O sistema será criado com todas as modificações que você solicitou.",
          nextStage: 'CUSTOMIZATION_COMPLETED' // Mantém o estágio para evitar ciclos indesejados
        };
      }
      

      else if (this.isProcessableStage(stage)) {
        const config = stageConfig[stage];
        let aiResponse = await this.stageHandlers.getAiResponseWithHistory(config.systemPrompt, messages);

        if (!aiResponse) {
          return {
            response: "Desculpe, estou com problemas para processar sua solicitação no momento. Vamos tentar novamente.",
            nextStage: stage
          };
        }

        let isCompleted = false;
        if (stage === 'DISCOVERING_BUSINESS') {
          // Verifica se a resposta contém o marcador SUMMARY:, indicando que a IA coletou informações suficientes
          isCompleted = aiResponse.includes('SUMMARY:');
        } else if (config.completionCheckPrompt) {
          // Para outros estágios, usa a verificação por IA se um prompt de verificação estiver configurado
          const checkResult = await this.stageHandlers.getAiResponseWithHistory(
            config.completionCheckPrompt,
            [...messages, { role: 'assistant', content: aiResponse }]
          );
          isCompleted = checkResult?.toLowerCase() === 'true';
        }

        if (isCompleted) {
          if (stage === 'DISCOVERING_BUSINESS') {
            // Extrai o resumo do negócio e cria uma pergunta de confirmação
            const summaryIndex = aiResponse.indexOf('SUMMARY:');
            const summaryText = aiResponse.substring(summaryIndex + 'SUMMARY:'.length).trim();
            const confirmationQuestion = `Entendi. Então, em resumo, seu negócio é: ${summaryText}. Isso está correto?`;
            return { response: confirmationQuestion, nextStage: 'CONFIRMING_BUSINESS' };
          }
          
          // Para outros estágios completos, avança para o próximo estágio configurado
          // Processa imediatamente o próximo estágio (importante para CONFIRMING_BUSINESS -> MATCHING_PRESET)
          return this.processTurn(config.nextStage, messages);
        }

        return { response: aiResponse, nextStage: stage };
      }

      // Estágio não processável (segue padrão de chat normal)
      else {
        const standardPrompt = `Você é um assistente especializado em configuração de sistemas. 
        Ajude o usuário a entender e configurar seu sistema da melhor maneira possível.`;
        
        const aiResponse = await this.stageHandlers.getAiResponseWithHistory(standardPrompt, messages);
        
        return {
          response: aiResponse || "Desculpe, não consegui processar sua solicitação.",
          nextStage: stage
        };
      }
    } catch (error) {
      logger.error(`[InterviewService] Erro ao processar turno: ${error}`);
      return {
        response: "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
        nextStage: 'CANNOT_PROCEED'
      };
    }
  }
}
