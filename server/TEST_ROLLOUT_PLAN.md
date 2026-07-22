# Test Rollout Plan — Backend Gold-Standard Coverage

Step-by-step plan to bring every backend feature up to the gold-standard test set defined in
[`TESTING.md`](./TESTING.md) and [`FEATURE_TEMPLATE.md`](./src/features/FEATURE_TEMPLATE.md) §10.

**Working rule:** each stage ends with a `/code-review` pass on the stage's diff (kill dead code,
`as any`, unused exports, stale docs surfaced while testing), then raise the coverage ratchet in
`jest.config.js`, update the feature README's Tests section, and record the gold verdict in memory.

Reference implementations to copy from:
- **CRUD** (4 levels): `users` — Policy spec · DTO spec · Service integration · HTTP routes.
- **Capability** (3 levels): `chat` — DTO spec · computation spec · HTTP routes.

---

## Status snapshot (start of rollout)

| Feature | Type | Policy | DTO | Service/Comput. | HTTP | Status |
|---|---|:--:|:--:|:--:|:--:|---|
| users | CRUD | ✅ | ✅ | ✅ | ✅ | 🟢 done |
| auth (cross-cutting) | — | — | — | — | ✅✅ | 🟢 done |
| chat | capability | n/a | ✅ | ✅ | ✅ | 🟢 done |
| documents | CRUD | ✅ | ✅ | ✅ | ✅ | 🟢 done (Stage 1) |
| structuredData | CRUD | ✅ | ✅ | ✅ | ✅ | 🟢 done (Stage 2) |
| chatInstances | CRUD | ✅ | ✅ | ✅ | ✅ | 🟢 done (Stage 3) |
| chatMessages | CRUD | ✅ | ✅ | ✅ | ✅ | 🟢 done (Stage 3) |
| dashboardLayout | CRUD | ✅ | ✅ | ✅ | ✅ | 🟢 done (Stage 4) |
| reports | capability | n/a | ✅ | ✅ | ✅ | 🟢 done (Stage 5) |
| analytics | capability | n/a | ✅ | ✅ (engine+5 KPIs) | ✅ | 🟢 done (Stage 5) |
| dynamicTables | CRUD (core) | ✅ | ✅ | ✅ (charact.+10 plugins) | ✅ | 🟢 done (Stage 6) |
| interview | capability | — | — | — | — | ⛔ out of scope (orphaned, not wired) |

Ordering is by **risk** (privacy Tier-0 → ownership → integrity), not alphabetical. `dynamicTables`
is last by request; it is the core and the largest remaining debt.

---

## Stage 1 — `documents` (highest risk: privacy + vector deletion)

Why first: it is the RAG knowledge source; a leak is a privacy incident. It also establishes the
**Qdrant/OpenAI mock pattern** that `structuredData` and `reports` will reuse.

**Files to create**
- `documents/policies/__tests__/DocumentPolicy.spec.ts`
- `documents/dtos/__tests__/DocumentDto.spec.ts`
- `documents/services/__tests__/DocumentService.integration.test.ts` (mock `VectorRepository`/embeddings)
- `src/controllers/__tests__/documents.routes.integration.test.ts`

