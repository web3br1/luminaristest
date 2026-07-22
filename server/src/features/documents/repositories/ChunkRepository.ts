import prisma from '../../../lib/prisma';
import { IChunkRepository } from './IChunkRepository';

/**
 * Repository for managing text chunks in the relational database.
 */
export class ChunkRepository implements IChunkRepository {
  /**
   * Creates a new text chunk linked to a document
   */
  async create(data: { id?: string; text: string; index: number; documentId: string }) {
    return prisma.chunk.create({ data });
  }
} 