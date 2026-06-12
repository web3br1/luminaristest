import { logger } from '../../../lib/logger';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { IMessage } from '../models/InterviewTypes';
import OpenAI from 'openai';

/**
 * Classe responsável por gerenciar as interações com a IA durante o processo de customização
 */
export class AIInteractions {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
  }

  /**
   * Obtém uma resposta da IA com base no prompt do sistema e mensagens da conversa
   */
  public async getAiResponse(systemPrompt: string, messages: IMessage[]): Promise<string | null> {
    try {
      logger.info('[AIInteractions] Obtendo resposta da IA');

      // Converte as mensagens para o formato esperado pelo OpenAI
      const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ 
          role: m.role, 
          content: m.content 
        }))
      ];

      // Solicita a resposta do OpenAI
      const response = await this.openaiService.getChatCompletionWithHistory(formattedMessages);
      return response;
    } catch (error) {
      logger.error(`[AIInteractions] Erro ao obter resposta da IA: ${error}`);
      return null;
    }
  }

  /**
   * Analisa a intenção do usuário em uma mensagem de customização
   */
  public async analyzeUserIntent(
    userMessage: string,
    customizationContext: string
  ): Promise<{ action: 'add' | 'remove' | 'done' | 'unknown', entity?: string }> {
    try {
      logger.info('[AIInteractions] Analisando intenção do usuário');

      const systemPrompt = `
        Você é um analisador de intenção do usuário durante um processo de customização de sistema.
        Analise a mensagem do usuário e determine se ele está querendo:
        1. Adicionar uma nova funcionalidade ou tabela
        2. Remover uma funcionalidade ou tabela existente
        3. Finalizar a customização
        
        Contexto da customização:
        ${customizationContext}
        
        Responda APENAS no formato JSON:
        {
          "action": "add" | "remove" | "done" | "unknown",
          "entity": "nome da tabela ou funcionalidade" (apenas se action for add ou remove)
        }
      `;

      const response = await this.getAiResponse(systemPrompt, [{ role: 'user', content: userMessage }]);

      if (!response) {
        logger.error('[AIInteractions] Sem resposta da análise de intenção');
        return { action: 'unknown' };
      }

      try {
        // Extrai e parseia o JSON da resposta usando regex correta e fallback via JSON.parse
        // BUG FIX (R28): regex anterior /\{[^\}]*\}/ tinha backslashes literais e nunca fazia match.
        // Agora tentamos extrair o primeiro bloco JSON com regex multi-line e, em seguida,
        // fazemos o parse via try/catch para robustez.
        let jsonCandidate: string | null = null;
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonCandidate = jsonMatch[0];
        } else {
          // Último recurso: tentar parsear a resposta inteira
          jsonCandidate = response.trim();
        }
        const result = JSON.parse(jsonCandidate);
        logger.info(`[AIInteractions] Intenção identificada: ${result.action}`);
        return result;
      } catch (parseError) {
        logger.error(`[AIInteractions] Erro ao parsear JSON da intenção: ${parseError}`);
      }

      return { action: 'unknown' };
    } catch (error) {
      logger.error(`[AIInteractions] Erro ao analisar intenção: ${error}`);
      return { action: 'unknown' };
    }
  }

  /**
   * Gera uma explicação para o usuário sobre como adicionar uma nova tabela
   */
  public async generateAddingGuidance(): Promise<string> {
    const systemPrompt = `
      Você é um assistente especializado em ajudar usuários a customizar sistemas.
      Gere uma explicação clara e concisa sobre como o usuário deve proceder para adicionar
      uma nova tabela ao sistema. Explique que ele deve fornecer:
      
      1. O nome da tabela
      2. Uma breve descrição da finalidade da tabela
      3. Alguns campos principais que essa tabela deve ter
      
      Use formatação markdown para tornar a explicação mais legível.
    `;

    const response = await this.getAiResponse(systemPrompt, []);
    return response || `
      # Adicionando uma Nova Tabela
      
      Para adicionar uma nova tabela ao seu sistema, por favor forneça:
      
      1. **Nome da tabela** - Um nome claro e descritivo
      2. **Descrição** - Para que serve esta tabela?
      3. **Campos principais** - Quais informações ela deve armazenar?
      
      Exemplo: "Quero adicionar uma tabela de Fornecedores para registrar informações de empresas que fornecem produtos para meu negócio, com campos como nome da empresa, contato, produtos fornecidos e condições de pagamento."
    `;
  }

  /**
   * Gera uma explicação para o usuário sobre como remover uma tabela
   */
  public async generateRemovingGuidance(availableTables: string[]): Promise<string> {
    const systemPrompt = `
      Você é um assistente especializado em ajudar usuários a customizar sistemas.
      Gere uma explicação clara e concisa sobre como o usuário deve proceder para remover
      uma tabela do sistema. Liste as tabelas disponíveis para remoção:
      
      ${availableTables.map(table => `- ${table}`).join('\n')}
      
      Explique que algumas tabelas são essenciais e não podem ser removidas.
      Use formatação markdown para tornar a explicação mais legível.
    `;

    const response = await this.getAiResponse(systemPrompt, []);
    return response || `
      # Removendo uma Tabela
      
      Para remover uma tabela do seu sistema, por favor indique o nome da tabela que deseja remover.
      
      Tabelas disponíveis para remoção:
      ${availableTables.map(table => `- ${table}`).join('\n')}
      
      Exemplo: "Quero remover a tabela de Produtos"
      
      **Nota:** Algumas tabelas são essenciais para o funcionamento do sistema e não podem ser removidas.
    `;
  }
}
