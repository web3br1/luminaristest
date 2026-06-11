# Feature: Chat Messages

## Visão Geral

A feature `chatMessages` é uma **feature de entidade** responsável pela **persistência das mensagens**
de uma conversa (o histórico trocado entre usuário e assistente). É um CRUD escopado por
`ChatInstance` e por usuário.

> **Importante (mudança de responsabilidade):** a **geração de respostas da IA NÃO acontece aqui**.
> Ela foi centralizada no endpoint **`/api/chat`** (feature [`chat`](../chat/README.md)). O
> `ChatMessageService` apenas **persiste e lê** mensagens — não invoca OpenAI nem orquestra RAG/Agent.

## Estrutura de Arquivos

```
chatMessages/
├── dtos/          ChatMessageDto.ts          # schemas Zod (Create/Update)
├── models/        ChatMessage.model.ts
├── policies/      ChatMessagePolicy.ts (+ interface)
├── repositories/  ChatMessageRepository.ts (+ interface)
└── services/      ChatMessageService.ts
```

## API do serviço (`ChatMessageService`)

| Método | Responsabilidade |
|---|---|
| `createMessage(data, userContext)` | Persiste uma mensagem após validar a propriedade da `ChatInstance`. **Não gera resposta de IA.** |
| `getMessageById(id, userContext)` | Lê uma mensagem (com checagem de acesso). |
| `getMessagesByInstance(chatInstanceId, userContext)` | Lista o histórico de uma instância. |
| `updateMessage(id, data, userContext)` | Atualiza uma mensagem existente. |
| `deleteMessage(id, userContext)` | Remove uma mensagem. |

Helper interno: `enrichMessageWithUserId(message)` — resolve o `userId` a partir do `chatInstanceId`.

## DTOs

- **`CreateChatMessageDto`** — `content`, `chatInstanceId`, `role` (e campos auxiliares da mensagem).
- **`UpdateChatMessageDto`** — atualização parcial.

A validação usa `safeParse` dos schemas Zod no serviço/controller.

## Autorização

A policy garante que o usuário só acesse mensagens de instâncias que lhe pertencem: o serviço compara
`chatInstance.userId` com o `userContext.userId` antes de qualquer operação.

## Interação com outras features

- **[`chatInstances`](../chatInstances/README.md) (dependência):** toda mensagem pertence a uma
  `ChatInstance`; a posse da instância governa o acesso.
- **[`chat`](../chat/README.md) (separada):** é quem **gera** a resposta do assistente (modos RAG e
  Agent ERP). O frontend tipicamente: cria a mensagem do usuário aqui → chama `/api/chat` para a
  resposta → a resposta é persistida como nova mensagem.
