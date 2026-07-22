# Feature: Chat

## Overview

The `chat` feature is a **capability feature**: it holds the assistant's **response-generation logic**
(exposed at the `/api/chat` endpoint). It **does not own** the messages table — that is the
[`chatMessages`](../chatMessages/README.md) feature — but it **orchestrates the conversation's
persistence** by delegating to `ChatMessageService` (see "Conversation persistence" below).

The core is `ChatService.generateResponse(request & { user: UserContext })`, which operates in **two
modes** depending on the request.

> **Architecture decision (non-CRUD feature):** although `chat` is not a CRUD feature, it is the
> **declared owner** of the agent infra — the `KnowledgeGraphRepository` and `ActionProposalRepository`
> live here on purpose. Writes to other features' tables are **always delegated** to the owning service
> (e.g. `dynamicTableService.createTableData`, which applies the policy). See `server/ARCHITECTURE.md` §9.

## The two modes

### 1. RAG — chat over documents
**Trigger:** the request carries `documentIds`.
- Rewrites the last question using the history (`rewriteQueryWithHistory`) to make it standalone.
- Generates the embedding and fetches relevant chunks via `vectorRepository.search(embedding, userId, 10, documentIds)`
  — the search is always scoped to `userId` (multi-tenant isolation); feature [`documents`](../documents/README.md).
- Builds the prompt with the retrieved context (`RAG_SYSTEM_PROMPT`) and generates a textual answer.

### 2. Agent ERP — operational assistant
**Trigger:** **no** `documentIds`.
- Uses `AGENT_SYSTEM_PROMPT` + the `LuminarisAgentService.getTools()` tools and the
  `KnowledgeGraphService` context (`getGraphPrompt()`).
- Runs a **tool-call loop** (up to ~5 iterations): the model requests tools, the service executes and
  feeds the result back, until it produces the final answer.
- May return an **action proposal** (`ACTION_PROPOSAL`) instead of text; the client confirms by sending
  `confirmedProposalId` in a follow-up call, which then commits the action.

## Conversation persistence (server-side)

`generateResponse` is the **owner of the persistence flow** when the request carries `chatInstanceId`:
1. Persists the **user** message (`chatMessageService.createMessage`) — instance ownership is validated
   here (403/404 if it isn't the user's).
2. Generates the response (`buildResponse`).
3. Persists the **assistant** response (`appendAssistantMessage`) — *best-effort*: a write failure is
   logged but does not discard the already-generated response.

Because roles are written by the server, the client **cannot** forge assistant messages. The client no
longer calls `POST /chat-messages` in the chat flow.

> **History (`history`):** today the context sent to the LLM comes from the `history` array in the
> request (client-supplied). It is *self-scoped* (each user only drives their own agent, over their own
> data, and writes require confirmation), so there is no cross-tenant risk. **Future hardening:** load
> the history from `chatInstanceId` on the server instead of trusting the client.

## Authorization and isolation

- **RAG:** the vector search is always scoped by `userId` — another tenant's `documentIds` return nothing.
- **Agent:** all tools operate via `dynamicTableService` scoped to the `user` (the table policy is
  applied). `executeProposal` validates `proposal.userId === user.userId` before committing.
- **ERP writes** **always** go through the owning service (`dynamicTableService.createTableData`/`updateTableData`),
  never directly into the database.

## Response types

`ChatResponseDto` distinguishes:
- **`TEXT`** — a direct textual answer.
- **`ACTION_PROPOSAL`** — a proposed action (its own structure) awaiting user confirmation.

## File structure

```
chat/
├── dtos/          ChatDto.ts                 # ChatRequestSchema / ChatResponseSchema (Zod)
├── services/      ChatService.ts (+ IChatService.ts)
│                  LuminarisAgentService.ts   # ERP agent tools
│                  KnowledgeGraphService.ts   # knowledge-graph context/prompt
└── repositories/  ActionProposalRepository, KnowledgeGraphRepository
```

## Interaction with other features

- **[`documents`](../documents/README.md):** RAG mode consumes the `VectorRepository` (vector search
  filtered by `documentIds`).
- **[`dynamicTables`](../dynamicTables/README.md) / ERP data:** Agent mode operates on the user's data
  via `LuminarisAgentService` tools and the knowledge graph.
- **[`chatMessages`](../chatMessages/README.md):** owner of the messages table. `ChatService`
  **delegates** persistence to it (user message + assistant response), all server-side inside
  `/api/chat`. The client does not persist messages directly in the chat flow.

## Tests

As a non-CRUD capability feature, chat uses the subset of the gold set (no Policy/Repository of its own):

- **DTO unit** — `dtos/__tests__/ChatDto.spec.ts`: request/response Zod shape (history role enum, array
  typings, the `type` default).
- **Computation unit** — `services/__tests__/ChatService.spec.ts`: orchestration with **all externals
  faked** (no OpenAI/vector/DB) — RAG vs Agent mode, **Tier-0** (vector search scoped to `userId`,
  proposals executed for the caller), action proposals, and server-owned persistence (user message
  before generation, assistant reply best-effort after).
- **HTTP/contract** — `controllers/__tests__/chat.routes.integration.test.ts`: the boundary that runs
  before any model call — 401 (no token), 400 (bad DTO), and **Tier-0 403/404** when `chatInstanceId`
  belongs to another user / doesn't exist.

> The model-generation happy path is **not** exercised over HTTP (it would hit OpenAI); the faked
> `ChatService.spec` covers that logic deterministically. Deep tests of `LuminarisAgentService` /
> `KnowledgeGraphService` internals are a separate follow-up.
