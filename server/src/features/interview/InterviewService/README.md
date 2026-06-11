## InterviewService

Orquestrador da entrevista guiada por IA. É um **singleton** (`InterviewService.getInstance()`) que
avança a conversa por **estágios** até o usuário ter um preset escolhido e (opcionalmente) customizado.

> Parte da feature [`interview`](../README.md). Tipos em [`../models`](../models/README.md).

## API pública

| Método | Papel |
|---|---|
| `getInstance()` | Acesso ao singleton. |
| `processTurn(stage, messages, presetKey?, sessionId?)` | Processa **um turno** e retorna `IInterviewTurnResult` (`response`, `nextStage`, e opcionalmente `presetKey`/`sessionId`/`startCustomization`/`customizationState`). |

## Dependências (componentes do módulo)

- **`PresetMatcher`** — `findMatchingPreset(messages)` casa a descrição do negócio com um preset;
  `extractTablesInfo(...)` resume as tabelas para a mensagem ao usuário.
- **`StageHandlers`** — `getAiResponseWithHistory(systemPrompt, messages)` e
  `handleCreationTypeConfirmation(messages, presetKey)` (decide criar agora vs customizar).
- **`PromptConfig` (`stageConfig`)** — prompts de sistema dos **estágios processáveis**.
- **`CustomizationService`** (singleton) — delegado quando a conversa entra em customização.

> A base de conhecimento de presets (`presetKnowledgeBase`) vive em
> `features/dynamicTables/presets/ai/`, **não** neste módulo — é consumida via `PresetMatcher` e pelo
> `CustomizationService`.

## Estágios (`InterviewStage`)

Definidos em [`../models/InterviewTypes.ts`](../models/InterviewTypes.ts). `processTurn` trata
explicitamente:

- **`GREETING`** → mensagem inicial; avança para `DISCOVERING_BUSINESS`.
- **`MATCHING_PRESET`** → casa o preset; se achar, monta mensagem amigável e vai para
  `AWAITING_CREATION_TYPE_CONFIRMATION` (com `presetKey`); se não, vai para `IDENTIFYING_ENTITIES`.
- **`AWAITING_CREATION_TYPE_CONFIRMATION`** → delega a `StageHandlers.handleCreationTypeConfirmation`.
- **`CUSTOMIZATION_IN_PROGRESS`** → delega a `CustomizationService.processCustomizationStep(sessionId, ...)`.
- **`CUSTOMIZATION_COMPLETED`** → mensagem de conclusão.
- **Estágios processáveis** (`DISCOVERING_BUSINESS`, `CONFIRMING_BUSINESS`, `IDENTIFYING_ENTITIES`,
  via `isProcessableStage`) → usam o `systemPrompt` do `stageConfig` + histórico para responder.

Demais estados do tipo (`CUSTOMIZATION_INTRO`, `CANNOT_PROCEED`, `COMPLETED`) são transições/terminais
do fluxo. `ProcessableStage` restringe quais estágios têm prompt dedicado.

> O serviço é **stateless por turno**: o frontend envia `stage`/`messages` (e `presetKey`/`sessionId`
> quando aplicável) e recebe o próximo estado. O estado da **customização** vive no `StateManager`
> (ver [`../CustomizationService`](../CustomizationService/README.md)).
