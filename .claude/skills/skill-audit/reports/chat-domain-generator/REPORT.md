# Skill Audit Report — chat-domain-generator

- Skill: `chat-domain-generator` (id `SKL-CHAT-DOMAIN`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS. Triggers via router-judge: positivo (nova tool call do agente ERP) + dois negativos —
`trigger-neg-1` **rejeita tarefa puramente visual** (estilizar a bolha de chat / componente React → frontend, não
o domínio de chat) e `trigger-neg-2` vizinho `document-processing` (construir a ingestão/embedding ≠ consumir RAG).
Happy/edge/regression via `batch-eval` (file-scoped). Regras: CHAT-001..010.

## Execução
Geração em contexto limpo (subagente lê SKILL.md + `LuminarisAgentService.ts`/`ChatService.ts`/`factory.ts`);
seções por case-id, arquivos por marcador `// path`. `batch-eval` extrai cada seção mecanicamente do output bruto.
Evidência verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | `LuminarisAgentService.ts`/`ChatService.ts`/`KnowledgeGraphService.ts` existem no path |
| happy-1 read+write tools + factory | PASS | 10/10 (getTools entry, `case`, `status:'OK'`, `PENDING`→`PROPOSED`, internalName, dep via factory, sem React/res.json) |
| edge-1 isolamento de tenant RAG | PASS | 4/4 (modo por `documentIds.length>0`, ownership `userId: user.id` antes do Qdrant, `search(... documentIds, user.id)`) |
| regression-1 escrita via proposal + loop≤5 + §2.1-B | PASS | 4/4 (`PROPOSED`, sem `PostingService`/`prisma.` no handler, `iterations < 5`) |

## DOMAIN-BOUNDARY (CHAT-010, regra nova)
Adicionada a regra de fronteira: serviços de chat (modelo `ActionProposal`, regras de proposta/confirmação,
`LuminarisAgentService`/`ChatService`/`KnowledgeGraphService`) são camada de servidor pura — sem React/JSX
(apresentação) e sem `res.json`/`Response` (transporte). Enforçada nas asserções `absent-code:from 'react'` /
`absent-code:res.json` de happy-1 e no `trigger-neg-1` (visual ⇒ não-ativação).

## Correções de eval (de-brittle, com controle)
- regression-1 `absent:PostingService`→`absent-code:PostingService` (tropeçava no comentário "NÃO chama … PostingService"). Controle CHAT-009a.
- regression-1 `absent:prisma.`→`absent-code:prisma.` (tropeçava no comentário "NÃO chama prisma.*"; `Prisma.JsonValue` maiúsculo não casa). Controle CHAT-009b.
- happy-1 `absent:from 'react'`/`absent:res.json`→`absent-code:*` (boundary comment-insensitive). Controles CHAT-010a/010b.

4 controles discriminam.

## Skipped / blocked
Nenhum.
