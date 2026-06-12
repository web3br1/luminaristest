import { IChatService } from './IChatService';
import { ChatRequestDto as ChatRequest, ChatResponseDto as ChatResponse } from '../dtos/ChatDto';
import { IEmbeddingService } from '@/lib/vector/embedding';
import { IVectorRepository } from '@/features/documents/repositories/IVectorRepository';
import { OpenAIService } from '@/lib/openai/OpenAIService';
import { LuminarisAgentService } from './LuminarisAgentService';
import { KnowledgeGraphService } from './KnowledgeGraphService';
import logger from '@/lib/logger';
import { UserContext } from '@/lib/authUtils';
import { ForbiddenError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import OpenAI from 'openai';
import { sanitizeUserInput, wrapSystemPrompt } from '@/lib/PromptSanitizer';

const RAG_SYSTEM_PROMPT = `
Você é um assistente de IA especializado em analisar documentos e responder perguntas com base estritamente no conteúdo fornecido.
Seu objetivo é fornecer respostas precisas e concisas, citando o texto exato dos documentos que suportam sua resposta.

Instruções:
1. Analise a pergunta do usuário e o contexto dos documentos fornecidos.
2. Se o contexto não contiver informações para responder à pergunta, afirme claramente que a resposta não foi encontrada nos documentos.
3. Baseie sua resposta SOMENTE nas informações extraídas do contexto. Não utilize conhecimento prévio ou informações externas.
4. Responda de forma direta e clara.
`;

const AGENT_SYSTEM_PROMPT = `
Você é o Luminaris AI Agent, um assistente inteligente integrado ao ERP/CRM do usuário.
Você tem acesso total ao MAPA DE CONHECIMENTO do sistema (tabelas e relações) que será fornecido abaixo.

Sua missão:
1. Analise o MAPA DE CONHECIMENTO para entender quais tabelas existem e como se relacionam.
2. Quando o usuário quiser criar algo, você DEVE chamar a ferramenta "request_record_creation" enviando TODO o objeto "data".
3. Quando quiser editar algo, use "request_record_update" com os campos alterados no objeto "data".
4. IMPORTANTE: Chamar a ferramenta É O PEDIDO DE CONFIRMAÇÃO. O sistema abrirá um modal automaticamente para o usuário. 
5. NÃO peça confirmação via texto antes de chamar a ferramenta. Se você tiver os dados, chame a ferramenta imediatamente.
6. REGRAS DE DADOS:
   - Se um campo tiver "Opções permitidas", você DEVE usar EXATAMENTE um dos valores da lista. NÃO traduza nem mude o valor (ex: se a opção for "Sale", use "Sale", não use "Venda").
   - Se o campo for uma RELATION, você deve fornecer o ID do registro relacionado.
   - Se faltarem dados obrigatórios, peça ao usuário ANTES de chamar a ferramenta.
7. Use a linguagem do usuário (Português) para conversar, mas mantenha os valores técnicos (IDs e Enums) idênticos ao Graph.
`;

export class ChatService implements IChatService {
  private embeddingService: IEmbeddingService;
  private vectorRepository: IVectorRepository;
  private openaiService: OpenAIService;
  private agentService: LuminarisAgentService;

  constructor(
    embeddingService: IEmbeddingService,
    vectorRepository: IVectorRepository,
    openaiService: OpenAIService,
    agentService: LuminarisAgentService,
    private readonly knowledgeGraphService: KnowledgeGraphService
  ) {
    this.embeddingService = embeddingService;
    this.vectorRepository = vectorRepository;
    this.openaiService = openaiService;
    this.agentService = agentService;
  }

  private async rewriteQueryWithHistory(query: string, history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<string> {
    const historyText = history
      .filter(h => h.role !== 'system') // Skip system instructions for query rewriting
      .map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}`)
      .join('\n');

    const rewritePrompt = `
Com base no histórico da conversa abaixo e na pergunta seguinte, reformule a pergunta para que ela seja autônoma e possa ser compreendida sem o histórico.
Responda APENAS com a pergunta reformulada.

Histórico da Conversa:
---
${historyText}
---

Pergunta a ser reformulada: "${query}"

Pergunta Reformulada:
`;

    const rewrittenQuery = await this.openaiService.getChatCompletion(rewritePrompt);
    // Retorna a query reescrita ou a original em caso de falha
    return rewrittenQuery ? rewrittenQuery.trim() : query;
  }

  async generateResponse(request: ChatRequest & { user: UserContext }): Promise<ChatResponse> {
    const { documentIds, history, confirmedProposalId, user } = request;
    const query = sanitizeUserInput(request.query ?? '');
    logger.info('Iniciando geração de resposta de chat', { queryLength: query.length, documentCount: documentIds?.length, historyLength: history?.length });

    // 0. Verifica se é uma confirmação de proposta
    if (confirmedProposalId) {
      logger.info('Executando proposta confirmada', { confirmedProposalId });
      try {
        const result = await this.agentService.executeProposal(user, confirmedProposalId);
        return {
          answer: `Pronto! A operação foi realizada com sucesso. ID do registro: ${result.result?.id || 'N/A'}`,
          type: 'TEXT',
          sourceDocuments: []
        };
      } catch (error: any) {
        return {
          answer: `Houve um erro ao executar a operação: ${error.message}`,
          type: 'TEXT',
          sourceDocuments: []
        };
      }
    }

    // Verifica se há documentos selecionados
    const hasSelectedDocuments = Array.isArray(documentIds) && documentIds.length > 0;

    // Se não houver documentos, usamos o fluxo de Agente ERP diretamente
    if (!hasSelectedDocuments) {
      logger.info('Nenhum documento selecionado. Usando modo AGENTE ERP.');

      const tools = await this.agentService.getTools(user.id);
      const knowledgeGraphPrompt = await this.knowledgeGraphService.getGraphPrompt(user.id);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: wrapSystemPrompt(AGENT_SYSTEM_PROMPT, user.id) },
        { role: 'system', content: knowledgeGraphPrompt },
        ...(history || []).map(h => ({ role: h.role, content: h.content } as any)),
        { role: 'user', content: query }
      ];

      // Loop de chamadas de ferramenta
      let iterations = 0;
      while (iterations < 5) {
        iterations++;
        const response = await this.openaiService.getChatCompletionWithToolsAndHistory(
          messages,
          tools
        );

        if (!response) break;

        if (response.tool_calls && response.tool_calls.length > 0) {
          messages.push(response as any);

          for (const toolCall of response.tool_calls) {
            let toolArgs: any;
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch (parseError) {
              logger.warn('Failed to parse tool args, skipping', { toolName: toolCall.function.name });
              continue;
            }
            const result = await this.agentService.handleToolCall(
              user,
              toolCall.function.name,
              toolArgs
            );

            // Se for uma proposta, interrompemos e retornamos para o frontend
            if (result.status === 'PROPOSED') {
              const proposal = await (this.agentService as any).getProposal(result.proposalId);
              return {
                answer: `Entendido! Estou propondo a seguinte ação na tabela **${proposal.tableName}**. Por favor, confirme os detalhes no modal abaixo para prosseguir.`,
                type: 'ACTION_PROPOSAL',
                proposal: {
                  id: proposal.id,
                  action: proposal.action,
                  tableName: proposal.tableName,
                  tableLabel: proposal.tableLabel,
                  data: proposal.data
                },
                sourceDocuments: []
              };
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            } as any);
          }
          // Após processar ferramentas, o loop continua para o LLM gerar o texto final baseado nos resultados
          // Mas precisamos enviar o histórico atualizado para o LLM
          const nextCompletion = await this.openaiService.getChatCompletionWithHistory(messages);
          if (nextCompletion) {
            return { answer: nextCompletion, type: 'TEXT', sourceDocuments: [] };
          }
          break;
        } else {
          return {
            answer: response.content || 'Não foi possível gerar uma resposta.',
            type: 'TEXT',
            sourceDocuments: [],
          };
        }
      }

      return { answer: 'O limite de processamento do agente foi atingido.', type: 'TEXT', sourceDocuments: [] };
    }

    // Caso contrário (modo RAG), segue com o fluxo normal

    // Security: verify that ALL requested documentIds actually belong to the
    // requesting user before touching the vector store. This prevents a
    // cross-tenant leak where user-B could read user-A's document content by
    // supplying user-A's documentId.
    const ownedDocs = await prisma.document.findMany({
      where: { id: { in: documentIds }, userId: user.id },
      select: { id: true },
    });
    if (ownedDocs.length !== documentIds.length) {
      logger.warn('RAG ownership check failed: one or more documents do not belong to the requesting user', {
        requestedIds: documentIds,
        userId: user.id,
        foundCount: ownedDocs.length,
      });
      throw new ForbiddenError('One or more documents do not belong to this user');
    }

    let contextualQuery = query;
    if (history && history.length > 1) {
      contextualQuery = await this.rewriteQueryWithHistory(query, history);
    }
    const queryEmbedding = await this.embeddingService.embedText(contextualQuery);
    // Pass userId so the vector store enforces tenant isolation at the index level.
    const searchResults = await this.vectorRepository.search(queryEmbedding, 10, documentIds, user.id);
    const context = searchResults.map(result => result.payload.textContent as string).join('\n\n---\n\n');

    if (searchResults.length === 0) {
      return {
        answer: 'Desculpe, não encontrei informações relevantes nos documentos selecionados.',
        type: 'TEXT',
        sourceDocuments: [],
      };
    }

    const finalPrompt = `Contexto:\n---\n${context}\n---\nPergunta: "${contextualQuery}"`;
    const answer = await this.openaiService.getChatCompletion(finalPrompt, wrapSystemPrompt(RAG_SYSTEM_PROMPT, user.id));

    return {
      answer: answer || 'Não foi possível gerar uma resposta.',
      type: 'TEXT',
      sourceDocuments: searchResults.map(result => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as any
      })),
    };
  }
}
