import { IReportService, ProgressCallback } from './IReportService';
import { IEmbeddingService } from '@/lib/vector/embedding';
import { IVectorRepository } from '@/features/documents/repositories/IVectorRepository';
import { OpenAIService } from '@/lib/openai/OpenAIService';
import { ForbiddenError } from '@/lib/errors';
// eslint-disable-next-line no-restricted-imports -- DEBT: prisma.* em service, viola contrato §2 (só Repository). Backlog: docs/architecture/lint-layer-gate.md. Remover ao migrar para repository (DocumentRepository).
import prisma from '@/lib/prisma';
import logger from '@/lib/logger';

// Definições de tipos para o serviço
export interface GenerateReportRequest {
  query: string;
  chatInstanceId: string;
  documentIds?: string[];
  /** ID of the authenticated user making the request (required for tenant isolation). */
  userId: string;
}

export interface GenerateReportResponse {
  response: string;
  chartData?: Array<{ [key: string]: unknown }>;
}

// Definição da ferramenta "Function Calling" para a OpenAI
const chartGenerationTool = {
  type: 'function' as const,
  function: {
    name: 'generate_chart_data',
    description: 'Gera dados para um gráfico quando o usuário pede para visualizar, analisar ou criar um relatório a partir dos documentos.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'O título do gráfico. Ex: "Vendas Mensais"' },
        chartType: { type: 'string', enum: ['line', 'bar'], description: 'O tipo de gráfico a ser gerado.' },
        data: {
          type: 'array',
          description: 'Os dados para o gráfico. Deve ser um array de objetos.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'O rótulo do eixo X. Ex: "Jan", "Fev"' },
            },
            required: ['name'],
            additionalProperties: { type: 'number' },
          },
        },
      },
      required: ['title', 'chartType', 'data'],
    },
  },
};

export class ReportService implements IReportService {
  private embeddingService: IEmbeddingService;
  private vectorRepository: IVectorRepository;
  private openaiService: OpenAIService;

  constructor(
    embeddingService: IEmbeddingService,
    vectorRepository: IVectorRepository,
    openaiService: OpenAIService
  ) {
    this.embeddingService = embeddingService;
    this.vectorRepository = vectorRepository;
    this.openaiService = openaiService;
  }

