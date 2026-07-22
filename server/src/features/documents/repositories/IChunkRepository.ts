import { Chunk } from 'generated/prisma';

/**
 * Interface defining the contract for Chunk data access operations.
 */
export interface IChunkRepository {
  /**
   * Creates a new text chunk linked to a document.
   */
  create(data: { id?: string; text: string; index: number; documentId: string }): Promise<Chunk>;
}
