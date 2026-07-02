# Planejamento — Buildout Contábil (INCR-1 a INCR-4)

> 🛑 **SUPERSEDED por `PLANEJAMENTO-buildout-contabil-v2.md` (2026-06-27).** Este documento é
> **histórico de raciocínio** — NÃO implementar a partir dele. O corpo dos incrementos abaixo
> contém texto pré-ratificação que contradiz as emendas. A fonte de execução é o **v2** + os
> ADRs ratificados. Mantido só pelo registro das alternativas exploradas.

> **Como este documento nasceu.** Gerado por orquestração multi-agente **read-only**:
> 6 agentes de reconhecimento (cbm + leitura de código, regra CBM-001) levantaram os
> padrões golden-ref, os contratos das skills e o estado real das 4 áreas; 4 personas de
> **arquiteto sênior** (pragmático/YAGNI, mas sem cortar camadas nem invariantes financeiros)
> tomaram as decisões de arquitetura por incremento. Toda afirmação comportamental foi
> confirmada em código (file:line). **Nenhuma linha de código foi tocada.**
>
> Escopo: os 4 incrementos de backend de maior alavancagem (fundação contábil). Frontend
> permanece diferido ([[frontend-deferred-strategy]]). Stack: Express+Prisma, camadas
> estritas, SQLite, contabilidade first-class Prisma.

---

## 0. Princípios fixos de execução (valem para os 4 incrementos)

1. **cbm-primeiro para localizar, código/teste para confirmar** (CBM-001). Cada incremento
   abre com um passo cbm que prova ausência do canônico + enumera o blast radius.
2. **Ratificar ADR ANTES de codar.** Lição do Incremento D (G0 falhou com "ratificado" sem
   ADR em disco). Cada incremento abaixo lista as perguntas + respostas recomendadas.
3. **Camadas são requisito, não over-engineering.** DTO `.strict()`, Policy, Factory,
   registro de rota em 3 toques — nunca inline. Ponytail morde no código solto dentro da
   camada (um guard, um helper), marcado com `// ponytail: <teto>`.
4. **Invariantes financeiros invioláveis:** centavos inteiros, igualdade exata Σd=Σc,
   idempotência por `@@unique` de DB, posted imutável, estorno preserva+linka o original.
5. **Review por agente independente** (worktree isolado) — PASS da mesma sequência que
   implementou é rejeitado ([[reviewer-independence-separate-agent]]).
6. **Gates de fechamento:** `tsc --noEmit` limpo (server + my-app), suíte Jest verde,
   skill-audit `wiring` limpo, `npm run docs:generate` rodado (artefato estático é
   preferido em runtime).

### Sequenciamento e dependência entre incrementos (crítico)

A ordem **não é arbitrária** — `PostingService` é o ponto onde 3 dos 4 incrementos convergem:

| Ordem | Incremento | Efeito no construtor de `PostingService` |
|---|---|---|
| 1º | **INCR-1 Períodos** | adiciona 5º arg (`IAccountingPeriodRepository`) + gate em postEntry/reverseEntry |
| 2º | **INCR-2 Auditoria** | adiciona 6º arg (`IAuditRepository`) + append in-tx; **passa a auditar o close/reopen do INCR-1** |
| 3º | **INCR-3 Numeração** | **NÃO toca `PostingService`** — atribuição vive em `JournalEntryRepository.create` (cobre post e reverse de graça) |
| 4º | **INCR-4 BP/DRE** | **NÃO toca `PostingService`** — métodos read-only em `AccountingReportService`, zero factory |

> Fazer INCR-1 → INCR-2 nesta ordem permite que a auditoria (INCR-2) já capture os eventos
> de fechamento de período (INCR-1). INCR-3 e INCR-4 são independentes entre si e podem ir
> em qualquer ordem depois — nenhum toca o motor de postagem.

---

## 1. Padrões golden-ref (o que reusar, com evidência)

