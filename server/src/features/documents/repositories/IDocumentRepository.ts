import { IDocument } from '../models/Document.model';
import { DocumentCreateInput, DocumentUpdateInput } from '../models/Document.model';

/**
 * Interface defining the data access operations for Document entities.
 */
export interface IDocumentRepository {
  /**
   * Creates a new document
   */
  create(data: DocumentCreateInput): Promise<IDocument>;

  /**
   * Finds all documents for a user with pagination
   */
  /**
   * Finds all documents for a user, returning only essential fields for lists.
   */
  findAllForUser(userId: string): Promise<{ id: string; fileName: string }[]>;

  /**
   * Finds all documents for a user with pagination
   */
  findAll(userId: string, page: number, limit: number): Promise<{
    documents: IDocument[];
    totalCount: number;
  }>;

  /**
   * Finds a document by its ID
   */
  findById(id: string): Promise<IDocument | null>;

  /**
   * Deletes a document
   */
  delete(id: string): Promise<void>;

  /**
   * Atomically deletes a document and all of its chunks in a single SQL transaction.
   * (Vector cleanup in Qdrant is handled separately by the service, as it is an external store.)
   */
  deleteWithChunks(id: string): Promise<void>;

  /**
   * Atualiza os dados de processamento de um documento
   */
  update(id: string, data: DocumentUpdateInput): Promise<IDocument>;
} 