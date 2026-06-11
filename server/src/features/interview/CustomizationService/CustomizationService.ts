import { logger } from '../../../lib/logger';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { ICustomizationState, IInterviewTurnResult, IMessage } from '../models/InterviewTypes';
import { presetKnowledgeBase } from '../../dynamicTables/presets/ai/PresetKnowledgeBase';
import { presetService } from '../../dynamicTables/services/PresetService';
import { TableExtractor } from './TableExtractor';
import { AIInteractions } from './AIInteractions';
import { StateManager } from './StateManager';

/**
 * @description
 * Este serviço é responsável por guiar o usuário através do processo de customização
 * de um preset de sistema. Ele recebe o preset base e interagirá com o usuário
 * para modificar tabelas, campos e outras configurações.
 */
export class CustomizationService {
  private static instance: CustomizationService;
  private openaiService: OpenAIService;
  private tableExtractor: TableExtractor;
  private aiInteractions: AIInteractions;
  private stateManager: StateManager;

  private constructor() {
    this.stateManager = StateManager.getInstance();
    this.openaiService = OpenAIService.getInstance();
    this.tableExtractor = new TableExtractor();
    this.aiInteractions = new AIInteractions(this.openaiService);
    logger.info('[CustomizationService] Initialized');
  }

  public static getInstance(): CustomizationService {
    if (!CustomizationService.instance) {
      CustomizationService.instance = new CustomizationService();
    }
    return CustomizationService.instance;
  }

  /**
   * Gera um novo ID de sessão
   */
  public generateSessionId(): string {
    return this.stateManager.generateSessionId();
  }

  /**
   * Cria uma sessão de customização para um preset específico
   */
  public createCustomizationSession(presetKey: string, sessionId: string): ICustomizationState | null {
    logger.info(`[CustomizationService] Criando sessão de customização para preset ${presetKey} com sessionId ${sessionId}`);
    
    // Encontra o preset usando o PresetService em vez da base de conhecimento da AI
    const preset = presetService.getPresetByKey(presetKey);
    if (!preset) {
      logger.error(`[CustomizationService] Preset com key ${presetKey} não encontrado`);
      return null;
    }
    
    // Obtém a descrição para a IA da base de conhecimento
    const presetKnowledge = presetKnowledgeBase.find(p => p.key === presetKey);
    if (!presetKnowledge) {
      logger.error(`[CustomizationService] Conhecimento do preset com key ${presetKey} não encontrado na base da AI`);
      return null;
    }
    
    // Extrai as tabelas do preset real
    const tables = this.tableExtractor.extractTablesFromRealPreset(preset);
    
    // Cria o estado da customização usando o StateManager
    try {
      const customizationState = this.stateManager.createSessionState(
        presetKey,
        preset.name,
        tables,
        sessionId
      );
      
      return customizationState;
    } catch (error) {
      logger.error(`[CustomizationService] Erro ao criar sessão de customização: ${error}`);
      return null;
    }
  }

  /**
   * Gera uma apresentação elegante das tabelas do preset para o usuário
   */
  public async generateTablesPresentation(sessionId: string, isInteractive = false): Promise<string> {
    logger.info(`[CustomizationService] Gerando apresentação de tabelas para sessionId ${sessionId}`);
    
    if (!this.stateManager.sessionExists(sessionId)) {
      logger.error(`[CustomizationService] Sessão com ID ${sessionId} não encontrada`);
      return 'Sessão de customização não encontrada. Por favor, tente novamente.';
    }
    
    const session = this.stateManager.getSessionState(sessionId);
    if (!session) {
      logger.error(`[CustomizationService] Estado da sessão ${sessionId} não disponível apesar de existir`);
      return 'Erro interno ao obter dados da sessão. Por favor, tente novamente.';
    }
    
    // No modo interativo, geramos uma resposta simples, pois os detalhes serão exibidos no painel lateral
    if (isInteractive) {
      return `# Customização do Sistema "${session.presetName}"

Por favor, observe o painel de customização à esquerda para ver todas as funcionalidades atuais do seu sistema.

O que você gostaria de fazer agora?

1. **Adicionar** novas funcionalidades
2. **Remover** funcionalidades existentes
3. **Finalizar** a customização e criar o sistema`;
    }

    // Para o modo não-interativo, geramos a apresentação completa com todos os detalhes
    // Gera uma apresentação detalhada de cada tabela, incluindo alguns campos principais quando disponíveis
    const tablesFormatted = session.tables.map(table => {
      let tablePresentation = `**${table.name}**: ${table.description}`;

      // Se a tabela tem campos definidos, adiciona alguns dos principais campos à apresentação
      if (table.fields && Array.isArray(table.fields) && table.fields.length > 0) {
        // Seleciona até 5 campos principais para mostrar como exemplo
        const mainFields = table.fields
          .filter(field => field.label && !field.hidden) // Exibe apenas campos não ocultos
          .slice(0, 5)
          .map(field => `${field.label}${field.required ? ' (obrigatório)' : ''}`);

        if (mainFields.length > 0) {
          tablePresentation += `\n   - Campos principais: ${mainFields.join(', ')}`;
        }
      }

      return tablePresentation;
    }).join('\n- ');

    const systemPrompt = `Você é um consultor de sistemas especializado em ajudar clientes a personalizar soluções para seus negócios.

O cliente escolheu customizar o sistema "${session.presetName}" que contém as seguintes tabelas/funcionalidades:

- ${tablesFormatted}

Gere uma mensagem elegante e bem formatada explicando ao cliente que estas são as funcionalidades atuais do sistema. Pergunte se ele gostaria de adicionar novas funcionalidades, remover alguma existente ou finalizar a customização.

Sua resposta deve ser clara, usar formatação markdown para ficar bonita e fácil de entender, e oferecer opções claras para o cliente escolher: adicionar, remover ou finalizar a customização e criar o sistema.`;

    const aiResponse = await this.aiInteractions.getAiResponse(systemPrompt, []);
    return aiResponse || `# Customização do Sistema ${session.presetName}

## Funcionalidades Atuais

Estas são as tabelas e funcionalidades incluídas no seu sistema:

- ${tablesFormatted}

## Próximos Passos

Você gostaria de:

1. **Adicionar** novas funcionalidades
2. **Remover** alguma funcionalidade existente
3. **Finalizar** a customização e criar o sistema`;
  }