| Padrão | Onde (evidência) | Como reusar |
|---|---|---|
| **Factory (God-object, 5 toques)** | `lib/factory.ts:96-376` | Novo service = 5 edições: import (~L49) → campo no map de services (~L151) → instanciar no construtor (deps inter-dependentes como `const` antes do literal `this.services`) → getter arrow (~L357). Repo: 4 toques (L15-17/L178-180). **tsc pega import faltante, NÃO pega getter faltante.** |
| **Policy** | `features/accounting/policies/AccountingPolicy.ts:9` | 3 booleans `canManage/canPost/canRead(scope)`, stateless. Service chama no topo de cada método e lança `ForbiddenError`. Adicionar método novo (ex.: `canClosePeriod`) — **não criar policy nova.** |
| **Repo + tx** | `PostingRepository.ts:56-58` | `prisma.$transaction` aberto NO REPO, exposto como `runTransaction<T>(fn)`. Service compõe writes atômicos passando `tx` no último param opcional de cada método (`(tx ?? prisma).model.*`). **Nunca `new TransactionalRepository` num service** ([[orchestration-service-tx-repo-smell]]). |
| **Workflow-transition (golden ref de máquina de estado)** | `SalesCancellationService.ts:26`, `RegisterPaymentService.ts:28`, `CrmPipelineService.advanceStage` | Guard de estado-fonte → write de whitelist estrita → bridge pós-commit best-effort. Modelo para close/reopen e aprovação — adaptando o write para Prisma first-class (não DynamicTable). |
| **Choke-point de postagem** | `PostingService.postEntry:103`, `reverseEntry:213` | Sequência: `canPost` → `ensureChartOfAccounts` → invariante Σd=Σc (`:114-116`) → idempotência por source → `resolveLeafAccount` → `runTransaction`. **`:116` é o ponto de inserção do gate de período** (depois do balance, antes da tx). |
| **Agregação reusável (trialBalance)** | `AccountingReportService.ts:70`, `PostingRepository.groupByAccount:39-54` | `groupByAccount(scope, ['Posted','Reversed'])` — **inclui Reversed** para o estorno netar a zero. BP/DRE reusam isto + agrupam por `account.nature`; só falta predicado de data para relatório por período. |
| **OpenAPI (armadilha silenciosa)** | `routes/docs.ts:28`, `scripts/generate-openapi.js:25` | Glob varre **só** `controllers/**` e `routes/**`. `@openapi` em `dtos/` é **morto**. Path block vai em `docs.paths.ts`. `public/openapi.json` (committed) é preferido em runtime → rodar `npm run docs:generate` ou fica stale. |
| **Testes** | `__tests__/PostingService.test.ts:22`, `AccountingReportService.test.ts:15` | `buildService(over={})` mocka repos+policy (não queries Prisma). Service com tx: `jest.mock` do singleton prisma como `{$transaction:(fn)=>fn(txHandle)}`, mantendo `generated/prisma` real para P2002 genuíno. |

---

## 2. Contratos das skills (ordem e como cada uma é usada)

**Ordem canônica de geração:**
`prisma-model → dto → repository → policy → service → controller → route → workflow-transition → test-suite → api-contract-sync → job`

**Registro de rota = 3 toques** (não 2; tsc só pega o 1º):
1. `[ROUTE-001]` `routes/index.ts` — import + `router.use('/<recurso>', router)`.
2. `[ROUTE-002]` `middleware/auth.ts` — `'/api/<recurso>'` em `protectedApiPaths`. **Pular = 401 silencioso com token válido** (tsc não pega).
3. `[ROUTE-003]` `routes/docs.paths.ts` — bloco `@openapi paths:` por endpoint. **Pular = endpoint ausente do doc** (tsc verde). Validar: `grep -c "/api/<recurso>" docs.paths.ts > 0`.

| Skill | Camada | Produz | Gotchas-chave |
|---|---|---|---|
| `backend-prisma-model-generator` | Schema Prisma | model + migração + client regen | **DESTRUTIVO** (migrate dev); `id cuid`; `createdAt/updatedAt`; `deletedAt?` p/ soft-delete; `userId` + `onDelete:Cascade`; `@@index([userId])`+`([deletedAt])`. |
| `backend-dto-generator` | DTO Zod + model | `<R>Dto.ts` + `<R>.model.ts` | Update = `Create.partial()`; `@openapi` no DTO é **morto** (glob); zero `z.any()`; datas `z.coerce.date()`; condicional via `.superRefine`. |
| `backend-repository-generator` | Repo (único com `prisma.*`) | `I<R>Repository.ts` + impl | `deletedAt:null` em todo find; soft-delete via update; `findAll` em `$transaction`; importar de `generated/prisma`; **zero lógica de negócio**. |
| `backend-policy-generator` | Policy boolean | `I<R>Policy.ts` + impl | `can*` retorna **só boolean** (zero throw — o service lança); `canListAll` = admin; ownership inclui branch admin; **zero acesso a dados**. |
| `backend-service-generator` | Service (lógica) | service + **edita factory** | policy-check antes de qualquer acesso; erros tipados de `lib/errors`; cross-tenant = `NotFoundError` (anti-enumeração); DI por construtor; **zero `prisma.*`/Express**; §2.1: nunca injetar service Prisma first-class junto de DynamicTableService. |
| `backend-controller-generator` | Controller HTTP | `<r>Controller.ts` | `Schema.safeParse(req.body)` antes de tudo; `getUserContextFromRequest`; `getFactory().getXService()` (nunca `new`); `handleApiError(error,res)`; `return` antes de cada `res.json`. |
| `backend-route-generator` | Route + 3 toques | route + index + auth + docs.paths | ver "3 toques" acima; zero lógica na rota; não inventar nomes de handler. |
| `backend-workflow-transition-generator` | Máquina de estado sobre DynamicTable | service+dto+controller+route+factory+test | orquestração sem repo/policy próprios; tudo em `runInTransaction`; resolver tabela por `internalName` nunca `[0]`; §2.1: nunca injetar PostingService p/ "também lançar". |
| `backend-test-suite-generator` | Jest (back) / Vitest (front) | `__tests__/*.test.ts` | `clearAllMocks`; **sem DB real** (repos mockados); dinheiro `toBeCloseTo(v,2)`; cross-tenant = `NotFoundError`; `referenceDate` fixo. |
| `api-contract-sync-generator` | Sync DTO↔serviço front | edita `my-app/lib/services/<r>.service.ts` | espelha (não importa de `server/`); tipos locais; **não toca OpenAPI**. |
| `job-generator` | Job/seed (Prisma direto) | `jobs/<J>.ts` / seed | idempotência; registrar no `server.ts` se agendado; documentar bypass de factory; resolver por `internalName` nunca `[0]`. |

