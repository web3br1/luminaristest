---
name: chat-domain-generator
description: Adiciona intenções, ferramentas (tool calls) ou modos ao agente AI Luminaris — cobre os dois modos de chat (RAG e AGENT ERP) e o fluxo de proposta/confirmação de ações
argument-hint: "[nova-tool-name] [acao: criar-tool|personalizar-prompt|sincronizar-kg|novo-modo]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Chat Domain Generator

## Purpose

Orquestra modificações no domínio de chat do Luminaris: adicionar ferramentas ao agente ERP, customizar prompts do sistema, integrar o KnowledgeGraph, ou modificar o pipeline RAG. É a skill correta quando o usuário pede "quero que o agente consiga fazer X" ou "adicionar intenção Y ao chat".

## When to use

- Adicionar nova capacidade ao agente (nova tool call OpenAI)
- Modificar o que o agente sabe sobre as tabelas (KnowledgeGraph)
- Customizar RAG_SYSTEM_PROMPT ou AGENT_SYSTEM_PROMPT
- Adicionar novo tipo de resposta além de TEXT e ACTION_PROPOSAL
- Adicionar nova ação ao fluxo de proposta → confirmação → execução
- Criar novo modo de chat além de DOCUMENT e GENERIC

## Inputs

- `$ARGUMENTS[0]`: nome da nova tool em snake_case (ex: `send_notification`) — se ação for `criar-tool`
- `$ARGUMENTS[1]`: tipo de ação — `criar-tool` | `personalizar-prompt` | `sincronizar-kg` | `novo-modo`

## Architecture — dois modos, um dispatcher

```
ChatService.generateResponse(request)
  │
  ├── confirmedProposalId? ──→ agentService.executeProposal() ──→ { type: 'TEXT' }
  │
  ├── documentIds.length > 0? ──→ MODO RAG (Qdrant)
  │     ownership check → rewriteQueryWithHistory → embedText
  │     → vectorRepository.search(embedding, 10, docIds, userId)
  │     → getChatCompletion(context + query, RAG_SYSTEM_PROMPT)
  │     → { type: 'TEXT', sourceDocuments: [...] }
  │
  └── documentIds vazio? ──→ MODO AGENT ERP (tool calls)
        agentService.getTools(userId) + knowledgeGraphService.getGraphPrompt(userId)
        → messages: [AGENT_SYSTEM_PROMPT, knowledgeGraphPrompt, ...history, query]
        → loop até 5 iterações de tool calls
        → result.status === 'PROPOSED'? ──→ { type: 'ACTION_PROPOSAL', proposal: {...} }
        → sem mais tool calls? ──→ { type: 'TEXT', answer: '...' }
```

## Repository patterns to inspect first

```
server/src/features/chat/services/LuminarisAgentService.ts   ← getTools(), handleToolCall(), executeProposal()
server/src/features/chat/services/ChatService.ts             ← dispatcher, RAG pipeline, agent loop
server/src/features/chat/services/KnowledgeGraphService.ts   ← syncGraph(), getGraphPrompt()
server/src/features/chat/repositories/                       ← IKnowledgeGraphRepository, ActionProposalRepository
server/prisma/schema.prisma (modelo ActionProposal)          ← id, userId, action, tableName, tableLabel, data, status
```

## Generation contract — adicionar nova tool call

### 1. Declarar a tool em `LuminarisAgentService.getTools()`

```typescript
// server/src/features/chat/services/LuminarisAgentService.ts

async getTools(userId: string): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
  return [
    // ... ferramentas existentes ...
    {
      type: 'function',
      function: {
        name: 'send_notification',       // snake_case obrigatório
        description: 'Envia notificação para um usuário do sistema.',
        parameters: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'ID do usuário destinatário' },
            message: { type: 'string', description: 'Conteúdo da notificação' },
          },
          required: ['userId', 'message'],
        },
      },
    },
  ];
}
```

### 2. Implementar o handler em `handleToolCall()`

```typescript
async handleToolCall(user: UserContext, toolName: string, args: any): Promise<any> {
  switch (toolName) {
    // ... cases existentes ...
    case 'send_notification': {
      // Ações de leitura: retornar resultado direto
      const result = await this.notificationService.send(args.userId, args.message);
      return { status: 'OK', result };
    }
    case 'request_record_creation': {
      // Ações de escrita: SEMPRE via ActionProposal — nunca escrever direto no DB
      const proposal = await this.actionProposalRepository.create({
        userId: user.id,
        action: 'CREATE',
        tableName: args.tableName,
        tableLabel: args.tableLabel,
        data: args.data,
        status: 'PENDING',
      });
      return { status: 'PROPOSED', proposalId: proposal.id };
    }
    default:
      throw new AppError(`Tool desconhecida: ${toolName}`);
  }
}
```

### 3. Registrar o novo serviço em `lib/factory.ts` (se necessário)

```typescript
// server/src/lib/factory.ts
private notificationService: INotificationService;

constructor() {
  // ... deps existentes ...
  this.notificationService = new NotificationService(this.userRepository);
  this.agentService = new LuminarisAgentService(
    this.actionProposalRepository,
    this.dynamicTableRepository,
    this.dynamicTableRecordService,
    this.notificationService,  // ← nova dep injetada
  );
}
```

