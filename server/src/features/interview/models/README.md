## models — tipos compartilhados

Todos os tipos do fluxo de entrevista/customização vivem em **um único arquivo**:
[`InterviewTypes.ts`](./InterviewTypes.ts). São compartilhados entre `InterviewService`,
`CustomizationService` e `FieldCustomizationService`.

> Parte da feature [`interview`](../README.md).

## Tipos

### Estágios
- **`InterviewStage`** (union de string) — todos os estágios: `GREETING`, `DISCOVERING_BUSINESS`,
  `CONFIRMING_BUSINESS`, `MATCHING_PRESET`, `AWAITING_CREATION_TYPE_CONFIRMATION`, `CUSTOMIZATION_INTRO`,
  `CUSTOMIZATION_IN_PROGRESS`, `CUSTOMIZATION_COMPLETED`, `IDENTIFYING_ENTITIES`, `CANNOT_PROCEED`,
  `COMPLETED`.
- **`ProcessableStage`** — subconjunto com prompt dedicado: `DISCOVERING_BUSINESS`,
  `CONFIRMING_BUSINESS`, `IDENTIFYING_ENTITIES`.

### Mensagens e turno
- **`IMessage`** — `{ role: 'user' | 'assistant'; content: string }`.
- **`IInterviewTurnResult`** — retorno de um turno: `response`, `nextStage`, e opcionais `presetKey`,
  `startCustomization`, `sessionId`, `customizationState`.

### Estado de customização
- **`ICustomizableTable`** — `conversationHistory: any[]`, `name`, `key`, `description`,
  `isSelected: boolean`, `isCore: boolean`, `fields?: any[]` (os `ISchemaField` reais do preset).
- **`ICustomizationState`** — `presetKey`, `presetName`, `tables: ICustomizableTable[]`,
  `customMessages: IMessage[]`, `currentAction?: 'adding' | 'removing' | null`, `isCompleted: boolean`.

> ⚠️ Não existem arquivos/interfaces separados `ICustomizationState.ts`, `ICustomizableTable.ts` ou
> `ICustomizableField.ts` (citados em doc antiga). Os campos de uma tabela são `ISchemaField` de
> [`dynamicTables`](../../dynamicTables/README.md), não um tipo próprio.