---

## 3. Os quatro incrementos (decisão-completos)

### INCR-1 — Períodos Contábeis + Gate de Fechamento

> ⚠️ **Ratificado com emendas (2026-06-27) — [ADR-INCR1](../adr/ADR-INCR1-accounting-periods.md) prevalece sobre o texto abaixo.** Emendas que mudam este plano: (1) gate **autoritativo dentro da transação** (não só preflight) — o `@@unique` não fecha o TOCTOU; (2) erro específico `ACCOUNTING_PERIOD_NOT_OPEN`, bridge dá skip **só** nesse code; (3) período ausente **bloqueia, não é semeado pelo post** (seed só em setup/admin); (4) **`AccountingPeriodTransition` entra no INCR-1**; (5) `status` = **enum Prisma**; (6) `reverseEntry` recebe **`reversalPostingDate` explícito**; (7) `SOFT_CLOSED` **não permite ajuste** no MVP.

**Objetivo.** `AccountingPeriod` first-class Prisma (`FUTURE|OPEN|SOFT_CLOSED|HARD_CLOSED`)
por `userId+unitId+year+month`; `PostingService` (postEntry+reverseEntry) vira o choke-point
único que resolve a data → período (tz-correto) e rejeita escrita em período não-OPEN.
Close/reopen = máquina de estado autorizada.

**Decisões de arquitetura**
- **Gate DENTRO de `PostingService`, não no controller** — só assim cobre `AccountingSyncService` e os bridges pós-commit (caminhos de maior volume). Controller-only deixaria o sync escrever em período fechado.
- **`AccountingPeriod` é Prisma first-class, não DynamicTable** — invariante regulatório (imutabilidade de período fechado).
- **Período DERIVADO da data** (year+month em `scope.timeZone`), **sem FK `periodId` em JournalEntry** — zero migração de backfill em journal_entries; período é função pura de (data, tz).
- **Explicit-open** é o default: FUTURE e ausente **bloqueiam**; só OPEN aceita post. `resolveOrCreate` semeia FUTURE (não OPEN). *(ADR — downgrade para implicit-open documentado se houver fricção de onboarding.)*
- **SOFT vs HARD_CLOSED**: ambos bloqueiam post igualmente; diferem só em reabertura (SOFT→OPEN permitido, HARD terminal). Estorno é gated no período da **data do estorno** (atual), não no do lançamento original.
- **Close/reopen** segue o golden ref `SalesCancellationService.transition` sobre Prisma first-class; nova policy `canClosePeriod` (distinta de `canPost`).
- **Bridges/reconcile** tratam rejeição de período fechado como **não-fatal: skip+log**, nunca retry-loop (período HARD_CLOSED looparia o job para sempre).

**ADRs a ratificar (antes do código):** explicit vs implicit-open · SOFT vs HARD diferem só em reabertura · estorno gated no período atual · reconcile skip+log · granularidade year+month (sem 13º período) · gate dentro de PostingService.

**Modelo de dados** — `AccountingPeriod` (`@@map accounting_periods`):
`id, userId(FK Cascade), unitId, year Int, month Int(1..12), status String @default('FUTURE'), openedAt?, openedById?, closedAt?, closedById?, createdAt, updatedAt`.
Constraints: `@@unique([userId,unitId,year,month])` (fecha TOCTOU, idioma P2002 do `ensureChartOfAccounts`) · `@@index([userId,unitId,status])` · status validado por Zod enum (SQLite, sem enum nativo) · **sem** `periodId` em JournalEntry.