## Generation contract — fluxo ActionProposal (ações de escrita)

O fluxo é assíncrono em duas etapas. Nunca escrever no DB diretamente em `handleToolCall()`.

```
1. handleToolCall() cria ActionProposal com status=PENDING → retorna { status: 'PROPOSED', proposalId }
2. ChatService detecta status PROPOSED → busca proposta → retorna { type: 'ACTION_PROPOSAL', proposal: {...} }
3. Frontend exibe modal com os dados da proposta
4. Usuário confirma → frontend envia request com { confirmedProposalId: proposal.id }
5. ChatService chama agentService.executeProposal(user, confirmedProposalId)
6. executeProposal() executa a ação real (CREATE ou UPDATE) e marca status=EXECUTED
7. Retorna { type: 'TEXT', answer: 'Pronto! ID: ...' }
```

**Tipos de resposta do ChatService:**

```typescript
// ChatResponse shape
{ type: 'TEXT', answer: string, sourceDocuments: [] }
{ type: 'TEXT', answer: string, sourceDocuments: SourceDocument[] }  // modo RAG
{ type: 'ACTION_PROPOSAL', answer: string, proposal: {
    id: string,
    action: 'CREATE' | 'UPDATE',
    tableName: string,
    tableLabel: string,
    data: Record<string, any>
  }, sourceDocuments: [] }
```

## Generation contract — customizar prompts do sistema

```typescript
// server/src/features/chat/services/ChatService.ts

const RAG_SYSTEM_PROMPT = `
Você é um assistente especializado que responde APENAS com base nos documentos fornecidos.
// ... regras de RAG ...
`;

const AGENT_SYSTEM_PROMPT = `
Você é o Luminaris, um assistente ERP inteligente.
// ... instruções de uso das ferramentas ...
// Ao adicionar nova instrução de tool: descrever quando usar, format de args esperado
`;
```

Ambos os prompts são encapsulados via `wrapSystemPrompt(prompt, userId)` — não modificar essa chamada.

## Generation contract — KnowledgeGraph no contexto do agente

O `KnowledgeGraphService.getGraphPrompt(userId)` injeta um segundo system message com o schema de todas as tabelas do usuário. O agente usa isso para saber o que pode consultar.

Para forçar resync do grafo (ao criar novas tabelas dinâmicas):

```typescript
// server/src/features/chat/services/KnowledgeGraphService.ts
async syncGraph(userId: string): Promise<KnowledgeGraphData> {
  const tables = await this.tableRepository.findTablesByUserId(userId);
  const graphData: KnowledgeGraphData = {
    tables: tables.map(t => ({
      id: t.id,
      name: t.name,
      label: t.name,
      category: t.category,
      fields: (t.schema as any).fields.map((f: any) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        relation: f.relation ? { targetTable: f.relation.targetTable, displayField: f.relation.displayField } : undefined,
      })),
    })),
    relations: [] // derivado automaticamente dos campos relation
  };
  await this.repository.saveGraph(userId, graphData);
  return graphData;
}
```

Chamar `syncGraph` sempre que uma tabela dinâmica for criada ou modificada. Verificar se já existe hook em `DynamicTableService` que faz isso.

## Files usually created or changed

```
server/src/features/chat/services/LuminarisAgentService.ts   ← EDIT (nova tool + handler)
server/src/features/chat/services/ChatService.ts             ← EDIT (novo tipo resposta ou prompt)
server/src/features/chat/services/KnowledgeGraphService.ts   ← EDIT (novo campo no graphData)
server/src/lib/factory.ts                                     ← EDIT (nova dep no LuminarisAgentService)
server/prisma/schema.prisma                                   ← EDIT (se precisar de nova model além de ActionProposal)
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd server && npx jest features/chat --passWithNoTests
```

## Anti-patterns

- **Nunca escrever no DB direto em `handleToolCall()`** — toda ação de escrita deve ser via `ActionProposal` para passar pelo fluxo de confirmação no frontend. Escrita direta bypassa o modal de confirmação.
- **Não adicionar tool call sem entry no `getTools()`** — o OpenAI não chamará a função se ela não estiver declarada na lista de tools.
- **Não confundir os dois modos** — RAG é ativado apenas quando `documentIds.length > 0`. O modo AGENT é o padrão sem documentos. Não misturar lógica de um no outro.
- **Não chamar `wrapSystemPrompt` mais de uma vez por sistema prompt** — já está encapsulado dentro de `ChatService.generateResponse`.
- **Não modificar `vectorRepository.search()` para buscar cross-tenant** — a ownership check antes do Qdrant é uma barreira de segurança obrigatória (previne leak de documentos entre usuários).
- **Não incrementar o loop de tool calls além de 5 iterações** — limite existe para evitar loop infinito em casos de tool calls circular. Se 5 não basta, investigar a lógica da tool, não aumentar o limite.
- **Não retornar `ACTION_PROPOSAL` para ações de leitura** — apenas CREATE/UPDATE passam pelo modal. Queries de listagem/busca retornam `TEXT` direto.

## Output format

Ao completar, informar:
1. Nome da tool adicionada e assinatura de parâmetros
2. Se foi via ActionProposal ou leitura direta
3. Se o KnowledgeGraph precisou de resync
4. Resultado de `npx tsc --noEmit` em server/
