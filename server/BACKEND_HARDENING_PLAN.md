# Backend Hardening Plan v2 — path to gold standard (infra + libraries)

Consolidated, staged plan to bring the **whole backend** (not just features) to gold standard. Companion
to [`TEST_ROLLOUT_PLAN.md`](./TEST_ROLLOUT_PLAN.md) (per-feature tests) and [`../REVIEW_BACKLOG.md`](../REVIEW_BACKLOG.md)
(deferred debt). Two interleaved concerns, ordered into phases:

- **(A) Infrastructure hardening** — CI, config, errors, request pipeline, ops, data layer.
- **(B) Library review & hardening** — `src/lib/*` is old and mostly unreviewed; each lib gets a gold pass.

## Scope & deliberate exclusions

- **OUT (by decision):** `dynamicTables` and `interview` — built/refined together later as a major
  subsystem, on top of the hardened environment this plan produces. Not touched here.
- **SQLite stays (by decision):** the offline/test DB until close to the first test release. PostgreSQL
  migration is a planned, time-boxed item (final stage), not a blocker now.
- **Orphan API surface** (REVIEW_BACKLOG §2.1) is gated on the frontend audit — parallel track.

## Engineering principle — right-size for a single developer

One-developer project: every item is the **simplest professional solution that fits that scope** — no
over-engineering. Prefer a few lines + a managed/free tool over bespoke infra. Cut/defer anything whose
operational burden outweighs the benefit at this scale (distributed tracing, custom metrics pipelines,
circuit breakers, queues, multi-tier caches). "Optional" sub-items are deferred until a concrete need.
The bar is **"professional and maintainable by one person"**, not "enterprise-grade".

## Working rule (every stage)

Each stage ends with: `npm test` green **+** `npx tsc --noEmit -p tsconfig.test.json` clean **+** new
behavior covered by a test where applicable **+** `/code-review` on the diff **+** CI green. Update this
file's status and the relevant README/memory.

---

## Status snapshot (all findings → stage)

