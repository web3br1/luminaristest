# Document Feature

This feature handles document management, including upload, asynchronous processing, storage, and retrieval. It's designed to extract text from various file types, generate vector embeddings, and enable semantic search capabilities.

## Architecture & Processing Flow

The system follows a robust, decoupled architecture to handle document processing efficiently:

1.  **Upload**: A user uploads a file (`PDF`, `DOCX`, `XLSX`) via the API.
2.  **Initial Handling (`DocumentService`)**: The service validates the request, extracts the full text from the file, and creates an initial `Document` record in the database with `PENDING` status.
3.  **Asynchronous Kick-off**: Immediately after creation, the service triggers the `DocumentProcessingPipeline` in a non-blocking, 'fire-and-forget' manner.
4.  **Pipeline Execution (`DocumentProcessingPipeline`)**: This is the core orchestrator for background processing. It updates the document status to `PROCESSING` and manages the entire flow.
5.  **Chunking & Embedding (`DocumentProcessingService`)**: The pipeline uses this low-level service to:
    *   Split the extracted text into smaller, manageable chunks.
    *   Generate vector embeddings for each chunk using an external AI model.
6.  **Storage (`ChunkRepository` & `VectorRepository`)**: The generated data is stored:
    *   Chunks are saved in a relational database (`ChunkRepository`).
    *   Vector embeddings are upserted into a vector database (`VectorRepository`) for efficient similarity searches.
7.  **Finalization**: Once all chunks are processed, the pipeline updates the document status to `COMPLETED` or `ERROR` if failures occurred.

## Structure

```
documents/
├── dtos/              # Data Transfer Objects (Zod Schemas)
├── models/            # Domain Models (Interfaces and Enums)
├── policies/          # Authorization Logic (e.g., can a user access a document?)
├── repositories/      # Data Access Layer (SQL and Vector DB)
│   ├── ChunkRepository.ts
│   ├── DocumentRepository.ts
│   ├── VectorRepository.ts
│   └── ... (interfaces)
├── services/          # Business Logic Layer
│   ├── __tests__/         # Unit tests for services
│   │   └── DocumentService.spec.ts
│   ├── DocumentService.ts          # High-level orchestrator
│   ├── DocumentProcessingPipeline.ts # Manages the async processing flow
│   └── DocumentProcessingService.ts  # Low-level text/vector operations
└── README.md          # This file
```

## Components

### Services
-   **`DocumentService`**: The main entry point for document-related business logic. It handles CRUD operations and initiates the async processing pipeline.
-   **`DocumentProcessingPipeline`**: Orchestrates the complex, multi-step process of chunking, embedding, and storing document data. It's responsible for updating the document's status and context throughout the process.
-   **`DocumentProcessingService`**: A low-level utility service responsible for concrete tasks like text extraction from different file formats and generating embeddings.

#### `DocumentService` API
| Method | Role |
|---|---|
| `getAllDocuments(userContext, page, limit)` | Paginated list of the user's documents. |
| `getDocumentListForUser(userContext)` | Lightweight `{ id, fileName }[]` — used to populate selection lists in the UI. |
| `getDocumentById(id, userContext)` | Fetch one document (ownership-checked). |
| `createDocument(fileBuffer, fileName, fileType, fileSize, userContext, documentPurpose?)` | Persists the document (`PENDING`) and kicks off async processing. `documentPurpose` defaults to `DATA_ANALYSIS`. |
| `updateDocument(id, data, userContext)` | Updates `status` / `summary` / `contextJson` / `processingDate` / `processingError`. |
| `deleteDocument(id, userContext)` | Removes the document and its chunks/vectors. |
| `searchDocuments(query, userContext, limit?)` | Semantic search across the user's documents. |

### Repositories
-   **`DocumentRepository`**: Manages data persistence for the core `Document` entity in the primary database.
-   **`ChunkRepository`**: Handles storage and retrieval of text chunks associated with a document.
-   **`VectorRepository`**: Interfaces with the vector database (e.g., Qdrant) to store and search for document embeddings.

### Models
-   **`Document.model.ts`**: Defines the `IDocument` interface, the `DocumentStatus` enum (`PENDING`, `PROCESSING`, `COMPLETED`, `ERROR`), and related data structures. The supported `fileType` values are `'PDF'`, `'DOCX'`, and `'XLSX'`.

### Policies
-   **`DocumentPolicy.ts`**: Implements authorization rules to ensure users can only access or modify documents they own or have permission to.