  public async generateReport(
    request: GenerateReportRequest,
    onProgress?: ProgressCallback
  ): Promise<GenerateReportResponse> {
    const { query, documentIds, userId } = request;
    onProgress?.({ status: 'started', message: 'Iniciando análise do seu pedido...' });
    logger.info('ReportService: Iniciando geração de relatório.', { queryLength: query.length, documentCount: documentIds?.length, userId });

    let context = '';
    let userPrompt = query;

    // Etapa 1: Verificar se o contexto do documento é necessário e executar o RAG.
    if (documentIds && documentIds.length > 0) {
      // Security: verify ALL documentIds belong to the requesting user before
      // touching the vector store (cross-tenant isolation, R3).
      const ownedDocs = await prisma.document.findMany({
        where: { id: { in: documentIds }, userId },
        select: { id: true },
      });
      if (ownedDocs.length !== documentIds.length) {
        logger.warn('ReportService: RAG ownership check failed', {
          requestedIds: documentIds,
          userId,
          foundCount: ownedDocs.length,
        });
        throw new ForbiddenError('One or more documents do not belong to this user');
      }

      onProgress?.({ status: 'rag_started', message: 'Entendido. Buscando informações nos seus documentos...' });
      logger.info('Triagem Inteligente: A consulta requer contexto. Executando RAG.', { queryLength: query.length });
            // Etapa 2.1: Refinar a consulta para otimizar a busca vetorial.
      const refinedQuery = await this._rewriteQueryForSearch(query);
      logger.info('Consulta refinada para busca RAG.', { originalLength: query.length, refinedLength: refinedQuery.length });

      const queryEmbedding = await this.embeddingService.embedText(refinedQuery);
      // Pass userId so the vector store enforces tenant isolation at the index level.
      const searchResults = await this.vectorRepository.search(queryEmbedding, 15, documentIds, userId);

      if (searchResults.length > 0) {
        context = searchResults
          .map(result => result.payload.textContent as string)
          .join('\n\n---\n\n');
        
        // Modifique o prompt do usuário para incluir o contexto.
        onProgress?.({ status: 'rag_completed', message: 'Informações encontradas. Preparando para gerar o gráfico...' });
        userPrompt = `Contexto dos documentos selecionados:\n---\n${context}\n---\n\nCom base no contexto acima, responda à seguinte solicitação: "${query}"`;
      } else {
        logger.warn('Nenhum contexto encontrado via RAG, mesmo com documentIds.', { queryLength: query.length });
      }
    } else {
        logger.info('Nenhum documento selecionado. Pulando RAG.', { queryLength: query.length });
    }

    // 3. Construa o prompt do sistema.
    const systemPrompt = `Você é um assistente analista de dados. Sua função é ajudar o usuário a analisar informações.
- Se o usuário pedir para visualizar, analisar dados ou criar um gráfico, você DEVE usar a ferramenta 'generate_chart_data'.
- Baseie sua resposta e a geração do gráfico PRIORITARIAMENTE no contexto fornecido.
- NÃO peça ao usuário por informações que já estão no contexto.
- Se não houver contexto ou se a informação não estiver lá, responda que não encontrou os dados nos documentos.
- Se a solicitação não for sobre análise de dados ou gráficos, apenas responda textualmente usando o contexto, se disponível.`;

    // 4. Chame a IA com o prompt enriquecido e as ferramentas.
    onProgress?.({ status: 'generating', message: 'Estou analisando os dados e desenhando o gráfico. Isso pode levar um momento...' });
    const response = await this.openaiService.getChatCompletionWithTools(
      userPrompt,
      systemPrompt,
      [chartGenerationTool]
    );

    const toolCall = response?.tool_calls?.[0];

    // 5. Analise a resposta da IA.
    if (toolCall?.function.name === 'generate_chart_data') {
      try {
        const chartArgs = JSON.parse(toolCall.function.arguments);
        logger.info('IA gerou dados de gráfico com sucesso.', { title: chartArgs.title });
        return {
          response: `Claro, aqui está o gráfico sobre "${chartArgs.title}" que preparei com base nos documentos.`,
          chartData: chartArgs.data,
        };
      } catch (error) {
        logger.error('Erro ao fazer parse dos argumentos da ferramenta de gráfico.', { error });
        return { response: 'Tive um problema ao formatar os dados para o gráfico.' };
      }
    }

    // Se não houver chamada de ferramenta, apenas retorne a resposta de texto da IA.
    logger.info('IA respondeu textualmente.', { queryLength: query.length });
    return {
      response: response?.content || 'Não consegui processar sua solicitação.',
    };
  }

  /**
   * Reescreve a consulta do usuário para otimizar a busca semântica no banco de dados vetorial.
   * @param query A consulta original do usuário.
   * @returns Uma versão da consulta, concisa e focada em palavras-chave.
   */
  private async _rewriteQueryForSearch(query: string): Promise<string> {
    try {
      const systemPrompt = `Você é um assistente de otimização de busca. Sua tarefa é reescrever a pergunta do usuário para torná-la ideal para uma busca semântica em um banco de dados vetorial. A pergunta reescrita deve ser concisa, focada em palavras-chave e remover qualquer elemento conversacional (como "por favor", "me diga", "eu gostaria de saber"), mas mantendo a intenção original. Responda APENAS com a pergunta reescrita.

Exemplos:
- User: "analise o documento e me faça um grafico basico da média de janeiro" -> "gráfico média de receita e despesas em janeiro"
- User: "e sobre as vendas do ultimo trimestre, como foram?" -> "relatório de vendas último trimestre"
- User: "pode me mostrar os dados de marketing do Q1?" -> "dados de marketing Q1"
- User: "lucro líquido" -> "lucro líquido"`;

      const response = await this.openaiService.getChatCompletion(query, systemPrompt);
            const refinedQuery = response?.trim();

      // Fallback para a query original se a IA retornar algo vazio ou muito curto
      if (!refinedQuery || refinedQuery.length < 3) {
        logger.warn('Refinamento de consulta retornou resultado inválido. Usando a consulta original.', { refinedQuery });
        return query;
      }

      return refinedQuery;
    } catch (error) {
      logger.error('Erro ao refinar a consulta. Usando a consulta original como fallback.', { error });
      return query;
    }
  }

}


