import { ChunkRepository } from '../repositories/ChunkRepository';
import { VectorRepository } from '../repositories/VectorRepository';
import { DocumentProcessingService } from './DocumentProcessingService';
import { OpenAIService } from '@/lib/openai/OpenAIService';
import { IDocumentRepository } from '../repositories/IDocumentRepository';
import { IDocument, DocumentStatus, DocumentPurpose } from '../models/Document.model';
import { DocumentContext } from '../models/DocumentContext';
import { logger } from '@/lib/logger';
import { v5 as uuidv5 } from 'uuid';
import { StructuredDataService } from '../../structuredData/services/StructuredDataService';
import { extractStructuredDataFromExcel } from '@/lib/vector/extractors/ExcelStructuredExtractor';
import { UserRepository } from '../../users/repositories/UserRepository';
import type { IUser } from '../../users/models/User.model';

// Namespace UUID para gerar UUIDs determinísticos para os chunks. Deve ser um UUID válido.
const CHUNK_ID_NAMESPACE = 'f6db7260-569b-4559-835a-484f913119a4';

export class DocumentProcessingPipeline {
  private chunkRepository: ChunkRepository;
  private vectorRepository: VectorRepository;
  private processingService: DocumentProcessingService;
  private documentRepository: IDocumentRepository;
  private openAIService: OpenAIService;
  private structuredDataService: StructuredDataService;
  private userRepository: UserRepository;

  constructor(
    chunkRepository: ChunkRepository,
    vectorRepository: VectorRepository,
    processingService: DocumentProcessingService,
    documentRepository: IDocumentRepository,
    openAIService: OpenAIService,
    structuredDataService: StructuredDataService,
    userRepository: UserRepository
  ) {
    this.chunkRepository = chunkRepository;
    this.vectorRepository = vectorRepository;
    this.processingService = processingService;
    this.documentRepository = documentRepository;
    this.openAIService = openAIService;
    this.structuredDataService = structuredDataService;
    this.userRepository = userRepository;
  }