| # | Area | Item | Status |
|---|---|---|:--:|
| 0 | Quality gate | CI (tsc + test + coverage) + ESLint/Prettier + ratchet (43/28/38/44) + CI dummy keys | ✅ |
| 1 | Config | `env.ts` Zod validation + fail-fast + quiet logging + typed `env` | ✅ |
| 2 | Errors | global handler → `handleApiError`; `P2025`→404; drop dead `apiUtils` Next.js code; rm empty dirs | ✅ |
| 3 | Lib hygiene | remove dead `lib/index.ts` barrel; clear 40 lint errors → flip lint to blocking | ✅ |
| 4 | Lib review | `logger` + `monitoring` (observability primitives) | ✅ |
| 5 | Lib review | `vector/` RAG pipeline (qdrant, qdrant-initializer, embedding, chunking, extractors) | ✅ |
| 6 | Lib review | `openai/OpenAIService` (chat/agent client) + external resilience | ✅ |
| 7 | Lib review | `factory` (composition root) | ✅ |
| — | ⏸ PAUSE | **dynamicTables + interview** (separate subsystem — user's call) | — |
| 8 | Pipeline | body/upload limits, CORS allowlist, stratified rate-limit (login) | 🔴 |
| 9 | Ops | readiness probe (`/health/ready`) + request-id logging | 🔴 |
| 10 | Security | `npm audit` blocking + Dependabot + per-feature `security-review` + email normalization | 🔴 |
| 11 | Data | PostgreSQL migration + enable deferred concurrency tests | 🟡 |

### Library status (Phase B targets)

| Lib | Verdict | Stage |
|---|---|:--:|
| `errors.ts` · `jwt.ts` · `prisma.ts` · `authUtils.ts` | ✅ reviewed, clean | — |
| `apiUtils.ts` · `config/env.ts` | ✅ hardened this cycle | 1–2 |
| `logger.ts` · `monitoring.ts` | 🔴 console-based; review | 4 |
| `vector/*` (qdrant, embedding, chunking, extractors) | 🔴 old; review (Qdrant returning to use) | 5 |
| `openai/OpenAIService.ts` | 🔴 old, 359 LOC; review + resilience | 6 |
| `factory.ts` | 🔴 big composition root; review | 7 |

---

# Phase 1 — Foundation (DONE)

> **Stage 0 ✅ (2026-06-26):** `.github/workflows/ci.yml` (npm ci → prisma generate → tsc → `test:coverage`
> blocking; lint + `npm audit` advisory; dummy `OPENAI_API_KEY`/`JWT_SECRET`/`DATABASE_URL` so module-load
> passes in CI). ESLint 9 flat + Prettier + scripts. Ratchet raised to 43/28/38/44. Lint baseline: 716
> problems (40 errors, 676 warnings) — all style/quality, no bugs; lint advisory until cleared (Stage 3).

> **Stage 1 ✅ (2026-06-26):** `env.ts` validates via Zod (`buildEnvSchema`/`validateEnv`, pure & tested —
> `config/__tests__/env.spec.ts`), fail-fasts at boot (DATABASE_URL always; JWT_SECRET in prod). Noisy
> `console.info` → one dev-only `logger.debug`. Typed `env` exported (gradual adoption). Footgun logged:
> `dotenv override:true` runs after jest.setupEnv (REVIEW_BACKLOG §3).

> **Stage 2 ✅ (2026-06-26):** global `app.ts` handler delegates to `handleApiError`; `handleApiError` typed
> with express `Response`, maps `P2025`→404, dropped dead Next.js helpers. Test `lib/__tests__/apiUtils.spec.ts`.
> Removed empty `lib/context` + `lib/hoc`.

---

# Phase 2 — Hygiene & library reviews (refine the environment BEFORE dynamicTables)

> **Stage 3 ✅ (2026-06-26):** removed dead `lib/index.ts` barrel. Lint errors 40 → 0: `eslint --fix`
> cleared 11; fixed 8 by hand (no-empty ×2 with comments, no-useless-escape ×3, no-case-declarations ×1,
> ban-ts-comment ×2 → removed the now-unnecessary `@ts-ignore` on pdf-parse/mammoth, which actually
> resolve types fine); downgraded 2 nuanced rules to `warn` (`preserve-caught-error` — needs AppError to
> thread `{ cause }`, deferred to the lib error reviews; `no-useless-assignment` — low value). CI lint
> flipped to **blocking** (0 errors enforced; 341 warnings allowed, mostly intentional `any`).
> `dynamicTables` + `interview` temporarily excluded from the lint gate (deferred work) — re-include when
> reviewed. Suite green (237 unit / 246 integration); `tsc` clean.

## Stage 3 — lib/ hygiene & lint debt (quick wins)

- **Remove the dead `lib/index.ts` barrel** — imported nowhere (`from '@/lib'` = 0 hits); re-exports
  `factory`, so any future barrel import would eager-load the whole feature tree.
- **Clear the 40 lint errors** (`preserve-caught-error`, `no-case-declarations`, `prefer-const`,
  `no-empty`, `no-useless-escape`, `ban-ts-comment` — mostly `--fix`-able), then flip the CI lint step's
  `continue-on-error` to `false` so lint becomes a real gate.

**Verify:** `npm run lint` clean → flip the gate; suite green. **Close:** code-review.

## Per-lib review — the gold bar (applies to Stages 4–7)

For each lib: (1) typed public API, no `any` at the boundary; (2) no import-time side effects / external
connections (init deferred to bootstrap); (3) typed errors (`AppError` family), `logger` not `console`;
(4) external calls bounded (timeout + 1–2 retries — no circuit breakers); (5) dead code removed; (6) a
focused unit test for the pure logic; (7) README/doc note if behavior is non-obvious.

> **Stage 4 ✅ (2026-06-26):** **logger** — fixed Error serialization (a bare `Error` in context logged as
> `{}`, losing message/stack; a replacer now emits name/message/stack + custom AppError fields).
> **monitoring** — typed `MetricOptions` (dropped `any`); kept the thin log-based timer (no metrics
> backend). Both unit-tested (`lib/__tests__/logger.spec.ts`, `monitoring.spec.ts`, 5 cases). logger kept
> console-based (pino swap deferred — not needed at this scale). Suite green (unit 237→242).

## Stage 4 — review `logger` + `monitoring`

Files: `lib/logger.ts`, `lib/monitoring.ts`. Both are console-based and used widely.

- **logger:** decide keep-vs-upgrade. Right-sized call: keep the tiny JSON logger but ensure levels are
  honored in production (today `debug` is dev-only — fine) and `console.*` elsewhere is migrated to it.
  A full `pino` swap is optional (defer unless logging volume needs it).
- **monitoring:** the `Metrics` timer logs durations (used by VectorRepository, DocumentProcessingService).
  Keep as a thin timing helper; do **not** build a metrics backend. Add a type for the options (drop `any`).

**Verify:** unit test the timer wraps + logs once. **Close:** code-review.

> **Stage 5 ✅ (2026-06-26):** **embedding.ts** — `embedText` made lazy (import-safe; key only needed on
> first call); class `OpenAIService` → `EmbeddingService` (factory updated); resilience via the OpenAI
> SDK's built-in `timeout` (30s) + `maxRetries` (2) — no custom code. **qdrant.ts** — added client
> `timeout`. **chunking.ts** — 7 unit tests for the word/sentence/paragraph math + overlap clamp; fixed a
> stale `ada-002` comment. **extractors** — confirmed (the unnecessary `@ts-ignore` was already removed in
> Stage 3). Suite green (unit 242→249). No production bugs found.

## Stage 5 — review `vector/` RAG pipeline (Qdrant returning to use)

Files: `lib/vector/qdrant.ts`, `qdrant-initializer.ts`, `embedding.ts`, `chunking.ts`, `extractors/*`.
This is the cohesive document→vector ingestion pipeline (extract → chunk → embed → store).

- **qdrant.ts / qdrant-initializer.ts:** confirm import-safety (already deferred init via
  `runQdrantInitialization` — good); replace `process.env.QDRANT_URL!` non-null asserts with the validated
  `env`; add timeout to client ops; confirm idempotent collection/index creation.
- **embedding.ts:** the eager default instance at import requires `OPENAI_API_KEY` — make `embedText`
  lazy (defer the key check to first call) to restore import-safety; **(cosmetic)** rename the class
  `OpenAIService` → `EmbeddingService` (it implements `IEmbeddingService`); add timeout/retry on the
  embeddings call.
- **chunking.ts:** pure text-splitting — add/confirm unit tests for the chunk/overlap math (cheap, high
  value); no external deps.
- **extractors/ (pdf/word/excel→text):** correctly placed (verified). Replace the `@ts-ignore` on
  `pdf-parse`/`mammoth` with proper typing or a typed shim; confirm error handling on malformed files.

**Verify:** unit tests for chunking + embedding wrapper; suite green. **Close:** code-review.

> **Stage 6 ✅ (2026-06-26):** resilience via SDK `timeout` (60s) + `maxRetries` (2); migrated 8
> `console.*` → `logger` (incl. the noisy RequestLock → `logger.debug`); typed the lock's `Map` (`any` →
> `unknown`); extracted `tryFixMalformedJson` as a pure exported function with 5 unit tests. **Bug found &
> fixed:** the smart-quote repair regex contained straight quotes (U+0022) — a no-op; smart-quote repair
> never worked. Now uses U+201C/U+201D. Suite green (unit 249→254). Third latent bug caught by writing a
> test for previously-untested pure logic.