**Plano de skills (qual, como, onde)**
1. **codebase-memory** — provar ausência de `AccountingPeriod`; `trace_path` in-degree de postEntry/reverseEntry p/ listar todo caller que precisa de período OPEN nos testes.
2. **prisma-model** — model `AccountingPeriod` após `Posting` (~L366) + migração.
3. **repository** — `IAccountingPeriodRepository`+impl espelhando `IJournalEntryRepository`: `findByYearMonth`, `resolveOrCreate` (race-safe + P2002), `setStatus` (updateMany scoped + NotFoundError), `list`. tx threaded.
4. **policy** — `canClosePeriod(scope)` em `AccountingPolicy` (não nova classe).
5. **service (novo `PeriodService`)** — `open/close(soft|hard)/reopen/list`, cada um: gate → resolve → asserir transição legal (ValidationError) → setStatus → log. Idioma `SalesCancellationService.transition`.
6. **service (editar `PostingService`)** — +5º arg `IAccountingPeriodRepository`; gate em postEntry **após `:116`** antes de `resolveLeafAccount` (`getZonedParts(date, scope.timeZone)` → se `status!=='OPEN'` → ValidationError); gate simétrico em reverseEntry (~`:248`) no período da data do estorno.
7. **dto** — `ClosePeriodSchema{unitId,year,month,mode:enum}`, `ReopenPeriodSchema`, `PeriodStatus enum`. `.strict()`, convenções `PostingDto`.
8. **controller** — `closePeriod/reopenPeriod/listPeriods` em `accountingController.ts` (idioma `:17-31`). `@openapi` no controller.
9. **route** — 3 toques: `POST /accounting/period/close`, `/reopen`, `GET /accounting/periods`.
10. **service (factory)** — wiring 5 toques: import + maps + instanciar repo + passar como 5º arg a `new PostingService(...)` + construir `PeriodService` const + getters.
11. **test-suite** — `PeriodService.test.ts` (transições legais/ilegais, HARD reopen rejeitado) + **estender `PostingService.test.ts`** (mock do period repo default OPEN para não quebrar os testes existentes; novos testes de post/reverse em SOFT/HARD/FUTURE → ValidationError) + ajustar testes de sync/bridge.
12. **api-contract-sync** — `npm run docs:generate` + i18n pt+en das novas mensagens.

**Invariantes/gates:** imutabilidade de período fechado no choke-point único · legalidade da máquina de estado · TOCTOU via `@@unique` real · derivação tz-correta · invariantes financeiros intactos (gate inserido **após** o balance) · bridges não-fatais · tsc/test/wiring/openapi.

**Aceite:** #3 (todo lançamento tem período resolvido+OPEN) · #4 (post/reverse em não-OPEN lança antes da tx, testado nos 3 estados) · close/reopen autorizado · #9 (open/close/reopen carimbam ator+timestamp+log) · cobertura de sync/bridge (skip+log) · #13 N/A (deferido p/ INCR-4).

**Ponytail (com teto):** derivar período sem FK (teto: se admin puder re-atribuir período independente da data → precisa FK+backfill) · gate boolean único (teto: post privilegiado em SOFT → muda só a condição do gate) · status String (teto: Postgres → enum nativo) · `canClosePeriod = !!actorUserId` (teto: units compartilhadas → check de membership).

**Riscos:** factory God-object (getter compila sem ser chamado — confiar no skill-audit, não no tsc) · mudança de aridade 4→5 do construtor rippla em todo test builder · loop de reconcile mal posicionado pode dropar receita silenciosamente OU loopar (skip+log precisa registrar no relatório) · fricção de onboarding com explicit-open (primeiro post de tenant novo rejeitado) · off-by-one mês em `getZonedParts` (teste de fronteira 31/12 23h BRT) · i18n parity.

---

### INCR-2 — AuditEvent append-only (hash-chain)

> ⚠️ **Ratificado com emendas (2026-06-27) — [ADR-INCR2](../adr/ADR-INCR2-audit-trail.md) prevalece.** Emendas: (1) **sem FK cascade** para usuário (`scopeUserId` escalar); (2) **auditar eventos de período** (`period.*`); (3) é **tamper-evident, não tamper-proof** (threat model documentado); (4) canonical com **`eventId`, `hashVersion`, `canonicalVersion`, `createdAtISO` gerado pela app**; (5) payload = **string canonical allowlistada**; (6) concorrência via **`AuditChainHead`** ou retry da tx — **P2002 nunca engolido**; (7) **`verifyAuditChain` nasce no INCR-2**; (8) **`seq BigInt`**.

**Objetivo.** Tabela `AuditEvent` first-class que registra toda mutação crítica
(`entry.posted`, `entry.reversed`, `account.created`, `account.deleted`) como evento
append-only, hash-encadeado por tenant, escrito na **MESMA tx** da mutação → commit atômico
e à prova de adulteração. Sem caminho de update/delete.

**Decisões de arquitetura**
- **`AuditEvent` Prisma first-class** — invariante de integridade (chain + append-only). `createdById/postedById` (mutáveis, mesma linha) não satisfazem.
- **`append(data, tx)` exige `Prisma.TransactionClient` — não há append fora de tx.** Reusa `PostingRepository.runTransaction`; torna estruturalmente impossível auditar fora de transação.
- **`createAccount`/`deleteAccount` reestruturados para abrir `runTransaction`** (hoje são write único sem tx) — conta + audit commitam juntos.
- **Tail (prevHash) lido na mesma tx antes do append**; `@@unique([userId,unitId,seq])` faz append duplo/forkado tropeçar em P2002.
- **Payload = allowlist sanitizada por tipo de evento** (JSON string) — nunca request body cru, sem PII/tokens; centavos inteiros dentro do JSON.
- **`ensureChartOfAccounts` e os bridges NÃO emitem audit** — seeding é ruído de sistema; bridges re-acionam postEntry/reverseEntry que já emitem no choke-point.

