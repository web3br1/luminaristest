## FieldCustomizationService

Etapa mais fina da customização: **adicionar/remover/modificar campos** de uma tabela específica, por
conversa com IA, reusando **field presets** quando possível. É um **singleton** — a classe vive em
[`index.ts`](./index.ts) (`FieldCustomizationService.getInstance()`).

> Parte da feature [`interview`](../README.md). Compartilha o `StateManager` do
> [`CustomizationService`](../CustomizationService/README.md).

## API pública

| Método | Papel |
|---|---|
| `getInstance()` | Acesso ao singleton. |
| `processMessage(sessionId, tableKey, userMessage, conversationHistory?)` | Processa um pedido de customização de campos de uma tabela e retorna `IFieldCustomizationResult` (`updatedTable`, `aiMessage`, `modified`, `conversationHistory`). |
| `validateFields(table)` | Sugere melhorias para os campos de uma tabela → `{ suggestions, valid }`. |

## Fluxo de `processMessage`

1. Recupera o estado da sessão (`StateManager.getSessionState`) e localiza a tabela por `tableKey`.
2. Monta o contexto (prompt de sistema com os campos atuais + histórico) e chama
   `openaiService.getChatCompletionWithHistory(..., 'gpt-4-turbo')`.
3. **`FieldIntentParser.parse(...)`** interpreta a resposta em modificações estruturadas
   (`add`/`remove`/`modify`); `hasValidModifications(...)` valida. Se inválido, devolve a tabela
   inalterada com uma mensagem amigável.
4. **`processFieldModifications(...)`** (privado): para adições, usa **`FieldPresetMatcher`** para casar
   o campo pedido com um **field preset** real; se achar, substitui pelo preset (preservando o label
   pedido) e usa `FIELD_PRESET_FOUND_PROMPT`; se não, mantém o campo custom e usa
   `FIELD_PRESET_NOT_FOUND_PROMPT`.
5. **`FieldUpdater.update(table, modifications)`** aplica as mudanças.
6. Se houve mudança, atualiza o `StateManager` (`updateTables`) e acrescenta as mensagens ao
   `conversationHistory` da tabela.

## Componentes do módulo

- **`FieldIntentParser`** — interpreta a intenção do usuário em modificações estruturadas.
- **`FieldUpdater`** — aplica as modificações na `ICustomizableTable`.
- **`FieldPresetMatcher`** — `findFieldPreset(description, existingFields)` casa um campo com um field
  preset de `dynamicTables`.
- **`PromptConfig`** — templates (`FIELD_CUSTOMIZATION_PROMPT`, `FIELD_PRESET_FOUND_PROMPT`,
  `FIELD_PRESET_NOT_FOUND_PROMPT`, `FIELD_VALIDATION_PROMPT`).
- **`StateManager`** (singleton, compartilhado) — fonte do estado da sessão.

> ⚠️ Não existem `AIFieldInteraction` nem `FieldExtractor` (citados em docs antigas). A IA é chamada
> diretamente via `OpenAIService` e a estruturação fica no `FieldIntentParser`.
