---
name: document-processing-generator
description: Gera ou modifica pipeline de ingestão documental — extractor, chunking, embedding, Qdrant e status tracking
argument-hint: "[tipo-do-extractor]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Document Processing Generator

## Purpose

Gera ou modifica componentes do pipeline RAG do Luminaris: extractors de arquivo, chunking, embedding via OpenAI, armazenamento no Qdrant, e atualização de status no Document model.

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
server/src/lib/vector/chunking.ts
server/src/lib/vector/embedding.ts
server/src/lib/vector/qdrant.ts
server/src/features/documents/services/DocumentService.ts
server/src/features/documents/services/DocumentProcessingService.ts
server/prisma/schema.prisma  (enum ProcessingStatus, DocumentPurpose)
```

## Generation contract

### Extractor

1. Arquivo: `server/src/lib/vector/extractors/<type>.ts`
2. Assinatura: `export async function extract<Type>(buffer: Buffer): Promise<{ text: string }>`
3. Retornar texto limpo sem formatação especial
4. Tratar erros com throw tipado

### DocumentProcessingService (modificação)

1. Leia o arquivo inteiro antes de editar
2. Adicionar case no switch de tipo de arquivo
3. Chamar o novo extractor
4. Passar para chunking → embedding → qdrant.upsert

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
server/src/lib/vector/extractors/<type>.ts                          ← NEW
server/src/features/documents/services/DocumentProcessingService.ts ← EDIT
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