**ADRs a ratificar:** enforcement append-only (convenção-only vs trigger SQLite) · função de hash + ordem canônica de campos (`sha256(prevHash+'|'+canonical)`, genesis = 64 zeros, `crypto` nativo) · granularidade da chain (1 por `userId+unitId`) · reverseEntry = 1 evento (`entry.reversed{reversalId,originalId}`) · `@@unique` por `seq` (+ por `hash` cinto-e-suspensório).

**Modelo de dados** — `AuditEvent` (`@@map audit_events`):
`id, userId(FK Cascade), unitId, actorUserId, seq Int, eventType, targetType, targetId, payload String(JSON), prevHash, hash, createdAt`.
Constraints: `@@unique([userId,unitId,seq])` + `@@unique([userId,unitId,hash])` · `@@index([userId,unitId])` + `([userId,unitId,targetType,targetId])` · **sem `updatedAt`/`deletedAt`** (append-only) · tudo TEXT (SQLite).

**Plano de skills (qual, como, onde)**
1. **codebase-memory** — confirmar green-field; confirmar `runTransaction` é o único seam de tx; `trace_path` fan-in de postEntry/reverseEntry.
2. **prisma-model** — `AuditEvent` após `Posting` + migração + `User.auditEvents` back-relation.
3. **repository** — `IAuditRepository`+impl: `append(data, tx)` [tx **obrigatório**, único `prisma.auditEvent.create`], `findTail(scope, tx)` [tail por seq desc, lido in-tx], `listByTarget`, `listByScope`. **Sem update/delete** na interface (append-only no nível do tipo).
4. **policy** — `canReadAudit(scope)` (write não precisa gate — é efeito de mutação já autorizada).
5. **service (editar `PostingService`)** — +5º arg `auditRepo`; dentro do `runTransaction` de postEntry/reverseEntry, após header+legs: `findTail`→computar hash→`append(...,tx)`; **embrulhar `createAccount`/`deleteAccount` em `runTransaction`** threading tx. Helpers privados `appendAudit(tx,...)` e `sanitize(eventType,raw)`.
6. **service (factory)** — registrar `new AuditRepository()` (~L181) + injetar como 5º arg do `postingService` const. Sem getter novo (read via futuro endpoint).
7. **test-suite** — estender `PostingService.test.ts`: append chamado com o **mesmo txHandle** (reusar o spy de `$transaction`); create/deleteAccount agora chamam `runTransaction` + 1 append; payload = só allowlist; linkagem seq/prevHash; guards Forbidden/NotFound curto-circuitam antes do append.

**Invariantes/gates:** atomicidade (append na mesma tx; rollback da mutação reverte o audit) · append-only (sem update/delete no surface) · hash-chain · `@@unique` real (P2002 em append duplo) · tenancy · sem dado sensível · create/deleteAccount agora transacionais · tsc/test/wiring/migração committada. *(OpenAPI N/A — sem endpoint novo neste incremento.)*

**Aceite:** #9 (4 mutações → 1 audit cada, in-tx) · atomicidade (rollback conjunto) · append-only (sem caminho de mutação) · tamper-evidence (chain reconstrutível) · double-append → P2002 · sanitização · tenancy · ruído de sistema excluído · regressão zero · ordem canônica de hash congelada por ADR.

**Ponytail (com teto):** append-only por surface + detectabilidade, não trigger SQL (teto: SQL cru ainda muta → trigger via migração manual) · sem endpoint read/verify (teto: verify é teste/script → `GET /accounting/audit` depois) · tail via `findTail` confiando em SQLite single-writer (teto: multi-writer → `SELECT FOR UPDATE`/retry-on-P2002) · allowlist via switch (teto: mapa eventType→allowlist se cobertura crescer) · 1 evento p/ reverse (teto: 2º evento se aprovação/período precisar do fato distinto).

**Riscos:** reestruturação de create/deleteAccount em tx é o de maior risco (não tinham tx; cuidar do mapeamento P2002→ValidationError existente) · blast radius em todo caller incl. bridges — se `findTail/append` lançar dentro da tx, agora dá rollback num post que antes passava (append precisa ser infalível-por-construção; P2002 em seq exige retry do tail, não swallow) · payload TEXT sem validação de DB · ADR de genesis/ordem **em disco antes do código** · reviewer independente obrigatório.

---

### INCR-3 — Numeração sequencial gapless (Livro Diário)

> ⚠️ **Ratificado com emendas (2026-06-27) — [ADR-INCR3](../adr/ADR-INCR3-entry-numbering.md) prevalece.** Emendas: (1) fundamento é **conservador**, não legal, até citar a norma; (2) número nasce na **postagem definitiva** (método explícito), não num `create` genérico; (3) `NOT NULL` só vale porque **Draft persistido não existe** (declarado); (4) `fiscalYear` derivado de **`postingDate`**, não `createdAt`; (5) backfill ordenado por **`postingDate, createdAt, id`**; (6) **idempotência resolvida ANTES de `nextNumber`** (duplicado não consome número); (7) lançamento numerado **nunca hard-deleted**; (8) teste de concorrência **na mesma partição**.

