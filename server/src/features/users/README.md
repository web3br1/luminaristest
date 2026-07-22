# users

Owns the system's **user accounts**: creation (public signup + admin-created), profile reads,
updates, deletion, and the authenticated user's own preferences. Each user is an isolated tenant.

## Model

`User` (Prisma): `id`, `name` (nullable), `username` (unique), `email` (unique), `password` (bcrypt
hash), `role` (`USER` | `ADMIN`), `locale`, `currency`, `createdAt`, `updatedAt`.

- `models/User.model.ts` — `IUser` domain entity (`locale`/`currency` optional: not every context
  loads them) and the `Role` enum (source of truth).
- `SafeUserProfile = Omit<IUser, 'password'>` — what the service returns; the password hash never
  leaves the repository except on the auth lookups (`getUserByUsername`/`getUserByEmail`).

## Layering & authorization

`Controller → Service → Repository`, with `Policy` injected into the service. Only the repository
touches Prisma. The two authorization layers have **distinct jobs** (no overlap):

1. **`middleware/auth.ts`** — **authentication only, fail-closed**: every `/api` route requires a
   valid JWT except a small public allowlist (`POST /api/users` signup, `/api/auth/login|register`,
   `/api/docs`). It injects the `x-user-*` context headers and makes **no** per-record decisions.
2. **`policies/UserPolicy.ts`** — **the authorization authority** (fine, per-action). The service
   calls it before every action:
   - `canCreate` — public signup (anonymous) or admin.
   - `canListAll` — **admin-only**.
   - `canView` / `canUpdate` — **owner-or-admin**.
   - `canChangeRole` — **admin-only**.
   - `canDelete` — **admin-only** (see below).

> **Self-service vs admin surface.** A user reads/edits their **own** profile via `GET /api/users/:id`
> / `PUT /api/users/:id` (owner-or-admin) or via `GET /api/auth/me`. Listing all users is admin-only.
> There is intentionally **no** cross-tenant "public profile" view.
>
> **Delete is admin-only — and self-delete is disallowed by design.** A `User` row cascade-deletes
> its business data (`Document`, `DynamicTable`, `DashboardLayout`, chat — schema `onDelete: Cascade`),
> so a user must not be able to hard-delete their own account; offboarding goes through an admin.

## API (`/api/users`)

| Method | Path | Who | Action |
|---|---|---|---|
| POST | `/` | Public | Sign up. Non-admin (or anonymous) callers cannot self-assign `ADMIN`. |
| GET | `/` | Admin | Paginated list. Query `page`/`limit` (`limit` capped at 100). |
| GET | `/:id` | Self or Admin | Get one user (full `SafeUserProfile`). |
| PUT | `/:id` | Self or Admin | Update. Only admins may change `role`. |
| DELETE | `/:id` | Admin | Delete a user (self-delete disallowed). |
| PATCH | `/me/preferences` | Self | Update own `locale`/`currency`. |

All `:id` params are validated as CUID at the controller. Bodies are validated with Zod
(`CreateUserSchema` / `UpdateUserSchema` / `UpdatePreferencesSchema` / `LoginSchema`).

**Auth endpoints** (`/api/auth`, in `authController`) operate on users and delegate to `UserService`:
`POST /register` → `createUser` (public), `POST /login` → `authenticate`, `GET /me` → `getUserById`
(self). They issue/consume the JWT; response contract `{ success, data: { user, token } }`.

## Invariants & rules

- **Passwords are bcrypt-hashed** (cost 10) on create and on password update; never returned.
- **No privilege escalation** — a non-admin updating a profile cannot set `role: ADMIN`
  (`canChangeRole` is admin-only; a role change by a non-admin throws `ForbiddenError`).
- **Last-admin protection** — the system cannot be locked out of admin access:
  - `deleteUser` refuses to delete the last `ADMIN` (`countByRole(ADMIN) <= 1`).
  - `updateUser` refuses to **demote** the last `ADMIN` (ADMIN → non-ADMIN) under the same condition.
- **Uniqueness** — `username`/`email` are unique. `createUser` pre-checks and returns
  `USERNAME_EXISTS`/`EMAIL_EXISTS` (409); on update the DB unique constraint surfaces as `P2002` → 409.
- **Empty update rejected** — `updateUser` throws `ValidationError` if no valid field is provided.

## Service surface (`UserService`)

- `createUser(data, actor?)` — `actor` null = public signup. Hashes password, enforces role rule,
  checks uniqueness. Returns `SafeUserProfile`.
- `authenticate(identifier, password)` — verifies login credentials (username **or** email + password);
  returns `SafeUserProfile` or throws `UnauthorizedError('Invalid credentials')` (no user enumeration).
  Used by `POST /api/auth/login`.
- `getAllUsers(actor, page?, limit?)` — admin-only (`canListAll`); returns `{ users, totalCount }`.
- `getUserById(id, actor)` — admin-or-self (`canView`); returns `SafeUserProfile`.
- `updateUser(id, data, actor)` — admin-or-self; admin-only role change with last-admin guard.
- `updatePreferences(userId, prefs)` — self-scoped by the caller (`ctx.userId`); no role check.
- `deleteUser(id, actor)` — **admin-only** (`canDelete`); last-admin guard prevents removing the final admin.
