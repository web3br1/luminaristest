# Feature: Reports

## Overview

The `reports` feature is a **capability feature**. Its main responsibility is to orchestrate the
generation of reports and data visualizations, such as charts, from document analysis and user
interaction.

Unlike entity features such as `users` or `documents`, `reports` has no table of its own in the
database. Instead, it consumes the services and repositories of other features to do its job.

## File structure

```
reports/
├── dtos/
│   └── GenerateReportDto.ts  # DTO and validation schema for the API
├── services/
│   ├── IReportService.ts     # service interface
│   └── ReportService.ts      # business-logic implementation
└── README.md                 # this file
```

## Architecture and operation flow

The feature uses OpenAI **Function Calling** to generate chart data in a structured way.

### Service API
`ReportService.generateReport(request, onProgress?)` → `GenerateReportResponse`
(`{ response: string; chartData?: ChartDataRow[] }` — `chartData` is **optional**: it only appears when
the AI decides to generate a chart; `ChartDataRow = Record<string, string | number>`). The
`GenerateReportDto` accepts `{ query, chatInstanceId, documentIds? }` — `chatInstanceId` and
`documentIds` are validated as **cuid**.

- **`chatInstanceId`** is a **client correlation id** (the chat tab the SSE result belongs to). It is
  **echoed back**, but the report/chart is **not persisted** as a message — the analysis is
  **ephemeral** (rendered on the frontend). (Persisting it would be a feature, out of scope.)

> **Streaming (SSE):** the controller (`/api/reports/generate-chart-data`) exposes the operation via
> Server-Sent Events. **Authentication (401) and body validation (400) happen BEFORE** opening the
> stream — only then is the SSE started and the `onProgress` callback emits progress events
> (`rag_started` → `rag_completed` → `generating`). Errors during the stream emit an `error` event with
> a **safe message** (`AppError` → its own message; unexpected → generic; the real error is logged,
> never leaked to the client).

### Flow

1.  **Validation**: the request is validated by `GenerateReportDto`.
2.  **Query rewrite**: `_rewriteQueryForSearch()` refines the user's question to optimize the vector
    search (if it fails, it falls back to the original query).
3.  **Context retrieval (RAG)**: `ReportService` uses `IVectorRepository` (feature `documents`) to
    retrieve the most relevant chunks in the selected documents.
4.  **AI call with a tool**: builds the prompt (context + query) exposing the `generate_chart_data`
    tool, whose schema covers **chart types `line` and `bar`** (current limitation), the title and the
    data structure.
5.  **Response**: if the AI invoked the tool → returns a friendly text **+** `chartData`; otherwise →
    only the textual response.

## Authorization and isolation (Tier-0)

`reports` has no entity of its own, but data access is **tenant-scoped**: the controller injects
`userId` from the `UserContext` (`{ ...validation.data, userId: ctx.userId }`) and `ReportService`
passes that `userId` to the vector search — `vectorRepository.search(emb, userId, 15, documentIds)`.
So another user's `documentIds` **return nothing** (the `userId` filter in Qdrant excludes them). There
is no path that reads another tenant's documents.

## Interaction with other features

- **Feature `documents`**: `reports` has a direct, crucial dependency on the `documents` feature. It
  consumes:
  - `IVectorRepository`: to perform the semantic-similarity search (RAG) and find the relevant context
    for report generation.
  - `IEmbeddingService`: to convert the user's query into a vector for the search.

## Tests

Capability-feature gold set (3 levels — no Policy/Repository; see [`TESTING.md`](../../../TESTING.md)):

- **DTO unit** — `dtos/__tests__/GenerateReportDto.spec.ts`: non-empty query, chatInstanceId as cuid,
  documentIds optional array of cuids.
- **Computation unit** — `services/__tests__/ReportService.spec.ts` (OpenAI + vector faked): Tier-0
  RAG search hard-scoped to the caller's `userId`, the tool-call → `chartData` path, the plain-text
  path, the no-documents path (RAG skipped), and the query-rewrite fallback resilience.
- **HTTP contract** — `controllers/__tests__/reports.routes.integration.test.ts`: the **SSE-safety
  boundary** — auth (401) and DTO validation (400) return a normal JSON response **before** the stream
  opens (regression guard against errors leaking into the stream).
