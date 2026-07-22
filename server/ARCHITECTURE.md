# Backend Architecture — Luminaris Server

An **Express + TypeScript** server with a **feature-based** architecture and **clean layers**
(Controller → Service → Repository), authorization via **policies**, and dependency injection through a
**singleton factory**. This document is the entry point for understanding how the backend is assembled
and how to add/change a feature without breaking the patterns.

> For the quick-start (run/build) see [`README.md`](./README.md). Each complex feature has its own
> documentation (e.g. [`src/features/dynamicTables/`](./src/features/dynamicTables/README.md)).

---

## 1. Principles

- **Feature-based:** each domain lives in `src/features/<feature>/` with its own layers. There is no
  global `services/` folder — logic is local to the feature.
- **Single-responsibility layers:** controllers only deal with HTTP; services hold business rules;
  repositories only access data (Prisma); policies only decide authorization.
- **Interfaces + implementation:** repositories and policies expose an interface (`I*`) + impl, for
  testability and swapping.
- **Type-safe at the boundary:** every input is validated by Zod DTOs before reaching the service.
- **Typed errors:** the domain throws `AppError` (and subclasses); a central translator converts to HTTP.
- **Right-sized for one developer:** this is a single-dev project; every change is the simplest
  professional solution that fits that scope — no over-engineering (see §11).

---

## 2. Directory structure

```
server/
├── ARCHITECTURE.md            # this document
├── README.md                  # quick-start + feature index
├── prisma/                    # schema.prisma, migrations, dev.db
└── src/
    ├── app.ts                 # createApp(): builds the Express app (no listen) — used by tests too
    ├── server.ts              # bootstrap: imports app, listen(), external-infra init
    ├── config/                # env loading (config/env.ts)
    ├── database/              # PrismaClient singleton (database/prisma.ts)
    ├── controllers/           # HTTP adapters per feature (auth, users, dashboard, ...)
    ├── routes/                # routing (index.ts aggregates the per-feature sub-routers)
    ├── middleware/            # auth.ts (JWT verification + protected paths + context injection)
    ├── lib/                   # cross-cutting: factory, errors, logger, jwt, apiUtils, prisma, ...
    │   └── README.md          # detail of lib/ contents
    ├── features/              # the core: one directory per domain (see §8)
    ├── scripts/               # utility/maintenance scripts
    └── types/                 # global/shared types
```

---

## 3. Request lifecycle

```
HTTP request
  │
  ▼
[ global middlewares ]  (src/app.ts, in this order)
  helmet → cors → compression → json → urlencoded → rateLimit(5000/15min) → authMiddleware
  │   authMiddleware (src/middleware/auth.ts) — AUTHENTICATION (fail-closed):
  │     - every /api route requires a Bearer JWT, except a small public allowlist
  │       (POST /api/users signup, /api/auth/login|register, /api/docs)
  │     - injects headers x-user-id / x-user-role / x-user-email / x-user-name
  │     - does NO authorization: who-can-do-what is decided in each feature's policy
  ▼
[ router ]  (src/routes/index.ts → src/routes/<feature>.ts)
  ▼
[ controller ]  (src/controllers/<feature>Controller.ts)
  - getUserContextFromRequest(req)  → reads the injected headers
  - validates the body with the feature's Zod DTO
  - service = getFactory().getXService()
  - try { ... } catch (err) { handleApiError(err, res) }
  ▼
[ service ]  (src/features/<feature>/services)
  - business rules; consults the policy; throws AppError when applicable
  ▼
[ repository ]  +  [ policy ]
  - repository → Prisma (data)        - policy → authorization decision
  ▼
PrismaClient singleton (src/database/prisma.ts)
```

Health check: `GET /health` → `{ status, timestamp, uptime }`. Unhandled errors fall through to the
**global error handler** at the end of `app.ts`.

---

## 4. Anatomy of a feature (example: `users`)

Each feature follows the same skeleton:

```
features/users/
├── controllers? (live in src/controllers/userController.ts — HTTP adapter)
├── services/        UserService.ts            # business rules
├── repositories/    IUserRepository.ts        # data contract
│                    UserRepository.ts         # Prisma impl
├── policies/        IUserPolicy.ts            # authorization contract
│                    UserPolicy.ts             # impl
├── dtos/            UserDto.ts                # Zod schemas + type guards (is<Dto>)
└── models/          User.model.ts             # domain interfaces (IUser, Role, ...)
```

Per-layer contract:

| Layer | Does | Does not |
|---|---|---|
| **Controller** (`src/controllers/`) | parse/validate HTTP, resolve the service via the factory, translate errors | business rules, data access |
| **Service** (`features/*/services`) | orchestrate rules, consult the policy, throw `AppError` | touch `req/res`, SQL/Prisma |
| **Repository** (`features/*/repositories`) | CRUD via Prisma; hides sensitive columns (e.g. password) | business rules, authorization |
| **Policy** (`features/*/policies`) | decide *who can do what* (boolean) | access data, throw HTTP |
| **DTO** (`features/*/dtos`) | validate input (Zod) + `is<Dto>()` guards | logic |
| **Model** (`features/*/models`) | domain interfaces | behavior |

