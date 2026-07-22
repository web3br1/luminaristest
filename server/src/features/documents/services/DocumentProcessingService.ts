import { extractTextFromPDF } from '@/lib/vector/extractors/pdf';
import { extractTextFromWord } from '@/lib/vector/extractors/word';
import { extractTextFromExcel } from '@/lib/vector/extractors/ExcelExtractor';
import { chunkText as splitText } from '@/lib/vector/chunking';
import { embedText, embedTexts } from '@/lib/vector/embedding';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/monitoring';
import { ValidationError } from '@/lib/errors';

/**
 * Service responsible for processing document files:
 * - Text extraction (PDF, Word, Excel)
 * - Splitting into chunks
 * - Generating embeddings via OpenAI
 */
export class DocumentProcessingService {
  /**
   * Extracts text from a file buffer based on MIME type
   */
  async extractText(buffer: ArrayBuffer, mimeType: string): Promise<string> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('document_extraction_time');

    try {
      logger.info('Iniciando extração de texto', { mimeType });
      
      let text: string;
      switch (mimeType) {
        case 'application/pdf':
          logger.debug('Extraindo texto de PDF');
          text = await extractTextFromPDF(buffer);
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          logger.debug('Extraindo texto de Word');
          text = await extractTextFromWord(buffer);
          break;
        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          logger.debug('Extraindo texto de Excel');
          text = await extractTextFromExcel(buffer);
          break;
        default:
          throw new ValidationError(`Unsupported file type: ${mimeType}`);
      }

      logger.info('Extração de texto concluída', { 
        mimeType,
        textLength: text.length,
        duration: Date.now() - startTime
      });
      endTimer({ success: true, mimeType });
      return text;
    } catch (error) {
      logger.error('Falha na extração de texto', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        mimeType,
        duration: Date.now() - startTime
      });
      endTimer({ success: false, mimeType });
      throw error;
    }
  }

  /**
   * Splits raw text into chunks
   */
  chunkText(text: string, maxWords = 500, overlap = 50): string[] {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('document_chunking_time');

    try {
      logger.info('Iniciando divisão de texto em chunks', { 
        textLength: text.length,
        maxWords,
        overlap
      });

      const chunks = splitText(text, { maxWords, overlap });
      logger.info('Divisão de texto concluída', { 
        chunkCount: chunks.length,
        duration: Date.now() - startTime
      });
      endTimer({ success: true, chunkCount: chunks.length });
      return chunks;
    } catch (error) {
      logger.error('Falha na divisão de texto', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      endTimer({ success: false });
      throw error;
    }
  }

  /**
   * Generates embedding for a given text chunk
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('document_embedding_time');

    try {
      logger.info('Iniciando geração de embedding', { textLength: text.length });

      const embedding = await embedText(text);
      logger.info('Geração de embedding concluída', {
        vectorLength: embedding.length,
        duration: Date.now() - startTime
      });
      endTimer({ success: true, vectorLength: embedding.length });
      return embedding;
    } catch (error) {
      logger.error('Falha na geração de embedding', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      endTimer({ success: false });
      throw error;
    }
  }

  /**
   * Generates embeddings for an array of text chunks in a single API call.
   * Prefer this over calling generateEmbedding() in a loop — one round-trip
   * for all chunks instead of N sequential requests.
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    const endTimer = metrics.startTimer('document_embedding_time');

    try {
      logger.info('Iniciando geração de embeddings em lote', { count: texts.length });

      const embeddings = await embedTexts(texts);
      logger.info('Geração de embeddings em lote concluída', {
        count: embeddings.length,
        duration: Date.now() - startTime
      });
      endTimer({ success: true, vectorLength: embeddings[0]?.length ?? 0 });
      return embeddings;
    } catch (error) {
      logger.error('Falha na geração de embeddings em lote', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      endTimer({ success: false });
      throw error;
    }
  }
} 