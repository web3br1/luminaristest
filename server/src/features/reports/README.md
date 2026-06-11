# Feature: Reports

## Visão Geral

A feature `reports` é uma **feature de capacidade** (capability feature). Sua principal responsabilidade é orquestrar a geração de relatórios e visualizações de dados, como gráficos, a partir da análise de documentos e da interação do usuário.

Diferente de features de entidade como `users` ou `documents`, `reports` não possui uma tabela própria no banco de dados. Em vez disso, ela consome os serviços e repositórios de outras features para cumprir sua função.

## Estrutura de Arquivos

```
reports/
├── dtos/
│   └── GenerateReportDto.ts  # DTO e schema de validação para a API
├── services/
│   ├── IReportService.ts     # Interface do serviço
│   └── ReportService.ts      # Implementação da lógica de negócio
└── README.md                 # Este arquivo
```

## Arquitetura e Fluxo de Operação

A feature usa **Function Calling** da OpenAI para gerar dados de gráfico de forma estruturada.

### API do serviço
`ReportService.generateReport(request, onProgress?)` → `GenerateReportResponse`
(`{ response: string; chartData?: any[] }` — note que `chartData` é **opcional**: só vem quando a IA
decide gerar um gráfico). O DTO `GenerateReportDto` aceita `{ query, chatInstanceId, documentIds? }`.

> **Streaming (SSE):** o controller (`/api/reports/generate-chart-data`) expõe a operação via
> Server-Sent Events e repassa o callback `onProgress`, emitindo eventos de progresso
> (`rag_started` → `rag_completed` → `generating`) ao cliente durante o processamento.

### Fluxo

1.  **Validação**: a requisição é validada pelo `GenerateReportDto`.
2.  **Reescrita da consulta**: `_rewriteQueryForSearch()` refina a pergunta do usuário para otimizar a
    busca vetorial (se falhar, usa a consulta original como fallback).
3.  **Busca de Contexto (RAG)**: o `ReportService` usa o `IVectorRepository` (feature `documents`) para
    recuperar os trechos mais relevantes nos documentos selecionados.
4.  **Chamada à IA com Ferramenta**: monta o prompt (contexto + consulta) expondo a ferramenta
    `generate_chart_data`, cujo schema cobre **tipos de gráfico `line` e `bar`** (limitação atual),
    título e a estrutura dos dados.
5.  **Resposta**: se a IA invocou a ferramenta → retorna texto amigável **+** `chartData`; caso
    contrário → apenas a resposta textual.

## Interação com Outras Features

- **Feature `documents`**: A feature `reports` tem uma dependência direta e crucial da feature `documents`. Ela consome:
  - `IVectorRepository`: Para realizar a busca por similaridade semântica (RAG) e encontrar o contexto relevante para a geração dos relatórios.
  - `IEmbeddingService`: Para converter a consulta do usuário em um vetor para a busca.