Example flow (create user): `userController.createUser` → validates `CreateUserSchema` →
`getFactory().getUserService().createUser(dto, actor)` → `UserService` calls
`userPolicy.canCreate(actor)`, runs `bcrypt.hash`, calls `userRepository.createUser`, returns
`SafeUserProfile` (no password).

---

## 5. Dependency injection — `ApplicationFactory`

`src/lib/factory.ts` is a **singleton** that builds the dependency graph once, in the order
repositories → policies → services (resolving inter-service dependencies):

```typescript
// typical use in a controller
import { getFactory } from '@/lib/factory';
const service = getFactory().getUserService();
```

- Each `getXService()` returns the already-wired instance (repository + policy injected).
- Adding a feature = registering its repository, policy and service in the `ApplicationFactory`
  constructor and exposing a getter.

---

## 6. Cross-cutting conventions (`src/lib/`)

> `src/lib/` has its own [README](./src/lib/README.md) detailing each utility.

- **Errors** (`lib/errors.ts`): `AppError` (base, with `statusCode` + `errorCode`) and subclasses
  `NotFoundError` (404), `ForbiddenError` (403), `UnauthorizedError` (401), `ValidationError` (400),
  `ServiceError` (500). The domain **throws** these classes; it never returns HTTP directly.
- **HTTP translation** (`lib/apiUtils.ts`): `handleApiError(err, res)` maps `AppError`/`ZodError` to the
  status and a `{ code, message }` body. Controllers call this in the `catch`.
- **Logging** (`lib/logger.ts`): `logger.info/warn/error/debug(message, context)` — JSON output.
- **Auth** (`lib/jwt.ts` + `lib/authUtils.ts`): `generateToken`/`verifyToken`/`getAuthToken` and
  `getUserContextFromRequest(req)` (reads the `x-user-*` headers injected by the middleware).
