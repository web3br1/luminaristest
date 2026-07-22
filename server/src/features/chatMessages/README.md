# Feature: Chat Messages

## Overview

The `chatMessages` feature is an **entity feature** responsible for **persisting the messages** of a
conversation (the history exchanged between user and assistant). It is a CRUD scoped by `ChatInstance`
and by user.

> **Important (responsibility shift):** **AI response generation does NOT happen here.** It was
> centralized in the **`/api/chat`** endpoint (feature [`chat`](../chat/README.md)). The
> `ChatMessageService` only **persists and reads** messages — it neither invokes OpenAI nor orchestrates
> RAG/Agent.

## File structure

```
chatMessages/
├── dtos/          ChatMessageDto.ts          # Zod schemas (Create/Update)
├── models/        ChatMessage.model.ts
├── policies/      ChatMessagePolicy.ts (+ interface)
├── repositories/  ChatMessageRepository.ts (+ interface)
└── services/      ChatMessageService.ts
```

## HTTP API (`/api/chat-messages`)

| Method | Path | Action |
|---|---|---|
| GET | `/?instanceId=…` | Lists an instance's history. **Additive** pagination: with `page`/`pageSize` returns a page + meta; without them, the whole thread. `pageSize` capped at 100. |
| POST | `/` | Creates a message **always with `role: USER`** (see below). |

## Service API (`ChatMessageService`)

| Method | Exposed via route? | Responsibility |
|---|---|---|
| `createMessage(data, userContext)` | ✅ POST `/` | Persists a USER message after validating ownership of the `ChatInstance`. **Does not generate an AI response.** |
| `getMessagesByInstance(id, userContext, opts?)` | ✅ GET `/` | Lists the history (with optional pagination). |
| `appendAssistantMessage(id, content, userContext)` | server-only | Persists the assistant's response; called by `ChatService` inside `/api/chat`. |
| `getMessageById` / `updateMessage` / `deleteMessage` | ⚠️ **not exposed** | Implemented (with policy `canView`/`canUpdate`/`canDelete`, USER-only) but **no route** today. Kept for future edit/delete — expose or remove once the decision is made. |

Internal helper: `enrichMessageWithUserId(message)` — resolves the `userId` from the `chatInstanceId`.

## DTOs

- **`CreateChatMessageDto`** — `content`, `chatInstanceId`, `documentIds?`. **`role` is intentionally
  absent:** creation via REST always writes `role: USER`; assistant responses are written server-side
  via `appendAssistantMessage` (feature [`chat`](../chat/README.md)).
- **`UpdateChatMessageDto`** — partial update (`content`).

Validation uses `safeParse` on the Zod schemas in the controller.

## Authorization

The policy ensures the user only accesses messages of instances they own: the service compares
`chatInstance.userId` with `userContext.userId` before any operation. Edit/delete (when exposed) are
**USER-only** — assistant messages are not editable by the client.

## Tests

Gold-standard 4-level suite (see [`TESTING.md`](../../../TESTING.md)):

- **Policy unit** — `policies/__tests__/ChatMessagePolicy.spec.ts`: view requires the message owner;
  **edit/delete are USER-role only** (assistant messages are never client-editable, even by the owner).
- **DTO unit** — `dtos/__tests__/ChatMessageDto.spec.ts`: content bounds (1–4000), chatInstanceId as
  cuid, list-query caps, and that a client-sent `role` is **stripped** (creation is always USER).
- **Service integration** — `services/__tests__/ChatMessageService.integration.test.ts`: parent-instance
  ownership gates every op (Tier-0), REST create writes a USER message, `appendAssistantMessage` is
  server-only, additive pagination, and the assistant-not-editable rule end-to-end.
- **HTTP contract** — `controllers/__tests__/chatMessages.routes.integration.test.ts`:
  401/400/403/404, the pagination meta, and the persisted USER role.

## Interaction with other features

- **[`chatInstances`](../chatInstances/README.md) (dependency):** every message belongs to a
  `ChatInstance`; ownership of the instance governs access.
- **[`chat`](../chat/README.md) (separate):** it is the one that **generates** the assistant response
  (RAG and Agent ERP modes) and **orchestrates the conversation's persistence**. Inside `/api/chat`,
  `ChatService` persists the user message (`createMessage`) and the assistant response
  (`appendAssistantMessage`) — the frontend does **not** call `POST /chat-messages` in the chat flow.
