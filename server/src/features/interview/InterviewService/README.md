## InterviewService

The orchestrator of the AI-guided interview. It is a **singleton** (`InterviewService.getInstance()`)
that advances the conversation through **stages** until the user has a chosen and (optionally) customized
preset.

> Part of the [`interview`](../README.md) feature. Types in [`../models`](../models/README.md).

## Public API

| Method | Role |
|---|---|
| `getInstance()` | Access the singleton. |
| `processTurn(stage, messages, presetKey?, sessionId?)` | Processes **one turn** and returns `IInterviewTurnResult` (`response`, `nextStage`, and optionally `presetKey`/`sessionId`/`startCustomization`/`customizationState`). |

## Dependencies (module components)

- **`PresetMatcher`** — `findMatchingPreset(messages)` matches the business description with a preset;
  `extractTablesInfo(...)` summarizes the tables for the message to the user.
- **`StageHandlers`** — `getAiResponseWithHistory(systemPrompt, messages)` and
  `handleCreationTypeConfirmation(messages, presetKey)` (decides create now vs. customize).
- **`PromptConfig` (`stageConfig`)** — system prompts for the **processable stages**.
- **`CustomizationService`** (singleton) — delegated to when the conversation enters customization.

> The preset knowledge base (`presetKnowledgeBase`) lives in `features/dynamicTables/presets/ai/`,
> **not** in this module — it is consumed via `PresetMatcher` and by `CustomizationService`.

## Stages (`InterviewStage`)

Defined in [`../models/InterviewTypes.ts`](../models/InterviewTypes.ts). `processTurn` explicitly handles:

- **`GREETING`** → initial message; advances to `DISCOVERING_BUSINESS`.
- **`MATCHING_PRESET`** → matches the preset; if found, builds a friendly message and goes to
  `AWAITING_CREATION_TYPE_CONFIRMATION` (with `presetKey`); if not, goes to `IDENTIFYING_ENTITIES`.
- **`AWAITING_CREATION_TYPE_CONFIRMATION`** → delegates to `StageHandlers.handleCreationTypeConfirmation`.
- **`CUSTOMIZATION_IN_PROGRESS`** → delegates to `CustomizationService.processCustomizationStep(sessionId, ...)`.
- **`CUSTOMIZATION_COMPLETED`** → completion message.
- **Processable stages** (`DISCOVERING_BUSINESS`, `CONFIRMING_BUSINESS`, `IDENTIFYING_ENTITIES`, via
  `isProcessableStage`) → use the `systemPrompt` from `stageConfig` + history to respond.

The remaining states of the type (`CUSTOMIZATION_INTRO`, `CANNOT_PROCEED`, `COMPLETED`) are
transitions/terminals of the flow. `ProcessableStage` restricts which stages have a dedicated prompt.

> The service is **stateless per turn**: the frontend sends `stage`/`messages` (and `presetKey`/`sessionId`
> when applicable) and receives the next state. The **customization** state lives in `StateManager`
> (see [`../CustomizationService`](../CustomizationService/README.md)).
