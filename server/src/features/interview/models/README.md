## models — shared types

All types of the interview/customization flow live in **a single file**:
[`InterviewTypes.ts`](./InterviewTypes.ts). They are shared between `InterviewService`,
`CustomizationService` and `FieldCustomizationService`.

> Part of the [`interview`](../README.md) feature.

## Types

### Stages
- **`InterviewStage`** (string union) — all stages: `GREETING`, `DISCOVERING_BUSINESS`,
  `CONFIRMING_BUSINESS`, `MATCHING_PRESET`, `AWAITING_CREATION_TYPE_CONFIRMATION`, `CUSTOMIZATION_INTRO`,
  `CUSTOMIZATION_IN_PROGRESS`, `CUSTOMIZATION_COMPLETED`, `IDENTIFYING_ENTITIES`, `CANNOT_PROCEED`,
  `COMPLETED`.
- **`ProcessableStage`** — the subset with a dedicated prompt: `DISCOVERING_BUSINESS`,
  `CONFIRMING_BUSINESS`, `IDENTIFYING_ENTITIES`.

### Messages and turn
- **`IMessage`** — `{ role: 'user' | 'assistant'; content: string }`.
- **`IInterviewTurnResult`** — the return of a turn: `response`, `nextStage`, and the optional
  `presetKey`, `startCustomization`, `sessionId`, `customizationState`.

### Customization state
- **`ICustomizableTable`** — `conversationHistory: any[]`, `name`, `key`, `description`,
  `isSelected: boolean`, `isCore: boolean`, `fields?: any[]` (the real `ISchemaField`s of the preset).
- **`ICustomizationState`** — `presetKey`, `presetName`, `tables: ICustomizableTable[]`,
  `customMessages: IMessage[]`, `currentAction?: 'adding' | 'removing' | null`, `isCompleted: boolean`.

> ⚠️ There are no separate `ICustomizationState.ts`, `ICustomizableTable.ts` or `ICustomizableField.ts`
> files/interfaces (mentioned in an old doc). A table's fields are `ISchemaField` from
> [`dynamicTables`](../../dynamicTables/README.md), not a type of their own.
