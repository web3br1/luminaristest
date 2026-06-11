# Área 4 — AI Agent ERP & Chat/RAG (Auditoria Profunda)

> Parte do relatório `auditoria_profunda_areas.md`. Gerado em 2026-06-11.

## 1. LuminarisAgentService — fluxo de mensagem

**Arquivo**: `server/src/features/chat/services/LuminarisAgentService.ts` (206 linhas); instanciado em `lib/factory.ts:149-150` com DynamicTableService + ActionProposalRepository.

**Entrada**: `ChatService.generateResponse()` (`ChatService.ts:84-217`):
1. **Confirmação de proposta** (l.88-105): se `confirmedProposalId` presente → `executeProposal()` e retorna TEXT
2. **Detecção de modo** (l.107-111): `documentIds` presentes → RAG; ausentes → AGENT ERP
3. **Modo AGENT** (l.112-185):
   - `getTools(user.id)` (l.114) + `KnowledgeGraphService.getGraphPrompt(user.id)` (l.115)
   - Mensagens: `AGENT_SYSTEM_PROMPT` + graph prompt + histórico completo + query (l.117-122)
   - **Loop de function-calling com máx. 5 iterações** (l.124-182): `getChatCompletionWithToolsAndHistory(messages, tools)`; tool calls executadas via `handleToolCall()`; resultado `PROPOSED` → interrompe e retorna `type: 'ACTION_PROPOSAL'` com modal (l.145-159); senão adiciona resultado como role 'tool' e re-chama o modelo (l.170)
   - Limite atingido → "O limite de processamento do agente foi atingido." (l.184)
4. **Modo RAG** (l.187-216): reescrita de query com histórico (l.189-191) → embedding (l.192) → `vectorRepository.search(embedding, 10, documentIds)` (l.193) → contexto concatenado (l.194) → `getChatCompletion(finalPrompt, RAG_SYSTEM_PROMPT)` (l.205) → retorna com sourceDocuments

## 2. Prompts de sistema

- **AGENT_SYSTEM_PROMPT** (`ChatService.ts:23-38`): instrui usar o Mapa de Conhecimento; chamar `request_record_creation`/`request_record_update` COM todos os dados; "chamar a ferramenta É o pedido de confirmação" (modal automático); usar exatamente as opções permitidas; IDs para relations; pedir dados faltantes antes de chamar tool; conversar em PT mantendo valores técnicos
- **RAG_SYSTEM_PROMPT** (`ChatService.ts:12-21`): responder estritamente com base no contexto; declarar quando a resposta não está nos documentos
- **Graph prompt** (`KnowledgeGraphService.ts:114-141`): lista tabelas (nome, label, ID), campos com tipos/obrigatoriedade/opções, e relações — **dados do usuário interpolados sem sanitização** (l.120-131)

## 3. Tools expostas ao modelo (5)

| Tool | Parâmetros | R/W | Tenancy | Linhas (LuminarisAgentService.ts) |
|---|---|---|---|---|
| `list_my_tables` | — | READ | ✅ `getTablesForUser(userId)` | 31-34 / 108-110 |
| `get_table_schema` | tableId | READ | ✅ `getTableById(user)` + policy.canView | 39-48 / 113-120 |
| `query_table_data` | tableId, filters | READ | ✅ idem; filtro igualdade simples; máx. 10 registros | 52-63 / 123-131 |
| `request_record_creation` | tableId, data | WRITE diferido | ✅ userId na proposta + getTableById | 68-78 / 134-151 |
| `request_record_update` | tableId, recordId, data | WRITE diferido | ✅ idem; recordId embutido em data.id (l.165) | 83-94 / 154-167 |

## 4. ActionProposal

**Modelo Prisma** (`schema.prisma:221-236`): id, userId (FK cascade), action (CREATE/UPDATE/DELETE), tableId, tableName, tableLabel, data (Json), status (PENDING/EXECUTED/EXPIRED), timestamps; index por userId; tabela `action_proposals`.

**Fluxo**: tool → `proposalRepository.create()` (`ActionProposalRepository.ts:6-17`, status PENDING) → ChatService retorna `ACTION_PROPOSAL` ao front (l.148-159) → usuário aprova → nova request com `confirmedProposalId` → `executeProposal()` (`LuminarisAgentService.ts:178-200`):
- Valida `proposal.userId === user.userId` (l.181) → senão "Unauthorized"
- CREATE → `dynamicTableService.createTableData(user, ...)` (l.186-189); UPDATE → `updateTableData` (l.190-194); **deleta a proposta após execução** (l.188, 193)
- ✅ **Revalidação completa na execução**: `createTableData` (DynamicTableService.ts:385-398) refaz getTableById + policy.canManageData + validação de schema + regras avançadas

