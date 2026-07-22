import { qdrant } from '@/lib/vector/qdrant';
import logger from '@/lib/logger';
import { IVectorRepository, ScoredPoint, VectorPoint, SearchVectorsSchema, VectorPointSchema } from './IVectorRepository';
import { ValidationError, ServiceError } from '@/lib/errors';
import { metrics } from '@/lib/monitoring';

// Tipos auxiliares para as requisições ao Qdrant
interface QdrantCondition {
  key: string;
  match?: { value: string | number | boolean };
  // Outros tipos de condição podem ser adicionados aqui, como 'range', 'geo', etc.
}

interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

interface SearchRequest {
  vector: number[];
  limit?: number;
  filter?: QdrantFilter;
  with_payload?: boolean;
  with_vector?: boolean;
}

interface ScrollRequest {
  filter?: {
    must: Array<{
      key: string;
      match: { value: string | number | boolean };
    }>;
  };
  limit?: number;
  with_payload?: boolean;
  with_vector?: boolean;
}

const COLLECTION_NAME = 'documents';
const MAX_POINTS_PER_BATCH = 100; // Limite de pontos por lote para operações em massa

/**
 * Repository for managing vector operations in Qdrant.
 * Uses the official Qdrant JS client.
 */
export class VectorRepository implements IVectorRepository {
  /**
   * Insere ou atualiza múltiplos pontos vetoriais no Qdrant em lotes
   * @param points Pontos vetoriais para upsert
   * @throws {ValidationError} Se a validação dos dados falhar
   * @throws {Error} Se a operação de upsert falhar
   */
  async upsertChunks(points: VectorPoint[]): Promise<void> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('vector_upsert_chunks_time');

    if (!points || points.length === 0) {
      logger.debug('Nenhum ponto fornecido para upsert');
      endTimer({ success: true });
      return;
    }

