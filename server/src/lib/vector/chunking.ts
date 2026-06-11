import { logger } from '@/lib/logger';

export interface ChunkingOptions {
  /**
   * Maximum number of words per chunk
   * @default 500
   */
  maxWords?: number;
  
  /**
   * Number of overlapping words between chunks
   * @default 50
   */
  overlap?: number;
  
  /**
   * Strategy for chunking text
   * - 'word': Split by word count
   * - 'sentence': Try to split at sentence boundaries
   * - 'paragraph': Split by paragraphs
   * @default 'word'
   */
  strategy?: 'word' | 'sentence' | 'paragraph';
}

/**
 * Splits text into chunks based on the specified strategy
 * @param text - The text to split into chunks
 * @param options - Chunking options
 * @returns Array of text chunks
 */
export function chunkText(
  text: string, 
  options: ChunkingOptions = {}
): string[] {
  if (!text || typeof text !== 'string') {
    logger.warn('Invalid text provided for chunking', { text });
    return [];
  }

  const {
    maxWords = 500,
    overlap = 50,
    strategy = 'word'
  } = options;

  logger.debug('Chunking text', {
    textLength: text.length,
    strategy,
    maxWords,
    overlap
  });

  try {
    let chunks: string[] = [];

    switch (strategy) {
      case 'sentence':
        chunks = chunkBySentences(text, maxWords, overlap);
        break;
      case 'paragraph':
        chunks = chunkByParagraphs(text, maxWords, overlap);
        break;
      case 'word':
      default:
        chunks = chunkByWords(text, maxWords, overlap);
    }

    logger.debug('Successfully chunked text', {
      originalLength: text.length,
      chunkCount: chunks.length,
      strategy,
      maxChunkLength: Math.max(...chunks.map(c => c.length))
    });

    return chunks;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to chunk text', {
      error: errorMessage,
      textLength: text.length,
      strategy
    });
    
    // Fallback to simple word-based chunking
    return chunkByWords(text, maxWords, overlap);
  }
}

/**
 * Splits text into chunks by word count with overlap
 */
function chunkByWords(text: string, maxWords: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  // Ensure overlap is not greater than maxWords
  const actualOverlap = Math.min(overlap, maxWords - 1);
  
  for (let i = 0; i < words.length; i += maxWords - actualOverlap) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    chunks.push(chunk);
  }
  
  return chunks;
}

/**
 * Attempts to split text at sentence boundaries
 */
function chunkBySentences(text: string, maxWords: number, overlap: number): string[] {
  // Simple sentence splitting - can be enhanced with more sophisticated NLP if needed
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    
    if (currentWordCount + words.length > maxWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      
      // Handle overlap
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.slice(overlapStart);
      currentWordCount = currentChunk.reduce((sum, w) => sum + w.split(/\s+/).length, 0);
    }
    
    currentChunk.push(sentence);
    currentWordCount += words.length;
  }
  
  // Add the last chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  
  return chunks;
}

/**
 * Splits text into chunks by paragraphs
 */
function chunkByParagraphs(text: string, maxWords: number, overlap: number): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    
    if (currentWordCount + words.length > maxWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      
      // Handle overlap - include last paragraph in next chunk
      if (overlap > 0 && currentChunk.length > 0) {
        currentChunk = [currentChunk[currentChunk.length - 1]];
        currentWordCount = currentChunk[0].split(/\s+/).length;
      } else {
        currentChunk = [];
        currentWordCount = 0;
      }
    }
    
    currentChunk.push(paragraph);
    currentWordCount += words.length;
  }
  
  // Add the last chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }
  
  return chunks;
}

// Export default function for backward compatibility
export default chunkText;
