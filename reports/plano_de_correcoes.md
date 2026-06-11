# Plano de Correção — Luminaris (modelo Orquestrador / Executor / Revisor)

> Derivado de `auditoria_consolidada.md` §20–§21. Cobre os 38 riscos (R1–R38) / 40 recomendações + Onda 0 de fundação.
> **Fonte da verdade:** toda correção aponta para `arquivo:linha` da auditoria. Nenhum item inventa escopo novo.
> Data: 2026-06-11.

---

## Papéis

| Papel | Responsabilidade | Não faz |
|---|---|---|
| **Orquestrador** | Sequencia ondas; abre/fecha **gates** entre elas; valida dependências; distribui itens em paralelo onde não há conflito de arquivo; consolida status; decide **rollback** e re-trabalho. | Não escreve código. |
| **Executor** | Aplica a mudança de um item dentro do escopo definido, em branch/worktree próprio; escreve o teste de regressão junto quando aplicável; entrega diff + nota de verificação. | Não amplia escopo; não mexe em item de outro Executor. |
| **Revisor** | Valida cada item contra o **critério de aceite**; roda a suíte; confere ausência de regressão e de vazamento de escopo; aprova ou devolve com motivo. | Não corrige (devolve ao Executor). |

### Regras de orquestração (invariantes)
1. **Gate por onda:** nenhuma onda começa antes de 100% da anterior aprovada pelo Revisor. Exceção controlada: Onda 2.1 (testes) pode iniciar em paralelo com o fim da Onda 1 — ver §Paralelização.
2. **Conflito de arquivo = serial.** Itens que tocam o mesmo arquivo nunca rodam em paralelo (lista em cada onda).
3. **Sem git, sem execução.** Onda 0.1 é pré-condição absoluta; Orquestrador bloqueia tudo até o baseline commitado.
4. **Teste-primeiro nos P0.** Para R1–R3, o Executor escreve o teste que **falha** antes do fix (handoff já valida que o teste pega o bug).
5. **Rollback atômico:** cada item = 1 commit isolado e reversível. Revisor reprova → `git revert` do commit, não emenda.

---

## Onda 0 — Fundação

**Gate de entrada:** nenhum. **Gate de saída:** baseline commitado, tree limpo, 1 PrismaClient.

### Orquestrador
- Serializa 0.1 → 0.2 (0.2 depende do `.gitignore` de 0.1).
- 0.3 e 0.4 podem rodar em paralelo após 0.1 (arquivos distintos).
- Não libera Onda 1 sem `git log` com baseline + tree < 5 MB.

### Executor
| Item | Mudança | Arquivos |
|---|---|---|
| 0.1 | `git init`; `.gitignore` para Express (ignorar `dist/`, `generated/`, `*.db`, `.env`, `node_modules/`); commit baseline | raiz, `server/.gitignore`, `my-app/.gitignore` |
| 0.2 | `git rm --cached` de `dev.db`, `dist/`, DLLs `.tmp` (166 MB); `prisma generate` movido para script de build | `server/package.json` (build), tree |
| 0.3 | Criar `.env.example` (todas as envs do §16, sem valores), `LICENSE`, `README` raiz | raiz, `server/.env.example` |
| 0.4 | Unificar PrismaClient: manter um singleton, remover duplicata; redirecionar imports | `server/src/lib/prisma.ts` vs `server/src/database/prisma.ts` (R35) |

### Revisor
- `git status` limpo; `dev.db`/`dist/`/`generated/` fora do tree; `du` do tree < 5 MB.
- Build regenera `generated/prisma` do zero (apaga e roda build).
- Grep `new PrismaClient` retorna **1** local. App sobe.

---

## Onda 1 — P0 · Integridade / tenant / token (CRÍTICO)

**Gate de entrada:** Onda 0 aprovada. **Gate de saída:** os 7 itens aprovados + testes P0 verdes.

### Orquestrador
- **Conflito:** 1.1, 1.2 e parte do 1.8(log) tocam `DynamicTableService.ts` → **serial**, nesta ordem: 1.2 (sanitização) → 1.1 (transação). 1.5 também sanitiza no `LuminarisAgentService` → depende de 1.2.
- **Paralelos seguros:** 1.3 (Vector/Chat), 1.4 (jwt), 1.5 (UserRepository), 1.6 (ChatInstance), 1.7 (documentsController) — arquivos distintos.
- **Teste-primeiro:** exige de 1.1/1.2/1.3 o teste-que-falha antes do diff.
- Gate de saída cruza com Onda 2.1 (a suíte cobre exatamente estes caminhos).