## Stage 6 — review `openai/OpenAIService` (chat/agent client) + resilience

File: `lib/openai/OpenAIService.ts` (359 LOC) — the general OpenAI client used by chat (system-manipulating
agent tools), reports, and structured extraction. Old and the largest lib.

- **Resilience (folds in the old "Stage 5"):** wrap completions/tools calls with a **timeout + 1–2
  retries + graceful typed error** — no circuit breakers/backoff libs.
- **Hygiene:** migrate the `console.log`/`console.error` (RequestLock, constructor) to `logger`; type the
  tool/response shapes (reduce `any`); confirm the `RequestLock` dedup is still needed and correct.
- **Config:** read the key/model config from the validated `env`, not raw `process.env`.

**Verify:** unit test the retry/timeout wrapper (timeout → typed error; retry then success). **Close:** code-review.

> **Stage 7 ✅ (2026-06-26):** confirmed the constructor does no network work (lazy singleton; Prisma/Qdrant
> clients are lazy/import-safe). Verdict: factory is good as-is. **(Reverted)** an initial pass removed 7
> unused getters + the type re-export block, but that contradicted the "don't delete orphan surface
> unilaterally" rule ([[feedback-crud-surface]]) and the imminent dynamicTables/interview work may need
> them — **restored.** Unused composition-root getters are flagged in REVIEW_BACKLOG, not deleted.
> Suite green (254/246). **Phase 2 complete — next is the dynamicTables + interview pause.**

