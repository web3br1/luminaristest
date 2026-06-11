import OpenAI from 'openai';
import { logger } from '../../../lib/logger';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { ICustomizableTable, IMessage } from '../models/InterviewTypes';
import { ISchemaField } from '../../../features/dynamicTables/models/DynamicTable.model';
import { FieldIntentParser } from './FieldIntentParser';
import { FieldUpdater } from './FieldUpdater';
import { promptConfig } from './PromptConfig';
import { FieldPresetMatcher } from './FieldPresetMatcher';
import { IFieldCustomizationResult } from './Types';
import { StateManager } from '../CustomizationService/StateManager';

/**
 * @description
 * Este serviço é responsável por processar solicitações de customização de campos
 * de uma funcionalidade (tabela) com base na conversa com o usuário.
 * 
 * O fluxo principal envolve:
 * 1. Receber uma mensagem do usuário sobre customização de campos
 * 2. Analisar a intenção do usuário utilizando IA
 * 3. Extrair as modificações estruturadas (campos a adicionar/remover/modificar)
 * 4. Aplicar estas modificações na tabela atual
 * 5. Retornar a tabela atualizada e uma mensagem amigável para o usuário
 */
export class FieldCustomizationService {
  private static instance: FieldCustomizationService;
  private openaiService: OpenAIService;
  private fieldUpdater: FieldUpdater;
  private fieldIntentParser: FieldIntentParser;
  private fieldPresetMatcher: FieldPresetMatcher;
  private stateManager: StateManager;

  /**
   * Inicializa o serviço com suas dependências
   */
  private constructor() {
    this.openaiService = OpenAIService.getInstance();
    this.fieldIntentParser = new FieldIntentParser();
    this.fieldUpdater = new FieldUpdater();
    this.fieldPresetMatcher = new FieldPresetMatcher();
    this.stateManager = StateManager.getInstance(); // Adiciona o StateManager singleton
    logger.info('[FieldCustomizationService] Serviço inicializado com StateManager singleton');
  }

  /**
   * Obtém a instância única do serviço (Singleton)
   */
  public static getInstance(): FieldCustomizationService {
    if (!FieldCustomizationService.instance) {
      FieldCustomizationService.instance = new FieldCustomizationService();
    }
    return FieldCustomizationService.instance;
  }