### Executor — itens
| # | R | Mudança | Arquivo:linha |
|---|---|---|---|
| 1.1 | R1 | Envolver create/update/delete + plugins em `prisma.$transaction`; idempotência em `processSaleStockUpdate` (guarda de transição de status p/ evitar double-apply em retry) | `DynamicTableService.ts:393-398`; `rules/plugins/sales/stockSync.ts:213-251` |
| 1.2 | R2 | Derivar `isSystem` do **call site** (seed/sistema), nunca de `data.__isSystem`; strip de `__isSystem` no input do usuário e da proposal | `DynamicTableService.ts:389,467` |
| 1.3 | R3 | `VectorRepository.search` passa a filtrar `userId`; `ChatService` valida posse dos `documentIds` antes do RAG | `VectorRepository.ts:156-163`; `ChatService.ts:187-216` |
| 1.4 | R4 | `jsonwebtoken ≥9.0.0`; `verify(..., {algorithms:['HS256']})`; exigir `JWT_SECRET` no boot (remover fallback hardcoded); remover/seedar credenciais do `seed.ts` (R16) | `jwt.ts:4,19`; `prisma/seed.ts:13-14` |
| 1.5 | R5 | Na deleção de usuário, delete-by-filter `userId` no Qdrant (reusar `searchVectors`/capacidade existente) | `UserRepository.ts:194-198` |
| 1.6 | R6 | Escopar `getAllInstances` por `userId`; auditar todos os `getAll*` do projeto | `ChatInstanceService.ts:102` |
| 1.7 | R7 | `multer` com `limits.fileSize` + `fileFilter` por magic bytes (PDF/DOCX/XLSX) | `documentsController.ts:11` |

### Executor — testes que acompanham (teste-primeiro)
- 1.1: venda multi-item com falha forçada no item N → asserta **rollback total** (sale + itens + estoque + comissões).
- 1.2: `POST .../data` com `__isSystem:true` no body → registro criado como **não-sistema**.
- 1.3: usuário A faz RAG com `documentId` do usuário B → **0 resultados**.

### Revisor
- Cada teste P0 **falha** no commit anterior ao fix e **passa** depois (prova de cobertura).
- 1.4: token `alg:none` e token assinado com segredo antigo → **401**; boot sem `JWT_SECRET` → processo falha.
- 1.5: após `DELETE /users/:id`, busca vetorial não retorna nada do usuário.
- 1.6: `GET /chat-instances` sem `?type` retorna só o tenant logado (testar com 2 usuários).
- 1.7: upload > limite → 413; tipo não permitido (magic bytes) → 415.
- Sem regressão na venda feliz (smoke).

---

## Onda 2 — P1 · Estrutural, segurança e compliance

**Gate de entrada:** Onda 1 aprovada. **Gate de saída:** 12 itens aprovados.

### Orquestrador
- **2.1 (testes)** é transversal — pode começar no fim da Onda 1 e serve de rede para o resto da Onda 2.
- **Conflito:** 2.2 e 2.9 tocam camada de chat-messages (`ChatMessageService`/controller) → serial.
- **Paralelos seguros:** 2.3 (logs, multi-arquivo mas só remoção), 2.4 (OpenAI), 2.5 (analytics), 2.6 (front `_app`), 2.7 (DateUtils), 2.8 (server.ts), 2.10 (i18n), 2.11 (server.ts + auth), 2.12 (doc). **Atenção:** 2.8 e 2.11 tocam `server.ts` → serial entre si.

