# Feature: Chat

## Visão Geral

A feature `chat` é uma **feature de capacidade**: contém a **lógica de geração de resposta** do
assistente (exposta no endpoint `/api/chat`). Não persiste mensagens — isso é responsabilidade da
feature [`chatMessages`](../chatMessages/README.md).

O núcleo é `ChatService.generateResponse(request & { user: UserContext })`, que opera em **dois modos**
conforme a requisição.

## Os dois modos

### 1. RAG — chat sobre documentos
**Gatilho:** a requisição traz `documentIds`.
- Reescreve a última pergunta usando o histórico (`rewriteQueryWithHistory`) para torná-la autônoma.
- Gera o embedding e busca trechos relevantes via `vectorRepository.search(embedding, 10, documentIds)`
  (feature [`documents`](../documents/README.md)).
- Monta o prompt com o contexto recuperado (`RAG_SYSTEM_PROMPT`) e gera uma resposta textual.

### 2. Agent ERP — assistente operacional
**Gatilho:** **sem** `documentIds`.
- Usa `AGENT_SYSTEM_PROMPT` + ferramentas do `LuminarisAgentService.getTools()` e contexto do
  `KnowledgeGraphService` (`getGraphPrompt()`).
- Executa um **loop de tool-calls** (até ~5 iterações): o modelo pede ferramentas, o serviço executa e
  realimenta o resultado, até produzir a resposta final.
- Pode retornar uma **proposta de ação** (`ACTION_PROPOSAL`) em vez de texto; o cliente confirma
  enviando `confirmedProposalId` numa chamada seguinte, que então efetiva a ação.

## Tipos de resposta

`ChatResponseDto` distingue:
- **`TEXT`** — resposta textual direta.
- **`ACTION_PROPOSAL`** — uma ação proposta (estrutura própria) aguardando confirmação do usuário.

## Estrutura de Arquivos

```
chat/
├── dtos/          ChatDto.ts                 # ChatRequestSchema / ChatResponseSchema (Zod)
├── services/      ChatService.ts (+ IChatService.ts)
│                  LuminarisAgentService.ts   # ferramentas do agente ERP
│                  KnowledgeGraphService.ts   # contexto/prompt do grafo de conhecimento
└── repositories/  ActionProposalRepository, KnowledgeGraphRepository
```

## Interação com outras features

- **[`documents`](../documents/README.md):** o modo RAG consome o `VectorRepository` (busca vetorial
  filtrada por `documentIds`).
- **[`dynamicTables`](../dynamicTables/README.md) / dados do ERP:** o modo Agent opera sobre os dados do
  usuário via ferramentas do `LuminarisAgentService` e o grafo de conhecimento.
- **[`chatMessages`](../chatMessages/README.md):** **separada** — apenas persiste as mensagens. O fluxo
  típico do cliente é: criar a mensagem do usuário (`chatMessages`) → chamar `/api/chat` para a
  resposta → persistir a resposta como nova mensagem.
