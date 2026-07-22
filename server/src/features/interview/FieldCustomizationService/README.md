## FieldCustomizationService

The finest customization step: **add/remove/modify fields** of a specific table, via an AI conversation,
reusing **field presets** when possible. It is a **singleton** — the class lives in
[`index.ts`](./index.ts) (`FieldCustomizationService.getInstance()`).

> Part of the [`interview`](../README.md) feature. Shares the `StateManager` of the
> [`CustomizationService`](../CustomizationService/README.md).

## Public API

| Method | Role |
|---|---|
| `getInstance()` | Access the singleton. |
| `processMessage(sessionId, tableKey, userMessage, conversationHistory?)` | Processes a field-customization request for a table and returns `IFieldCustomizationResult` (`updatedTable`, `aiMessage`, `modified`, `conversationHistory`). |
| `validateFields(table)` | Suggests improvements for a table's fields → `{ suggestions, valid }`. |

## `processMessage` flow

1. Retrieves the session state (`StateManager.getSessionState`) and locates the table by `tableKey`.
2. Builds the context (a system prompt with the current fields + history) and calls
   `openaiService.getChatCompletionWithHistory(..., 'gpt-4-turbo')`.
3. **`FieldIntentParser.parse(...)`** interprets the response into structured modifications
   (`add`/`remove`/`modify`); `hasValidModifications(...)` validates. If invalid, it returns the table
   unchanged with a friendly message.
4. **`processFieldModifications(...)`** (private): for additions, it uses **`FieldPresetMatcher`** to
   match the requested field with a real **field preset**; if found, it substitutes the preset
   (preserving the requested label) and uses `FIELD_PRESET_FOUND_PROMPT`; if not, it keeps the custom
   field and uses `FIELD_PRESET_NOT_FOUND_PROMPT`.
5. **`FieldUpdater.update(table, modifications)`** applies the changes.
6. If there was a change, it updates the `StateManager` (`updateTables`) and appends the messages to the
   table's `conversationHistory`.

## Module components

- **`FieldIntentParser`** — interprets the user's intent into structured modifications.
- **`FieldUpdater`** — applies the modifications to the `ICustomizableTable`.
- **`FieldPresetMatcher`** — `findFieldPreset(description, existingFields)` matches a field with a
  `dynamicTables` field preset.
- **`PromptConfig`** — templates (`FIELD_CUSTOMIZATION_PROMPT`, `FIELD_PRESET_FOUND_PROMPT`,
  `FIELD_PRESET_NOT_FOUND_PROMPT`, `FIELD_VALIDATION_PROMPT`).
- **`StateManager`** (singleton, shared) — the source of session state.

> ⚠️ There are no `AIFieldInteraction` nor `FieldExtractor` (mentioned in old docs). The AI is called
> directly via `OpenAIService` and the structuring is done by `FieldIntentParser`.