- **Validation:** Zod DTOs per feature + `is<Dto>(obj)` guards.
- **Config** (`config/env.ts`): loads `.env` (with a robust fallback). Keys: `NODE_ENV`,
  `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `REDIS_URL`.
- **Prisma** (`database/prisma.ts`): `PrismaClient` singleton with a global cache in dev.

---

## 7. Plugging in a new feature

1. Create `src/features/<feature>/` with `services/`, `repositories/` (+ interface), `policies/`
   (+ interface), `dtos/`, `models/`.
2. Create the controller in `src/controllers/<feature>Controller.ts` (use `getFactory()`,
   `getUserContextFromRequest`, `handleApiError`).
3. Create `src/routes/<feature>.ts` and **mount it** in `src/routes/index.ts` (`router.use('/<feature>', ...)`).
4. Register repository/policy/service in the `ApplicationFactory` (`lib/factory.ts`) + getter.
5. The route is protected by default (the middleware is fail-closed); add it to the public allowlist
   only if it must be unauthenticated.
6. Document: the feature README (see §9) and its tests (`FEATURE_TEMPLATE.md` §10).

---

## 8. Feature index

| Feature | Role | Doc |
|---|---|---|
| `users` | Users, roles (USER/ADMIN), profile | [README](./src/features/users/README.md) |
| `dynamicTables` | Schema-driven dynamic tables + declarative governance + presets | [README + docs/](./src/features/dynamicTables/README.md) |
| `analytics` | KPIs/charts over the user's tables (templates, CORE definitions, pipelines) | [README](./src/features/analytics/README.md) |
| `chat` | Response generation: RAG and Agent ERP modes (tools, action proposals) | [README](./src/features/chat/README.md) |
| `chatInstances` | Chat instances (DOCUMENT/GENERIC) per widget | [README](./src/features/chatInstances/README.md) |
| `chatMessages` | Message persistence (CRUD; AI lives in `/api/chat`) | [README](./src/features/chatMessages/README.md) |
| `documents` | Upload, processing and search of documents (RAG/vectors) | [README](./src/features/documents/README.md) |
| `structuredData` | Structured data extracted from documents | [README](./src/features/structuredData/README.md) |
| `dashboardLayout` | Dashboard layout configs (upsert per user) | [README](./src/features/dashboardLayout/README.md) |
| `reports` | Report/chart data generation | [README](./src/features/reports/README.md) |
| `interview` | Guided customization (interview/field services) | [READMEs](./src/features/interview/) |

---

## 9. Feature types: CRUD vs non-CRUD

Not every feature is CRUD. Forcing the canonical skeleton (empty `policies/`, `repositories/`) onto a
compute feature is cargo cult. There are **two types**, with distinct conventions:

### 9.1 CRUD feature (owns data)
It **owns one or more tables** and exposes create/read/update/delete over them.
These are: `users`, `documents`, `structuredData`, `chatInstances`, `chatMessages`, `dashboardLayout`,
`dynamicTables`.

Required layout (see §2 and §4): `dtos/ · models/ · policies/ · repositories/ · services/`, with
`I*` interfaces for repository and policy. Authorization lives in the injected **policy**.

### 9.2 Non-CRUD feature (derives / computes / orchestrates)
It **does not own the data** it processes — it reads from other features, computes, or orchestrates.
These are: `analytics` (read-only KPI engine), `reports` (compute façade),
`chat` (orchestrator/agent; owner only of its own infra `KnowledgeGraph`/`ActionProposal`),
`interview` (customization wizard).

Recommended layout:
```
features/<feature>/
├── README.md          # responsibility + WHERE authorization happens (required)
├── dtos/              # Zod boundary — ALWAYS, CRUD or not
├── types/             # domain types (instead of models/, which implies a persisted entity)
├── engine/ | services/  # the computation (analytics splits into core/dynamic/engine/kpis)
└── docs/              # if complex (the dynamicTables convention)
```
**No `repositories/` nor `policies/`** when the feature has no entity of its own.

### 9.3 Authorization in non-CRUD features (the golden rule)
They **do not need a `Policy` object** — they need **scoped, typed, explicit authorization**:
- Every engine function receives **`UserContext`** (never the raw `req`), resolved in the controller via
  `getUserContextFromRequest` (`lib/authUtils.ts`).
- Every read is **scoped by `userId`** — the scope is a signature parameter, not discipline.
- When a non-CRUD feature **writes**, it **delegates to the owning feature's service** (e.g. the `chat`
  agent calls `dynamicTableService.createTableData(user, ...)`, which applies `DynamicTablePolicy`).
  No non-CRUD feature reaches into another's database outside its service.

### 9.4 Exceptions and recorded decisions
- **`interview`** keeps per-service-name folders (`InterviewService/`, `FieldCustomizationService/`,
  `CustomizationService/`) — accepted exception; do not migrate to `services/` for now. **Note:** the
  feature is **not wired into the server** (no route/controller/consumer — the active logic lives in the
  frontend), so it is **outside the gold-standard scope** until exposed via a route (when it should gain
  Zod `dtos/`).
- **`chat`** is the declared **owner** of `KnowledgeGraph` and `ActionProposal` (agent infra), hence it
  hosts those repositories — see the `chat` README.
- **Controllers are not 1:1 with features:** `dashboardController` serves `dynamicTables`/presets,
  `analyticsDefinitionsController` serves the `analyticsDefinitions` table of `dynamicTables`,
  `authController`/`authUtilityController` serve `users`.
- **Service interfaces (`IChatService`, `IReportService`):** kept only for the two non-trivial services
  (`chat`, `reports`); `IReportService` also exports the shared `ProgressCallback` type. The other
  features resolve the concrete service via the factory — an accepted pattern.

---

## 10. Documentation conventions

- **Template = `dynamicTables`.** Simple feature → one `README.md`. Complex feature → a lean `README.md`
  (index) + a `docs/` folder per concern (e.g. architecture / validation / rules).
- **Every feature README must have:** responsibility (1 paragraph), the **public service methods**
  (the real API), main models/DTOs, **policy** rules, and the **boundary with other features**.
- **Maintenance rule:** update the feature README **in the same PR** that changes its public API. Docs
  rot when code moves and docs don't — the goal is to avoid that.
- **Language:** English prose. Identifiers/`label` stay as in the code.

---

## 11. Scope & complexity (single-developer ceiling)

This backend is built and maintained by **one developer**. The bar for any change is **"professional and
maintainable by one person"**, not "enterprise-grade". Every solution must be the **simplest professional
option that fits that scope** — deliberately avoid over-engineering. (Pairs with the `backend-scope` skill.)

**Default to CUT / DEFER** (out of scope at this scale): distributed tracing, custom metrics pipelines,
circuit breakers / backoff libraries, message queues, multi-tier caching, microservices, event
sourcing/CQRS, custom DI containers, and generic "framework" abstractions built for one or two call sites.

**Right-sized equivalents we actually use:**
- **Resilience** = the SDK's built-in `timeout` + 1–2 retries + a clean typed error. Not circuit breakers.
- **Observability** = the structured `lib/logger` + a readiness probe + a request id. Not a metrics backend.
- **Config** = one Zod schema validated at boot (`config/env.ts`). **DI** = the hand-wired `lib/factory.ts`.

**Removing code — two cases (don't conflate them):**
- *Truly dead* (no callers, not a public contract) → delete after a grep.
- *Unused **public surface*** (service methods without a route, policy methods not wired, `factory.ts`
  getters, a capability an upcoming feature may use) → **flag in `REVIEW_BACKLOG.md`, don't delete
  unilaterally.** Re-adding a contract later is friction; the owner decides keep-vs-remove.

"Optional" items in the hardening plan are deferred until a concrete need appears — don't build them
speculatively.
