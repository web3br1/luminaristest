# Feature: Chat Instances

## Overview

The `chatInstances` feature is a core **entity feature**. Its responsibility is to manage the lifecycle
of an individual conversation (chat instance). Each instance represents a unique chat session, with its
own message history and metadata.

## File structure

```
chatInstances/
├── dtos/
│   └── ChatInstanceDto.ts
├── models/
│   └── ChatInstance.model.ts
├── policies/
│   └── ChatInstancePolicy.ts
├── repositories/
│   └── ChatInstanceRepository.ts
├── services/
│   └── ChatInstanceService.ts
└── README.md
```

## Architecture and components

The feature follows a standard layered architecture to ensure separation of concerns, security and
testability.

- **DTOs (`ChatInstanceDto.ts`)**: uses Zod to define robust validation schemas for all input
  operations (create, update) and to type the output data.
- **Service (`ChatInstanceService.ts`)**: orchestrates the business logic. It consumes the repository
  and the policy to run the CRUD operations, ensuring every business and authorization rule is applied
  before touching the database.
- **Policy (`ChatInstancePolicy.ts`)**: centralizes the authorization rules. Defines who can create,
  view, edit or delete a chat instance, ensuring a user cannot access or modify another's conversations.
- **Repository (`ChatInstanceRepository.ts`)**: implements the data-access layer, abstracting the
  database queries (Prisma). It is the only layer that interacts directly with the database.

## Service API (`ChatInstanceService`)

| Method | Responsibility |
|---|---|
| `createInstance(data, userContext)` | Creates an instance. Duplicate (`userId`+`widgetInstanceId`) → 409 via P2002. |
| `getAllInstances(userContext, page?, limit?)` | Paginated list → `{ instances, totalCount }`. |
| `getInstanceById(id, userContext)` | Fetch by ID (with access check). |
| `getInstancesByUser(userContext, type?)` | Lists (summary) the user's instances, optionally by `type`. |
| `getOrCreateInstance(widgetInstanceId, type, userContext)` | **Idempotent:** returns the existing instance for the `widgetInstanceId` or creates a new one, handling the race condition via the unique constraint. |
| `updateInstance(id, data, userContext)` | Updates. |
| `deleteInstance(id, userContext)` | Deletes. |

## HTTP API (`/api/chat-instances`)

| Method | Path | Action |
|---|---|---|
| GET | `/?page&limit&type` | List (paginated; `limit` capped at 100). With `type`, filters by type. Returns **summaries** (no `userId`). |
| POST | `/` | Create (strict). Duplicate (`userId`+`widgetInstanceId`) → 409 via P2002. |
| POST | `/get-or-create` | **Idempotent** — used on chat initialization to avoid duplicates. |
| PUT | `/:id` | Update (`title`/`widgetInstanceId`). |
| DELETE | `/:id` | Delete. |

> `getInstanceById` exists in the service (with `canView`) but has no HTTP route today.

### Key concepts
- **`widgetInstanceId`**: stably identifies the instance bound to a frontend widget; it is the key used
  for **deduplication** in `getOrCreateInstance`.
- **`type`** (enum): `'DOCUMENT'` | `'GENERIC'` — distinguishes document-bound conversations from
  generic ones.
- **Lists return summaries** (`ChatInstanceSummaryDto`, no `userId`); single-record reads return the
  full DTO.

## Tests

Gold-standard 4-level suite (see [`TESTING.md`](../../../TESTING.md)):

- **Policy unit** — `policies/__tests__/ChatInstancePolicy.spec.ts`: owner-only view/update/delete (no
  admin bypass); create/list require auth.
- **DTO unit** — `dtos/__tests__/ChatInstanceDto.spec.ts`: list-query caps/coercions + type enum,
  get-or-create and create shapes.
- **Service integration** — `services/__tests__/ChatInstanceService.integration.test.ts`: Tier-0
  read/update/delete, the unique `(userId, widgetInstanceId)` constraint, the idempotent
  get-or-create, and that lists return summaries **without `userId`**.
- **HTTP contract** — `controllers/__tests__/chatInstances.routes.integration.test.ts`:
  401/400/403/409, the idempotent get-or-create, and the pagination envelope.

## Interaction with other features

- **`chatMessages` (child)**: the `ChatInstance` is the parent entity of messages. Each `ChatMessage`
  belongs to a single `ChatInstance`, forming a one-to-many relation that structures the conversation
  history.
- **`users` (owner)**: each `ChatInstance` belongs to a `User`. The `userContext` is used in every
  operation to ensure access policies are applied correctly, isolating conversations per user.
