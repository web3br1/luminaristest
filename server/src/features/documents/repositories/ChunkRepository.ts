import prisma from '../../../lib/prisma';

/**
 * Repository for managing text chunks in the relational database.
 */
export class ChunkRepository {
  /**
   * Creates a new text chunk linked to a document
   */
  async create(data: { id?: string; text: string; index: number; documentId: string }) {
    return prisma.chunk.create({ data });
  }

  /**
   * Finds chunk IDs for a given document
   */
  async findChunkIdsByDocument(documentId: string): Promise<string[]> {
    const chunks = await prisma.chunk.findMany({
      where: { documentId },
      select: { id: true }
    });
    return chunks.map(chunk => chunk.id);
  }

  /**
   * Deletes all chunks associated with a document
   */
  async deleteByDocument(documentId: string): Promise<void> {
    await prisma.chunk.deleteMany({ where: { documentId } });
  }
} 