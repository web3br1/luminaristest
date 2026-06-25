---
name: document-processing-generator
description: Gera ou modifica o pipeline de ingestão documental RAG do Luminaris — extractor de arquivo (PDF/DOCX/TXT/MD → `{ text }`), chunking, embedding (OpenAI), upsert no Qdrant e status tracking do Document (PENDING→PROCESSING→COMPLETED/ERROR). Use quando o pedido for "suportar novo tipo de arquivo", "extractor de X", "mudar chunking/embedding", "processar documento para RAG/busca semântica", "indexar no Qdrant", ou ao depurar documento preso em PROCESSING. Camada de serviço — sem React/transporte no pipeline. Domínio/arquivos: server/src/lib/vector/extractors/<type>.ts + server/src/features/documents/services/DocumentProcessingPipeline.ts. NÃO é para XLSX/CSV → tabela editável (use structured-data-generator).
argument-hint: "[tipo-do-extractor]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com Prisma + tsc, libs em lib/vector/ — chunking/embedding/qdrant — e DocumentProcessingPipeline). Depende de Qdrant + chave OpenAI em runtime; a geração em si não tem efeitos externos (apenas gera/edita arquivos).
metadata:
  governance-skill-id: "SKL-DOC-PROC"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Document Processing Generator

## Purpose

Gera ou modifica componentes do pipeline RAG do Luminaris: extractors de arquivo, chunking, embedding via OpenAI, armazenamento no Qdrant, e atualização de status no Document model.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, no-`any`, soft-delete, money math, testes, verificação) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Document Processing / RAG**.

> ⚠️ **Risco HIGH — confirmação manual.** Este pipeline toca isolamento de tenant na busca RAG e o status de documentos do usuário. Um erro vaza documentos entre usuários ou trava documentos em `PROCESSING`. Confirme o plano antes de editar e rode os testes de isolamento (`documents/__tests__/rag-tenant-isolation.test.ts`) depois.

## Checklist obrigatório — Document Processing / RAG

- [ ] **[DOCPROC-001] Extractor retorna `{ text: string }`** — assinatura `export async function extract<Type>(buffer: Buffer): Promise<{ text: string }>`; texto limpo, sem formatação especial. Erros via throw tipado.
- [ ] **[DOCPROC-002] Chunking, embedding e Qdrant via as libs de `lib/vector/`** — `chunking.ts`, `embedding.ts` (OpenAI), `qdrant.ts`. Não reimplementar chunk/embed/upsert no extractor ou no service.
- [ ] **[DOCPROC-003] Status flow respeitado em TODOS os branches:** `PENDING → PROCESSING` (ao iniciar) → `COMPLETED` (sucesso) | `ERROR` (qualquer exceção). Nenhum caminho deixa o documento preso em `PROCESSING`. Atualizar `Document.processingDate` e `Document.processingError` junto com o status.
- [ ] **[DOCPROC-004] Isolamento por tenant na busca RAG é barreira de segurança:** a ownership check (`userId`) acontece **antes** do Qdrant, e o `vectorRepository.search()` recebe `userId` + `docIds` do dono. Nunca buscar cross-tenant. Validar com o teste de isolamento.
- [ ] **[DOCPROC-005] `DocumentPurpose` correto:** `KNOWLEDGE_BASE` (PDF/DOCX → RAG) vs `DATA_ANALYSIS` (XLSX/CSV → tabela estruturada; ver `structured-data-generator`). Usar o purpose errado pula a extração devida.
- [ ] **[DOCPROC-006] Pipeline é camada de serviço pura — sem React/transporte:** processamento sempre async (via `DocumentService`/`setImmediate`), nunca no controller, nunca bloqueante; ZERO `import React`/JSX, ZERO Express/`res.json` no extractor, no pipeline ou no service. O buffer **não** vai para o banco — só metadados e texto extraído; o vetor vai para o Qdrant.

## When to use

- Novo tipo de arquivo precisa ser suportado (ex: CSV, TXT, Markdown)
- Modificando estratégia de chunking
- Adicionando metadados ao processo de embedding
- Debugando falhas no pipeline de processamento documental

## Inputs

- `$ARGUMENTS[0]`: tipo do extractor (ex: `csv`, `markdown`, `txt`)

## Repository patterns to inspect first

