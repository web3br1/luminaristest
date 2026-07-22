# Backend Hardening — Progress Report

Living execution log for the backend gold-standard work. This is the **what has been done and learned**
companion to the planning docs:

- [`../BACKEND_HARDENING_PLAN.md`](../BACKEND_HARDENING_PLAN.md) — the staged plan (what to do).
- [`../TEST_ROLLOUT_PLAN.md`](../TEST_ROLLOUT_PLAN.md) — per-feature test rollout.
- [`../../REVIEW_BACKLOG.md`](../../REVIEW_BACKLOG.md) — deferred debt.

> **Guiding principle:** single-developer project — every change is the *simplest professional solution
> that fits the scope*. No over-engineering. Bar = "professional and maintainable by one person".

Last updated: **2026-06-26**.

---

## Status at a glance

| Phase | Stage | Scope | Status |
|---|---|---|:--:|
| 1 — Foundation | 0 | CI + ESLint/Prettier + coverage ratchet | ✅ |
| 1 | 1 | `env.ts` schema validation + fail-fast | ✅ |
| 1 | 2 | Error-handling unification (`handleApiError`, P2025→404, dead code) | ✅ |
| 2 — Hygiene & lib reviews | 3 | lib hygiene + lint debt → lint blocking | ✅ |
| 2 | 4 | review `logger` + `monitoring` | ✅ |
| 2 | 5 | review `vector/` RAG pipeline | ✅ |
| 2 | 6 | review `openai/OpenAIService` + resilience | ✅ |
| 2 | 7 | review `factory` | ✅ |
| ⏸ | — | **PAUSE: dynamicTables + interview** | ⬜ next |
| 3 — Pipeline & ops | 8 | upload/body limits, CORS, rate-limit | ⬜ |
| 3 | 9 | readiness probe + request-id logging | ⬜ |
| 4 — Pre-launch | 10 | security pass (audit, Dependabot, security-review) | ⬜ |
| 4 | 11 | PostgreSQL migration | ⬜ |

**Tests:** 574 total, all green (was 500 — +74 from the `dynamicTables` Stage 6 gold suite: policy/DTO
units, HTTP routes incl. a `/lookup` cross-tenant regression guard, and exhaustive coverage of all 10
rule plugins). **Coverage:** ≥ ratchet floor (raised 43/28/38/44 → **50/36/46/51**). **Type-check &
lint:** clean (lint blocking, 0 errors).

---

## Completed work log

### Stage 0 — Quality gate foundation ✅
- **CI** ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)): on PR/push runs `npm ci` →
  `prisma generate` → `tsc --noEmit` → `npm run test:coverage` (blocking) → lint (blocking) → `npm audit`
  (advisory). Dummy `OPENAI_API_KEY`/`JWT_SECRET`/`DATABASE_URL` so module-load succeeds (tests mock
  OpenAI/Qdrant).
- **ESLint 9 (flat) + Prettier** (`eslint.config.mjs`, `.prettierrc.json`) + `lint`/`format` scripts.
- **Coverage ratchet** raised 35/22/25/35 → **43/28/38/44** (`jest.config.js`) to lock the test-rollout gain.

### Stage 1 — Config & boot safety ✅
- `env.ts` now validates via a **Zod schema** with **fail-fast at boot** (`buildEnvSchema`/`validateEnv`,
  pure & unit-tested): `DATABASE_URL` required always; `JWT_SECRET` required in production.
- Replaced the noisy per-import `console.info` diagnostics with one dev-only `logger.debug`.
- Exported a typed `env` for gradual adoption.

### Stage 2 — Error-handling unification ✅
- Global Express error handler now delegates to `handleApiError` (was a generic `console.error` + 500).
- `handleApiError` typed with express `Response`; **maps Prisma `P2025` → 404** (was 500 on update/delete
  races where not caught locally).
- Removed dead Next.js-era helpers (`createApiHandler`, `sendXError`, `NextApiRequest=any`).
- Removed empty leftover dirs `lib/context`, `lib/hoc`.

### Stage 3 — lib hygiene & lint debt ✅
- Removed the dead `lib/index.ts` barrel (imported nowhere; re-exported `factory`).
- Lint errors **40 → 0**: `--fix` cleared 11; 8 fixed by hand (empty catches commented, useless regex
  escapes removed, a `switch` default wrapped, and the unnecessary `@ts-ignore` on `pdf-parse`/`mammoth`
  deleted — their types resolve fine). Downgraded 2 nuanced rules to `warn` (`preserve-caught-error`,
  `no-useless-assignment`). **Lint flipped to blocking.**
- `dynamicTables` + `interview` temporarily excluded from the lint gate (deferred work; re-include when reviewed).

### Stage 4 — review `logger` + `monitoring` ✅
- **logger:** fixed Error serialization — a bare `Error` in context used to log as `{}` (losing
  message/stack). A replacer now serializes `name/message/stack` + custom `AppError` fields. Error logs
  are now actually useful. Unit-tested.
