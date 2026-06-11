# Área 6 — Document Intelligence (RAG) & structuredData (Auditoria Profunda)

> Parte do relatório `auditoria_profunda_areas.md`. Gerado em 2026-06-11.

## 1. Upload

- Rota: `POST /api/documents/upload` (`routes/documents.ts:24`); handler `uploadDocument()` (`documentsController.ts:88-132`)
- Multer com `memoryStorage()` (`documentsController.ts:11`) — **SEM limite de tamanho configurado** (risco OOM)
- Tipos aceitos: PDF, DOCX, XLSX — validados via Zod `CreateDocumentSchema.pick()` (l.98-112)
- Arquivo **não é armazenado em disco**: buffer em memória; após extração só o `textContent` persiste no Prisma; bytes brutos descartados
- Rate limit global 5000 req/15min (`server.ts:33-38`) — não específico de upload

## 2. Extração de texto

| Formato | Lib | Função | Arquivo |
|---|---|---|---|
| PDF | pdf-parse | `extractTextFromPDF()` | `lib/vector/extractors/pdf.ts:8` |
| DOCX | mammoth | `extractTextFromWord()` | `lib/vector/extractors/word.ts:8` |
| XLSX | ExcelJS | `extractTextFromExcel()` | `lib/vector/extractors/ExcelExtractor.ts:18` |

Orquestração: `DocumentProcessingService.extractText(buffer, mimeType)` (`DocumentProcessingService.ts:19`), sequencial. Falha → exception (l.52-60) → capturada no pipeline → documento `ERROR` + mensagem (`DocumentProcessingPipeline.ts:201-224`). **Sem retry, sem fila, sem fallback.**

## 3. Chunking

`chunkByWords(text, maxWords, overlap)` — `chunking.ts:32-106`: padrão **500 palavras com overlap de 50** (l.42-43); split por `/\s+/` (l.94); estratégias 'word'|'sentence'|'paragraph' (l.44). Chamado por `DocumentProcessingService.chunkText()` (`DocumentProcessingService.ts:66-84`).

## 4. Embeddings

- Modelo `text-embedding-3-small`, dimensão 1536 (`embedding.ts:48-49`), OpenAI
- Batches de **10 chunks** antes do upsert no Qdrant (`DocumentProcessingPipeline.ts:172`)
- **Sem retry** — falha em 1 chunk derruba o documento inteiro (l.161-194); sem throttling/backoff
- Custo estimável: $0.00002/1K tokens; doc de 1MB ≈ 62,5K tokens ≈ **$1,25**

## 5. Qdrant

- Collection `documents`, vetores 1536D, distância Cosine (`qdrant-initializer.ts:4-6`)
- Payload por ponto (`DocumentProcessingPipeline.ts:166-170`): `{documentId, userId, index, textContent, chunkId, fileName}`; id determinístico uuidv5
- Upsert: `VectorRepository.upsertChunks()` (l.66), batches de 100 (l.41), validação Zod (l.80), `wait: true` (l.109)

## 6. As DUAS rotas de busca (gap confirmado)

| | `search()` | `searchVectors()` |
|---|---|---|
| Filtro | `documentIds` opcional, `should` (OR) | `userId` obrigatório, `must` (AND) |
| userId | ❌ **NÃO filtra** | ✅ filtra |
| Consumidor | **ChatService.ts:193 (modo RAG)** | `DocumentService.searchDocuments()` (`DocumentService.ts:168`) |
| Linhas | VectorRepository.ts:140-199 | VectorRepository.ts:210+ |

> Nota de consolidação: o subagente desta área classificou `search()` como "órfã", mas a auditoria da Área 4 e a auditoria consolidada anterior confirmam que **`ChatService.generateResponse()` (modo RAG) chama `vectorRepository.search()` na linha 193** — portanto a rota vulnerável ESTÁ em uso no caminho do chat com documentos. O risco cross-tenant (R3 do relatório consolidado) permanece confirmado: sem validação de posse dos documentIds, um usuário pode buscar chunks de documentos de outro usuário.

## 7. Ciclo de vida do documento

Estados (`Document.model.ts:76-81`): PENDING → PROCESSING → COMPLETED | ERROR.

1. Upload → PENDING (`DocumentService.ts:113`)
2. `processDocumentAsync()` non-blocking (l.118)
3. PROCESSING (`DocumentProcessingPipeline.ts:63-69`)
4. Chunking+embedding com progresso em `contextJson` (processedChunks/failedChunks) (l.175-181)
5. COMPLETED (l.144) ou ERROR + processingError (l.217-220)

- Re-upload = novo documento (não sobrescreve)
- Atualização: PATCH `:id` (`DocumentService.ts:182-205`)
- **Deleção limpa** (`DocumentService.ts:139-155`): Qdrant points → chunks SQL → documento (cascade em structuredData via FK) ✅
- Front: polling via GET `/api/documents/:id` (sem WebSocket)

## 8. structuredData — pipeline órfão confirmado

**Backend 100% implementado**:
- Endpoint: GET `/api/structured-data/:documentId` (`structuredDataController.ts:6`)
- Service: `createFromStructured()` (Excel direto, `StructuredDataService.ts:92-138`), `createFromText()` (via LLM, l.140-186), `getByDocumentId()` (l.29-90)
- Repository: create/findByDocumentId/update (`StructuredDataRepository.ts:12-32`)
- Prisma: `model StructuredData` (`schema.prisma:154-171`) — documentId unique, headers Json, data Json, cascade delete
- Integração no pipeline: Excel DATA_ANALYSIS → `extractStructuredDataFromExcel()` (`DocumentProcessingPipeline.ts:97`); texto tabular → `isTextTabular()` + `createFromText()` (l.111-126); KNOWLEDGE_BASE pulado (l.131-134)

**Frontend 0% consumo**: `grep -r "structuredData" my-app/` → nenhum resultado. Feature completa mas inacessível ao usuário.

## 9. Riscos (DOC-1 a DOC-8)

| # | Sev. | Risco | Evidência |
|---|---|---|---|
| DOC-1 | **Crítica** | Multer memoryStorage sem limite de tamanho — OOM com upload grande | documentsController.ts:11 |
| DOC-2 | **Crítica** | `search()` sem filtro de userId — usada pelo ChatService no modo RAG (= R3 consolidado) | VectorRepository.ts:140-199; ChatService.ts:193 |
| DOC-3 | Média | Sem retry em falha de extração — documento irrecuperável (só re-upload) | DocumentService.ts:118-120 |
| DOC-4 | Média | structuredData órfã no front | grep my-app sem resultados |
| DOC-5 | Média | Limite 100K tokens rejeita docs grandes sem preview/comunicação clara | OpenAIService.ts:232-235 |
| DOC-6 | Baixa | Embedding sem retry — 1 chunk falho derruba o documento | DocumentProcessingPipeline.ts:165 |
| DOC-7 | Baixa | `textContent` integral redundante com chunks (espaço em SQLite) | Document.model.ts:26 |
| DOC-8 | Baixa | Polling em vez de WebSocket/SSE para progresso | front |

## 10. Pontos positivos confirmados

- Deleção em cascata limpa (Qdrant → chunks → documento) ✅
- Payload Qdrant inclui userId em todos os pontos (o dado existe; só o filtro de `search()` falta) ✅
- Validação Zod no upload e no upsert de vetores ✅
- Estados de processamento com contexto de progresso ✅