## Stage 7 — review `factory` (composition root)

File: `lib/factory.ts` (247 LOC). Single DI composition root — good pattern; review for correctness/clarity.

- Confirm no heavy/network work in the constructor (it's lazy-singleton via `getInstance` — eager builds
  all services on first `getFactory()`; verify that's acceptable now that env is validated).
- Trim any unused getters/exports; ensure interface-typed fields throughout (a few concrete types leak).

**Verify:** suite green (factory is exercised by every HTTP test). **Close:** code-review.

---

# ⏸ PAUSE — build `dynamicTables` + `interview`

Per the user's plan: with the environment refined (Phases 1–2), pause infra work and build/refine the
`dynamicTables` + `interview` subsystem together. Their per-feature tests are Stage 6 of
`TEST_ROLLOUT_PLAN.md`. Resume Phase 3 afterwards.

---

# Phase 3 — Request pipeline & ops (as production approaches)

## Stage 8 — request-pipeline hardening (`app.ts`, documents upload)

- **Body/upload limits:** explicit `json({ limit })` / `urlencoded({ limit })`; `multer` `limits.fileSize`
  on the documents upload (today `memoryStorage` is unbounded → DoS).
- **CORS allowlist:** allowed origins from `env`; reject others in production (permissive in dev).
- **Stratified rate limiting:** keep the relaxed global `/api/` limiter; add a strict limiter on
  `/api/auth/login` (+ register) to blunt brute-force.

**Verify (supertest):** oversized upload → 413; over-limit login → 429; disallowed origin blocked.

## Stage 9 — observability & ops (right-sized)

- **Readiness probe:** `/health/ready` pings DB (and Qdrant if configured) → 503 when down; keep
  `/health` as shallow liveness. (~20 lines.)
- **Request-id logging:** one small middleware assigning a request id + logging method/path/status/latency.
  No distributed tracing.
- **DEFERRED (only if wanted):** free-tier error tracker (Sentry, ~3-line init). Skip custom metrics.

---

# Phase 4 — Pre-launch

## Stage 10 — security pass

- Flip the CI `npm audit` step to **fail on high/critical**; enable **Dependabot** (free, zero-maintenance).
- Per-feature **`security-review`** (skill) across the gold features; fold findings into REVIEW_BACKLOG.
- Decide **email normalization** (case-insensitive uniqueness) — REVIEW_BACKLOG §2 users.

## Stage 11 — PostgreSQL migration (execute near launch)

- Partial unique index for dashboardLayout (`userId` where `isActive`); confirm no orphaned Qdrant vectors;
  validate `P2025`/concurrency under real DB.
- Enable the deferred concurrency tests (last-admin TOCTOU, one-active-layout) shipped `skip`ped until
  Postgres (TESTING.md §9).

---

## Recommended order

Phase 1 ✅ → **Phase 2 (Stages 3–7: hygiene + lib reviews)** → ⏸ **dynamicTables + interview** → Phase 3
(8–9) → Phase 4 (10–11). Phases 1–2 are the "refine the environment first" goal; everything in them is
low-risk and high-leverage before the big subsystem work.