### Executor
| # | R | Mudança | Arquivo:linha |
|---|---|---|---|
| 2.1 | R15 | Suíte: rules engine (venda+rollback), isolamento de tenant (RAG/chat-instances/dynamic-tables), auth/middleware, `DataSanitizer` (locale US), `DateUtils` (TZ inválida) | `server/src/**/__tests__` |
| 2.2 | R10 | Paginação obrigatória + teto de `limit` em `/dynamic-tables/:id/data` e `/chat-messages`; corrigir N+1 do `enrichMessageWithUserId` | `DynamicTableRepository.ts:102-107`; `chatMessagesController.ts:8-22`; `ChatMessageService.ts:180-182` |
| 2.3 | R8 | Camada de redação; remover dumps de registro/query/texto integral | `DynamicTableService.ts:673`, `ChatService.ts:86`, `ReportService.ts:69-134`, `chunking.ts:37`, `DashboardLayoutRepository.ts:193,232` |
| 2.4 | R11 | `max_tokens` por chamada; batch de embeddings; rate-limit por usuário; try/catch no `JSON.parse` dos tool args | `OpenAIService.ts`, `LuminarisAgentService.ts` |
| 2.5 | R12,R13 | Corrigir `discoverKPIsAsync` (shape de measure sem `type`); corrigir locale do `DataSanitizer` (`"1,500"`→1500, `"1,234,567"`→1234567) | `AnalyticsService.ts:442`; `DataSanitizer.ts:35` |
| 2.6 | R14 | Remover supressão global de `console.error`/`error`/`unhandledrejection`; isolar `ErrorBoundary` por widget (não global) | `_app.tsx:37-76`; `ErrorBoundary.tsx:31-57` |
| 2.7 | R17 | Validar `x-user-timezone`; fallback UTC em TZ inválida (fix 3 linhas) | `DateUtils.ts:26-44` |
| 2.8 | R19 | `SIGTERM`→`server.close()`+`prisma.$disconnect()`; handlers `unhandledRejection`/`uncaughtException`; `/health` pinga DB/Qdrant | `server.ts:51-58` |
| 2.9 | R24 | Forçar `role:'USER'` no `POST /chat-messages`; bloquear `updateMessage` de reescrever role | `ChatMessageDto.ts:53-55`; `ChatMessageService.ts:101-105,221` |
| 2.10 | R25 | Criar `pt/chatMessages.json`; completar 17 chaves EN faltantes no `common.json`; adicionar `title` em `finance_view.json` EN | `my-app/public/locales/*` |
| 2.11 | R21,R22,R23 | CORS `origin: env.ALLOWED_ORIGIN`; rate-limit login ≤10/min; logout limpa cookie | `server.ts:19`; `authUtilityController.ts` |
| 2.12 | R9 | Doc LGPD dos fluxos OpenAI/Qdrant (operador, aviso de privacidade ao usuário final) | `reports/` + código (consentimento) |

### Revisor
- 2.1: suíte cobre os 5 grupos; CI local (`npm test`) verde nos dois apps.
- 2.2: `?limit=1000000` é capado; 1 query por página (sem N+1 — contar queries).
- 2.3: grep nos arquivos do §17 sem PII (registro/query/texto integral).
- 2.4: resposta de tool malformada → tratada, não 500; embedding em lote.
- 2.5: testes de locale US **e** PT passam; `discoverKPIs` retorna sem throw.
- 2.6: rejection em um widget não derruba a app; erros voltam ao console.
- 2.7: TZ inválida → 200 com UTC, não 500.
- 2.8: `/health` reflete DB/Qdrant down; `SIGTERM` encerra limpo.
- 2.9: `role:'ASSISTANT'` no `POST /chat-messages` → rejeitado/forçado a USER.
- 2.10: UI em PT sem chaves cruas no chat.
- 2.11: >10 logins/min → 429; logout limpa cookie; CORS bloqueia origin estranha.

---

## Onda 3 — P2 · Qualidade e manutenção

**Gate de entrada:** Onda 2 aprovada. **Gate de saída:** 10 itens aprovados (alguns são **decisões** — ver 3.3/3.7).

### Orquestrador
- 3.3 e 3.7 exigem **decisão de produto** (reconectar vs aposentar). Orquestrador abre essas duas como pergunta ao dono antes de o Executor agir.
- **Conflito:** 3.8 (`UserContext` único) toca toda fronteira controller→service — agendar **isolado**, depois de 3.1/3.2 (que mexem em services específicos).
- Paralelos: 3.1, 3.2, 3.4, 3.5, 3.6, 3.9, 3.10 em arquivos distintos.

### Executor
| # | R | Mudança |
|---|---|---|
| 3.1 | R27 | `deleteUserSystem` limpa KnowledgeGraph + ActionProposals; sincronizar grafo em delete/rename de tabela (`dashboardController.ts:337-348`) |
| 3.2 | R29 | `searchDocuments`: `payload.text` → `payload.textContent` (`DocumentService.ts:174`) |
| 3.3 | R26 | **Decisão:** reconectar UI de `structuredData` ou aposentar feature; remover `handsontable`/`@handsontable/react`/`exceljs` mortos + resolver licença |
| 3.4 | R30 | Code splitting: `next/dynamic` nas 9 category-views; mover `MeetingsCalendar` p/ dynamic (`pages/dashboard/index.tsx:8-19`) |
| 3.5 | R31 | A11y: focus trap nos modais; `role="dialog"`/`aria-modal`/ESC consistentes; `aria-invalid` nos campos com erro; `role="button"`+tabIndex nos cards clicáveis |
| 3.6 | R34 | Sincronizar OpenAPI com rotas reais (21→55); corrigir paths errados; padronizar envelope de resposta |
| 3.7 | R28 | **Decisão:** ligar onboarding por IA (criar rota + corrigir regex `/\{[^}]*\}/` + `getChatCompletion` + persistir `StateManager`) ou remover a UI |
| 3.8 | R35 | `UserContext` único entre middleware e services; eliminar `ctx as any` sistêmico (424 ocorrências) |
| 3.9 | R34 | Transação no `installPresetAsSystem`; idempotência no `ProductAutoStockPlugin` |
| 3.10 | R37 | Remover morto/duplicado: `jose`, hooks de chat duplicados, `ChatWidget`, `useGenericChat`, `analytics/kpi/*`, `backfill.sql`, debug em `ProfitKpiProcessor` |

