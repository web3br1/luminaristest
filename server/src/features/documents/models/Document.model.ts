/**
 * Enum definindo os possíveis propósitos de um documento
 */
export enum DocumentPurpose {
  DATA_ANALYSIS = 'DATA_ANALYSIS',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE'
}

/**
 * Represents the core Document entity within the application domain.
 * This interface decouples the application logic from the specific ORM (Prisma).
 */
export interface IDocument {
  /** Unique identifier for the document */
  id: string;
  /** ID of the user who owns this document */
  userId: string;
  /** Original name of the uploaded file */
  fileName: string;
  /** Mime type of the uploaded file */
  mimeType: string;
  /** Type of file (PDF, DOCX, or XLSX) */
  fileType: 'PDF' | 'DOCX' | 'XLSX';
  /** Size of the file in bytes */
  fileSize: number;
  /** Full extracted text content of the document */
  textContent: string;
  /** Processing status of the document */
  status: DocumentStatus;
  /** Propósito do documento (análise de dados ou base de conhecimento) */
  documentPurpose: DocumentPurpose;
  /** AI-generated summary, se disponível */
  summary: string | null;
  /** JSON estruturado do processamento via AI */
  contextJson: Record<string, unknown> | null;
  /** Timestamp when the document was created */
  createdAt: Date;
  /** Timestamp when the document was last updated */
  updatedAt: Date;
  /** Timestamp quando o arquivo foi enviado */
  uploadDate: Date;
  /** Timestamp de conclusão do processamento */
  processingDate: Date | null;
  /** Mensagem de erro do processamento, se houver */
  processingError: string | null;
}

/**
 * Input type for creating a new Document in the database.
 */
export interface DocumentCreateInput {
  userId: string;
  mimeType: string;
  fileName: string;
  fileType: 'PDF' | 'DOCX' | 'XLSX';
  fileSize: number;
  textContent: string;
  status: DocumentStatus;
  documentPurpose: DocumentPurpose;
}

/**
 * Input type para atualizar um Document no banco de dados.
 */
export interface DocumentUpdateInput {
  status: DocumentStatus;
  summary: string | null;
  contextJson?: Record<string, unknown> | null;
  processingDate: Date | null;
  processingError: string | null;
  textContent?: string;
}

/**
 * Enum representando o status de processamento do documento
 */
export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  FAILED = 'FAILED',
} 