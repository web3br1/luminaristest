# Feature: Structured Data

> **DEPRECATED (R26 — Onda 3)**
> The structuredData sub-feature (Excel → structured JSON display) has been retired on the frontend.
> The backend implementation (service, repository, controller, route) is preserved here but the
> frontend was never connected — zero UI components, zero imports were ever built.
> The display library intended for this feature (Handsontable, commercial license) and the
> frontend parsing dependency (exceljs) have been removed from `my-app/package.json`.
>
> **Future decision required:** either build the frontend UI (SpreadsheetWidget) and reconnect,
> or remove the backend pipeline entirely. Do not add new consumers until that decision is made.

Stores the **tables extracted from user-uploaded documents** (Excel spreadsheets or tabular PDFs/text)
in a **1-to-1 relation with `Document`**, intended for display and editing in a `SpreadsheetWidget` on
the frontend (never built — see deprecation note above). **It has no relation to `dynamicTables`** —
it is a satellite of the `documents` feature, part of the upload/RAG world, not the ERP
dynamic-tables engine.

## Model

- **`StructuredData`** (Prisma): `id`, `documentId` (`@unique`, 1:1 with `Document`, `onDelete: Cascade`),
  `headers` (JSON), `data` (JSON), `createdAt`, `updatedAt`.
- **`IStructuredData`** (domain): `headers: Header[]` + `data: StructuredDataValue`, where `data` can be
  simple tabular (`(string|number|null)[][]`), multi-sheet (`SheetData[]`) or an arbitrary JSON object.
- **`toStructuredData`** (in `models/`) normalizes the raw Prisma JSON to the domain (defensive string
  parsing, tabular vs. multi-sheet detection). Header converters (`apiHeaderToHeader`,
  `excelHeaderToHeader`, `convertSheetToTableData`, `headerToColumnFormat`) also live in `models/`.

## Layering & authorization

`Controller → Service → Repository`, with `IStructuredDataPolicy` injected into the service;
dependencies wired in `factory.ts`. Only the repository touches Prisma.

- **Tier-0:** access is scoped by **document ownership**. The policy `canAccess(ctx, documentId)`
  fetches the `Document` and requires `document.userId === ctx.userId`.
- **Policy variant (strict by design):** `canAccess` is **owner-only, with no admin bypass** —
  structured data is the tenant's private document content. More restrictive than the owner-or-admin
  default of other features; intentional.
- Every service call receives `UserContext` (not `IUser`) and delegates authorization to the policy.

## API

| Method | Path                              | Action                                              |
|--------|-----------------------------------|-----------------------------------------------------|
| GET    | `/api/structured-data/:documentId` | Retrieves the structured data (normalizes multi-sheet) |
| PUT    | `/api/structured-data/:documentId` | Updates a document's structured data                |

`:documentId` is validated as `cuid`. The initial write does **not** go through HTTP — it comes from the
pipeline (see below).

## Invariants

- 1:1 with `Document` (`documentId @unique`); deleting the document removes the data via cascade.
- Every read/write authorized via `canAccess` (owner-only).
- `data` accepts three formats (tabular, multi-sheet, arbitrary JSON); `getByDocumentId` exposes the full
  structure in `sheets` and the first sheet as the main `data` when multi-sheet.
- Typed errors (`ForbiddenError`, `NotFoundError`, `ServiceError`); `logger`, never `console`; no `as any`.

## Tests

Gold-standard 4-level suite (see [`TESTING.md`](../../../TESTING.md)):

- **Policy unit** — `policies/__tests__/StructuredDataPolicy.spec.ts`: `canAccess` owner-only, with the
  **no-admin-bypass** case explicitly locked (an ADMIN who is not the owner is denied).
- **DTO unit** — `dtos/__tests__/StructuredDataDto.spec.ts`: header name regex + type enum, documentId
  as cuid, and the three accepted `data` formats (tabular / multi-sheet / arbitrary object).
- **Service integration** — `services/__tests__/StructuredDataService.integration.test.ts` (real SQLite,
  ownership via the real `DocumentRepository`, OpenAI faked): owner-only Tier-0 for read/update, the
  Forbidden/NotFound/Unauthorized contract, and multi-sheet normalization (`sheets` + first sheet as `data`).
- **HTTP contract** — `controllers/__tests__/structuredData.routes.integration.test.ts`: 401/400/403/404
  on GET/PUT `/:documentId`; the no-admin-bypass 403; the `{ success, data }` envelope.

> Creation (`createFromStructured`/`createFromText`) has no HTTP route — it is fed by the document
> pipeline — so it is covered by the documents flow, not here.

## Variant (justified)

A **pipeline + entity** feature. Creation has no HTTP route: it is fed by the
`DocumentProcessingPipeline` during document processing. Read and update are CRUD via HTTP.

## Interaction with other features

- **Consumes `documents`:** the policy uses `IDocumentRepository` to check document ownership.
- **Consumed by `documents`:** the `DocumentProcessingPipeline` calls `createFromStructured` (Excel,
  direct extraction) or `createFromText` (PDF/text, extraction via `OpenAIService`) after classifying
  the document as tabular.

## File structure

```
/features/structuredData
├── dtos/         StructuredDataDto.ts   # Zod schemas + inferred types (Create/Update/Header)
├── models/       StructuredData.model.ts # IStructuredData, toStructuredData, header converters
├── policies/     StructuredDataPolicy.ts (+ I…) # canAccess owner-only
├── repositories/ StructuredDataRepository.ts (+ I…) # the only point that touches Prisma
├── services/     StructuredDataService.ts # orchestration + multi-sheet normalization
└── README.md
```
