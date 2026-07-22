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

  /**
   * Generates embedding vectors for an array of texts in a single API call.
   * @param texts - The texts to generate embeddings for
   * @returns Promise that resolves to an array of embedding vectors (same order as input)
   * @throws {Error} If embedding generation fails
   */
  embedTexts(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingOptions {
  /** The OpenAI API key */
  apiKey: string;
  /** The model to use for embeddings @default 'text-embedding-3-small' */
  model?: string;
  /** The expected dimension of the embedding vector @default 1536 */
  expectedDimension?: number;
  /** Per-request timeout in ms (SDK-level) @default 30000 */
  timeoutMs?: number;
  /** Bounded automatic retries on transient failures (SDK-level) @default 2 */
  maxRetries?: number;
}

/**
 * Embedding service backed by OpenAI. Resilience (timeout + bounded retries) uses the OpenAI SDK's
 * built-in options — no custom retry code. (Formerly named `OpenAIService`; renamed to avoid the
 * clash with the chat client in `lib/openai/OpenAIService.ts`.)
 */
export class EmbeddingService implements IEmbeddingService {
  private client: OpenAI;
  private model: string;
  private expectedDimension: number;

  constructor(options: EmbeddingOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 30_000,
      maxRetries: options.maxRetries ?? 2,
    });
    this.model = options.model || 'text-embedding-3-small';
    this.expectedDimension = options.expectedDimension || 1536;
  }

  public async embedText(text: string): Promise<number[]> {
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    logger.debug('Generating embedding for text', { textLength: text.length, model: this.model });

    try {
      const response = await this.client.embeddings.create({ model: this.model, input: text });
      const embedding = response.data[0]?.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response format');
      }

      if (embedding.length !== this.expectedDimension) {
        const errorMessage = `Invalid embedding dimension: expected ${this.expectedDimension}, got ${embedding.length}`;
        logger.error(errorMessage, { expected: this.expectedDimension, actual: embedding.length, model: this.model });
        throw new Error(errorMessage);
      }

      logger.debug('Successfully generated embedding', {
        textLength: text.length,
        vectorLength: embedding.length,
        model: this.model,
      });

      return embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to generate embedding', { error: errorMessage, textLength: text.length, model: this.model });
      throw new Error(`Failed to generate embedding: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Generates embedding vectors for an array of texts in a single API call.
   * The OpenAI embeddings endpoint accepts an array of inputs, so this issues
   * one request for all texts instead of N sequential requests.
   */
  public async embedTexts(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    logger.debug('Generating batch embeddings', {
      count: texts.length,
      model: this.model
    });

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });

      // OpenAI returns embeddings in the same order as the input array
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => {
          if (!item.embedding || !Array.isArray(item.embedding)) {
            throw new Error('Invalid embedding response format');
          }
          if (item.embedding.length !== this.expectedDimension) {
            throw new Error(
              `Invalid embedding dimension: expected ${this.expectedDimension}, got ${item.embedding.length}`
            );
          }
          return item.embedding;
        });

      logger.debug('Successfully generated batch embeddings', {
        count: embeddings.length,
        model: this.model
      });

      return embeddings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to generate batch embeddings', {
        error: errorMessage,
        count: texts.length,
        model: this.model
      });
      throw new Error(`Failed to generate batch embeddings: ${errorMessage}`);
    }
  }
}

// Lazy default singleton — built on first use, NOT at import, so importing this module has no side
// effect and needs no key (the key is only required when an embedding is actually requested).
let defaultEmbeddingService: IEmbeddingService | null = null;

function getDefaultEmbeddingService(): IEmbeddingService {
  if (!defaultEmbeddingService) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    defaultEmbeddingService = new EmbeddingService({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'text-embedding-3-small',
      expectedDimension: 1536,
    });
  }
  return defaultEmbeddingService;
}

/** Convenience binding to the default service; resolves the singleton lazily on first call. */
export const embedText = (text: string): Promise<number[]> => getDefaultEmbeddingService().embedText(text);

/** Batch embedding helper — issues a single API call for all input texts (lazy singleton). */
export const embedTexts = (texts: string[]): Promise<number[][]> => getDefaultEmbeddingService().embedTexts(texts);
