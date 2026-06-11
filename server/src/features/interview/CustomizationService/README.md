## CustomizationService

Gerencia a customização no **nível de tabelas** de um preset escolhido: apresenta as tabelas e
processa pedidos de **adicionar/remover** tabelas durante a conversa. É um **singleton**
(`CustomizationService.getInstance()`).

> Parte da feature [`interview`](../README.md). É chamado pelo
> [`InterviewService`](../InterviewService/README.md) quando a conversa entra em customização.

## API pública

| Método | Papel |
|---|---|
| `getInstance()` | Acesso ao singleton. |
| `generateSessionId()` | Gera um `sessionId` (delega ao `StateManager`). |
| `createCustomizationSession(presetKey, sessionId)` | Cria o estado da sessão a partir do preset real; retorna `ICustomizationState` ou **`null`** se o preset/conhecimento não existir. |
| `generateTablesPresentation(sessionId, isInteractive?)` | Monta a apresentação das tabelas do preset. `isInteractive` muda o tom/forma da mensagem (modo interativo vs. resumo). |
| `processCustomizationStep(sessionId, messages)` | Processa um turno de customização de tabelas; retorna `IInterviewTurnResult`. |

## Dependências (componentes do módulo)

- **`StateManager`** (singleton) — estado das sessões **em memória** (`ICustomizationState` por
  `sessionId`): tabelas, histórico (`customMessages`), `currentAction`, `isCompleted`. Métodos como
  `createSessionState`, `getSessionState`, `updateTables`, `sessionExists`.
- **`TableExtractor`** — `extractTablesFromRealPreset(preset)` deriva as `ICustomizableTable` do preset
  real (via `presetService`).
- **`AIInteractions`** — formula os prompts e fala com o `OpenAIService` para as tarefas de
  adicionar/remover tabela.

> O preset base vem de `dynamicTables`: `presetService.getPresetByKey` (estrutura real) +
> `presetKnowledgeBase` (descrição p/ IA, em `presets/ai/`).

## Máquina de ações (`currentAction`)

Durante a customização, o estado guarda `currentAction: 'adding' | 'removing' | null`. Um turno que
interpreta a intenção do usuário roteia para o processamento de adição ou remoção de tabela e, ao
concluir, **reseta `currentAction` para `null`**. Tabelas marcadas `isCore` não podem ser removidas.

> **Estado é só em memória** — perdido ao reiniciar o servidor. (Uma variante com Redis já existiu, mas
> foi removida; não há `RedisStateManager` no código atual.)

## Customização de campos

A customização **dentro de uma tabela** (campos) é responsabilidade do
[`FieldCustomizationService`](../FieldCustomizationService/README.md), que compartilha o mesmo
`StateManager`.