```
server/src/lib/vector/extractors/pdf.ts
server/src/lib/vector/extractors/word.ts
server/src/lib/vector/extractors/ExcelExtractor.ts
server/src/lib/vector/extractors/ExcelStructuredExtractor.ts   ← extração tabular (DATA_ANALYSIS)
server/src/lib/vector/chunking.ts
server/src/lib/vector/embedding.ts
server/src/lib/vector/qdrant.ts
server/src/features/documents/services/DocumentService.ts               ← createDocument, setImmediate async
server/src/features/documents/services/DocumentProcessingPipeline.ts    ← dispatcher: status flow + DATA_ANALYSIS vs KNOWLEDGE_BASE
server/src/features/documents/services/DocumentProcessingService.ts     ← helper: chunkText() + generateEmbeddings()
server/prisma/schema.prisma  (enum DocumentStatus, DocumentPurpose)
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/documents/services/DocumentProcessingPipeline.ts` — pipeline real e perfeito: é o **dispatcher** que aplica o status flow em todos os branches (`PROCESSING` ao iniciar → `COMPLETED` no sucesso → `ERROR` em `handleProcessingError`, sempre setando `processingDate`/`processingError`), separa `DocumentPurpose.DATA_ANALYSIS` (Excel → `extractStructuredDataFromExcel` → `StructuredDataService`; PDF/DOCX → `isTextTabular`) de `KNOWLEDGE_BASE` (pula extração estruturada), e só então chama `processChunks()` → embeddings em batch → `vectorRepository.upsertChunks`. Para um extractor, espelhe `server/src/lib/vector/extractors/pdf.ts` (devolve apenas `{ text }`). Confirme o status flow lendo `handleProcessingError`. Leia-o ANTES de gerar.

## Generation contract

### Extractor

1. Arquivo: `server/src/lib/vector/extractors/<type>.ts`
2. Assinatura: `export async function extract<Type>(buffer: Buffer): Promise<{ text: string }>`
3. Retornar texto limpo sem formatação especial
4. Tratar erros com throw tipado

### DocumentProcessingPipeline (modificação — dispatcher)

1. Leia `DocumentProcessingPipeline.ts` inteiro antes de editar — é onde mora o status flow e o branch por `documentPurpose`/`mimeType`
2. Adicionar o branch de detecção do novo tipo (por `mimeType`/`documentPurpose`) dentro do `try` de `processDocument`
3. Chamar o novo extractor
4. Para RAG: deixar `processChunks()` cuidar de chunking → embedding (batch) → `vectorRepository.upsertChunks`. Para tabular: chamar `StructuredDataService` (ver `structured-data-generator`)
5. O chunking/embedding em si vive em `DocumentProcessingService.ts` (`chunkText`/`generateEmbeddings`) — reuse, não reimplemente

### Status flow (sempre respeitar)

```
PENDING → PROCESSING (ao iniciar)
PROCESSING → COMPLETED (ao finalizar com sucesso)
PROCESSING → ERROR (em qualquer exceção)
```

5. Sempre atualizar `Document.processingDate` e `Document.processingError`
6. Enum `DocumentPurpose`: `DATA_ANALYSIS` (XLSX/CSV) vs `KNOWLEDGE_BASE` (PDF/DOCX)

## Files usually created or changed

```
server/src/lib/vector/extractors/<type>.ts                           ← NEW
server/src/features/documents/services/DocumentProcessingPipeline.ts ← EDIT (dispatcher: novo branch + status flow)
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Não processe o documento diretamente no controller — sempre via DocumentService async
- Não esqueça de atualizar `Document.status` em TODOS os branches (sucesso e erro)
- Não armazene o buffer em banco de dados — apenas metadados e texto extraído
- Não ignore erros do Qdrant — o status deve refletir falhas de vetorização
- Não reimplemente chunking/embedding/upsert no extractor — use as libs de `lib/vector/`; o extractor só devolve `{ text }`
- Não busque RAG cross-tenant — a ownership check por `userId` antes do Qdrant é barreira de segurança obrigatória; passar `userId` + `docIds` do dono a `vectorRepository.search()` é inegociável
- Não deixe o documento preso em `PROCESSING` — todo branch (sucesso e exceção) move para `COMPLETED` ou `ERROR`
- Não use `KNOWLEDGE_BASE` para XLSX/CSV tabular — esse purpose pula a extração estruturada (ver `structured-data-generator`)