  /**
   * Processa a resposta do usuário durante a customização
   */
  public async processCustomizationStep(sessionId: string, messages: IMessage[]): Promise<IInterviewTurnResult> {
    try {
      logger.info(`[CustomizationService] Processando passo de customização para sessionId ${sessionId}`);

      // Verifica se a sessão existe
      if (!this.stateManager.sessionExists(sessionId)) {
        logger.error(`[CustomizationService] Sessão com ID ${sessionId} não encontrada`);
        return {
          response: "Desculpe, ocorreu um erro ao processar sua customização. Vamos recomeçar.",
          nextStage: 'MATCHING_PRESET'
        };
      }
      
      const session = this.stateManager.getSessionState(sessionId);
      // TypeScript não consegue inferir que session não é nulo depois da verificação de sessionExists
      // Por isso, fazemos uma verificação adicional para garantir a type safety
      if (!session) {
        logger.error(`[CustomizationService] Estado da sessão ${sessionId} não disponível apesar de existir`);
        return {
          response: "Desculpe, ocorreu um erro interno. Vamos recomeçar.",
          nextStage: 'MATCHING_PRESET'
        };
      }

      // Obtém a última mensagem do usuário
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        logger.warn(`[CustomizationService] Não foi encontrada nenhuma mensagem do usuário para processar`);
        return {
          response: "Não entendi sua solicitação. Por favor, diga o que deseja fazer com a customização do sistema.",
          nextStage: 'CUSTOMIZATION_IN_PROGRESS',
          sessionId
        };
      }

      // Adiciona a mensagem ao histórico de customização
      this.stateManager.addCustomizationMessage(sessionId, lastUserMessage);

      // Prepara o contexto para análise da intenção
      const customizationContext = this.stateManager.getCustomizationSummary(sessionId);
      
      // Se já estamos em um fluxo específico de ação, continue esse fluxo
      if (session.currentAction === 'adding') {
        // Processa a adição de uma nova tabela
        return await this.processAddingTable(sessionId, lastUserMessage.content);
      } 
      else if (session.currentAction === 'removing') {
        // Processa a remoção de uma tabela
        return await this.processRemovingTable(sessionId, lastUserMessage.content);
      }

      // Se não estamos em um fluxo específico, analisa a intenção do usuário
      const intent = await this.aiInteractions.analyzeUserIntent(
        lastUserMessage.content,
        customizationContext
      );

      // Com base na intenção, direciona para o fluxo adequado
      switch (intent.action) {
        case 'add':
          // Inicia o fluxo de adição de tabela
          this.stateManager.setCurrentAction(sessionId, 'adding');
          const addingGuidance = await this.aiInteractions.generateAddingGuidance();
          return {
            response: addingGuidance,
            nextStage: 'CUSTOMIZATION_IN_PROGRESS',
            sessionId
          };

        case 'remove':
          // Inicia o fluxo de remoção de tabela
          this.stateManager.setCurrentAction(sessionId, 'removing');
          // Prepara a lista de tabelas não essenciais para apresentar ao usuário
          const removableTables = session.tables
            .filter(t => !t.isCore)
            .map(t => t.name);

          const removingGuidance = await this.aiInteractions.generateRemovingGuidance(removableTables);
          return {
            response: removingGuidance,
            nextStage: 'CUSTOMIZATION_IN_PROGRESS',
            sessionId
          };

        case 'done':
          // Finaliza a customização
          this.stateManager.completeCustomization(sessionId);
          return {
            response: `# Customização Concluída!\n\nSeu sistema "${session.presetName}" foi customizado com sucesso e agora inclui todas as funcionalidades e tabelas que você solicitou.\n\nO sistema será criado conforme suas especificações.`,
            nextStage: 'CUSTOMIZATION_COMPLETED',
            sessionId
          };

        default:
          // Para intenção desconhecida, responde com uma mensagem genérica
          const systemPrompt = `
            Você é um assistente de customização de sistemas. O usuário está personalizando um sistema chamado "${session.presetName}".
            
            Estado atual do sistema:
            ${customizationContext}
            
            A mensagem do usuário foi: "${lastUserMessage.content}"
            
            Responda de forma útil e educada, explicando as opções disponíveis para customização:
            1. Adicionar novas funcionalidades/tabelas
            2. Remover funcionalidades/tabelas existentes que não são essenciais
            3. Finalizar a customização e criar o sistema
            
            Use formatação markdown para tornar sua resposta mais legível.
          `;

          const aiResponse = await this.aiInteractions.getAiResponse(systemPrompt, []);
          return {
            response: aiResponse || "Não entendi completamente o que você deseja fazer. Você gostaria de adicionar novas funcionalidades, remover alguma existente, ou finalizar a customização?",
            nextStage: 'CUSTOMIZATION_IN_PROGRESS',
            sessionId
          };
      }
    } catch (error) {
      logger.error(`[CustomizationService] Erro ao processar passo de customização: ${error}`);
      return {
        response: "Ocorreu um erro ao processar sua solicitação de customização. Por favor, tente novamente.",
        nextStage: 'CUSTOMIZATION_IN_PROGRESS',
        sessionId
      };
    }
  }

  /**
   * Processa a adição de uma nova tabela
   */
  private async processAddingTable(sessionId: string, userMessage: string): Promise<IInterviewTurnResult> {
    try {
      logger.info(`[CustomizationService] Processando adição de tabela para sessionId ${sessionId}`);

      // Extrai informações da tabela da mensagem do usuário
      const systemPrompt = `
        Você é um analisador de requisições para criação de tabelas em um sistema.
        Analise a mensagem do usuário e extraia:
        1. O nome da tabela a ser criada
        2. Uma breve descrição da finalidade da tabela
        
        A mensagem do usuário foi: "${userMessage}"
        
        Responda APENAS no formato JSON:
        {
          "tableName": "nome da tabela",
          "description": "descrição da tabela"
        }
        
        Se não for possível extrair essas informações, responda com:
        {
          "tableName": "",
          "description": ""
        }
      `;

      const aiResponse = await this.aiInteractions.getAiResponse(systemPrompt, []);
      if (!aiResponse) {
        logger.error(`[CustomizationService] Não foi possível analisar a requisição de adição de tabela`);
        return {
          response: "Não consegui entender os detalhes da tabela que você deseja adicionar. Por favor, forneça o nome e a descrição da tabela.",
          nextStage: 'CUSTOMIZATION_IN_PROGRESS',
          sessionId
        };
      }

      // Extrai o JSON da resposta
      try {
        const jsonMatch = aiResponse.match(/\\{[^\\}]*\\}/);
        if (jsonMatch) {
          const tableInfo = JSON.parse(jsonMatch[0]);

          // Verifica se as informações são válidas
          if (!tableInfo.tableName || !tableInfo.description) {
            return {
              response: "Não consegui identificar claramente o nome ou a descrição da tabela. Por favor, forneça essas informações no formato: \"Quero adicionar uma tabela de [nome] para [descrição]\".",
              nextStage: 'CUSTOMIZATION_IN_PROGRESS',
              sessionId
            };
          }

          // Adiciona a tabela ao estado
          const success = this.stateManager.addTable(
            sessionId,
            tableInfo.tableName,
            tableInfo.description
          );

          // Reseta o estado de ação
          this.stateManager.setCurrentAction(sessionId, null);

          if (success) {
            return {
              response: `# Tabela Adicionada com Sucesso!\n\nA tabela "${tableInfo.tableName}" foi adicionada ao seu sistema.\n\nVocê gostaria de:\n\n1. **Adicionar** outra funcionalidade\n2. **Remover** alguma funcionalidade existente\n3. **Finalizar** a customização e criar o sistema`,
              nextStage: 'CUSTOMIZATION_IN_PROGRESS',
              sessionId
            };
          } else {
            return {
              response: `Não foi possível adicionar a tabela "${tableInfo.tableName}". Ela pode já existir no sistema ou ocorreu um erro no processo.\n\nPor favor, tente um nome diferente ou escolha outra ação:`,
              nextStage: 'CUSTOMIZATION_IN_PROGRESS',
              sessionId
            };
          }
        }
      } catch (error) {
        logger.error(`[CustomizationService] Erro ao processar JSON da adição de tabela: ${error}`);
      }

      return {
        response: "Não consegui processar corretamente as informações da tabela. Por favor, tente novamente com um formato mais claro, especificando o nome e a descrição da tabela.",
        nextStage: 'CUSTOMIZATION_IN_PROGRESS',
        sessionId
      };
    } catch (error) {
      logger.error(`[CustomizationService] Erro ao processar adição de tabela: ${error}`);
      this.stateManager.setCurrentAction(sessionId, null);
      return {
        response: "Ocorreu um erro ao processar a adição da tabela. Por favor, tente novamente.",
        nextStage: 'CUSTOMIZATION_IN_PROGRESS',
        sessionId
      };
    }
  }

  /**
   * Processa a remoção de uma tabela
   */
  private async processRemovingTable(sessionId: string, userMessage: string): Promise<IInterviewTurnResult> {
    try {
      logger.info(`[CustomizationService] Processando remoção de tabela para sessionId ${sessionId}`);

      // Obtém o estado da customização
      const session = this.stateManager.getSessionState(sessionId);
      if (!session) {
        logger.error(`[CustomizationService] Sessão com ID ${sessionId} não encontrada`);
        return {
          response: "Ocorreu um erro ao processar a remoção da tabela. A sessão não foi encontrada.",
          nextStage: 'CUSTOMIZATION_IN_PROGRESS',
          sessionId
        };
      }

      // Extrai o nome da tabela a ser removida
      const systemPrompt = `
        Você é um analisador de requisições para remoção de tabelas em um sistema.
        Analise a mensagem do usuário e extraia o nome da tabela a ser removida.
        
        Tabelas disponíveis para remoção:
        ${session.tables.filter(t => !t.isCore).map(t => `- ${t.name} (key: ${t.key})`).join('\n')}
        
        A mensagem do usuário foi: "${userMessage}"
        
        Responda APENAS com o nome ou a chave da tabela a ser removida. Se não for possível identificar, responda com "unknown".
      `;

      const aiResponse = await this.aiInteractions.getAiResponse(systemPrompt, []);
      if (!aiResponse || aiResponse.trim().toLowerCase() === "unknown") {
        logger.error(`[CustomizationService] Não foi possível identificar a tabela a ser removida`);
        return {
          response: "Não consegui identificar qual tabela você deseja remover. Por favor, especifique o nome exato da tabela que deseja remover.",
          nextStage: 'CUSTOMIZATION_IN_PROGRESS',
          sessionId
        };
      }

      // Tenta remover a tabela
      const tableKey = aiResponse.trim();
      const success = this.stateManager.removeTable(sessionId, tableKey);

      // Reseta o estado de ação
      this.stateManager.setCurrentAction(sessionId, null);

      if (success) {
        return {
          response: `# Tabela Removida com Sucesso!\n\nA tabela "${tableKey}" foi removida do seu sistema.\n\nVocê gostaria de:\n\n1. **Adicionar** uma nova funcionalidade\n2. **Remover** outra funcionalidade existente\n3. **Finalizar** a customização e criar o sistema`,
          nextStage: 'CUSTOMIZATION_IN_PROGRESS',
          sessionId
        };
      } else {
        // Prepara a lista de tabelas não essenciais para apresentar ao usuário
        const removableTables = session.tables
          .filter(t => !t.isCore)
          .map(t => t.name);

        if (removableTables.length === 0) {
          return {
            response: "Não há tabelas que possam ser removidas. Todas as tabelas restantes são essenciais para o funcionamento do sistema.\n\nVocê gostaria de adicionar novas funcionalidades ou finalizar a customização?",
            nextStage: 'CUSTOMIZATION_IN_PROGRESS',
            sessionId
          };
        }

        return {
          response: `Não foi possível remover a tabela "${tableKey}". Ela pode ser essencial para o sistema ou não foi encontrada.\n\nTabelas disponíveis para remoção:\n${removableTables.map(t => `- ${t}`).join('\n')}\n\nPor favor, escolha uma das tabelas listadas ou selecione outra ação.`,
          nextStage: 'CUSTOMIZATION_IN_PROGRESS',
          sessionId
        };
      }
    } catch (error) {
      logger.error(`[CustomizationService] Erro ao processar remoção de tabela: ${error}`);
      this.stateManager.setCurrentAction(sessionId, null);
      return {
        response: "Ocorreu um erro ao processar a remoção da tabela. Por favor, tente novamente.",
        nextStage: 'CUSTOMIZATION_IN_PROGRESS',
        sessionId
      };
    }
  }
}
