# features/documents — Documentos (frontend)

Lado cliente do gerenciamento de documentos: **upload, listagem e exclusão**, além do acompanhamento do
processamento (vetorização/Qdrant) feito no backend. É uma feature **fina** no front — a UI vive nas
páginas e a comunicação no service.

| Onde | O quê |
|---|---|
| `features/documents/dtos/DocumentDto.ts` | Tipos/DTO de documento usados pela UI. |
| [`pages/documents/index.tsx`](../../pages/documents/index.tsx) · [`create.tsx`](../../pages/documents/create.tsx) | Telas de listagem e de upload. |
| [`lib/services/document.service.ts`](../../lib/README.md) | Chamadas ao backend (abaixo). |

## `document.service` (API)

| Método | Papel |
|---|---|
| `getDocuments()` | Lista os documentos do usuário. |
| `getDocumentById(docId)` | Detalhe de um documento. |
| `uploadDocument(formData)` | Upload (multipart) — cria o documento e dispara o processamento. |
| `getTokenCost(formData)` | Estimativa de custo antes do upload. |
| `getQdrantStatus()` · `getQdrantPoints(docId)` · `triggerQdrantInjection(docId)` | Status/pontos no vetor store e reinjeção. |
| `deleteDocument(docId)` | Remove o documento (e seus dados). |

> Processamento, extração e busca semântica acontecem no **backend** (feature
> [`documents`](../../../server/src/features/documents/README.md)). O front apenas inicia/consome.
> Os documentos processados alimentam o chat **RAG** (ver [`components/widgets/chat`](../../components/widgets/chat/README.md)).