**Objetivo.** `entryNumber` gapless, único e atômico por lançamento (incl. estornos) no
momento do post, particionado por `(userId, unitId, fiscalYear)`, com `fiscalYear` derivado
do ano-calendário da data em America/Sao_Paulo. **Sem novo service/policy e sem 2ª transação.**

**Decisões de arquitetura**
- **Gapless via tabela contadora `JournalEntrySequence`** (upsert+increment dentro da tx do post) — Livro Diário BR exige sequência sem buracos. Rollback não consome número.
- **Atribuição em `JournalEntryRepository.create` (tx-aware), não em service** — `create` é o único choke-point de header por onde passam post E reverse; cobre estorno de graça, `PostingService` fica intocado.
- **Chave = `(userId, unitId, fiscalYear)`**; `ledgerCode 'DEFAULT'` fica fora da chave (literal, não coluna) — ledger único implícito ([[accounting-scope-foundation-no-multicompany]]).
- **`fiscalYear` derivado de `entry.date` em America/Sao_Paulo, persistido como coluna Int** no create — permite o `@@unique` composto e estabiliza a partição. UTC year erraria 31/12 23h BRT.
- **`@@unique([userId,unitId,fiscalYear,entryNumber])` real**; colisão = P2002 com loop de retry (cinto-de-segurança — o upsert do contador já serializa).
- **`entryNumber Int NOT NULL` com backfill determinístico** das linhas já em main (`ORDER BY unitId, fiscalYear, createdAt, id`). Entries nascem Posted (status 'Draft' default é morto), então NOT NULL é seguro.

**ADRs a ratificar:** gapless (vs único/monotônico com furos) · estorno consome próprio número da mesma sequência · `fiscalYear` = ano-civil BR no MVP · grão `(userId,unitId,fiscalYear)` · NOT NULL + backfill.

**Modelo de dados**
- `JournalEntry` (alteração): `+entryNumber Int NOT NULL`, `+fiscalYear Int NOT NULL`. `@@unique([userId,unitId,fiscalYear,entryNumber])` + `@@index([userId,unitId,fiscalYear])`. Migração com backfill.
- `JournalEntrySequence` (nova, `@@map journal_entry_sequences`): `id, userId, unitId, fiscalYear, last Int @default(0), createdAt, updatedAt`. `@@unique([userId,unitId,fiscalYear])`. Seed na migração: `last = max(entryNumber)` por partição.

**Plano de skills (qual, como, onde)**
1. **codebase-memory** — confirmar (Read) que `JournalEntryRepository.create` é o único call-site de criação de header; `detect_changes` p/ ripple da regeneração do client.
2. **prisma-model** — +`entryNumber`/`fiscalYear` em JournalEntry + model `JournalEntrySequence`; migração SQL **hand-written** (estilo `20260626000000_...`) com backfill `ORDER BY createdAt,id` + seed do contador.
3. **repository** — `IJournalEntrySequenceRepository`+impl com `nextNumber(userId,unitId,fiscalYear,tx)` (upsert `{create:{last:1},update:{last:{increment:1}}}`). Alterar `JournalEntryRepository.create`: derivar `fiscalYear` (America/Sao_Paulo) → `nextNumber(...tx)` → setar `entryNumber`+`fiscalYear`, tudo sob o tx recebido.
4. **service** — **NENHUM novo.** Edição opcional sancionada: `PostingService.ts:270` troca `Estorno de ${original.id}` por `...${original.entryNumber}`.
5. **policy** — **NENHUMA.** Numeração não é gate de autorização (post já gated por `canPost`). Pular explicitamente (registrar p/ reviewer).
6. **dto** — sem mudança de entrada (`entryNumber` nunca aceito do cliente — não-forjável); surge no output pelo spread verbatim do controller.
7. **test-suite** — (a) unit: estender `PostingService.test.ts` (mock `nextNumber`, asserir create recebe número + reverse também numera); (b) **integration test NOVO contra SQLite real** (posters concorrentes na mesma partição → gapless/sem-dup; fronteira 31/12 23h BRT) — o stub de `$transaction` não cobre concorrência.
8. **api-contract-sync** — `entryNumber/fiscalYear` aditivos; se houver `@openapi` de resposta explícito, atualizar no controller/route + `docs:generate`.
9. **luminaris-reviewer** — independente: gapless provado por integration test, `@@unique` na migração, fiscalYear em America/Sao_Paulo, NOT NULL+backfill, PostingService sem dep nova, factory não tocado (sem service novo), tsc verde nos dois pacotes.

**Invariantes/gates:** gapless (1..N sem buraco/dup mesmo sob concorrência+rollback) · atomicidade (número na mesma `runTransaction` de header+legs) · `@@unique` real (P2002) · cobertura de estorno · tz-correto · número não-input · imutabilidade · tsc (2 pacotes) · integration test SQLite real · migração aplica com backfill+seed · wiring (sem service/policy novo; 1 toque de repo) · openapi (se schema explícito).

