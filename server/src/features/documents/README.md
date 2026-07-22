# documents

Owns the lifecycle of user **documents**: upload, text extraction, asynchronous processing
(chunking + embedding), storage, and semantic search. It is also the **knowledge source** for the
RAG flow in [`chat`](../chat/README.md) and [`reports`](../reports/README.md). Each document is
scoped to its owner (tenant).

## Model

`Document` (Prisma): `id`, `userId`, `fileName`, `fileType` (`PDF` | `DOCX` | `XLSX`), `fileSize`,
`textContent`, `mimeType`, `status` (`PENDING` | `PROCESSING` | `COMPLETED` | `ERROR`),
`documentPurpose` (`DATA_ANALYSIS` | `KNOWLEDGE_BASE`), `summary`, `contextJson`, dates.
`Chunk` rows hold the split text; vectors live in **Qdrant** (collection `documents`).

## Layering & authorization

`Controller → Service → Repository`, with `Policy` injected into the service. SQL access goes through
`DocumentRepository`/`ChunkRepository`; vector access through `VectorRepository` (Qdrant).

- **Multi-tenant (Tier-0):** vector search is **hard-scoped to the owner** —
  `VectorRepository.search`/`searchVectors` always apply `must: [{ key: 'userId', match: userId }]`,
  so a `documentId` from another tenant returns nothing.
- **Policy** (`DocumentPolicy`): `canView`/`canUpdate`/`canDelete` are **owner-or-admin**.
  `getDocumentById` returns **404** (not 403) for a non-owned document, so existence isn't leaked.

## API (`/api/documents`)

| Method | Path | Action |
|---|---|---|
| GET | `/` | Paginated list of the user's documents (`page`/`limit`). |
| GET | `/list` | Lightweight `{ id, fileName }[]` for selection UIs. |
| GET | `/:id` | Get one document (owner-or-admin). |
| POST | `/upload` | Upload a file (`multipart/form-data`, field `file`). Starts async processing. |
| PATCH | `/:id` | Update `status`/`summary`/`contextJson`/`processingDate`/`processingError`. |
| DELETE | `/:id` | Delete the document + its chunks + its vectors. |
| POST | `/search` | Semantic search over the user's documents (`{ query, limit? }`). |
| GET | `/:id/qdrant` | Inspect a document's stored vectors (owner-checked). |
| POST | `/token-cost` | Estimate token count for an uploaded file (no persistence). |

All endpoints require authentication. Static paths (`/list`) are registered before `/:id` so they
are not shadowed by the parametric route.

## Processing pipeline (async, fire-and-forget)

`createDocument` persists the record as `PENDING` and kicks off `DocumentProcessingPipeline` without
blocking the response:

1. Status → `PROCESSING`; statistics computed.
2. **DATA_ANALYSIS** purpose: Excel → direct structured extraction; other tabular text → LLM-based
   structured extraction (delegated to [`structuredData`](../structuredData/README.md)). Extraction
   failures are recorded in `contextJson.errors` but don't abort the run.
3. Text is chunked; each chunk is embedded and upserted into Qdrant in batches of 10. Each vector's
   payload carries `{ documentId, userId, index, textContent, chunkId, fileName }`.
4. Status → `COMPLETED` (or `ERROR`, with the message persisted) on finish.

## Invariants & lifecycle

- **Delete removes vectors too.** `deleteDocument` deletes Qdrant points **by the `documentId`
  payload filter** (`VectorRepository.deletePointsByDocumentId`) **first**, then deletes chunks +
  document in a single SQL transaction. Deleting by semantic key (not by reconstructed point ids) is
  robust against id-derivation drift and reaps any pre-existing orphans — so a deleted document's
  content can no longer surface in RAG.
- **Qdrant-before-SQL ordering:** the external store is cleaned first; if the SQL transaction then
  fails, vectors are already gone and SQL is intact (logged for visibility, no data corruption).
- **Vector point id** = `uuidv5(chunk.id, NAMESPACE)` at upsert (see pipeline). Because deletion is
  by payload filter, callers never need to reconstruct this id.

## DTOs

- **`CreateDocumentSchema`** — `fileName`, `fileType` (`PDF`/`DOCX`/`XLSX`), `fileSize`,
  `documentPurpose` (default `DATA_ANALYSIS`). Used by the upload handler.
- **`UpdateDocumentSchema`** — processing fields (`status`, `summary`, `contextJson`,
  `processingDate`, `processingError`).

## Tests

Gold-standard 4-level suite (see [`TESTING.md`](../../../TESTING.md)):

- **Policy unit** — `policies/__tests__/DocumentPolicy.spec.ts`: owner-or-admin matrix for
  view/update/delete; create/list for any authenticated user.
- **DTO unit** — `dtos/__tests__/DocumentDto.spec.ts`: `CreateDocumentSchema` limits (fileType enum,
  positive fileSize, `documentPurpose` default) + list/search query caps.
- **Service integration** — `services/__tests__/DocumentService.integration.test.ts` (real SQLite,
  Qdrant/embeddings mocked): Tier-0 reads/updates/deletes, the **404-not-403 existence non-leak**, and
  the privacy-critical **delete ordering** (Qdrant vectors purged BEFORE the SQL row; a Qdrant failure
  leaves SQL intact). Also guards the search payload mapping (`textContent` reaches the caller).
- **HTTP contract** — `controllers/__tests__/documents.routes.integration.test.ts`: 401/400/403/404 and
  the `{ success, data }` envelope on the boundary that runs before any external call.

> **Bug found & fixed while testing:** `searchDocuments` read the wrong vector-payload field
> (`payload.text` instead of `payload.textContent`), so every search hit returned `chunkText:
> undefined`. The service test now asserts the mapping.

## Interaction with other features

- **Consumes:** [`structuredData`](../structuredData/README.md) (structured extraction for tabular
  docs — **DEPRECATED R26 on the frontend**, see that feature's README), [`users`](../users/README.md)
  (`UserRepository` to resolve the owner during processing), `lib/openai` (tabular detection / embeddings).
- **Consumed by:** [`chat`](../chat/README.md) (RAG search via `VectorRepository.search`),
  [`reports`](../reports/README.md) (context extraction for chart generation). Both pass the
  authenticated `userId`, so retrieval stays tenant-scoped.

