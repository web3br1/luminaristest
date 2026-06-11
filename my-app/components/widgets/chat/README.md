# Chat Widget (Frontend)

Componentes e hooks React da interface de chat usada no dashboard. Conversa com a API do backend
(`/api/chat` para gerar respostas; `chatInstances`/`chatMessages` para persistência).

> É um **widget do dashboard** — instanciado pelo [`dashboard-grid`](../dashboard-grid/README.md).
> Backend correspondente: features `chat`, `chatInstances`, `chatMessages` em `../../../../server`.

## Componentes

| Componente | Papel |
|---|---|
| `ChatWidget` | Widget base de chat; coordena instância, mensagens e input, e **integra com o dashboard** (ver props abaixo). |
| `DocumentChatWidget` | Chat **RAG sobre documentos** (vetores Qdrant) — variante usada pelo grid. |
| `DocumentSelector` | Seleção dos documentos que entram no contexto RAG (`DocumentOption[]`). |
| `ChatHeader` · `ChatMessageList` · `ChatMessageInput` | Subcomponentes da UI. |

### Props de integração do `ChatWidget`
```ts
{
  id: string;                         // widgetInstanceId
  onClose?: (id) => void;
  onInstanceActivated: (chatId) => void;
  onInstanceDeactivated: (chatId) => void;
  activeChatInstanceIds: ReadonlySet<string>;   // coordenação multi-chat no grid
  onDocumentAnalysis?: (documents: DocumentOption[]) => void;
  onGenerateChart?: (query, chatInstanceId, documentIds?) => void;  // gerar gráfico a partir do chat
  lastAssistantMessage?: { chatInstanceId; message; timestamp } | null;
}
```
Essas props permitem que o `dashboard-grid` orqueste **várias instâncias de chat** e dispare a geração
de gráficos (Analytics) a partir da última resposta do assistente.

## Hooks (`hooks/`)

| Hook | Papel |
|---|---|
| `useChatInstance` | Cria/resolve a instância de chat do widget (por `widgetInstanceId`). |
| `useChatInstances` | Lista/gerencia instâncias do usuário. |
| `useChatMessages` | Histórico de mensagens da instância (persistência via backend). |
| `useChatInput` | Estado do campo de entrada e envio. |

## Modos de resposta (backend)

A geração de resposta acontece no backend (`/api/chat`) em **dois modos**: **RAG** (com `documentIds`,
busca vetorial) e **Agent ERP** (sem documentos, com ferramentas). O front seleciona o modo conforme há
documentos selecionados no `DocumentSelector`. Ver
[`server/.../features/chat`](../../../../server/src/features/chat/README.md).

## Estrutura de arquivos

```
chat/
├── components/  ChatWidget · DocumentChatWidget · DocumentSelector · ChatHeader/List/Input
├── hooks/       UseChatInstance · UseChatInstances · UseChatMessages · UseChatInput
└── types/       chat.types.ts
```
