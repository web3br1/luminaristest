---
name: chat-domain-generator
description: Adiciona intenções, ferramentas (tool calls) ou modos ao agente AI Luminaris — cobre os dois modos de chat (RAG e AGENT ERP) e o fluxo de proposta/confirmação de ações
argument-hint: "[nova-tool-name] [acao: criar-tool|personalizar-prompt|sincronizar-kg|novo-modo]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Chat Domain Generator

## Purpose

Orquestra modificações no domínio de chat do Luminaris: adicionar ferramentas ao agente ERP, customizar prompts do sistema, integrar o KnowledgeGraph, ou modificar o pipeline RAG. É a skill correta quando o usuário pede "quero que o agente consiga fazer X" ou "adicionar intenção Y ao chat".

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, no-`any`, soft-delete, money math, testes, verificação) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Chat Domain / Agente**.

## Checklist obrigatório — Chat Domain / Agente

- [ ] **Toda ação de ESCRITA em `handleToolCall()` retorna `{ status: 'PROPOSED', proposalId }`** — cria um `ActionProposal` com `status: 'PENDING'` e **nunca escreve direto no banco**. A escrita real só acontece em `executeProposal()` após confirmação do usuário no frontend. Escrita direta bypassa o modal de confirmação — FAIL.
- [ ] **Ações de LEITURA retornam o resultado direto** (`{ status: 'OK', result }`) — listagem/busca/consulta nunca viram `ACTION_PROPOSAL`.
- [ ] **Toda tool tem entry em `getTools()`** (nome snake_case) **e** case em `handleToolCall()` — sem a declaração o OpenAI não chama; sem o handler dá erro.
- [ ] **Resolver tabelas por `internalName`** (preset key) escopado ao `userId` — nunca por índice `[0]` nem por id presumido; a ordem da API varia.
- [ ] **Isolamento de tenant no RAG é barreira de segurança** — `vectorRepository.search()` com `userId` + `docIds` do dono, ownership check antes do Qdrant; nunca cross-tenant.
- [ ] **Não confundir os modos:** RAG só quando `documentIds.length > 0`; AGENT é o default sem documentos. Não misturar a lógica.
- [ ] **Loop de tool calls limitado a 5 iterações** — não aumentar; se 5 não basta, a tool está mal modelada.
- [ ] **Nova dep de service injetada via factory** no `LuminarisAgentService` (construtor) — nunca `new Service()` dentro do agente.
- [ ] **Ação que toca módulo Prisma first-class (contábil/folha/fiscal) chama o serviço próprio do módulo — não vira escrita direta misturando os dois mundos.** O agente opera sobre DynamicTable via `ActionProposal`; uma ação com invariante passa pela API do módulo (que aplica policy/invariante), nunca por `prisma.*` ou `PostingService` cravado no handler. Ver §2.1.

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
server/prisma/schema.prisma (modelo ActionProposal)          ← id, userId, action, tableId, tableName, tableLabel, data, status
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/chat/services/LuminarisAgentService.ts` — agente perfeito: em `handleToolCall()`, toda ação de ESCRITA (`request_record_creation`/`request_record_update`) cria um `ActionProposal` com `status: 'PENDING'` via `proposalRepository.create()` e retorna `{ status: 'PROPOSED', proposalId }` — **nunca** escreve no banco direto; a escrita real só ocorre em `executeProposal()` após confirmação. Ações de LEITURA (`query_table_data`/`get_table_schema`) retornam o resultado direto. Resolve tabelas via `dynamicTableService.getTableById` escopado ao `user`, e deps entram pelo construtor (factory). Pareie com `ChatService.ts` (dispatcher dos dois modos: RAG quando `documentIds.length > 0`, AGENT senão; loop de tool calls limitado a 5; ownership check antes do Qdrant). Leia-os ANTES de gerar.

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
- **Não resolver tabela por índice `[0]` nem id presumido** — resolva por `internalName` (preset key) escopado ao `userId`; a ordem da API varia e quebra silenciosamente.
- **Não injetar service com `new` dentro do agente** — toda dep entra pelo construtor do `LuminarisAgentService` via factory.
- **Não injetar serviço Prisma first-class para escrever invariante direto no `handleToolCall`** — ação de módulo contábil/folha/fiscal vai pela API própria do módulo (que garante o invariante), pelo mesmo fluxo proposta→confirmação. Misturar os dois mundos no agente é o anti-padrão §2.1.

## Output format

Ao completar, informar:
1. Nome da tool adicionada e assinatura de parâmetros
2. Se foi via ActionProposal ou leitura direta
3. Se o KnowledgeGraph precisou de resync
4. Resultado de `npx tsc --noEmit` em server/
