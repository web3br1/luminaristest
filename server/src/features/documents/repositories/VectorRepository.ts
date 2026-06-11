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
 * Converte IDs para o formato esperado pelo Qdrant
 * Pode ser string ou número
 */
function normalizeIds(ids: string[]): (string | number)[] {
  return ids.map(id => {
    // Tenta converter para número se for um número válido
    const numId = Number(id);
    return isNaN(numId) ? id : numId;
  });
}

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
      const errorBody = (error instanceof Error && 'cause' in error) ? (error as any).cause : error;
      logger.error('Falha no upsert de pontos vetoriais', { 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorBody: JSON.stringify(errorBody, null, 2),
        pointsCount: points.length,
        userId: points[0].payload?.userId,
        duration: Date.now() - startTime
      });
      endTimer({ success: false });
      throw new Error(`Falha ao inserir/atualizar vetores: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Searches for similar vectors in Qdrant, with an optional filter by document IDs.
   * @param vector The vector to search for.
   * @param limit The maximum number of results to return.
   * @param documentIds Optional array of document IDs to filter the search.
   * @returns A promise that resolves to an array of scored points.
   */
  async search(
    vector: number[],
    limit: number,
    documentIds?: string[]
  ): Promise<ScoredPoint[]> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('vector_search_filtered_time');

    logger.debug('Iniciando busca por vetores similares com filtro de documentos', {
      vectorLength: vector.length,
      limit,
      documentIdsCount: documentIds?.length,
      collection: COLLECTION_NAME,
    });

    try {
      const filter: QdrantFilter = {};

      if (documentIds && documentIds.length > 0) {
        filter.should = documentIds.map(id => ({
          key: 'documentId',
          match: { value: id },
        }));
      }

      const searchParams: SearchRequest = {
        vector,
        limit,
        filter: (filter.should && filter.should.length > 0) ? filter : undefined,
        with_payload: true,
        with_vector: false,
      };

      const response = await qdrant.search(COLLECTION_NAME, searchParams);

      logger.debug('Busca por vetores filtrada concluída', {
        resultsCount: response.length,
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
      const errorBody = (error instanceof Error && 'cause' in error) ? (error as any).cause : error;
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
          version: (point as any).version || 0,
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
      
      throw new Error(`Falha na busca por vetores: ${errorMessage}`);
    }
  }

  /**
   * Remove múltiplos pontos vetoriais do Qdrant
   * @param ids IDs dos pontos a serem removidos
   * @throws {ValidationError} Se a lista de IDs for inválida
   * @throws {Error} Se a remoção falhar
   */
  async deletePoints(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) {
      logger.debug('Nenhum ID fornecido para remoção');
      return;
    }

    // Valida os IDs
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && id.trim() !== '')) {
      throw new ValidationError('Lista de IDs inválida');
    }

    const normalizedIds = normalizeIds(ids);
    
    logger.debug(`Verificando existência de ${normalizedIds.length} pontos no Qdrant`, {
      collection: COLLECTION_NAME,
      sampleIds: normalizedIds.slice(0, 3)
    });

    try {
      // Primeiro, verifica quais pontos existem
      const existingPoints: (string | number)[] = [];
      const nonExistingPoints: (string | number)[] = [];

      // Verifica a existência em lotes
      for (let i = 0; i < normalizedIds.length; i += MAX_POINTS_PER_BATCH) {
        const batch = normalizedIds.slice(i, i + MAX_POINTS_PER_BATCH);
        
        try {
          logger.debug('Chamando Qdrant retrieve', { 
            collection: COLLECTION_NAME,
            batchSize: batch.length,
            sampleIds: batch.slice(0, 3)
          });
          
          const pointsInfo = await qdrant.retrieve(COLLECTION_NAME, {
            ids: batch,
            with_vector: false,
            with_payload: false
          });

          logger.debug('Resposta do Qdrant retrieve', { 
            collection: COLLECTION_NAME,
            pointsCount: pointsInfo.length,
            sampleIds: pointsInfo.slice(0, 3).map((p: any) => p.id)
          });

          const existingBatchPoints = pointsInfo.map((p: any) => p.id);
          const existingBatchSet = new Set(existingBatchPoints);

          batch.forEach(id => {
            if (existingBatchSet.has(id)) {
              existingPoints.push(id);
            } else {
              nonExistingPoints.push(id);
            }
          });
        } catch (retrieveError) {
          const errorMessage = retrieveError instanceof Error ? retrieveError.message : 'Erro desconhecido';
          logger.error('Erro ao verificar pontos no Qdrant', {
            error: errorMessage,
            collection: COLLECTION_NAME,
            batchSize: batch.length,
            sampleIds: batch.slice(0, 3)
          });
          
          // Se houver erro na verificação, assume que os pontos não existem
          nonExistingPoints.push(...batch);
        }
      }

      // Log de pontos não encontrados
      if (nonExistingPoints.length > 0) {
        logger.warn(`${nonExistingPoints.length} pontos não encontrados no Qdrant`, {
          collection: COLLECTION_NAME,
          nonExistingSampleIds: nonExistingPoints.slice(0, 3)
        });
      }

      // Se não há pontos existentes para remover, retorna
      if (existingPoints.length === 0) {
        logger.debug('Nenhum ponto encontrado para remoção');
        return;
      }

      logger.info(`Iniciando remoção de ${existingPoints.length} pontos do Qdrant`, { 
        collection: COLLECTION_NAME,
        totalPoints: normalizedIds.length,
        existingPoints: existingPoints.length,
        nonExistingPoints: nonExistingPoints.length,
        sampleIds: existingPoints.slice(0, 3)
      });
      
      // Remove apenas os pontos que existem
      const successfullyDeleted: (string | number)[] = [];
      const failedToDelete: Array<{id: string | number, error: string}> = [];
      
      for (let i = 0; i < existingPoints.length; i += MAX_POINTS_PER_BATCH) {
        const batch = existingPoints.slice(i, i + MAX_POINTS_PER_BATCH);
        const batchNumber = Math.floor(i / MAX_POINTS_PER_BATCH) + 1;
        const totalBatches = Math.ceil(existingPoints.length / MAX_POINTS_PER_BATCH);
        
        try {
          logger.debug(`Removendo lote ${batchNumber} de ${totalBatches} com ${batch.length} pontos`, {
            collection: COLLECTION_NAME,
            batch: batchNumber,
            totalBatches,
            sampleIds: batch.slice(0, 3)
          });
          
          await qdrant.delete(COLLECTION_NAME, {
            wait: true,
            points: batch,
          });

          logger.debug(`Lote ${batchNumber} de ${totalBatches} removido com sucesso`, {
            collection: COLLECTION_NAME,
            batch: batchNumber,
            totalBatches,
            pointsCount: batch.length
          });
          
          successfullyDeleted.push(...batch);
        } catch (deleteError) {
          const errorMessage = deleteError instanceof Error ? deleteError.message : 'Erro desconhecido';
          logger.error(`Erro ao remover lote ${batchNumber} de ${totalBatches}`, {
            error: errorMessage,
            collection: COLLECTION_NAME,
            batch: batchNumber,
            totalBatches,
            batchSize: batch.length,
            sampleIds: batch.slice(0, 3)
          });
          
          // Adiciona todos os IDs do lote à lista de falhas
          batch.forEach(id => {
            failedToDelete.push({
              id,
              error: errorMessage
            });
          });
        }
      }
      
      // Log do resultado da operação
      if (successfullyDeleted.length > 0) {
        logger.info('Remoção de pontos do Qdrant concluída parcialmente', { 
          collection: COLLECTION_NAME,
          totalRequested: normalizedIds.length,
          totalDeleted: successfullyDeleted.length,
          failedToDelete: failedToDelete.length,
          notFound: nonExistingPoints.length,
          sampleSuccessIds: successfullyDeleted.slice(0, 3),
          sampleFailedIds: failedToDelete.slice(0, 3).map(f => f.id)
        });
      }
      
      // Se houve falhas, lança um erro com os detalhes
      if (failedToDelete.length > 0) {
        const errorMessage = `Falha ao remover ${failedToDelete.length} de ${normalizedIds.length} pontos`;
        logger.error(errorMessage, {
          collection: COLLECTION_NAME,
          totalRequested: normalizedIds.length,
          totalDeleted: successfullyDeleted.length,
          failedToDelete: failedToDelete.length,
          sampleErrors: failedToDelete.slice(0, 3)
        });
        
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Falha ao remover pontos do Qdrant', { 
        error: errorMessage,
        collection: COLLECTION_NAME,
        idsCount: normalizedIds.length,
        sampleIds: normalizedIds.slice(0, 3)
      });
      
      throw new Error(`Falha ao remover vetores: ${errorMessage}`);
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
          version: (point as any).version || 0,
          score: 0, // Não há pontuação em consultas de scroll
          payload: point.payload || {},
          vector
        };
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      // Serializa o objeto de erro completo para garantir que todos os detalhes sejam capturados
      const fullErrorString = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);

      logger.error('Falha ao buscar pontos por ID do documento', {
        error: errorMessage,
        documentId,
        collection: COLLECTION_NAME,
        fullError: fullErrorString
      });
      throw new Error(`Falha ao buscar pontos do documento: ${errorMessage}`);
    }
  }
}