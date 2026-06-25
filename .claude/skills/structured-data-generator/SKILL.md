---
name: structured-data-generator
description: Gera ou estende o pipeline de dados estruturados (XLSX/planilha → tabela editável) do Luminaris — extractor `extractStructuredDataFromExcel`, `DocumentPurpose.DATA_ANALYSIS`, `StructuredDataService` (persistência em coluna JSON SQL, editável) e integração com o frontend de spreadsheet. Use quando o pedido for "importar XLSX como tabela", "extrair planilha", "novo tipo de coluna (HeaderType)", "multi-sheet", "export CSV/JSON de StructuredData", "widget de spreadsheet", ou "por que o XLSX não virou tabela editável (DATA_ANALYSIS vs KNOWLEDGE_BASE)". Domínio/arquivos: `server/src/features/structuredData/**`, `server/src/lib/vector/extractors/*StructuredExtractor.ts`, `DocumentProcessingPipeline.ts`. NÃO é para ingestão RAG (PDF → chunk → embedding → Qdrant) — isso é `document-processing-generator`.
argument-hint: "[acao: novo-extrator|novo-tipo-coluna|multi-sheet|frontend-widget]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com Prisma + tsc, lib `xlsx`/`exceljs`, `features/structuredData/` e `lib/vector/extractors/`). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-STRUCTURED-DATA"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Structured Data Generator

## Purpose

Documenta e guia extensões do pipeline de dados estruturados: importação de XLSX para tabela editável no frontend, detecção automática de conteúdo tabular em PDF/DOCX, e API de edição de células. Diferente do RAG (chunks + Qdrant), este pipeline armazena os dados em SQL (JSON column) para permitir edição pelo usuário.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, no-`any`, soft-delete, money math, testes, verificação) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Structured Data**.

## Checklist obrigatório — Structured Data

- [ ] **[SDATA-001] Importar via lib de planilha** (`xlsx`/`exceljs`) — não parsear bytes na mão. O extractor (`extractStructuredDataFromExcel`) devolve `{ sheets: SheetStructured[] }` com headers inferidos.
- [ ] **[SDATA-002] Preservar o tipo de cada célula** — não coagir tudo a `string`. Número permanece `number`, data vira `DATE`, percentual `PERCENTAGE`, moeda `CURRENCY`. A inferência de coluna (`inferColumnType`) determina o `HeaderType`; coagir tudo a texto quebra ordenação/formatação no frontend. **`null` para célula vazia — nunca `undefined`** (o tipo é `(string | number | null)[][]`; `undefined` não serializa em JSON e some na coluna SQL, desalinhando a linha).
- [ ] **[SDATA-003] Armazenar em SQL (JSON column) via `StructuredDataService`** — nunca no Qdrant (esse é exclusivo de embeddings). Update sempre via `StructuredDataService.update()` (valida schema), nunca `prisma` direto na coluna.
- [ ] **[SDATA-004] `DocumentPurpose.DATA_ANALYSIS`** para tabular; `KNOWLEDGE_BASE` pula a extração estruturada e perde o dado.
- [ ] **[SDATA-005] O extractor/serviço é camada de servidor — ZERO React/JSX.** O pipeline (`*StructuredExtractor.ts`, `StructuredDataService`, `DocumentProcessingPipeline`) é agnóstico a apresentação: nunca `import React`, JSX, hooks ou componentes. A tabela editável é consumida pelo widget de spreadsheet no frontend, que apenas lê o shape `(string|number|null)[][]` exposto pelo serviço.
- [ ] **[SDATA-006] Novo `HeaderType`** propaga em 4 pontos casados: enum em `StructuredData.model.ts`, `ExcelHeader` em `Sheet.types.ts`, detecção em `inferColumnType`, e o `z.enum` do DTO. Esquecer um deixa o tipo inválido em runtime.
- [ ] **[SDATA-007] Normalizar single-sheet vs multi-sheet** ao ler — `getByDocumentId()` já normaliza; não assumir que `data` é sempre `(string|number|null)[][]`. **Paginar** grandes volumes — não materializar a planilha inteira em memória quando há leitura paginada; o frontend pagina a tabela editável.

## When to use

- Adicionar suporte a novo formato de arquivo além de XLSX, PDF, DOCX
- Adicionar novo tipo de coluna além de TEXT, NUMBER, CURRENCY, PERCENTAGE, DATE
- Modificar como XLSX multi-sheet é apresentado no frontend
- Implementar novo widget de spreadsheet no frontend
- Adicionar endpoint de export (CSV, JSON) a partir de `StructuredData`
- Debugar por que XLSX não está sendo extraído (DATA_ANALYSIS vs KNOWLEDGE_BASE)

## Inputs