- **monitoring:** typed `MetricOptions` (dropped `any`); kept the thin log-based timer (no metrics
  backend — out of scope). Unit-tested.

### Stage 5 — review `vector/` RAG pipeline ✅
- **embedding.ts:** `embedText` made **lazy** (importing the module no longer needs a key — key resolved on
  first call); class `OpenAIService` renamed to `EmbeddingService` (the misleading name forced aliases);
  **resilience** via the OpenAI SDK's built-in `timeout` (30s) + `maxRetries` (2) — no custom retry code.
- **qdrant.ts:** added a client `timeout` so a hung Qdrant fails cleanly.
- **chunking.ts:** 7 unit tests for the word/sentence/paragraph splitting + overlap clamp; fixed a stale
  `text-embedding-ada-002` comment.
- **extractors:** confirmed correctly placed (RAG-ingestion pipeline); the unnecessary `@ts-ignore` was
  already removed in Stage 3.

### Stage 6 — review `openai/OpenAIService` (chat/agent client) ✅
- **Resilience:** OpenAI client now uses the SDK's `timeout` (60s) + `maxRetries` (2) — no custom code.
- **Logging:** migrated 8 `console.*` calls to `logger` (including the chatty `RequestLock`).
- **Types:** the request-coalescing lock's `Map<string, Promise<any>>` → `Promise<unknown>`.
- **Testability:** extracted `tryFixMalformedJson` (LLM JSON repair) as a pure exported function + 5 tests.
- **Bug fixed:** the smart-quote repair regex contained straight quotes (a no-op) — smart-quote repair
  never actually worked. Now fixed.

### Stage 7 — review `factory` (composition root) ✅
- Confirmed the constructor does no network work (lazy singleton; Prisma/Qdrant clients are import-safe).
  Verdict: the factory is good as-is.
- An initial cleanup removed 7 unused getters + the type re-export block, but that was **reverted** — it
  contradicted the "don't delete orphan surface unilaterally" rule and the upcoming dynamicTables/interview
  work may need them. The unused composition-root getters are flagged in REVIEW_BACKLOG, not deleted.

**→ Phase 2 (hygiene + library reviews) complete. Next: pause infra for the dynamicTables + interview
subsystem, then Phase 3.**

---

## Findings & decisions (the "why")

### Bugs / real issues found and fixed
- **Search payload mapping** (during test rollout): `DocumentService.searchDocuments` read `payload.text`
  instead of `payload.textContent` → every search hit returned `chunkText: undefined`. Fixed + guarded.
- **Prisma `P2025` → 500:** update/delete races returned 500 instead of 404 where not caught locally.
  Centralized to 404 in `handleApiError`.
- **CI module-load needs OpenAI key:** `lib/vector/embedding.ts` builds its default instance at import and
  the embedding class throws on an empty key; `factory` constructs it with `OPENAI_API_KEY`. CI would fail
  without it → fixed with dummy keys in the workflow.
- **Logger swallowed errors:** Error objects in log context serialized to `{}`. Fixed (Stage 4).
- **Smart-quote JSON repair was a no-op:** `OpenAIService`'s malformed-JSON repair regex contained
  straight quotes instead of smart quotes (U+201C/U+201D), so LLM responses using smart quotes were never
  repaired. Fixed (Stage 6). (Third latent bug caught by testing previously-untested pure logic.)

### Re-analysis corrections (two earlier flags were WRONG)
- **`vector/extractors/` is correctly placed** — extractors (pdf/word/excel → text) → chunking → embedding
  → qdrant is one coherent RAG-ingestion pipeline. Not a misplacement; will not move.
- **The two `OpenAIService` classes are genuinely different** (chat completions/tools vs embeddings) —
  not redundant; will not merge. Only the shared class name is a minor cosmetic nit.

### Standing decisions
- **dynamicTables + interview deferred** — built/refined together later as a subsystem, on top of this
  hardened environment. Not touched during Phases 1–2.
- **SQLite kept** until close to the first test release (offline DB + tests). PostgreSQL migration is the
  final stage, not a current blocker.
- **Orphan API surface** (unrouted service methods) deferred to the frontend audit (REVIEW_BACKLOG §2.1).
- **Right-sizing:** observability = readiness probe + request id (no custom metrics/tracing); resilience =
  timeout + 1–2 retries (no circuit breakers); deps = Dependabot (no manual cadence).

---

## What's next

- **Stage 5 — `vector/` RAG pipeline review** (Qdrant returning to use): make `embedText` import-safe
  (lazy), use the validated `env`, add timeouts, type the extractors, test the chunking math.
- **Stage 6 — `openai/OpenAIService`**: timeout + retries, `console` → `logger`, typed tool/response shapes.
- **Stage 7 — `factory`** review.
- Then ⏸ pause for **dynamicTables + interview**, then Phases 3–4.
