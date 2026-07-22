## CustomizationService

Manages **table-level** customization of a chosen preset: presents the tables and processes requests to
**add/remove** tables during the conversation. It is a **singleton** (`CustomizationService.getInstance()`).

> Part of the [`interview`](../README.md) feature. Called by the
> [`InterviewService`](../InterviewService/README.md) when the conversation enters customization.

## Public API

| Method | Role |
|---|---|
| `getInstance()` | Access the singleton. |
| `generateSessionId()` | Generates a `sessionId` (delegates to `StateManager`). |
| `createCustomizationSession(presetKey, sessionId)` | Creates the session state from the real preset; returns `ICustomizationState` or **`null`** if the preset/knowledge does not exist. |
| `generateTablesPresentation(sessionId, isInteractive?)` | Builds the presentation of the preset's tables. `isInteractive` changes the message tone/shape (interactive mode vs. summary). |
| `processCustomizationStep(sessionId, messages)` | Processes a turn of table customization; returns `IInterviewTurnResult`. |

## Dependencies (module components)

- **`StateManager`** (singleton) — **in-memory** session state (`ICustomizationState` per `sessionId`):
  tables, history (`customMessages`), `currentAction`, `isCompleted`. Methods like `createSessionState`,
  `getSessionState`, `updateTables`, `sessionExists`.
- **`TableExtractor`** — `extractTablesFromRealPreset(preset)` derives the `ICustomizableTable`s from the
  real preset (via `presetService`).
- **`AIInteractions`** — formulates the prompts and talks to `OpenAIService` for the add/remove-table
  tasks.

> The base preset comes from `dynamicTables`: `presetService.getPresetByKey` (real structure) +
> `presetKnowledgeBase` (AI description, in `presets/ai/`).

## Action machine (`currentAction`)

During customization, the state holds `currentAction: 'adding' | 'removing' | null`. A turn that
interprets the user's intent routes to add- or remove-table processing and, on completion, **resets
`currentAction` to `null`**. Tables marked `isCore` cannot be removed.

> **State is in-memory only** — lost on a server restart. (A Redis variant once existed but was removed;
> there is no `RedisStateManager` in the current code.)

## Field customization

Customization **within a table** (fields) is the responsibility of the
[`FieldCustomizationService`](../FieldCustomizationService/README.md), which shares the same
`StateManager`.