    // Valida cada ponto antes de enviar para o Qdrant
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      try {
        VectorPointSchema.parse(point);
      } catch (error) {
        logger.error('Ponto inválido', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          pointId: point.id,
          userId: point.payload?.userId
        });
        endTimer({ success: false });
        throw new ValidationError(
          `Ponto inválido na posição ${i}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        );
      }
    }

    logger.info('Iniciando upsert de pontos vetoriais', {
      pointsCount: points.length,
      userId: points[0].payload?.userId
    });

    try {
      // Processa em lotes para evitar sobrecarga
      for (let i = 0; i < points.length; i += MAX_POINTS_PER_BATCH) {
        const batch = points.slice(i, i + MAX_POINTS_PER_BATCH);
        logger.debug(`Processando lote de ${batch.length} pontos`, {
          batch: i / MAX_POINTS_PER_BATCH + 1,
          totalBatches: Math.ceil(points.length / MAX_POINTS_PER_BATCH)
        });

        await qdrant.upsert(COLLECTION_NAME, {
          wait: true,
          points: batch,
        });
      }

      logger.info('Upsert de pontos vetoriais concluído', {
        duration: Date.now() - startTime
      });
      endTimer({ success: true });

    } catch (error) {
      const errorBody = (error instanceof Error && 'cause' in error) ? (error as { cause?: unknown }).cause : error;
      logger.error('Falha no upsert de pontos vetoriais', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorBody: JSON.stringify(errorBody, null, 2),
        pointsCount: points.length,
        userId: points[0].payload?.userId,
        duration: Date.now() - startTime
      });
      endTimer({ success: false });
      throw new Error(`Falha ao inserir/atualizar vetores: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, { cause: error });
    }
  }

  /**
   * Searches for similar vectors in Qdrant, filtered by document IDs and userId.
   * Both conditions must match: documentId in documentIds AND userId == userId.
   * @param vector The vector to search for.
   * @param limit The maximum number of results to return.
   * @param documentIds Array of document IDs to filter the search.
   * @param userId The user ID that must own the documents (required for tenant isolation).
   * @returns A promise that resolves to an array of scored points.
   */
  async search(
    vector: number[],
    limit: number,
    documentIds: string[],
    userId: string
  ): Promise<ScoredPoint[]> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('vector_search_filtered_time');

    logger.debug('Iniciando busca por vetores similares com filtro de documentos', {
      vectorLength: vector.length,
      limit,
      documentIdsCount: documentIds?.length,
      userId,
      collection: COLLECTION_NAME,
    });

    try {
      // Build a filter that requires BOTH userId match AND documentId membership.
      // must[] = all conditions must hold (logical AND).
      // For documentId membership across multiple IDs we use per-id conditions in a
      // nested "should" filter (OR), wrapped inside a must element so the overall
      // result is: userId == userId AND (documentId == ids[0] OR documentId == ids[1] …)
      const mustConditions: QdrantCondition[] = [
        { key: 'userId', match: { value: userId } },
      ];

      const qdrantFilter: QdrantFilter = { must: mustConditions };

      // If specific document IDs are provided, add them as a must-nested-should
      // so only chunks from those documents are returned.
      if (documentIds && documentIds.length > 0) {
        // Qdrant supports nested filter objects (must-inside-must nesting with a
        // should sub-clause) that our minimal QdrantFilter type doesn't model.
        // We rebuild the filter as a fully typed nested structure here.
        type NestedMustElement =
          | QdrantCondition
          | { should: QdrantCondition[] };
        const nestedMust: NestedMustElement[] = [
          { key: 'userId', match: { value: userId } },
          {
            should: documentIds.map(id => ({
              key: 'documentId',
              match: { value: id },
            })),
          },
        ];
        (qdrantFilter as { must: NestedMustElement[] }).must = nestedMust;
      }

      const searchParams: SearchRequest = {
        vector,
        limit,
        filter: qdrantFilter,
        with_payload: true,
        with_vector: false,
      };

      const response = await qdrant.search(COLLECTION_NAME, searchParams);

      logger.debug('Busca por vetores filtrada concluída', {
        resultsCount: response.length,
        userId,
        collection: COLLECTION_NAME,
        duration: Date.now() - startTime,
      });
      endTimer({ success: true });

      return response.map((point): ScoredPoint => ({
        id: point.id,
        version: point.version,
        score: point.score,
        payload: point.payload || {},
        vector: Array.isArray(point.vector) ? (point.vector as number[]) : [],
      }));
    } catch (error) {
      const errorBody = (error instanceof Error && 'cause' in error) ? (error as { cause?: unknown }).cause : error;
      logger.error('Falha na busca filtrada de vetores', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorBody: JSON.stringify(errorBody, null, 2),
        duration: Date.now() - startTime,
      });
      endTimer({ success: false });
      throw new ServiceError(`Falha ao buscar vetores: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Busca vetores similares no Qdrant
   * @param vector Vetor de busca
   * @param userId ID do usuário para filtro
   * @param limit Número máximo de resultados (padrão: 10, máximo: 1000)
   * @returns Array de pontos pontuados
   * @throws {ValidationError} Se a validação dos parâmetros falhar
   * @throws {Error} Se a busca falhar
   */
  async searchVectors(
    vector: number[],
    userId: string,
    limit = 10
  ): Promise<ScoredPoint[]> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('vector_search_time');

    // Valida os parâmetros de entrada
    try {
      SearchVectorsSchema.parse({ vector, userId, limit });
    } catch (error) {
      logger.error('Parâmetros de busca inválidos', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        userId,
        vectorLength: vector.length,
        limit
      });
      endTimer({ success: false });
      throw new ValidationError(
        `Parâmetros de busca inválidos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
    }

    logger.debug('Iniciando busca por vetores similares', {
      vectorLength: vector.length,
      userId,
      limit,
      collection: COLLECTION_NAME
    });

    try {
      const searchParams: SearchRequest = {
        vector,
        limit,
        filter: {
          must: [
            {
              key: 'userId',
              match: { value: userId },
            },
          ],
        },
        with_payload: true,
        with_vector: false,
      };

      const response = await qdrant.search(COLLECTION_NAME, searchParams);

      logger.debug('Busca por vetores concluída', {
        resultsCount: response.length,
        userId,
        collection: COLLECTION_NAME
      });

      // Mapeia a resposta para o tipo ScoredPoint
      return response.map(point => {
        // Garante que o vetor seja um array de números
        let vector: number[] = [];

        if (Array.isArray(point.vector)) {
          // Se for um array de números, usa diretamente
          if (point.vector.every(v => typeof v === 'number')) {
            vector = point.vector as number[];
          }
          // Se for um array de arrays de números, pega o primeiro array
          else if (point.vector.length > 0 && Array.isArray(point.vector[0])) {
            vector = (point.vector as number[][])[0] || [];
          }
        }

        return {
          id: point.id,
          version: (point as { version?: number }).version || 0,
          score: point.score || 0,
          payload: point.payload || {},
          vector
        };
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Falha na busca por vetores', {
        error: errorMessage,
        userId,
        vectorLength: vector?.length,
        collection: COLLECTION_NAME
      });

      throw new Error(`Falha na busca por vetores: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Removes every vector belonging to a document by filtering on the `documentId` payload.
   * Deleting by semantic key (rather than by reconstructed point ids) is robust against id-derivation
   * drift and also reaps any pre-existing orphans for the document.
   * @param documentId The owning document id.
   * @throws {ValidationError} If the document id is invalid.
   * @throws {Error} If the deletion fails.
   */
  async deletePointsByDocumentId(documentId: string): Promise<void> {
    if (typeof documentId !== 'string' || documentId.trim() === '') {
      throw new ValidationError('ID do documento inválido');
    }

    try {
      await qdrant.delete(COLLECTION_NAME, {
        wait: true,
        filter: {
          must: [{ key: 'documentId', match: { value: documentId } }],
        },
      });
      logger.info('Vetores do documento removidos do Qdrant', { documentId, collection: COLLECTION_NAME });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Falha ao remover vetores do documento', { error: errorMessage, documentId, collection: COLLECTION_NAME });
      throw new Error(`Falha ao remover vetores do documento: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Removes all vectors belonging to a user — LGPD art.18 VI (right to erasure).
   * Uses a filter-based delete so no prior point-ID lookup is needed.
   * Must be called BEFORE the user row is deleted from SQL so that, if Qdrant
   * fails, the caller can abort and the user record remains intact for retry.
   * @param userId ID of the user whose vectors should be deleted
   * @throws {Error} If the Qdrant delete operation fails
   */
  async deleteVectorsByUserId(userId: string): Promise<void> {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new ValidationError('ID do usuário inválido para remoção de vetores');
    }

    logger.info('Iniciando remoção de vetores do usuário (LGPD art.18 VI)', { userId, collection: COLLECTION_NAME });

    try {
      await qdrant.delete(COLLECTION_NAME, {
        wait: true,
        filter: {
          must: [
            { key: 'userId', match: { value: userId } },
          ],
        },
      });

      logger.info('Vetores do usuário removidos do Qdrant com sucesso', { userId, collection: COLLECTION_NAME });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Falha ao remover vetores do usuário do Qdrant', { error: errorMessage, userId, collection: COLLECTION_NAME });
      throw new Error(`Falha ao remover vetores do usuário ${userId}: ${errorMessage}`);
    }
  }

  /**
   * Obtém pontos vetoriais por ID do documento
   * @param documentId ID do documento
   * @returns Array de pontos vetoriais associados ao documento
   * @throws {ValidationError} Se o ID do documento for inválido
   * @throws {Error} Se a consulta falhar
   */
  async getPointsByDocumentId(documentId: string): Promise<ScoredPoint[]> {
    // Valida o ID do documento
    if (typeof documentId !== 'string' || documentId.trim() === '') {
      throw new ValidationError('ID do documento inválido');
    }

    logger.debug('Buscando pontos por ID do documento', {
      documentId,
      collection: COLLECTION_NAME
    });

    try {
      const scrollParams: ScrollRequest = {
        filter: {
          must: [
            {
              key: 'documentId',
              match: { value: documentId }
            }
          ]
        },
        limit: 1000, // Limite máximo de pontos por consulta
        with_payload: true,
        with_vector: false
      };

      // Log detalhado da requisição que será enviada
      logger.debug('Enviando requisição de scroll para o Qdrant', {
        scrollParams: JSON.stringify(scrollParams, null, 2)
      });

      const response = await qdrant.scroll(COLLECTION_NAME, scrollParams);
      const points = response.points || [];
      logger.debug('Pontos encontrados para o documento', {
        documentId,
        pointsCount: points.length,
        collection: COLLECTION_NAME
      });

      // Mapeia a resposta para o tipo ScoredPoint
      return points.map(point => {
        // Garante que o vetor seja um array de números
        let vector: number[] = [];
        if (point.vector && Array.isArray(point.vector)) {
          if (point.vector.every(v => typeof v === 'number')) {
            vector = point.vector as number[];
          } else if (point.vector.length > 0 && Array.isArray(point.vector[0])) {
            vector = (point.vector as number[][])[0] || [];
          }
        }
        return {
          id: point.id,
          version: (point as { version?: number }).version || 0,
          score: 0, // Não há pontuação em consultas de scroll
          payload: point.payload || {},
          vector
        };
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      // Serializa o objeto de erro completo para garantir que todos os detalhes sejam capturados
      const fullErrorString = JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2);

      logger.error('Falha ao buscar pontos por ID do documento', {
        error: errorMessage,
        documentId,
        collection: COLLECTION_NAME,
        fullError: fullErrorString
      });
      throw new Error(`Falha ao buscar pontos do documento: ${errorMessage}`, { cause: error });
    }
  }
}