**Invariants that must each have a failing-if-broken test** (from the README)
- Policy `canView/canUpdate/canDelete` = owner-or-admin.
- `getDocumentById` returns **404 (not 403)** for a non-owned doc — existence is not leaked.
- **Delete removes vectors too:** `deleteDocument` calls `VectorRepository.deletePointsByDocumentId`
  **before** the SQL transaction (assert order + that it's called with the documentId).
- Vector search is hard-scoped to `userId` (another tenant's `documentId` returns nothing).
- DTO: `CreateDocumentSchema` rejects bad `fileType`; `documentPurpose` defaults to `DATA_ANALYSIS`.
- HTTP: 401 no token; 403/404 cross-tenant; 400 malformed cuid / bad body; `{success,data}` envelope.

**Infra:** add `deleteMany` for `Document`/`Chunk`/`StructuredData` to `resetDb` (FK order). Add a
`seedDocument` helper. Mock Qdrant + embeddings (don't hit the network).

**Close:** `/code-review` the diff → raise ratchet → update `documents/README.md` Tests section →
update memory [[documents-review]].

---

## Stage 2 — `structuredData` (satellite of documents)

Why here: depends on document ownership; reuses Stage 1's seed/mocks. Note the **stricter policy**.

**Files to create**
- `structuredData/policies/__tests__/StructuredDataPolicy.spec.ts`
- `structuredData/dtos/__tests__/StructuredDataDto.spec.ts`
- `structuredData/services/__tests__/StructuredDataService.integration.test.ts`
- `src/controllers/__tests__/structuredData.routes.integration.test.ts`

**Invariants**
- **`canAccess` is owner-ONLY, no admin bypass** (more restrictive than other features — lock this:
  an ADMIN who is not the owner must be **denied**). This is the key distinguishing test.
- Access scoped by **document ownership** (policy fetches the `Document`, compares `userId`).
- 1:1 with `Document` (`documentId @unique`); cascade delete removes the structured data.
- `data` normalization: tabular / multi-sheet / arbitrary JSON; multi-sheet exposes `sheets` + first
  sheet as `data`.
- HTTP: only GET/PUT `/:documentId` exist; `:documentId` validated as cuid (400 otherwise); create is
  **not** an HTTP route (fed by the pipeline) — assert there is no POST.

**Close:** `/code-review` → ratchet → README → memory [[structureddata-review]].

---

## Stage 3 — `chatInstances` + `chatMessages` (conversation Tier-0, parent/child)

Why together: cohesive pair (instance is the parent of messages); ownership of the instance governs
access to both. Completes the chat trio alongside the already-done `chat`.

**Files to create**
- `chatInstances/policies/__tests__/ChatInstancePolicy.spec.ts`
- `chatInstances/dtos/__tests__/ChatInstanceDto.spec.ts`
- `chatInstances/services/__tests__/ChatInstanceService.integration.test.ts`
- `src/controllers/__tests__/chatInstances.routes.integration.test.ts`
- `chatMessages/policies/__tests__/ChatMessagePolicy.spec.ts`
- `chatMessages/dtos/__tests__/ChatMessageDto.spec.ts`
- `chatMessages/services/__tests__/ChatMessageService.integration.test.ts`
- `src/controllers/__tests__/chatMessages.routes.integration.test.ts`

**chatInstances invariants**
- USER cannot view/update/delete another user's instance (Tier-0).
- Duplicate (`userId` + `widgetInstanceId`) → **409** (P2002).
- `getOrCreateInstance` is **idempotent** (returns existing for the widgetInstanceId; handles the race).
- Lists return **summaries with no `userId`**; single read returns the full DTO.
- HTTP `limit` capped at 100; `type` filter works.

**chatMessages invariants**
- `createMessage` validates ownership of the `ChatInstance` before persisting (foreign instance →
  403/404).
- REST create **always writes `role: USER`** (role is not accepted from the client).
- `appendAssistantMessage` is server-only (no route); assistant messages not editable by client.
- Pagination is additive: with `page`/`pageSize` → page + meta; without → whole thread; `pageSize` cap 100.

**Close:** `/code-review` → ratchet → both READMEs → memory [[chat-features-review]]. (While here,
decide: expose or delete the unused `getMessageById/updateMessage/deleteMessage` — flag in review.)

---

## Stage 4 — `dashboardLayout` (Tier-0; application-enforced integrity)

**Files to create**
- `dashboardLayout/policies/__tests__/DashboardLayoutPolicy.spec.ts`
- `dashboardLayout/dtos/__tests__/DashboardLayoutDto.spec.ts`
- `dashboardLayout/services/__tests__/DashboardLayoutService.integration.test.ts`
- `src/controllers/__tests__/dashboardLayout.routes.integration.test.ts`

**Invariants**
- Owner-or-admin on every mutation; cross-tenant denied.
- **One active layout per user** — `setActive` flips inside a `$transaction` (after activate, exactly
  one `isActive`). This is the integrity invariant; cover it exhaustively. (Document the SQLite
  TOCTOU caveat as a `skip`/comment for Postgres.)
- **Merge-on-update** — partial PATCH never wipes `type`/`config` (load + override).
- **Fail-soft listing** — a row with malformed `layoutData` JSON is skipped+logged, the rest still
  returned; single-record read still surfaces the error.
- Delete-active reassigns active to the most recently updated remaining layout.

**Close:** `/code-review` → ratchet → README → memory [[dashboardlayout-review]].

---

## Stage 5 — `reports` (finish capability) + `analytics` (finish)

Two capability features; `analytics` already has computation tests, so it only needs DTO + HTTP.

**reports files** (`reports` is capability — 3 levels)
- `reports/dtos/__tests__/GenerateReportDto.spec.ts`
- `reports/services/__tests__/ReportService.spec.ts` (computation; mock OpenAI/vector — like `chat`)
- `src/controllers/__tests__/reports.routes.integration.test.ts`

**reports invariants**
- **SSE safety:** auth (401) and DTO (400) happen **BEFORE** the stream opens — assert these return a
  normal error response, not a half-open stream.
- Stream errors emit a **safe message** (AppError → own message; unexpected → generic); the real error
  is never leaked to the client. (Regression guard for the known SSE error-leak bug.)
- Tier-0: vector search receives the caller's `userId`; another tenant's `documentIds` return nothing.
- `chatInstanceId` is echoed back but **not persisted** (ephemeral).
- DTO: `chatInstanceId`/`documentIds` validated as cuid.

**analytics files** (finish — computation already covered by KpiEngine.spec + 5 KPI processors)
- `analytics/dtos/__tests__/AnalyticsQueryDto.spec.ts`
- `src/controllers/__tests__/analytics.routes.integration.test.ts` (covers `analyticsController` +
  `analyticsDefinitionsController`)

**analytics invariants**
- DTO boundary rejection for `AnalyticsQueryDto` (date ranges, enums, limits).
- HTTP: 401 without token; the `{success,data}` envelope; Tier-0 scoping of KPI queries to the caller.

**Close:** `/code-review` → ratchet → both READMEs → memory [[reports-review]].

---

## Stage 6 — `dynamicTables` (the core — finish; LAST by request) — ✅ DONE

> **✅ (2026-06-30):** completed the gold suite — `DynamicTablePolicy.spec` (exclusive policy traits),
> `DynamicTable.dto.spec` (table-definition boundary), `dynamicTables.routes.integration.test` (HTTP
> contract incl. a **`/lookup` cross-tenant regression guard**), and `rules/__tests__/plugins.integration.test.ts`
> covering **all 10 rule plugins** (one block each, real `$transaction` + hooks). Paired with the audit
> fixes: a **Tier-0 leak in `resolveRelations`** (now filters resolved rows to the authorized table) and
> the delete-constraint scan made **unbounded** (`findRowsReferencingId` `LIMIT 100` removed → correct
> `RESTRICT_IF_AGGREGATE`/`CASCADE`). Suite 500 → 574 green; ratchet raised to 50/36/46/51. Feature is
> **GOLD**. SalesPlugin's deep finalize side-effects deferred to the Sales-preset review (their real
> fixture). Cosmetic debt (`as any` typing + PT comments) catalogued, not in scope here.

Already has a service characterization suite. Finish the remaining levels. Highest integrity stakes:
money/governance plugins (`noOverlap`, `immutableAfter`, `compositeUnique`, `deleteConstraints`).

**Files to create**
- `dynamicTables/policies/__tests__/*Policy.spec.ts`
- `dynamicTables/dtos/__tests__/*Dto.spec.ts`
- `src/controllers/__tests__/dynamicTables.routes.integration.test.ts`
- Extend the service integration suite to cover **each governance plugin** exhaustively (a test that
  fails if the rule breaks). See memory [[dynamictables-review]] (Fase C decomposition).

**Close:** `/code-review` → raise ratchet to its final target → README → memory.

---

## Stage 7 — Close known holes (documented debt)

- Concurrency / TOCTOU tests marked `skip`/`xfail` until the **SQLite → PostgreSQL** migration
  (last-admin guard, one-active-layout, unique-on-create races). Documents `TESTING.md` §9.
- Final ratchet raise; ensure CI runs `npm test` + `tsc --noEmit` + coverage as a merge gate.

---

## The repeatable recipe (every feature)

1. Ensure `resetDb()` deletes the feature's table(s) in FK order.
2. Add/confirm a `seedX` helper (or seed via the feature's own service).
3. Write levels cheap→expensive: Policy spec → DTO spec → Service integration → HTTP routes.
4. **Every README invariant gets a test that fails if the invariant breaks.** Assert typed errors
   (`.rejects.toBeInstanceOf(ForbiddenError)`), never message strings. Assert no secret leakage.
5. Finish: `npm test` green **and** `npx tsc --noEmit` clean **and** raise the ratchet. Update the
   README Tests section and record the gold verdict in memory.