- `$ARGUMENTS[0]`: ação — `novo-extrator` | `novo-tipo-coluna` | `multi-sheet` | `frontend-widget`

## Architecture — dois pipelines distintos, mesma entry point

```
DocumentService.createDocument(fileBuffer, fileName, fileType, fileSize, user, documentPurpose?)
  │                           ↑
  │                     DocumentPurpose.DATA_ANALYSIS (XLSX → tabela)
  │                     DocumentPurpose.KNOWLEDGE_BASE (PDF → RAG)
  │
  └── setImmediate → DocumentProcessingPipeline.process(document, fileBuffer)
        │
        ├── documentPurpose === DATA_ANALYSIS?
        │     ├── fileType === XLSX (fileBuffer presente)?
        │     │     └── extractStructuredDataFromExcel(fileBuffer)
        │     │           └── StructuredDataService.createFromStructured(user, docId, { sheets })
        │     └── PDF/DOCX?
        │           └── OpenAIService.isTextTabular(text)
        │                 ├── true  → StructuredDataService.createFromText(user, docId, text)
        │                 └── false → pular extração estruturada
        │
        ├── documentPurpose === KNOWLEDGE_BASE?
        │     └── PULAR extração estruturada → ir direto para chunks + embeddings
        │
        └── (ambos os fluxos) → processChunks() → embeddings → Qdrant
```

## Repository patterns to inspect first

```
server/src/lib/vector/extractors/ExcelStructuredExtractor.ts           ← extractStructuredDataFromExcel (XLSX → sheets)
server/src/features/documents/services/DocumentProcessingPipeline.ts   ← dispatcher DATA_ANALYSIS vs KB
server/src/features/documents/services/DocumentService.ts               ← createDocument, setImmediate async
server/src/features/structuredData/services/StructuredDataService.ts    ← API completa (createFromStructured/createFromText/update)
server/src/features/structuredData/models/StructuredData.model.ts       ← IStructuredData, Header, SheetData
server/src/features/structuredData/types/Sheet.types.ts                 ← ExcelHeader, SheetStructured
server/src/features/structuredData/dtos/StructuredDataDto.ts            ← validação de input
server/prisma/schema.prisma (modelo StructuredData)                     ← documentId FK, headers JSON, data JSON
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/lib/vector/extractors/ExcelStructuredExtractor.ts` — extractor XLSX real e perfeito: importa via lib de planilha (`exceljs`, não parseia bytes na mão), devolve `{ sheets: SheetStructured[] }` com headers inferidos, **preserva o tipo de cada célula** (`inferType` decide `NUMBER`/`DATE`/`TEXT` a partir dos valores — não coage tudo a string) e usa **`null` para célula vazia** (`getCellValue` retorna `null`, com padding de linhas curtas com `null` para não desalinhar). Pareie com `StructuredDataService.createFromStructured()` (normaliza single-sheet vs multi-sheet e persiste via repository — nunca prisma direto na coluna). Leia-os ANTES de gerar.

## Data model

```typescript
// Dois formatos possíveis para `data` (depende de quantas sheets o XLSX tem)

// Formato 1: single-sheet — array de arrays direto
type StructuredDataValue = (string | number | null)[][];

// Formato 2: multi-sheet — array de objetos SheetData
type SheetData = {
  name: string;
  headers: { key: string; title: string; type: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENTAGE' | 'DATE' }[];
  data: (string | number | null)[][];
};
type StructuredDataValue = SheetData[];

// Tipo canônico salvo no Prisma (JSON column)
interface IStructuredData {
  id: string;
  documentId: string;
  headers: Header[];   // { name: string; type: HeaderType }
  data: StructuredDataValue;
  createdAt: Date;
  updatedAt: Date;
}
```

## Generation contract — adicionar novo tipo de coluna

### 1. Adicionar ao enum em `models/StructuredData.model.ts`

```typescript
export type HeaderType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENTAGE' | 'DATE' | 'BOOLEAN'; // ← add
```

### 2. Adicionar ao tipo `ApiHeader` em `types/Sheet.types.ts`

```typescript
export interface ExcelHeader {
  key: string;
  title: string;
  type: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'PERCENTAGE' | 'DATE' | 'BOOLEAN'; // ← add
}
```

### 3. Atualizar a lógica de detecção em `extractStructuredDataFromExcel()`

Verificar onde o tipo de coluna é inferido a partir dos valores da célula Excel e adicionar detecção de boolean:

```typescript
function inferColumnType(values: (string | number | null)[]): HeaderType {
  const nonNull = values.filter(v => v !== null);
  if (nonNull.every(v => typeof v === 'boolean' || v === 'TRUE' || v === 'FALSE')) return 'BOOLEAN';
  if (nonNull.every(v => typeof v === 'number')) return 'NUMBER';
  // ... lógica existente ...
  return 'TEXT';
}
```

