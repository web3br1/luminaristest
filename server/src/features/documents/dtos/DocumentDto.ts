import { z } from 'zod';
import { DocumentStatus, DocumentPurpose } from '../models/Document.model';
import { DocumentContext } from '../models/DocumentContext';

/**
 * Schema for creating a new Document record upon file upload.
 */
export const CreateDocumentSchema = z.object({
  fileName: z.string({ message: 'document.validation.fileNameRequired' })
    .min(1, 'document.validation.fileNameRequired'),
  fileType: z.enum(['PDF', 'DOCX', 'XLSX'] as const, {
    message: 'document.validation.fileTypeRequired',
  }),
  fileSize: z.number({ message: 'document.validation.fileSizeRequired' })
    .positive('document.validation.fileSizePositive'),
  documentPurpose: z.nativeEnum(DocumentPurpose, {
    message: 'document.validation.purposeRequired',
  }).default(DocumentPurpose.DATA_ANALYSIS),
});

/**
 * Schema for updating a Document record's processing status and results.
 */
export const UpdateDocumentSchema = z.object({
  contextJson: z.object({
    processing: z.object({
      totalChunks: z.number(),
      processedChunks: z.number(),
      failedChunks: z.number(),
      duration: z.number(),
      startTime: z.string(),
      endTime: z.string()
    }),
    statistics: z.object({
      wordCount: z.number(),
      charCount: z.number(),
      avgWordLength: z.number()
    }),
    errors: z.array(z.object({
      code: z.string(),
      message: z.string(),
      timestamp: z.string()
    })).optional()
  }).optional(),
  status: z.nativeEnum(DocumentStatus, {
    message: 'document.validation.statusRequired',
  }),
  summary: z.string().nullable(),
  processingDate: z.preprocess((val) => {
    if (typeof val === 'string' || val instanceof Date) {
      return val instanceof Date ? val : new Date(val);
    }
    return val;
  }, z.date().nullable()),
  processingError: z.string().nullable(),
});

/**
 * Schema for Document response.
 */
export const DocumentResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  fileName: z.string(),
  fileType: z.enum(['PDF', 'DOCX', 'XLSX']),
  fileSize: z.number(),
  textContent: z.string().optional(),
  status: z.nativeEnum(DocumentStatus),
  documentPurpose: z.nativeEnum(DocumentPurpose),
  summary: z.string().nullable(),
  contextJson: z.object({
    processing: z.object({
      totalChunks: z.number(),
      processedChunks: z.number(),
      failedChunks: z.number(),
      duration: z.number(),
      startTime: z.string(),
      endTime: z.string()
    }).nullable(),
    statistics: z.object({
      wordCount: z.number(),
      charCount: z.number(),
      avgWordLength: z.number()
    }).nullable(),
    errors: z.array(z.object({
      code: z.string(),
      message: z.string(),
      timestamp: z.string()
    })).optional()
  }).nullable(),
  uploadDate: z.date(),
  processingDate: z.date().nullable(),
  processingError: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Schema for paginated Document list response.
 */
export const DocumentListResponseSchema = z.object({
  documents: z.array(DocumentResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>;
export type UpdateDocumentDto = z.infer<typeof UpdateDocumentSchema>;
export type DocumentResponseDto = z.infer<typeof DocumentResponseSchema>;
export type DocumentListResponseDto = z.infer<typeof DocumentListResponseSchema>; 