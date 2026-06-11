import { IDocument } from '../models/Document.model';
import { IDocumentRepository } from '../repositories/IDocumentRepository';
import { ChunkRepository } from '../repositories/ChunkRepository';
import { VectorRepository } from '../repositories/VectorRepository';
import { DocumentProcessingService } from './DocumentProcessingService';
import { DocumentProcessingPipeline } from './DocumentProcessingPipeline';
import { UserContext } from '../../../lib/authUtils';
import { NotFoundError, ForbiddenError } from '../../../lib/errors';
import { UpdateDocumentDto } from '../dtos/DocumentDto';
import { DocumentUpdateInput } from '../models/Document.model';
import type { IDocumentPolicy } from '../policies/IDocumentPolicy';
import { DocumentStatus, DocumentPurpose } from '../models/Document.model';
import { logger } from '@/lib/logger';
import { OpenAIService } from '@/lib/openai/OpenAIService';
import { StructuredDataService } from '../../structuredData/services/StructuredDataService';
import { UserRepository } from '../../users/repositories/UserRepository';

/**
 * Service implementation for Document business logic.
 * Handles all business operations for Document entities.
 */
export class DocumentService {
  private processingPipeline: DocumentProcessingPipeline;

    constructor(
    private readonly repository: IDocumentRepository,
    private readonly chunkRepository: ChunkRepository,
    private readonly vectorRepository: VectorRepository,
    private readonly processingService: DocumentProcessingService,
    private readonly policy: IDocumentPolicy,
    private readonly openAIService: OpenAIService,
    private readonly structuredDataService: StructuredDataService,
    private readonly userRepository: UserRepository
  ) {
    this.processingPipeline = new DocumentProcessingPipeline(
      chunkRepository,
      vectorRepository,
      processingService,
      repository,
      openAIService,
      structuredDataService,
      userRepository
    );
  }

  /**
   * Retrieves all documents for a user with pagination
   */
  async getAllDocuments(userContext: UserContext, page: number, limit: number) {
    // Add authorization if needed
    return this.repository.findAll(userContext.id, page, limit);
  }

  /**
   * Retrieves all documents for a user, returning only id and fileName.
   * Optimized for populating selection lists in the UI.
   */
  async getDocumentListForUser(userContext: UserContext): Promise<{ id: string; fileName: string }[]> {
    // Authorization is implicit via userContext.id
    return this.repository.findAllForUser(userContext.id);
  }

  /**
   * Retrieves a specific document by ID
   */
  async getDocumentById(id: string, userContext: UserContext): Promise<IDocument> {
    const document = await this.repository.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }
    // Verifica permissão de visualização
    if (!this.policy.canViewDocument(userContext, document)) {
      throw new NotFoundError('Document not found');
    }
    return document;
  }

  /**
   * Handles document upload and starts async processing
   */
  async createDocument(
    fileBuffer: ArrayBuffer,
    fileName: string,
    fileType: string,
    fileSize: number,
    userContext: UserContext,
    documentPurpose: DocumentPurpose = DocumentPurpose.DATA_ANALYSIS
  ): Promise<IDocument> {
    let mimeType: string;
    switch (fileType.toUpperCase()) {
      case 'PDF':
        mimeType = 'application/pdf';
        break;
      case 'DOCX':
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'XLSX':
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    const buffer = Buffer.from(fileBuffer);
    const text = await this.processingService.extractText(fileBuffer, mimeType);

    const doc = await this.repository.create({
      userId: userContext.id,
      fileName,
      fileType: fileType.toUpperCase() as 'PDF' | 'DOCX' | 'XLSX',
      fileSize,
      textContent: text,
      status: DocumentStatus.PENDING,
      mimeType: mimeType,
      documentPurpose: documentPurpose,
    });

    this.processDocumentAsync(doc, text, buffer).catch(error => {
      logger.error(`Error in async document processing for document ${doc.id}`, { error });
    });

    return doc;
  }

  /**
   * Processes document asynchronously (chunking, embedding, etc.)
   */
  private async processDocumentAsync(document: IDocument, text: string, fileBuffer: Buffer): Promise<void> {
    try {
      await this.processingPipeline.processDocument(document, text, fileBuffer);
    } catch (error) {
      logger.error(`Async processing failed for document ${document.id}`, { error });
    }
  }

  /**
   * Deletes a document and its chunks/vectors
   */
  async deleteDocument(id: string, userContext: UserContext): Promise<void> {
    const document = await this.repository.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }
    if (!this.policy.canDeleteDocument(userContext, document)) {
      throw new ForbiddenError('Access denied to delete document');
    }
    // 1. Retrieve chunk IDs for this document
    const chunkIds = await this.chunkRepository.findChunkIdsByDocument(id);
    // 2. Delete vectors in Qdrant by chunk point IDs
    await this.vectorRepository.deletePoints(chunkIds);
    // 3. Delete chunks in SQL
    await this.chunkRepository.deleteByDocument(id);
    // 4. Delete document record in SQL
    await this.repository.delete(id);
  }

  /**
   * Search documents by similarity on stored embeddings
   */
  async searchDocuments(
    query: string,
    userContext: UserContext,
    limit = 10
  ): Promise<Array<{ document: IDocument; chunkText: string; score: number }>> {
    // generate embedding for the query
    const queryVector = await this.processingService.generateEmbedding(query);
    // search in Qdrant
    const hits = await this.vectorRepository.searchVectors(queryVector, userContext.id, limit);
    const results: Array<{ document: IDocument; chunkText: string; score: number }> = [];
    for (const hit of hits) {
      const payload = hit.payload as any;
      const doc = await this.repository.findById(payload.documentId);
      if (!doc) continue;
      results.push({ document: doc, chunkText: payload.text, score: hit.score });
    }
    return results;
  }

  /**
   * Updates o status e metadados de processamento de um documento
   */
  async updateDocument(
    id: string,
    data: UpdateDocumentDto,
    userContext: UserContext
  ): Promise<IDocument> {
    const document = await this.repository.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }
    // Verifica permissão de atualização
    if (!this.policy.canUpdateDocument(userContext, document)) {
      throw new ForbiddenError('Access denied to update document');
    }
    // Mapeia dados de DTO para input do repositório
    const updateInput: DocumentUpdateInput = {
      status: data.status,
      summary: data.summary,
      contextJson: data.contextJson,
      processingDate: data.processingDate,
      processingError: data.processingError,
    };
    const updatedDocument = await this.repository.update(id, updateInput);
    return updatedDocument;
  }
} 