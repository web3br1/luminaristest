export interface DocumentContext {
  processing: {
    totalChunks: number;
    processedChunks: number;
    failedChunks: number;
    duration: number;
    startTime: string;
    endTime: string;
  };
  statistics: {
    wordCount: number;
    charCount: number;
    avgWordLength: number;
  };
  errors: Array<{
    code: string;
    message: string;
    timestamp: string;
  }>;
}

