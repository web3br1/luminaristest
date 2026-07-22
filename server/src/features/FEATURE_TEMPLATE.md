# Backend Feature Standard ("the mold")

The single source of truth for how a backend feature under `server/src/features/<feature>/` is built.
Every feature follows this skeleton; **justified uniqueness is allowed but must be documented** (see
"Variants"). Reference features that embody the mold: `users`, `chatInstances`, `dashboardLayout`.

A feature is **gold** when it satisfies the Tier-0 + Tier-1 invariants *and* this standard.

---

## 1. Directory layout

```
<feature>/
├── dtos/          Zod schemas + inferred types (input validation + response typing)
├── models/        domain interface I<Entity> + enums — source of truth, decoupled from Prisma
├── policies/      I<Entity>Policy + <Entity>Policy — authorization rules
├── repositories/  I<Entity>Repository + <Entity>Repository — the ONLY layer that touches Prisma
├── services/      <Entity>Service — business logic; depends on interfaces
└── README.md      feature doc (see §8 for format)
```

Wiring: `Controller → Service → Repository`, with `Policy` injected into the Service. Dependencies
are constructed and injected in `server/src/lib/factory.ts`.

## 2. Controller (`server/src/controllers/<feature>Controller.ts`)

- Extract context: `const ctx = getUserContextFromRequest(req); if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });`
- Validate the `:id` param: a local `const <Entity>IdSchema = z.object({ id: z.string().cuid({ message: '...' }) });` via `safeParse` → on failure `return res.status(400).json({ success: false, error: parsed.error.flatten() });`
- Validate body/query with the feature's Zod schema via `safeParse` (same 400 shape).
- List endpoints use a `List<Entity>QuerySchema` that **caps `limit`** (`z.coerce.number().int().min(1).max(100).default(10)`).
- Delegate to `getFactory().get<Entity>Service()`. **Never** put business logic in the controller.
- Success envelope: `{ success: true, data }`. Lists add `total`, `page`, `pageSize`.
- Wrap in `try/catch` → `handleApiError(error, res)`.
- No `ctx as any`. `getUserContextFromRequest` already returns a typed `UserContext`.

## 3. Service (`services/<Entity>Service.ts`)

- Constructor injects **interfaces** (`I<Entity>Repository`, `I<Entity>Policy`, other `I*` deps).
- Every public method starts with: `if (!userContext.userId) throw new UnauthorizedError(...)`.
- Authorization via the policy:
  - create/list: `if (!this.policy.canCreate(ctx)) throw new ForbiddenError(...)` / `canListAll`.
  - single record: fetch → `if (!entity) throw new NotFoundError(...)` → `if (!this.policy.canView/Update/Delete(ctx, entity)) throw new ForbiddenError(...)`.