### Revisor
- 3.1: após reset, KnowledgeGraph/proposals limpos; agente não "vê" tabela morta.
- 3.2: `searchDocuments` retorna `chunkText` preenchido.
- 3.4: bundle inicial sem FullCalendar/recharts/dnd-kit (medir com analyzer).
- 3.5: navegação por teclado nos modais e cards; `aria-invalid` presente.
- 3.6: OpenAPI gerado bate com rotas reais; envelope único.
- 3.8: grep `as any` no server cai drasticamente; tipos compilam sem `@ts-ignore`.
- 3.9: install com falha → rollback; estoque não duplica.
- 3.10: build sem imports mortos; dependências removidas do `package.json`.

---

## Onda 4 — P3 · Evolução

**Gate de entrada:** Onda 3 aprovada. **Gate de saída:** por item (são épicos independentes).

### Orquestrador
- 4.1 (Postgres) é o épico-âncora: reforça retroativamente 1.1 (transações) e 4.3 (integridade). Agendar primeiro **ou** mitigar com WAL+`busy_timeout` enquanto não migra.
- Demais itens são independentes — podem virar trilhas paralelas pós-estabilização.

### Executor
| # | R | Mudança |
|---|---|---|
| 4.1 | R20 | Migrar SQLite→PostgreSQL; interino: WAL + `busy_timeout`; remover 2º PrismaClient residual |
| 4.2 | R38 | Retenção/purga de `deletedAt`: definir TTL + job/cron de purga |
| 4.3 | §9 | Integridade referencial real para relações dinâmicas (hoje em JSON) |
| 4.4 | §6 | Cache/snapshot de KPIs (roadmap `kpi_engine_roadmap.md`) |
| 4.5 | R18 | Documento assíncrono: fila/worker + watchdog p/ PROCESSING preso; `extractText` fora do event loop |
| 4.6 | R36 | Design tokens reais (`lumi-*`) substituindo 119 cores hex hardcoded |
| 4.7 | R36 | i18n completo: varredura dos ~60 arquivos com PT hardcoded |
| 4.8 | §14 | Prompt injection: delimitadores no contexto do agente, verificação de intenção, nonce na confirmação |
| 4.9 | §6 | "Custom KPIs" validados + pipeline declarativo (roadmap) |
| 4.10 | §18 | CI/CD + Docker + cobertura mínima como gate de PR |

### Revisor
- 4.1: testes de concorrência sem `database is locked`; transações da Onda 1 passam no Postgres.
- 4.5: documento grande não bloqueia API; PROCESSING preso é recuperado.
- 4.10: PR sem cobertura mínima é barrado no CI.

---

## Paralelização — mapa de conflitos de arquivo

| Arquivo | Itens que tocam | Regra |
|---|---|---|
| `DynamicTableService.ts` | 1.1, 1.2, 2.3 | **Serial:** 1.2 → 1.1 → 2.3 |
| `server.ts` | 2.8, 2.11 | **Serial** |
| `ChatMessageService.ts` | 2.2, 2.9 | **Serial** |
| `LuminarisAgentService.ts` | 1.2(sanit.), 2.4 | **Serial** |
| controllers (`ctx as any`) | 3.8 | **Isolado**, depois dos demais services |
| Tudo o mais | — | Paralelo dentro da onda |

## Sequência macro (gates)

```
Onda 0 ──gate──> Onda 1 ──gate──> Onda 2 ──gate──> Onda 3 ──gate──> Onda 4
                    │                ▲
                    └── 2.1 (testes) pode iniciar aqui ──┘
```

## Definição de "Pronto" (por item)
1 commit isolado e reversível · critério de aceite do Revisor satisfeito · suíte verde · sem ampliação de escopo · diff aponta para o `arquivo:linha` da auditoria.

---
*Plano derivado de `auditoria_consolidada.md`. 41 frentes (Onda 0 + 40 recomendações), 38 riscos cobertos.*