**Expiração**: `deleteOldProposals(hours)` existe (`ActionProposalRepository.ts:39-47`) mas **nunca é chamado** — propostas antigas acumulam indefinidamente.

## 5. Modelos, temperatura, tokens, streaming

**CONFIG** (`OpenAIService.ts:4-33`): MAX_TOKENS_PER_REQUEST 100k; MODELS: DEFAULT `gpt-3.5-turbo-0125`, FALLBACK `gpt-4o-mini`, CHAT `gpt-3.5-turbo`, TOOLS `gpt-4o`; MAX_OUTPUT_TOKENS 4096.

| Uso | Modelo | Temp | Max tokens | Linhas |
|---|---|---|---|---|
| Agent ERP (tools) | gpt-4o | não definida (default 1.0) | não definido | OpenAIService.ts:161-178 |
| RAG chat | gpt-3.5-turbo | não definida | não definido | l.84-111 |
| Query rewrite | gpt-3.5-turbo | não definida | não definido | l.79 |
| Detecção tabular | gpt-3.5-turbo | **0** | **5** | l.197-198 |
| Extração estruturada | gpt-3.5-turbo / gpt-4o-mini | **0.1** | **4096** | l.331-332 |

**Streaming**: ❌ não implementado em nenhuma chamada.

## 6. Busca vetorial no chat

`VectorRepository.search()` (l.140-198): filtro Qdrant `should` (OR) por documentIds (l.156-163); **sem filtro por userId**; top-K hardcoded 10 (ChatService:193); **sem threshold de score** — os 10 resultados são usados; payload com textContent, documentId, userId, fileName, chunkId, index. A validação de posse dos documentIds dependeria do controller (não confirmada).

## 7. Histórico de conversa

- DTO: `ChatDto.ts:15` — array `{role: user|assistant|system, content}` opcional
- **Modo RAG**: `rewriteQueryWithHistory()` (`ChatService.ts:59-82`) reescreve a pergunta para ser autônoma (se history > 1)
- **Modo Agent**: histórico completo enviado ao modelo **sem truncamento** (l.120) — risco de exceder contexto/custos
- Acumulado em memória durante loop de tools; **não persistido** pelo backend — front persiste via feature `chatMessages` (chat/README.md:53-55; `ChatMessageRepository` em factory.ts:108)

## 8. Custos / rate limiting

- `estimateTokenCount` = chars/4 (`OpenAIService.ts:222-236`) — só usado em extractStructuredData
- `RequestLock` (l.36-59): dedup por hash de mensagem — **não é rate limiting**
- ❌ Sem rate limiting por usuário/IP, sem retry/backoff, sem contabilidade de custos

## 9. Riscos (AG-1 a AG-8)

| # | Sev. | Risco | Evidência |
|---|---|---|---|
| AG-1 | **Alta** | Prompt injection via nomes de tabela/campo/opções no graph prompt (sem escape) | KnowledgeGraphService.ts:124-130 |
| AG-2 | **Alta** | Prompt injection via conteúdo de documento no contexto RAG | ChatService.ts:194, 204 |
| AG-3 | **Alta** | `search()` sem validação de posse de documentIds (depende do controller) | VectorRepository.ts:158-162 |
| AG-4 | Média | Sem rate limiting → custos OpenAI ilimitados | OpenAIService.ts (ausência) |
| AG-5 | Média | Propostas nunca expiram (`deleteOldProposals` órfão) | ActionProposalRepository.ts:39-47 |
| AG-6 | Média | Histórico sem truncamento → estouro de contexto/custo | ChatService.ts:120 |
| AG-7 | Baixa | Tool schemas sem enforcement de campos obrigatórios (mitigado pela revalidação na execução) | LuminarisAgentService.ts:69-77 |
| AG-8 | OK | Revalidação de permissões na execução de proposta — **implementado corretamente** | DynamicTableService.ts:385, 462; LuminarisAgentService.ts:181 |

## 10. Recomendações

1. Escapar/delimitar dados de usuário no graph prompt e no contexto RAG (ex.: tags XML)
2. Rate limiting por usuário (Redis) + retry com backoff
3. Truncar histórico (últimas N + system)
4. Cron para `deleteOldProposals()`
5. Threshold mínimo de score na busca vetorial
6. Logging de chamadas OpenAI para auditoria de custos