**Aceite:** todo lançamento (manual+estorno) tem `entryNumber`+`fiscalYear` · gapless/único por partição provado por integration test concorrente · estorno consome próximo número + descrição referencia original · 31/12 23h BRT → fiscalYear corrente · backfill determinístico das linhas em main + seed do contador · duplicata → P2002 · API aditiva não-breaking · 2 tsc verdes + ADRs em disco antes do código.

**Ponytail (com teto):** sem service/policy/controller/rota (teto: "quem pode renumerar" → service+policy) · fiscalYear = ano-civil (teto: INCR de período → deriva do período) · chave sem dimensão de diário (teto: multi-diário → +journal na chave) · retry-P2002 cinto-de-segurança (teto: multi-processo real → revalidar) · NOT NULL via backfill (teto: fluxo Draft→Post real → nullable-até-post + unique parcial).

**Riscos:** backfill determinístico (empates de `createdAt` no mesmo ms → tie-break por id) · seed do contador = exatamente `max` por partição (errar → P2002 no próximo post) · integration test exige SQLite isolado (flakiness se paralelo no mesmo arquivo) · contenção WAL se bridge pós-commit alongar a tx · ano-fiscal civil pode divergir de exercício real de algum cliente (ratificar ADR) · UI de listagem pode querer renderizar o número (follow-up não-bloqueante).

---

### INCR-4 — Demonstrações BP + DRE

> ⚠️ **Ratificado com emendas (2026-06-27) — [ADR-INCR4](../adr/ADR-INCR4-bp-dre.md) prevalece.** Emendas: (1) **não aceitar `from/to` e ignorar**; (2) **BP = `as_of`**, **DRE = `year_to_date`** (não "cumulative"); (3) resultado computado na **mesma janela da DRE** + diagnóstico de resultado anterior não encerrado; (4) mapeamento por **regras declarativas (`codePrefix`+`nature`)**, não `Record<nature>` puro; (5) **`diagnostics` + `reportStatus`** — conta sem mapping/removida nunca ignorada silenciosamente; (6) teste de estorno `Posted+Reversed`; (7) `trialBalance` **byte-idêntico** após o refactor.

**Objetivo.** `balanceSheet()` (Balanço Patrimonial) e `incomeStatement()` (DRE) como métodos
read-only em `AccountingReportService`, reclassificando o **mesmo agregado** que `trialBalance`
já produz, por `account.nature` em seções com subtotais e flag balanceado, dirigido por um
mapeamento conta→linha **versionado e declarativo**. Sem mutação de ledger, sem model Prisma
novo, sem mudança de factory.

**Decisões de arquitetura**
- **Métodos em `AccountingReportService`, não service novo** — BP/DRE são reclassificações do agregado de `trialBalance`. Extrair helper privado `getAccountBalances(scope)` de `trialBalance:75-95`; re-apontar trialBalance para ele (output byte-idêntico, guardado pelos testes existentes). Zero factory.
- **Mapeamento declarativo versionado `StatementMappingFixture.ts`** (irmão de `ChartOfAccountsFixture.ts`), keyed por `nature → {statement, section, sign}`, com `STATEMENT_MAPPING_VERSION` carimbado em todo payload. Service lê o mapa; não hardcode `switch(nature)`.
- **Convenção de sinal centralizada no fixture**: Asset & Expense débito-positivo (`Σdébito−crédito`); Liability, Equity & Revenue crédito-positivo (`Σcrédito−débito`). Tudo em "saldo natural" → magnitudes positivas; contra-receita 3.2 reduz a seção.
- **BP balanceia injetando linha computada "Resultado do Exercício" no PL** = resultado da DRE (receita−despesa). **Sem conta Equity nova, sem lançamento de encerramento** — partida dobrada garante a identidade. `isComputed:true`, fora do ledger.
- **Cumulativo-até-a-data** neste incremento (igual trial-balance), `periodSemantics:'cumulative'` carimbado no payload + OpenAPI. `from/to` aceitos mas ignorados (DRE por competência = incremento futuro com predicado de data + ADR).
- **Endpoints em inglês kebab-case** `GET /api/accounting/balance-sheet` e `/income-statement`, reusando `ReportQuerySchema` e o idioma exato de `getTrialBalance`.
- **Shape aninhado por seção** (BP: `{assets[],liabilities[],equity[]}` com subtotal; DRE: `{revenue[],expenses[],netResult}`), cada linha com `amountCents` (sinalizado) + raw `debitCents/creditCents`, top-level `mappingVersion` + `balanced`.

**ADRs a ratificar:** convenção de sinal por nature · injeção computada do resultado no PL (sem conta/lançamento) · semântica cumulativa documentada (não silenciosa) · mapeamento como fixture versionada (não tabela, não branches inline).

**Modelo de dados** (sem Prisma, sem migração)
- `StatementMappingFixture.ts`: `STATEMENT_MAPPING_VERSION` + `Record<AccountNature,{statement:'BP'|'DRE'; section; sign}>` — **exaustivo em compile-time** (nature sem mapping falha tsc). Asset→BP/assets/débito+; Liability→BP/liabilities/crédito+; Equity→BP/equity/crédito+; Revenue→DRE/revenue/crédito+; Expense→DRE/expenses/débito+.
- Interfaces TS `BalanceSheetReport`/`IncomeStatementReport` (sem persistência): `balanced = (assetsCents === liabilitiesCents + equityCents)` exato; `netResultCents = netRevenueCents − totalExpensesCents` (= injeção no PL); agregado usa `['Posted','Reversed']`.