  public async processDocument(document: IDocument, text:string, fileBuffer?: Buffer): Promise<void> {
    const startTime = Date.now();
    const context: DocumentContext = {
      processing: {
        totalChunks: 0,
        processedChunks: 0,
        failedChunks: 0,
        duration: 0,
        startTime: new Date().toISOString(),
        endTime: '',
      },
      statistics: this.calculateStatistics(text),
      errors: [],
    };

    try {
      logger.info(`Starting document processing for document ${document.id}`);

      await this.documentRepository.update(document.id, {
        status: DocumentStatus.PROCESSING,
        contextJson: context,
        summary: null,
        processingDate: null,
        processingError: null,
      });

      const isExcel =
        document.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && fileBuffer;

      const userRecord = await this.userRepository.getUserById(document.userId);
      if (!userRecord) {
        throw new Error(`User with id ${document.userId} not found for document ${document.id}`);
      }
      const user: IUser = {
        id: userRecord.id,
        name: userRecord.name ?? '',
        username: userRecord.username,
        email: userRecord.email,
        role: userRecord.role,
        createdAt: userRecord.createdAt,
        updatedAt: userRecord.updatedAt,
      };

      // Lógica condicional baseada no propósito do documento
      if (document.documentPurpose === DocumentPurpose.DATA_ANALYSIS) {
        logger.info(`Processing document ${document.id} for DATA_ANALYSIS.`);
        if (isExcel) {
          logger.info(`Excel document ${document.id} detected. Using direct structured data extraction.`);
          try {
            if (!fileBuffer) {
              throw new Error('File buffer is missing for Excel processing.');
            }
            const structuredData = await extractStructuredDataFromExcel(fileBuffer);
            await this.structuredDataService.createFromStructured(user, document.id, structuredData);
            logger.info(`Successfully extracted and saved structured data directly from Excel for document ${document.id}.`);
          } catch (error) {
            logger.error(`Failed to extract or save structured data directly from Excel for document ${document.id}`, { error });
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during structured data processing';
            context.errors.push({
              code: 'STRUCTURED_DATA_ERROR_EXCEL',
              message: errorMessage,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          logger.info(`Document ${document.id} is not an Excel file or buffer is missing. Using LLM-based extraction.`);
          const isTabular = await this.openAIService.isTextTabular(text);

          if (isTabular) {
            logger.info(`Document ${document.id} is tabular. Attempting to extract and save structured data via LLM.`);
            try {
              await this.structuredDataService.createFromText(user, document.id, text);
              logger.info(`Successfully extracted and saved structured data for document ${document.id}.`);
            } catch (error) {
              logger.error(`Failed to extract or save structured data for document ${document.id}`, { error });
              const errorMessage = error instanceof Error ? error.message : 'Unknown error during structured data processing';
              context.errors.push({
                code: 'STRUCTURED_DATA_ERROR_LLM',
                message: errorMessage,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            logger.info(`Document ${document.id} is not tabular. Skipping structured data extraction.`);
          }
        }
      } else if (document.documentPurpose === DocumentPurpose.KNOWLEDGE_BASE) {
        logger.info(`Processing document ${document.id} for KNOWLEDGE_BASE. Skipping structured data extraction.`);
        // A lógica de vetorização de chunks já é comum e será executada após este bloco.
        // Futuramente, podemos adicionar lógicas específicas para KNOWLEDGE_BASE aqui, como geração de resumos.
      } else {
        logger.warn(`Document ${document.id} has an unknown or null purpose. Defaulting to KNOWLEDGE_BASE processing to avoid data extraction on non-tabular data.`);
      }

      await this.processChunks(document, text, context);

      context.processing.duration = Date.now() - startTime;
      context.processing.endTime = new Date().toISOString();
      await this.documentRepository.update(document.id, {
        status: DocumentStatus.COMPLETED,
        processingDate: new Date(),
        contextJson: context,
        summary: null,
        processingError: null,
      });
      logger.info(`Document ${document.id} processed successfully`);
    } catch (error) {
      await this.handleProcessingError(document, error, context, startTime);
    }
  }

  private async processChunks(document: IDocument, text: string, context: DocumentContext): Promise<void> {
    const chunks = this.processingService.chunkText(text);
    context.processing.totalChunks = chunks.length;

    // Persist chunk records first so we have their IDs for vector point generation
    const chunkRecords: Array<{ id: string; text: string; index: number }> = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunkText = chunks[i];
        const chunk = await this.chunkRepository.create({ text: chunkText, index: i, documentId: document.id });
        chunkRecords.push({ id: chunk.id, text: chunkText, index: i });
      } catch (error) {
        context.processing.failedChunks++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown chunk processing error';
        logger.error(`Error persisting chunk ${i} of document ${document.id}`, { error });
        context.errors = context.errors || [];
        context.errors.push({ code: 'CHUNK_PROCESSING_ERROR', message: errorMessage, timestamp: new Date().toISOString() });
      }
    }

    if (chunkRecords.length === 0) {
      if (context.processing.failedChunks > 0) {
        throw new Error(`${context.processing.failedChunks} chunks failed to process.`);
      }
      return;
    }

    // Batch-embed all chunk texts in a single OpenAI API call (R11: avoid N sequential calls)
    let vectors: number[][];
    try {
      vectors = await this.processingService.generateEmbeddings(chunkRecords.map(c => c.text));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown embedding error';
      logger.error(`Batch embedding failed for document ${document.id}`, { error });
      context.processing.failedChunks += chunkRecords.length;
      context.errors = context.errors || [];
      context.errors.push({ code: 'CHUNK_PROCESSING_ERROR', message: errorMessage, timestamp: new Date().toISOString() });
      throw new Error(`Batch embedding failed: ${errorMessage}`);
    }

    // Build vector points and upsert in batches of 10
    const vectorPoints: Array<{ id: string; payload: Record<string, string | number | boolean | null>; vector: number[] }> = [];
    for (let j = 0; j < chunkRecords.length; j++) {
      const { id: chunkId, text: chunkText, index } = chunkRecords[j];
      vectorPoints.push({
        id: uuidv5(chunkId, CHUNK_ID_NAMESPACE),
        payload: { documentId: document.id, userId: document.userId, index, textContent: chunkText, chunkId, fileName: document.fileName },
        vector: vectors[j],
      });
      context.processing.processedChunks++;
      if (vectorPoints.length >= 10 || j === chunkRecords.length - 1) {
        await this.vectorRepository.upsertChunks(vectorPoints);
        vectorPoints.length = 0;
        await this.documentRepository.update(document.id, {
          contextJson: context,
          status: DocumentStatus.PROCESSING,
          summary: null,
          processingDate: null,
          processingError: null
        });
      }
    }

    if (context.processing.failedChunks > 0) {
      throw new Error(`${context.processing.failedChunks} chunks failed to process.`);
    }
  }

  private async handleProcessingError(
    document: IDocument,
    error: unknown,
    context: DocumentContext,
    startTime: number
  ): Promise<void> {
    context.processing.duration = Date.now() - startTime;
    context.processing.endTime = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
    context.errors = context.errors || [];
    context.errors.push({
      code: 'FATAL_PROCESSING_ERROR',
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });
    logger.error(`Fatal error processing document ${document.id}`, { error });
    await this.documentRepository.update(document.id, {
      status: DocumentStatus.ERROR,
      processingError: errorMessage,
      processingDate: new Date(),
      contextJson: context,
      summary: null
    });
  }

  private calculateStatistics(text: string): DocumentContext['statistics'] {
    const words = text.split(/\s+/).filter(function(word) { return word.length > 0; });
    const wordCount = words.length;
    const charCount = text.length;
    const avgWordLength = wordCount > 0 ? charCount / wordCount : 0;
    return {
      wordCount: wordCount,
      charCount: charCount,
      avgWordLength: avgWordLength,
    };
  }
}