  /**
   * Processa uma mensagem do usuário para customizar os campos de uma tabela.
   * @param userMessage A mensagem enviada pelo usuário
   * @param currentTable A tabela atual que está sendo customizada
   * @param conversationHistory Histórico da conversa para contexto
   * @returns Resultado da customização com tabela atualizada e mensagem
   */
  public async processMessage(
    sessionId: string,
    tableKey: string,
    userMessage: string,
    conversationHistory: IMessage[] = []
  ): Promise<IFieldCustomizationResult> {
    // 1. Obter o estado da sessão a partir do StateManager
    const customizationState = this.stateManager.getSessionState(sessionId);
    if (!customizationState) {
      logger.error(`[FieldCustomizationService] Sessão ${sessionId} não encontrada.`);
      throw new Error(`Sessão não encontrada.`);
    }

    // 2. Encontrar a tabela específica dentro da sessão
    const currentTable = customizationState.tables.find((t: ICustomizableTable) => t.key === tableKey);
    if (!currentTable) {
      logger.error(`[FieldCustomizationService] Tabela ${tableKey} não encontrada na sessão ${sessionId}.`);
      throw new Error(`Tabela não encontrada na sessão.`);
    }

    try {
      logger.info(`[FieldCustomizationService] Processando mensagem para tabela '${currentTable.key}' na sessão ${sessionId}`);

      // 3. Preparar o contexto da conversa para a IA
      const messages = this.prepareConversationContext(userMessage, currentTable, conversationHistory);
      
      // 4. Enviar para OpenAI e obter análise da intenção
      logger.debug('[FieldCustomizationService] Enviando contexto para análise de intenção');
      const aiRawResponse = await this.openaiService.getChatCompletionWithHistory(
        messages,
        'gpt-4-turbo'
      );

      // 5. Analisar e estruturar a resposta da IA
      const structuredResponse = this.fieldIntentParser.parse(aiRawResponse || '');
      
      // 6. Validar se conseguimos extrair a intenção corretamente
      if (!structuredResponse || !this.fieldIntentParser.hasValidModifications(structuredResponse)) {
        logger.warn('[FieldCustomizationService] Não foi possível estruturar a resposta da IA ou não há modificações válidas');
        return {
          updatedTable: currentTable,
          aiMessage: structuredResponse?.friendlyMessage || 
            'Desculpe, não entendi exatamente o que você gostaria de modificar. Poderia explicar melhor?',
          modified: false,
          conversationHistory: currentTable.conversationHistory // Adiciona o histórico atual
        };
      }

      // 7. Processar as solicitações de adição de campo para buscar presets
      const processedModifications = await this.processFieldModifications(
        structuredResponse.modifications,
        currentTable.fields || []
      );

      // 8. Aplicar as modificações na tabela
      logger.debug(`[FieldCustomizationService] Aplicando ${processedModifications.modifications.length} modificações`);
      const { updatedTable, modified } = this.fieldUpdater.update(currentTable, processedModifications.modifications);

      // 9. Atualizar o estado da tabela no StateManager
      if (modified) {
        // Obtém todas as tabelas, substitui a que foi modificada e atualiza o estado
        const allTables = customizationState.tables.map(t => 
          t.key === tableKey ? updatedTable : t
        );
        
        // Adiciona a mensagem do usuário e da IA ao histórico
        const userMessageEntry = { role: 'user', content: userMessage, timestamp: new Date() };
        const assistantMessageEntry = { role: 'assistant', content: processedModifications.message, timestamp: new Date() };
        updatedTable.conversationHistory.push(userMessageEntry, assistantMessageEntry);

        // Atualiza o estado da sessão com as tabelas modificadas
        this.stateManager.updateTables(sessionId, [updatedTable]);
      }

      // 10. Retornar o resultado da operação com a mensagem adequada
      return {
        updatedTable,
        aiMessage: processedModifications.message,
        modified,
        conversationHistory: updatedTable.conversationHistory
      };
    } catch (error) {
      logger.error(`[FieldCustomizationService] Erro ao processar mensagem: ${error}`);
      return {
        updatedTable: currentTable, // Retorna a tabela antes da falha
        aiMessage: 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.',
        modified: false,
        conversationHistory: currentTable.conversationHistory
      };
    }
  }

  /**
   * Prepara o contexto da conversa para a IA analisar a intenção do usuário
   */
  private prepareConversationContext(
    userMessage: string,
    currentTable: ICustomizableTable,
    conversationHistory: IMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // Preparar o prompt de sistema com dados da tabela atual
    const systemPrompt = this.getSystemPrompt(currentTable);
    
    // Converter o histórico de conversa para o formato esperado pela OpenAI
    const formattedHistory = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Montar a estrutura completa de mensagens
    return [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ];
  }

  /**
   * Gera o prompt de sistema para a IA, incluindo dados da tabela atual
   */
  private getSystemPrompt(currentTable: ICustomizableTable): string {
    // Formatar os campos de maneira mais legível para a IA
    const formattedFields = (currentTable.fields || []).map(field => {
      return `- ${field.label} (${field.name}): Tipo ${field.type}${field.required ? ', obrigatório' : ''}`;
    }).join('\n');

    // Substituir os marcadores no template do prompt
    return promptConfig.FIELD_CUSTOMIZATION_PROMPT
      .replace('{{TABLE_NAME}}', currentTable.name)
      .replace('{{TABLE_DESCRIPTION}}', currentTable.description)
      .replace('{{TABLE_FIELDS}}', formattedFields);
  }