### 4. Atualizar o DTO de validação em `dtos/StructuredDataDto.ts`

```typescript
const HeaderTypeEnum = z.enum(['TEXT', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DATE', 'BOOLEAN']);
```

## Generation contract — adicionar novo extrator de formato

Localização: `server/src/lib/vector/extractors/` (mesma pasta de `ExcelStructuredExtractor.ts` — espelhe a assinatura dele). Registrar o novo branch no dispatcher `DocumentProcessingPipeline.ts`.

```typescript
// Padrão do extrator — mesma assinatura dos existentes
export async function extractStructuredDataFromCsv(
  fileBuffer: Buffer
): Promise<{ sheets: SheetStructured[] }> {
  // Parse CSV → SheetStructured com headers inferidos
  return {
    sheets: [{
      name: 'Sheet1',
      headers: [/* ExcelHeader[] */],
      data: [/* (string|number|null)[][] */],
    }],
  };
}

// Registrar no DocumentProcessingPipeline.ts
if (fileType === FileType.CSV) {
  const structured = await extractStructuredDataFromCsv(fileBuffer);
  await structuredDataService.createFromStructured(user, documentId, structured);
}
```

Adicionar `CSV` ao enum `FileType` em `schema.prisma` + `migrate dev`.

## Diferença crítica: DATA_ANALYSIS vs KNOWLEDGE_BASE

| Aspecto | DATA_ANALYSIS | KNOWLEDGE_BASE |
|---|---|---|
| Trigger | `documentPurpose = DATA_ANALYSIS` (padrão para XLSX) | `documentPurpose = KNOWLEDGE_BASE` |
| Extração | XLSX: `extractStructuredDataFromExcel()` — tabular direto; PDF/DOCX: `isTextTabular()` + `extractStructuredData()` | Chunking de texto |
| Armazenamento | `StructuredData` (Prisma JSON) — editável | Chunks SQL + vetores Qdrant |
| Frontend | Spreadsheet widget editável | Chat RAG com sourceDocuments |
| Update | `StructuredDataService.update()` via PATCH | Imutável após indexação |

## Files usually created or changed

```
server/src/features/structuredData/models/StructuredData.model.ts        ← EDIT (novo tipo)
server/src/features/structuredData/types/Sheet.types.ts                  ← EDIT (novo ExcelHeader type)
server/src/features/structuredData/services/StructuredDataService.ts     ← EDIT (nova lógica)
server/src/features/structuredData/dtos/StructuredDataDto.ts             ← EDIT (validação)
server/src/lib/vector/extractors/<Format>StructuredExtractor.ts          ← NEW (novo formato — espelha ExcelStructuredExtractor.ts)
server/src/features/documents/services/DocumentProcessingPipeline.ts    ← EDIT (novo fileType case)
server/prisma/schema.prisma                                               ← EDIT (novo FileType enum)
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd server && npx prisma migrate dev --name add_<tipo>_to_structured_data
```

## Anti-patterns

- **Não confundir os dois fluxos de XLSX** — `extractTextFromExcel()` extrai texto puro (para RAG/chunking); `extractStructuredDataFromExcel()` extrai estrutura tabular (para DATA_ANALYSIS). São funções diferentes com saídas diferentes.
- **Não usar `documentPurpose = KNOWLEDGE_BASE` para XLSX tabulares** — este purpose pula toda a extração estruturada e vai direto para embedding. O dado tabular é perdido.
- **Não armazenar `StructuredData` no Qdrant** — esses dados vão para SQL (JSON column), não para o vector store. Qdrant é exclusivo para embeddings de texto.
- **Não retornar sheet[0] sem detectar formato** — `StructuredDataService.getByDocumentId()` normaliza o formato multi-sheet automaticamente; não assumir que `data` é sempre `(string|number|null)[][]`.
- **Não modificar `data` diretamente no Prisma** — sempre via `StructuredDataService.update()` que valida schema e propaga para o frontend.
- **Não coagir todas as células a `string`** — preserve o tipo (`number`/`DATE`/`CURRENCY`/`PERCENTAGE`); coagir tudo a texto quebra ordenação e formatação no spreadsheet.
- **Não usar `undefined` para célula vazia** — use `null`; `undefined` não serializa em JSON e desalinha a linha na coluna SQL.
- **Não materializar a planilha inteira em memória quando há leitura paginada** — pagine; volumes grandes estouram memória e o frontend já consome em páginas.
- **Não esquecer nenhum dos 4 pontos casados ao adicionar `HeaderType`** — model enum + `ExcelHeader` + `inferColumnType` + `z.enum` do DTO; faltar um deixa o tipo inválido só em runtime.
