# dashboardLayout

CRUD feature that owns the user's **dashboard layouts (tabs)**. Each layout stores the grid
configuration (widget positions) of one dashboard tab. A user may have **many layouts**; at most
**one is active** at a time (the tab currently shown on the home dashboard).

## Model

`DashboardLayout` (Prisma): `id`, `userId` (indexed, **not** unique), `name` (tab label), `isActive`,
`layoutData` (JSON holding `{ type, config }`), `createdAt`, `updatedAt`.

The domain entity (`models/DashboardLayout.model.ts`) flattens `name`/`isActive` (columns) and
`type`/`config` (from `layoutData`) into `IDashboardLayout`.

## Layering & authorization

`Controller → Service → Repository`, with `Policy` injected into the service. Only the repository
touches Prisma.

- **Multi-tenant:** every layout is scoped to its owner. List/active reads filter by `userId`;
  single-record reads (`getLayoutById`) are fetched then authorized via the `Policy`.
- **Authorization lives in `policies/DashboardLayoutPolicy.ts`** — `canCreate`/`canView`/`canUpdate`/
  `canDelete` (owner-or-admin). The service calls the policy before every mutation.

## API (`/api/dashboard-layout`)

| Method | Path | Action |
|---|---|---|
| GET | `/` | List the user's layouts (tabs), most recent first. Envelope `{ success, data: [...] }`. |
| POST | `/` | Create a new layout (tab) → it becomes the active one. |
| GET | `/:id` | Get one layout (owner only). |
| PATCH | `/:id` | Update a layout. **Partial updates are merged** with the stored record (never wipes `type`/`config`). Also used to rename via `name`. |
| POST | `/:id/activate` | Switch the active layout (tab). |
| DELETE | `/:id` | Delete a layout; if it was active, the most recently updated remaining one becomes active. |

## Invariants

- **One active layout per user** — enforced by `repository.setActive`, which flips the flag inside a
  `prisma.$transaction` (unset all of the user's, then set the target). This is **application-enforced
  only**: there is no DB-level constraint backing it, because a partial unique index (`userId` where
  `isActive = true`) is not expressible in Prisma on SQLite. `setActive` is the single writer of
  `isActive`, so the invariant holds as long as no code mutates the flag outside it. If the project
  migrates to PostgreSQL, add a partial unique index to make the DB the source of truth.
- **Merge-on-update** — `service.updateLayout` loads the current layout and overrides only the fields
  present in the request, so a partial PATCH cannot corrupt the stored config.
- **Fail-soft listing** — `repository.getLayoutsByUser` skips (and logs) any row whose `layoutData`
  JSON is malformed, so one corrupt record cannot deny the user access to the rest of their tabs.
  Single-record reads still surface the error.

## Tests

Gold-standard 4-level suite (see [`TESTING.md`](../../../TESTING.md)):

- **Policy unit** — `policies/__tests__/DashboardLayoutPolicy.spec.ts`: owner-or-admin view/update/delete;
  `canListAll` admin-only.
- **DTO unit** — `dtos/__tests__/DashboardLayoutDto.spec.ts`: name bounds (3–50), type enum, config
  `columns` 1–12, partial-update shape.
- **Service integration** — `services/__tests__/DashboardLayoutService.integration.test.ts`: the
  integrity invariants — exactly **one active layout per user** (transactional `setActive`),
  **merge-on-update** (a partial PATCH never wipes type/config), **fail-soft listing** (a malformed row
  is skipped; a single-record read still surfaces the error), delete-active reassignment, the per-user
  cap (20), and Tier-0 ownership.
- **HTTP contract** — `controllers/__tests__/dashboardLayout.routes.integration.test.ts`:
  401/400/403/404, the merge-on-update end-to-end, and the `{ success, data }` envelope.

> Concurrency (two simultaneous `setActive`) is not covered here — SQLite serializes it; a TOCTOU test
> is deferred to the PostgreSQL migration (see `TESTING.md` §9).

## Frontend

`my-app/components/widgets/dashboard-grid/` consumes this feature:
- `dashboard-layout.api.ts` — typed calls to the endpoints above.
- `DashboardTabsBar.tsx` — tab bar (create / switch / rename / delete).
- `dashboard-grid.tsx` — loads the active layout on mount and auto-saves edits via `PATCH /:activeId`.
