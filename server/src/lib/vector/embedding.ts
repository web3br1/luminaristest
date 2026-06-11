import OpenAI from 'openai';
import { logger } from '@/lib/logger';

export interface IEmbeddingService {
  /**
   * Generates an embedding vector for the given text
   * @param text - The text to generate embedding for
   * @returns Promise that resolves to the embedding vector
   * @throws {Error} If embedding generation fails
   */
  embedText(text: string): Promise<number[]>;
}

export interface OpenAIOptions {
  /**
   * The OpenAI API key
   */
  apiKey: string;
  
  /**
   * The model to use for embeddings
   * @default 'text-embedding-3-small'
   */
  model?: string;
  
  /**
   * The expected dimension of the embedding vector
   * @default 1536
   */
  expectedDimension?: number;
}

export class OpenAIService implements IEmbeddingService {
  private client: OpenAI;
  private model: string;
  private expectedDimension: number;

  /**
   * Creates a new instance of OpenAIService
   * @param options - Configuration options
   */
  constructor(options: OpenAIOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model || 'text-embedding-3-small';
    this.expectedDimension = options.expectedDimension || 1536;
  }

  /**
   * Generates an embedding vector for the given text
   * @param text - The text to generate embedding for
   * @returns Promise that resolves to the embedding vector
   * @throws {Error} If embedding generation fails or has invalid dimension
   */
  public async embedText(text: string): Promise<number[]> {
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    logger.debug('Generating embedding for text', {
      textLength: text.length,
      model: this.model
    });

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response format');
      }

      // Validate embedding dimension
      if (embedding.length !== this.expectedDimension) {
        const errorMessage = `Invalid embedding dimension: expected ${this.expectedDimension}, got ${embedding.length}`;
        logger.error(errorMessage, {
          expected: this.expectedDimension,
          actual: embedding.length,
          model: this.model
        });
        throw new Error(errorMessage);
      }

      logger.debug('Successfully generated embedding', {
        textLength: text.length,
        vectorLength: embedding.length,
        model: this.model
      });

      return embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to generate embedding', {
        error: errorMessage,
        textLength: text.length,
        model: this.model
      });
      throw new Error(`Failed to generate embedding: ${errorMessage}`);
    }
  }
}

// Singleton instance for backward compatibility
let defaultEmbeddingService: IEmbeddingService | null = null;

/**
 * Gets the default embedding service instance
 * @returns The default embedding service
 * @throws {Error} If OPENAI_API_KEY is not set
 */
function getDefaultEmbeddingService(): IEmbeddingService {
  if (!defaultEmbeddingService) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    defaultEmbeddingService = new OpenAIService({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
      expectedDimension: 1536
    });
  }
  return defaultEmbeddingService;
}

// Export default instance for backward compatibility
const defaultExport = getDefaultEmbeddingService();

export default defaultExport;

// Re-export the embedText function for backward compatibility
export const embedText = defaultExport.embedText.bind(defaultExport);