### DTOs (Contratos de Dados)
-   **`CreateDocumentSchema`**: Valida os dados básicos do arquivo (`fileName`, `fileType`, `fileSize`) na criação de um novo documento. Usado pela API de upload.
-   **`UpdateDocumentSchema`**: Valida os campos que podem ser atualizados durante ou após o processamento, como `status`, `summary`, e o `contextJson` com as métricas de processamento.
-   **`DocumentResponseSchema`**: Define o formato de um objeto de documento completo retornado pela API.
-   **`DocumentListResponseSchema`**: Define o formato da resposta para a listagem paginada de documentos.

## Interação com Outras Features

- **Consome:**
    - `features/structuredData`: O `DocumentProcessingPipeline` chama o `StructuredDataService` para criar registros de dados estruturados quando um documento tabular é processado.
    - `features/users`: O `DocumentProcessingPipeline` utiliza o `UserRepository` para obter os dados completos do usuário (`IUser`) necessários para as chamadas de serviço.
    - `lib/openai`: Utiliza o `OpenAIService` para tarefas de IA, como determinar se um texto é tabular.

- **Consumida por:**
    - `features/chat`: O `ChatService` pode utilizar o `DocumentService` para realizar buscas semânticas nos documentos como parte do fluxo de RAG (Retrieval-Augmented Generation).
    - `features/reports`: O `ReportService` pode consumir dados de documentos para gerar relatórios e análises.

## API Endpoints

### GET /api/documents
- **Description**: Lists all documents for the authenticated user, with pagination.
- **Auth**: Required.

### POST /api/documents
- **Description**: Creates a new document by uploading a file. The request should be `multipart/form-data`.
- **Auth**: Required.
- **Supported Types**: `PDF`, `DOCX`, `XLSX`.

### GET /api/documents/{id}
- **Description**: Retrieves a specific document by its ID.
- **Auth**: Required.
- **Authorization**: User must own the document or have an ADMIN role.

### DELETE /api/documents/{id}
- **Description**: Deletes a document and all its associated data (chunks and vectors).
- **Auth**: Required.
- **Authorization**: User must own the document or have an ADMIN role.

### POST /api/documents/search
- **Description**: Performs a semantic search across all of the user's documents.
- **Auth**: Required.
- **Body (JSON)**:
  - `query` (string, required): The search text.
  - `limit` (integer, optional): The maximum number of results (default: 10).
- **Returns**: A list of matching chunks, including the document source and similarity score.

### Exemplos de Uso

#### 1. Upload de Documento
```typescript
// Exemplo de upload usando fetch
const formData = new FormData();
formData.append('file', file);
formData.append('fileName', 'documento.pdf');

const response = await fetch('/api/documents', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: formData
});

const document = await response.json();
```

#### 2. Busca Semântica
```typescript
// Exemplo de busca usando fetch
const response = await fetch('/api/documents/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    query: 'termo de busca',
    limit: 5
  })
});

const results = await response.json();
```

#### 3. Recuperação de Documento
```typescript
// Exemplo de recuperação usando fetch
const response = await fetch(`/api/documents/${documentId}`, {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

const document = await response.json();
```

#### 4. Atualização de Documento
```typescript
// Exemplo de atualização usando fetch
const response = await fetch(`/api/documents/${documentId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    summary: 'Resumo atualizado',
    status: 'COMPLETED'
  })
});
```

## Authorization Rules

- Users can only access their own documents
- Admins can access all documents
- Document creation requires authentication
- Document updates require ownership or admin role
- Document deletion requires ownership or admin role

## Validation Rules

- File name is required and must not be empty
- File type must be one of `PDF`, `DOCX`, `XLSX`
- File size must be positive
- Status transitions are validated
- Processing errors require error messages
- Completed status requires context data 

## Interação com Outras Features

A feature `documents`, especialmente através do seu `VectorRepository`, é a base para as capacidades de busca e análise de outras features no sistema.

- **Feature `chat`**: O `ChatService` consome o `VectorRepository` para realizar a busca por similaridade semântica (RAG - Retrieval-Augmented Generation). Ele transforma a pergunta do usuário em um embedding e usa este repositório para encontrar os trechos de documentos mais relevantes para contextualizar a resposta da IA.

- **Feature `reports`**: De forma similar, o `ReportService` utiliza o `VectorRepository` na etapa de extração de dados. Quando a IA detecta a intenção de gerar um gráfico, o serviço busca o contexto necessário nos documentos para então formatar os dados para a visualização.

Em resumo, a feature `documents` não apenas gerencia o ciclo de vida dos arquivos, mas também serve como a principal fonte de conhecimento para as features de IA da aplicação.