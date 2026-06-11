import prisma from '../../../lib/prisma';
import { IDocument, DocumentCreateInput, DocumentUpdateInput } from '../models/Document.model';
import { IDocumentRepository } from './IDocumentRepository';

/**
 * Prisma implementation of the Document repository.
 * Handles all database operations for Document entities.
 */
export class DocumentRepository implements IDocumentRepository {
  async create(data: DocumentCreateInput): Promise<IDocument> {
    const document = await prisma.document.create({
      data: {
        userId: data.userId,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        textContent: data.textContent,
        mimeType: data.mimeType,
        documentPurpose: data.documentPurpose,
        status: data.status,
      },
    });
    return this.toDomain(document);
  }

  async update(id: string, data: DocumentUpdateInput): Promise<IDocument> {
    /*
## Phase 4: Knowledge Graph Integration

The AI Agent's intelligence has been significantly enhanced by a **Knowledge Graph**, which provides a holistic "map" of the system's tables and their relationships.

### Key Enhancements:
- **Persistent Storage**: The graph is stored in a new `KnowledgeGraph` Prisma model.
- **AI Context Enrichment**: `ChatService` injects the "Knowledge Map" into the AI prompt for deep system awareness.

---

## Phase 5: Server-side CRUD Standardization

A major refactoring was performed to standardize all server-side operations, ensuring consistency, reliability, and security across the entire application.

### Key Enhancements:
- **Unified User Context**: Replaced fragmented context extraction with a single, robust helper `getUserContextFromRequest` in `authUtils.ts`.
- **Standardized Controller Pattern**: All 14 controllers (from `user` to `analytics` and `reports`) now follow a consistent structure:
    - User context extraction and validation.
    - Zod schema validation for inputs.
    - Service layer delegation.
    - Standardized JSON responses (`{ success: true, data: ... }`).
    - Unified error handling via `handleApiError`.
- **Zero Build Errors**: Resolved long-standing TypeScript issues (TS7030, model mismatches) in `DocumentRepository.ts` and `reportsController.ts`.

```mermaid
graph LR
    A[Standardized Request] --> B[Auth Middleware / Context]
    B --> C[Standardized Controller]
    C --> D[Zod Validation]
    D --> E[Service Layer]
    E --> F[Repository / DB]
    F --> G[Standardized JSON Response]
```
    */
    const updated = await prisma.document.update({
      where: { id },
      data: {
        status: data.status,
        summary: data.summary,
        ...(data.contextJson !== undefined && { contextJson: data.contextJson }),
        processingDate: data.processingDate,
        processingError: data.processingError,
      },
    });
    return this.toDomain(updated);
  }

  async findAllForUser(userId: string): Promise<{ id: string; fileName: string }[]> {
    const documents = await prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        fileName: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return documents;
  }

  async findAll(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [documents, totalCount] = await Promise.all([
      prisma.document.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.count({ where: { userId } }),
    ]);

    return {
      documents: documents.map(this.toDomain),
      totalCount,
    };
  }

  async findById(id: string): Promise<IDocument | null> {
    const document = await prisma.document.findUnique({
      where: { id },
    });

    return document ? this.toDomain(document) : null;
  }

  async delete(id: string): Promise<void> {
    await prisma.document.delete({
      where: { id },
    });
  }

  private toDomain(prismaDocument: any): IDocument {
    return {
      id: prismaDocument.id,
      userId: prismaDocument.userId,
      fileName: prismaDocument.fileName,
      fileType: prismaDocument.fileType,
      fileSize: prismaDocument.fileSize,
      textContent: prismaDocument.textContent,
      mimeType: prismaDocument.mimeType,
      status: prismaDocument.status,
      documentPurpose: prismaDocument.documentPurpose,
      summary: prismaDocument.summary,
      contextJson: prismaDocument.contextJson || {},
      uploadDate: prismaDocument.uploadDate,
      processingDate: prismaDocument.processingDate,
      processingError: prismaDocument.processingError,
      createdAt: prismaDocument.createdAt,
      updatedAt: prismaDocument.updatedAt,
    };
  }
} 