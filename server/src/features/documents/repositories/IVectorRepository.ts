// Import types from @qdrant/js-client-rest
interface QdrantScoredPoint {
  id: string | number;
  version: number;
  score: number;
  payload: Record<string, unknown> | null;
  vector?: number[];
}
import { z } from 'zod';

/**
 * Esquema para validação de pontos vetoriais
 */
export const VectorPointSchema = z.object({
  id: z.string().min(1, 'ID não pode ser vazio'),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  vector: z.array(z.number()).min(1, 'Vetor não pode estar vazio')
});

export type VectorPoint = z.infer<typeof VectorPointSchema>;

/**
 * Ponto pontuado retornado pelo Qdrant
 */
export interface ScoredPoint {
  id: string | number;
  version: number;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
}

/**
 * Esquema para validação de busca
 */
export const SearchVectorsSchema = z.object({
  vector: z.array(z.number()).min(1, 'Vetor de busca não pode estar vazio'),
  limit: z.number().int().positive().max(100).optional().default(10),
  documentIds: z.array(z.string()).optional(),
});

/**
 * Interface para o repositório de operações vetoriais
 */
export interface IVectorRepository {
  /**
   * Insere ou atualiza múltiplos pontos vetoriais no Qdrant
   * @param points Pontos vetoriais para upsert
   * @throws {Error} Se a operação de upsert falhar
   */
  upsertChunks(points: VectorPoint[]): Promise<void>;

  /**
   * Searches for similar vectors in Qdrant, filtered by document IDs and userId.
   * Both conditions must match: documentId in documentIds AND userId == userId.
   * @param vector The vector to search for.
   * @param limit The maximum number of results to return.
   * @param documentIds Array of document IDs to filter the search.
   * @param userId The user ID that must own the documents (required for tenant isolation).
   * @returns A promise that resolves to an array of scored points.
   */
  search(vector: number[], limit: number, documentIds: string[], userId: string): Promise<ScoredPoint[]>;


  /**
   * Busca vetores similares no Qdrant
   * @param vector Vetor de busca
   * @param userId ID do usuário para filtro
   * @param limit Número máximo de resultados (padrão: 10, máximo: 1000)
   * @returns Array de pontos pontuados
   * @throws {Error} Se a busca falhar
   */
  searchVectors(
    vector: number[], 
    userId: string, 
    limit?: number
  ): Promise<ScoredPoint[]>;

  /**
   * Remove múltiplos pontos vetoriais do Qdrant
   * @param ids IDs dos pontos a serem removidos
   * @throws {Error} Se a remoção falhar
   */
  deletePoints(ids: string[]): Promise<void>;

  /**
   * Obtém pontos vetoriais por ID do documento
   * @param documentId ID do documento
   * @returns Array de pontos vetoriais associados ao documento
   * @throws {Error} Se a consulta falhar
   */
  getPointsByDocumentId(documentId: string): Promise<ScoredPoint[]>;

  /**
   * Removes all vectors belonging to a user (LGPD art.18 VI - right to erasure).
   * Must be called before deleting the user from SQL.
   * @param userId ID of the user whose vectors should be deleted
   * @throws {Error} If the deletion fails
   */
  deleteVectorsByUserId(userId: string): Promise<void>;
}