  /**
   * Processa modificações de campos para buscar e usar presets quando disponíveis
   * @param modifications Lista de modificações solicitadas pelo usuário via IA
   * @param existingFields Campos existentes na tabela atual
   * @returns Modificações processadas e mensagem atualizada
   */
  private async processFieldModifications(modifications: any[], existingFields: ISchemaField[]) {
    // Resultado final a ser retornado
    let processedResult = {
      modifications: [...modifications],
      message: ""
    };

    // Apenas processa as adições de campo para buscar presets
    const addModifications = modifications.filter(mod => mod.action === 'add');
    
    if (addModifications.length === 0) {
      return processedResult; // Não há adições, retorna as modificações originais
    }

    // Processa apenas a primeira adição para manter a interação mais simples
    const addMod = addModifications[0];
    const fieldDescription = addMod.fieldDescription || 
                            `Campo do tipo ${addMod.field.type} chamado ${addMod.field.label}`;

    try {
      // Busca o preset que corresponde à descrição
      const presetResult = await this.fieldPresetMatcher.findFieldPreset(
        fieldDescription, 
        existingFields
      );

      if (presetResult.found && presetResult.preset) {
        // Encontrou um preset adequado
        logger.info(`[FieldCustomizationService] Preset encontrado: ${presetResult.matchedKey}`);
        
        // Substitui o campo customizado pelo preset
        const modIndex = processedResult.modifications.findIndex(m => 
          m.action === 'add' && m.field.name === addMod.field.name
        );

        if (modIndex >= 0) {
          // Cria uma cópia do preset para não modificar o original
          const presetField = { ...presetResult.preset };

          // Preserva o label personalizado se for diferente do padrão
          if (addMod.field.label && addMod.field.label !== presetField.label) {
            presetField.label = addMod.field.label;
          }

          // Substitui a modificação original pelo preset
          processedResult.modifications[modIndex] = {
            ...processedResult.modifications[modIndex],
            field: presetField
          };

          // Atualiza a mensagem para informar sobre o uso do preset
          processedResult.message = promptConfig.FIELD_PRESET_FOUND_PROMPT
            .replace('{{PRESET_NAME}}', presetResult.preset.label)
            .replace('{{PRESET_DESCRIPTION}}', presetResult.preset.description || 
              `Campo do tipo ${presetResult.preset.type}`);
        }
      } else if (!presetResult.found && !presetResult.exactMatch) {
        // Não encontrou preset, mantém o campo personalizado e pergunta ao usuário
        processedResult.message = promptConfig.FIELD_PRESET_NOT_FOUND_PROMPT
          .replace('{{FIELD_NAME}}', addMod.field.label)
          .replace('{{FIELD_TYPE}}', addMod.field.type)
          .replace('{{FIELD_DESCRIPTION}}', addMod.field.description || fieldDescription);
      }

      return processedResult;
    } catch (error) {
      logger.error(`[FieldCustomizationService] Erro ao processar presets de campos: ${error}`);
      return processedResult; // Em caso de erro, mantém as modificações originais
    }
  }

  /**
   * Valida os campos de uma tabela e sugere melhorias (opcional)
   * @param table A tabela a ser validada
   * @returns Sugestões de melhoria para os campos
   */
  public async validateFields(table: ICustomizableTable): Promise<{
    suggestions: string;
    valid: boolean;
  }> {
    try {
      logger.info(`[FieldCustomizationService] Validando campos da tabela '${table.key}'`);
      
      // Preparar prompt para validação
      const validationPrompt = promptConfig.FIELD_VALIDATION_PROMPT
        .replace('{{TABLE_NAME}}', table.name)
        .replace('{{TABLE_DESCRIPTION}}', table.description)
        .replace('{{TABLE_FIELDS}}', JSON.stringify(table.fields || []));
      
      // Enviar para validação
      const response = await this.openaiService.getChatCompletion(
        JSON.stringify([{ role: 'system', content: validationPrompt }]),
        'gpt-4-turbo'
      );
      
      return {
        suggestions: response || 'Não foi possível validar os campos.',
        valid: !response?.toLowerCase().includes('recomend')
      };
    } catch (error) {
      logger.error(`[FieldCustomizationService] Erro ao validar campos: ${error}`);
      return {
        suggestions: 'Ocorreu um erro durante a validação dos campos.',
        valid: true // Assumir válido em caso de erro
      };
    }
  }
}

// Exporta a instância única do serviço para uso em outros módulos
export const fieldCustomizationService = FieldCustomizationService.getInstance();