**Plano de skills (qual, como, onde)**
1. **codebase-memory** — confirmar que BP/DRE são net-new (sem clone a reusar) e que só `trialBalance` chama o agregado a extrair (refactor seguro).
2. **job-generator** — gerar `StatementMappingFixture.ts` declarativo versionado (padrão "fixture, não hardcode no service" do `ChartOfAccountsFixture`).
3. **service** — extrair `getAccountBalances(scope)` de `trialBalance`, re-apontar trialBalance (output idêntico); adicionar `balanceSheet`/`incomeStatement` (gate `canRead` → ler `STATEMENT_MAPPING` → bucket por nature → subtotais sinalizados → `netResultCents` → linha PL injetada → flag `balanced` exato). Zero repo/policy/factory novos.
4. **controller** — `getBalanceSheet`/`getIncomeStatement` em `accountingController.ts` (idioma verbatim de `getTrialBalance`).
5. **route** — 3 toques: `GET /balance-sheet`, `/income-statement` (auth herdado via `index.ts:59`/`auth.ts:20`).
6. **api-contract-sync** — 2 blocos `@openapi` em `docs.paths.ts` (documentar `periodSemantics`+`mappingVersion`) + `npm run docs:generate`.
7. **test-suite** — `describe` BP/DRE em `AccountingReportService.test.ts` (buildService, sem stub de tx): bucketing por nature; contra-receita 3.2 reduz receita; reversed neta a zero (asserir `['Posted','Reversed']`); `balanced=true`/forçado-false; PL vazio ainda balanceia via linha computada; centavos exatos; `canRead=false` curto-circuita; `mappingVersion` presente.
8. **luminaris-reviewer** — independente: refactor de trialBalance preservado, paridade de wiring (rota⇄doc), tsc limpo, nenhum service Prisma vazou p/ DynamicTable.

**Invariantes/gates:** centavos inteiros ponta-a-ponta · agregado `['Posted','Reversed']` (estorno neta a zero) · `balanced` igualdade exata · `netResult` consistente entre os dois relatórios · sinal centralizado no mapa versionado · `mappingVersion`+`periodSemantics` em todo payload · `canRead` curto-circuita · refactor deixa trialBalance byte-idêntico (testes guardam) · camadas (DTO/policy reusados, factory intocado, 3 toques de rota) · tsc (Record exaustivo) · test · wiring · openapi regenerado.

**Aceite:** BP retorna seções aninhadas + `balanced=true` em ledger balanceado · DRE retorna receita/despesa + `netResultCents` · #13 (`mappingVersion` em ambos; classificação data-driven) · identidade BP exata com resultado injetado · contra-receita 3.2 reduz `netRevenueCents` (teste) · netting de estorno (teste) · PL vazio ainda balanceia · #9 N/A (read-only); #3/#4 explicitamente fora de escopo (`periodSemantics:'cumulative'`) · auth herdado + ForbiddenError · openapi com os 2 endpoints.

**Ponytail (com teto):** métodos em service existente (teto: precisar de repo date-ranged/policy própria → service novo) · cumulativo (teto: competência → overload `groupByAccount` com predicado de data + ADR) · resultado no PL computado (teto: período-close real → conta Equity + lançamento de encerramento) · mapa fixture (teto: mapeamento user-editável → tabela Prisma).

**Riscos:** regressão no refactor (preservar `.sort(code)` + fallbacks de Map-miss `'?'`/`'(conta removida)'`) · erro de sinal na injeção do PL (BP balancearia por sorte — testes balanced-true/forçado-false + sanity do reviewer) · DRE cumulativa pode surpreender contador esperando competência (ADR assinado antes) · versão do mapa só vale se for bumpada (skill-audit deve falhar mapa editado sem bump) · `openapi.json` stale se esquecer `docs:generate` (wiring gate deve asserir os 2 paths em `public/openapi.json`).

---

## 4. Definition of Done global

| Marco | Critério |
|---|---|
| **Núcleo 1 → 100%** | INCR-1 + INCR-2 + INCR-3 fechados (períodos + auditoria + numeração). |
| **Núcleo 4 inicia** | INCR-4 (BP/DRE) entregue. |
| **Por incremento** | ADRs em disco antes do código · camadas completas · `tsc` limpo (2 pacotes) · suíte Jest verde (sem regredir os 414+) · skill-audit `wiring` limpo · `npm run docs:generate` rodado · review por agente independente com PASS explícito. |
| **Pendência herdada a saldar** | `/package-balances` ainda fora do `openapi.json` (Incremento G) — incluir no próximo `docs:generate`. |

> Frontend permanece fora de escopo até este backend fechar. Contabilidade terá aba de
> dashboard própria (não KPI no analytics).