- Throw typed errors only (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`, `ServiceError`) — `handleApiError` maps them.
- Map the domain entity → DTO before returning (never return a raw Prisma row).
- Use `logger` (never `console`). Don't leak `error.message` to clients.

## 4. Repository (`repositories/<Entity>Repository.ts` + `I<Entity>Repository.ts`)

- Implements `I<Entity>Repository`. It is the **only** layer importing `prisma`.
- Explicit `select` — never select secrets (e.g. password hashes) into read paths.
- Multi-tenant reads are scoped by `userId`.
- Map Prisma `P2025` → `NotFoundError`; let `P2002` (unique) propagate → handled as 409.
- External stores (e.g. Qdrant `VectorRepository`) are repositories too and also have an interface.

## 5. Policy (`policies/<Entity>Policy.ts` + `I<Entity>Policy.ts`)

Canonical method set (do not rename/suffix):
- `canCreate(ctx)`, `canListAll(ctx)` — take only the context.
- `canView(ctx, entity)`, `canUpdate(ctx, entity)`, `canDelete(ctx, entity)` — owner-or-admin.

## 6. DTOs (`dtos/<Entity>Dto.ts`)

- Zod schemas; export `z.infer` types. `Update = Create.partial()` when it fits.
- `List<Entity>QuerySchema` with a capped `limit`. Validation messages use i18n keys where the
  feature already does.
- No dead type guards (`isXDto`) unless actually consumed.

## 7. Invariants

- **Tier-0 (multi-tenant):** every read/mutation is scoped to the owner (`userId`) or authorized via
  policy. External stores are filtered by `userId`. `getById` fetches then authorizes; returning
  `404` (not `403`) for a non-owned record to avoid leaking existence is acceptable.
- **Two-layer authorization:** `middleware/auth.ts` (coarse, path-prefix) + policy (fine, per-action)
  must stay consistent. If the middleware restricts a path, don't ship policy branches that imply
  looser access (dead/ misleading code).
- **No dead code, no `as any`, `logger` not `console`.**

## 8. README format (gold)

Sections: title + one-paragraph purpose; **Model**; **Layering & authorization** (note Tier-0
scoping); **API** table (Method | Path | Action); **Invariants**; **Interaction with other
features**. Keep it accurate — document the real route methods/paths and the real policy method names.

## 9. Variants (justified uniqueness — keep the skeleton, document the difference)

The skeleton (controller→service→repo, DI, Tier-0, Zod) is **non-negotiable**. Feature-specific
machinery is fine when the domain demands it, and must be documented in the feature README:
- **Capability features** (e.g. `chat`): no CRUD entity of their own; own orchestration infra
  (agent, knowledge graph) and delegate writes to the owning service.
- **Pipeline features** (e.g. `documents`): async processing, external vector store, multipart
  upload. `createX` may take a binary/file argument instead of a JSON DTO.

## 10. Mandatory tests

A feature is **not gold without tests**. Shared infra lives in `server/test/helpers/`
(`makeApp`, `seedUser`, `authHeader`/`ctxFor`, `pushTestSchema`/`resetDb`/`disconnectDb`).
Convention: `*.spec.ts` = pure unit (no DB); `*.integration.test.ts` = touches DB/HTTP.
Run: `npm run test:unit` (fast, watchable) · `npm run test:integration` (serial, isolated DB) ·
`npm run test:coverage` (coverage ratchet — fails if it regresses).

The gold test set for a CRUD feature (four levels):

1. **Policy — unit (`policies/__tests__/<Entity>Policy.spec.ts`)**: the full authorization matrix
   (role × target × null). Pure, no I/O. Ref.: `users/policies/__tests__/UserPolicy.spec.ts`.
2. **DTO — unit (`dtos/__tests__/<Entity>Dto.spec.ts`)**: the validation boundary — what each Zod
   schema must reject (limits), not just the happy path. Ref.: `users/dtos/__tests__/UserDto.spec.ts`.
3. **Service — integration (`services/__tests__/<Entity>Service.integration.test.ts`)**: real SQLite
   via `pushTestSchema`; covers **Tier-0** (owner reads/writes their own; other tenant → 403/404),
   business rules and typed errors. Ref.: `dynamicTables/.../DynamicTableService.integration.test.ts`.
4. **HTTP/contract — integration (`controllers/__tests__/<feature>.routes.integration.test.ts`)**:
   supertest over the real app; covers **401** without a token, **403** cross-tenant/role, **400** from
   the DTO, the `{ success, data }` envelope, error→status mapping and **no secret leakage**
   (e.g. `password`). Ref.: `controllers/__tests__/users.routes.integration.test.ts`.

Cross-cutting (shared, not per-feature): `middleware/__tests__/auth.routes.integration.test.ts` locks
the fail-closed auth gate.

Depth by risk (not a uniform %): **Tier-0** and money/integrity governance get exhaustive coverage,
not sampling. Coverage is a hole-detector, not a quality meter: every **README invariant** should have
a test that fails if it breaks.

> Non-CRUD features (compute/orchestrate — see §9) have no Policy/Repository, so they use a subset:
> DTO unit + computation tests + HTTP contract.

## 11. Gold checklist

- [ ] Directory layers present; only the repository touches Prisma.
- [ ] Tier-0 scoping verified on every read/mutation (incl. external stores).
- [ ] Controller: ctx→401, cuid `:id`, capped list `limit`, Zod body, `{ success, data }`, `handleApiError`.
- [ ] Service: `userId` guard + policy call in every method; typed errors; domain→DTO mapping.
- [ ] Repository: implements interface; explicit `select`; P2025→404.
- [ ] Policy: canonical method names (`canCreate/canListAll/canView/canUpdate/canDelete`).
- [ ] Interfaces injected (not concretes); no dead code; no `as any`; `logger` not `console`.
- [ ] README in gold format and accurate.
- [ ] Tests (§10): policy unit + DTO unit + service integration (Tier-0) + HTTP contract (401/403/400 + no leak).
- [ ] `npm test` green and coverage ≥ ratchet (`npm run test:coverage`).
- [ ] `npx tsc --noEmit` clean.
