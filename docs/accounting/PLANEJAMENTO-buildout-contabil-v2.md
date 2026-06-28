# Planejamento v2 — Buildout Contábil (INCR-1 a INCR-4) — fonte de execução

> 🟢 **Este é o ÚNICO documento implementável.** Substitui `PLANEJAMENTO-buildout-contabil.md`
> (histórico) e incorpora as emendas ratificadas em 2026-06-27 **dentro do corpo** de cada
> incremento — sem texto stale. Em qualquer divergência, o **ADR ratificado** (`docs/adr/ADR-INCRn-*.md`)
> é a autoridade final sobre a decisão; este doc é a autoridade sobre **como/onde** as skills a executam.
>
> **Regra dura:** nenhum agente implementa a partir do v1. Se um corpo aqui parecer conflitar
> com o ADR correspondente, **pare e reconcilie** — não escolha por conta própria.

## 0. Princípios fixos

1. **cbm-primeiro para localizar, código/teste para confirmar** (CBM-001).
2. **ADR em disco antes de codar** (lição Incremento D / G0). Os 4 ADRs já estão ratificados-com-emendas.
3. **Camadas são requisito:** DTO `.strict()`, Policy, Factory, rota em 3 toques — nunca inline. Ponytail morde no código solto, marcado `// ponytail: <teto>`.
4. **Invariantes financeiros:** centavos inteiros, Σd=Σc exato, idempotência por `@@unique` de DB, posted imutável, estorno preserva+linka.
5. **Review por agente independente** (worktree isolado) — PASS da mesma sequência é rejeitado.
6. **Gates:** `tsc` limpo (2 pacotes), Jest verde, skill-audit `wiring`, `npm run docs:generate`.

## 1. Sequenciamento e dependências (atualizado pós-ratificação)

`PostingService` é o ponto de convergência. A ordem **INCR-1 → INCR-2** é obrigatória.

| Ordem | Incremento | Efeito em `PostingService` | Outros serviços |
|---|---|---|---|
| 1º | **INCR-1 Períodos** | +5º arg `IAccountingPeriodRepository`; gate preflight + **autoritativo in-tx** | cria `PeriodService` (escreve `AccountingPeriodTransition`) |
| 2º | **INCR-2 Auditoria** | +6º arg `IAuditRepository`; append in-tx | **`PeriodService` ganha audit** (eventos `period.*`); cria `verifyAuditChain` |
| 3º | **INCR-3 Numeração** | inalterado p/ post/reverse — número nasce em `createPostedEntry` no repo | — |
| 4º | **INCR-4 BP/DRE** | inalterado | métodos em `AccountingReportService` + **novo predicado de data no `groupByAccount`** |

> ⚠️ **Mudança material vs v1:** INCR-2 audita eventos de período → `PeriodService` (do INCR-1)
> precisa do `IAuditRepository` injetado quando o INCR-2 entrar. E INCR-4 **deixou de ser
> zero-blast-radius no repo**: `as_of`/`year_to_date` exigem predicado de data em `groupByAccount`.

## 2. Padrões golden-ref e skills (referência estável)

Padrões golden-ref (factory 5-toques, policy, repo+`runTransaction`, workflow-transition,
choke-point `PostingService.ts:116`, agregação `groupByAccount`, OpenAPI glob, testes
`buildService`) e os contratos das 11 skills (ordem canônica, rota em **3 toques**, `@openapi`
em DTO é morto) estão em **§1–§2 do v1** e nos contratos `docs/claude-skills/GENERATION_CONTRACTS.md`
— **não mudaram** com as emendas. Use-os como referência; só o corpo dos incrementos (§3 abaixo) foi reescrito.

---

## 3. Incrementos — decisão ratificada (implementável)

### INCR-1 — Períodos Contábeis + Gate de Fechamento
**ADR:** [ADR-INCR1](../adr/ADR-INCR1-accounting-periods.md). **Objetivo:** `AccountingPeriod`
(enum `FUTURE|OPEN|SOFT_CLOSED|HARD_CLOSED`) por `userId+unitId+year+month`; gate **preflight +
autoritativo dentro da tx**; close/reopen como máquina de estado com **histórico de transição**.

**Modelo final** (Prisma): `enum AccountingPeriodStatus`; `AccountingPeriod` (status enum
`@default(FUTURE)`, `openedAt/By`, `closedAt/By`, `transitions[]`, `@@unique([userId,unitId,year,month])`,
`@@index([userId,unitId,status])`, `@@index([userId,unitId,year])`); `AccountingPeriodTransition`
(`periodId`, `fromStatus?`, `toStatus`, `actorUserId`, `reason?`, `occurredAt`, `onDelete:Cascade`
no período). Período **derivado da data** em `scope.timeZone`, **sem** FK em JournalEntry.

**Plano de skills**
1. **cbm** — provar ausência de período; `trace_path` callers de postEntry/reverseEntry (todos precisam de período OPEN nos testes).
2. **prisma-model** — `AccountingPeriodStatus` + `AccountingPeriod` + `AccountingPeriodTransition` + migração.
3. **repository** — `IAccountingPeriodRepository`+impl: `findByYearMonth(scope,y,m,tx?)` (**sem create no path de post**), `seedYear(scope,year,tx?)` (cria 12 `FUTURE`), `setStatus(scope,y,m,next,actor,reason,tx)` que **escreve a `AccountingPeriodTransition` na MESMA tx**, `list(scope,year)`.
4. **policy** — `canClosePeriod(scope)` em `AccountingPolicy`.
5. **service `PeriodService`** — `seedYear/open/softClose/hardClose/reopen/list`. Cada transição: `canClosePeriod` → `findByYearMonth` → asserir transição legal (`ValidationError`) → `setStatus`+transition (1 tx). (INCR-2: append `period.*`.)
6. **service editar `PostingService`** — +5º arg period repo. **postEntry:** preflight `assertPeriodOpen(scope, postingDate)` fora da tx (erro rápido) **+ `assertPeriodOpenTx(tx, scope, postingDate)` dentro do `runTransaction`, antes de marcar `Posted`**. Erro = `AccountingPeriodNotOpenError` (`code:'ACCOUNTING_PERIOD_NOT_OPEN'`). **reverseEntry:** recebe **`reversalPostingDate` explícito**; gate no período dessa data.
7. **dto** — `SeedYearSchema`, `ClosePeriodSchema{unitId,year,month,reason}`, `ReopenPeriodSchema`, `PeriodStatus` Zod enum; `ReverseEntrySchema` ganha `reversalPostingDate` + `reason`. `.strict()`, `month` validado 1..12.
8. **controller** — `seedYear/openPeriod/softClose/hardClose/reopen/listPeriods` em `accountingController.ts`. `@openapi` no controller.
9. **route** — 3 toques: `GET /accounting/:unit/periods`, `POST .../periods/seed-year|:id/open|:id/soft-close|:id/hard-close|:id/reopen`.
10. **factory** — wiring 5 toques: period repo + `PeriodService` + 5º arg de `PostingService`.
11. **test-suite** — gate (`MISSING/FUTURE/SOFT/HARD`→bloqueia, `OPEN`→permite, nos dois caminhos); **TOCTOU** (período fecha entre preflight e commit → post falha no gate in-tx); transições legais/ilegais; **transition-row escrita** em cada close/reopen; `reverseEntry` usa `reversalPostingDate` (não o original); `month` 0/13 rejeitado; bridge `ACCOUNTING_PERIOD_NOT_OPEN`→skip+log no relatório, outros erros fatais.
12. **api-contract-sync** — `docs:generate` + i18n pt/en das mensagens de período.

**Invariantes/gates:** imutabilidade de período fechado garantida **no gate in-tx** (preflight é só atalho); legalidade da máquina de estado; transição registrada; `month 1..12`; erro específico; bridges não-fatais só nesse code; invariantes financeiros intactos; tsc/test/wiring/openapi.

**Aceite:** #3 todo lançamento resolve período OPEN; #4 post/reverse em não-OPEN lança **dentro da tx** antes do `Posted` (testado nos 3 estados + MISSING); close/reopen autorizado com transição registrada; #9 open/close/reopen carimbam ator+timestamp+transition+log; cobertura de sync/bridge (skip+log com registro); onboarding abre o mês corrente.

**Ponytail (teto):** período derivado sem FK (teto: re-atribuição manual → FK+backfill); gate boolean único (teto: post privilegiado em SOFT → muda a condição); `canClosePeriod = !!actorUserId` (teto: units compartilhadas → membership).

**Riscos:** factory God-object (getter compila sem ser chamado → skill-audit, não tsc); construtor 4→5 args rippla nos test builders; reconcile-loop mal posicionado; onboarding com explicit-open (1º post de tenant novo rejeitado até abrir mês); off-by-one mês em `getZonedParts` (teste de fronteira BRT).

---

### INCR-2 — AuditEvent append-only (hash-chain, tamper-evident)
**ADR:** [ADR-INCR2](../adr/ADR-INCR2-audit-trail.md). **Objetivo:** `AuditEvent` append-only,
hash-encadeado por `(scopeUserId,unitId)`, escrito **na mesma tx** da mutação; **tamper-evident,
não tamper-proof** (threat model no ADR). Cobre entry/account **e período**.

**Modelo final:** `AuditEvent` (`scopeUserId`, `unitId`, `seq BigInt`, `actorUserId?`, `actorType`,
`eventType`, `targetType`, `targetId`, `payload String` canonical, `prevHash`, `hash`,
`hashVersion`, `canonicalVersion`, `createdAt` **gerado pela app**; `@@unique([scopeUserId,unitId,seq])`
+ `@@unique([scopeUserId,unitId,hash])`; 4 índices de leitura; **sem `updatedAt`/`deletedAt`**;
**sem FK cascade**). `AuditChainHead` (`@@id([scopeUserId,unitId])`, `nextSeq BigInt`, `headHash`, `version`).

**Plano de skills**
1. **cbm** — green-field; confirmar `runTransaction` como único seam; fan-in de postEntry/reverseEntry + dos métodos do `PeriodService`.
2. **prisma-model** — `AuditEvent` + `AuditChainHead` + migração. `GENESIS_HASH = "0".repeat(64)`.
3. **repository** — `IAuditRepository`+impl: `append(input, tx)` [**tx obrigatório**, único `create`], `readHead(scope, tx)`/`bumpHead(scope, nextSeq, headHash, version, tx)`, `listByScope`, `listByTarget`. **Sem update/delete.**
4. **policy** — `canReadAudit(scope)`.
5. **service** — `AuditService.append(tx, scope, eventType, target, payloadObj)`: `readHead` → `seq=head.nextSeq`, `prevHash=head.headHash` → `sanitize(eventType, payloadObj)` (allowlist, dinheiro string) → montar **tupla canonical versionada** (`audit.v1`, eventId, scopeUserId, unitId, seq.toString(), actor, tipos, payloadCanonical, createdAtISO, prevHash) → `hash=sha256(JSON.stringify(tupla))` → `append` → `bumpHead` (version-checked). **P2002 → rollback+retry da tx, nunca swallow.** + `verifyAuditChain(scope)` (reasons `MISSING_GENESIS|SEQ_GAP|PREV_HASH_MISMATCH|HASH_MISMATCH|HEAD_MISMATCH`).
   - **editar `PostingService` (+6º arg audit):** append `entry.posted`/`entry.reversed` in-tx; **envolver `createAccount`/`deleteAccount` em `runTransaction`** preservando o mapeamento P2002→ValidationError; tentativa falha não emite audit.
   - **editar `PeriodService` (+audit):** append `period.opened/soft_closed/hard_closed/reopened`.
6. **factory** — registrar `AuditRepository` + head repo; injetar em `PostingService` (6º) e `PeriodService`.
7. **test-suite** — construção (seq1 genesis → seq2 encadeado); verify (cada reason); atomicidade (rollback conjunto; append falha → entry não Posted); account create P2002 sem audit + erro preservado; delete bloqueado sem audit; eventos de período; concorrência (seqs distintos encadeados, verify ok); sanitização (token/password/requestBody/BigInt → rejeitado).

**Invariantes/gates:** atomicidade in-tx; append-only no surface; hash-chain; `@@unique` real (P2002 não engolido); tenancy; sem dado sensível (payload canonical allowlist); `createAccount/deleteAccount` transacionais com erro preservado; `verifyAuditChain` existe; tsc/test/wiring/migração.

**Aceite:** #9 8 tipos de evento (entry×2, account×2, period×4) → 1 audit cada in-tx; rollback conjunto; sem caminho update/delete; tamper-evidence via verify; double-append → P2002; sanitização; tenancy; ruído de sistema excluído; regressão zero.

**Ponytail (teto):** convenção-only (teto: trigger SQL via migração); sem endpoint read/verify público (teto: `GET /accounting/audit` depois — verify já existe como service); allowlist via switch (teto: mapa se cobertura crescer).

**Riscos:** `createAccount/deleteAccount` reestruturados em tx (preservar P2002→ValidationError); append dentro da tx de post agora pode dar rollback num post que antes passava (append infalível-por-construção; P2002 em seq = retry do head, não swallow); `createdAt` deve ser app-set antes do hash; ADR de genesis/ordem **em disco** (✓ já está); reviewer independente.

---

### INCR-3 — Numeração sequencial gapless (Livro Diário)
**ADR:** [ADR-INCR3](../adr/ADR-INCR3-entry-numbering.md). **Objetivo:** `entryNumber` gapless por
`(userId,unitId,fiscalYear)` atribuído **na postagem definitiva**, `fiscalYear` derivado de
**`postingDate`**. Fundamento **conservador** de produto (não legal até citar norma).

**Modelo final:** `JournalEntry += fiscalYear Int, entryNumber Int` (`@@unique([userId,unitId,fiscalYear,entryNumber])`,
`@@index([userId,unitId,fiscalYear])`); `JournalEntrySequence` (`@@id([userId,unitId,fiscalYear])`,
`last Int @default(0)`). `displayEntryNumber` derivado na API/UI.

**Plano de skills**
1. **cbm** — confirmar `JournalEntryRepository.create` como único call-site de header; ripple da regeneração do client.
2. **prisma-model** — colunas + `JournalEntrySequence`; migração **hand-written** com backfill `ORDER BY userId,unitId,fiscalYear,postingDate,createdAt,id` + seed `last=max` por partição + validador pré-migração.
3. **repository** — `IJournalEntrySequenceRepository`+impl `nextNumber(scope,fiscalYear,tx)` (upsert). Adicionar **`createPostedEntry(...,tx)`** (método explícito) em `JournalEntryRepository` que: deriva `fiscalYear` de `postingDate` (`scope.timeZone`) → `nextNumber(...tx)` → cria com `entryNumber/fiscalYear/status:'Posted'`. **`create` genérico não numera.**
4. **service** — `PostingService` mínimo: garantir que a **idempotência (`sourceType,sourceId`) resolve ANTES** de chamar `createPostedEntry` (já há read-side idempotency em `:121-131`; duplicado retorna existente e **não** numera). Edição opcional: descrição do estorno cita `original.entryNumber`. **Sem service/policy novos.**
5. **policy** — nenhuma (decisão registrada p/ reviewer).
6. **dto** — sem mudança de entrada (`entryNumber` não-forjável); aditivo no output.
7. **test-suite** — **integration test SQLite real**: 50 posts concorrentes **mesma partição** → `1..50` sem buraco/dup, `last=50`; rollback após `nextNumber` não consome; **idempotência não consome** (`last` inalterado); estorno numera (descrição cita original); fronteira tz `2026-12-31T23:00-03:00`→2026; hard-delete de numerado proibido.
8. **api-contract-sync** — `docs:generate` se houver schema de resposta explícito.
9. **luminaris-reviewer** — independente.

**Invariantes/gates:** gapless (1..N sem buraco/dup sob concorrência+rollback); atomicidade (número na tx de header+legs); `@@unique` real; cobertura de estorno; **`fiscalYear` de `postingDate`**; idempotência antes do número; número não-input; **numerado nunca hard-deleted**; tsc (2 pacotes); integration test; migração com backfill+seed; wiring (sem service/policy novo; 1 toque de repo).

**Aceite:** todo lançamento (manual+estorno) tem `entryNumber/fiscalYear`; gapless por partição provado por teste concorrente; estorno consome próximo número; `2026-12-31 23h BRT`→fiscalYear 2026; backfill determinístico; duplicata→P2002; idempotente não consome número; API aditiva; ADRs em disco.

**Ponytail (teto):** sem service/policy (teto: "quem renumera" → service+policy); `fiscalYear` civil (teto: INCR-1 maduro → deriva do período); chave sem diário (teto: multi-diário); retry-P2002 cinto (teto: multi-processo real); NOT NULL via backfill (teto: Draft persistido real → nullable + unique parcial).

**Riscos:** backfill (empate `createdAt` → tie-break `id`; validar antes); seed do contador = `max` exato (errar → P2002); integration test exige SQLite isolado (flakiness se paralelo); contenção WAL se bridge alongar a tx; ano-fiscal civil pode divergir de exercício real (ADR ratificado como conservador).

---

### INCR-4 — Demonstrações BP + DRE
**ADR:** [ADR-INCR4](../adr/ADR-INCR4-bp-dre.md). **Objetivo:** `balanceSheet(scope, asOf)` (**`as_of`**)
e `incomeStatement(scope, asOf)` (**`year_to_date`**) em `AccountingReportService`, mapeamento por
**regras declarativas**, com `diagnostics`/`reportStatus`. **Não** aceita `from/to` ignorado.

**Modelo final (sem Prisma):** `StatementMappingFixture.ts` com `STATEMENT_MAPPING_VERSION` +
`STATEMENT_MAPPING_RULES` (regras `match:{nature, codePrefix?}`, `section`, `sign`, `order`;
matching accountId→codePrefix→nature→fallback). Interfaces `BalanceSheetReport`(`as_of`)/`IncomeStatementReport`(`year_to_date`)
com `reportStatus:'OK'|'WARNING'|'INVALID'`, `diagnostics`, valores monetários como **string**.

**Plano de skills**
1. **cbm** — confirmar BP/DRE net-new; só `trialBalance` chama o agregado a extrair.
2. **job-generator (fixture)** — `StatementMappingFixture.ts` declarativa versionada (`codePrefix`+`nature`).
3. **repository** — ⚠️ **`groupByAccount` ganha predicado de data opcional** (`asOf` → `entry.date <= asOf`; `between` → `from..to`). `trialBalance` chama **sem** bounds (fica byte-idêntico); BP usa `asOf`, DRE usa `[anoCivil-01-01, asOf]`.
4. **service** — extrair `getAccountBalances(scope, dateBounds?)` de `trialBalance` (re-apontar trialBalance, output idêntico); `balanceSheet(scope, asOf)` e `incomeStatement(scope, asOf)`: `canRead` → agregado com bounds → bucket por **regras** → subtotais sinalizados → `netResultCents` (janela da DRE) → **linha PL computada na mesma janela** (`isComputed`, `fromDate/toDate`) → `balanced` exato → **`diagnostics`+`reportStatus`** (conta sem mapping/removida com saldo → `WARNING/INVALID`, nunca ignorada).
5. **controller** — `getBalanceSheet(?asOf)` e `getIncomeStatement(?asOf)`; **`?from` → `400 FROM_DATE_NOT_SUPPORTED_IN_INCR4`**.
6. **route** — 3 toques: `GET /accounting/balance-sheet`, `/income-statement` (auth herdado).
7. **api-contract-sync** — `@openapi` em `docs.paths.ts` documentando `asOf`+`periodSemantics`+`mappingVersion` + `docs:generate`.
8. **test-suite** — `as_of`/`year_to_date` (predicado de data correto); sinal por nature; contra-receita 3.2 reduz; estorno `Posted+Reversed` neta a zero; `balanced=true`/forçado-false **+ classificação por seção**; PL vazio balanceia via linha computada; `hasUnclosedPriorYearResult`; conta sem mapping → `INVALID`; **`trialBalance` byte-idêntico** (suíte existente verde); `mappingVersion` presente.
9. **luminaris-reviewer** — independente (refactor preservado, paridade rota⇄doc).

**Invariantes/gates:** centavos inteiros (string no payload); agregado `['Posted','Reversed']`; `balanced` exato; `netResult` consistente; sinal centralizado nas regras versionadas; `mappingVersion`+`periodSemantics` em todo payload; conta sem mapping nunca ignorada; `canRead` curto-circuita; **`trialBalance` byte-idêntico**; **`from/to` ignorado proibido**; tsc/test/wiring/openapi.

**Aceite:** BP `as_of` com seções + `balanced=true`; DRE `year_to_date` com `netResultCents`; #13 `mappingVersion` em ambos (data-driven); identidade BP exata com resultado injetado na janela; contra-receita reduz; estorno neta; PL vazio balanceia; `diagnostics`+`reportStatus`; `?from`→400; auth+ForbiddenError; openapi com os 2 endpoints + `asOf`.

**Ponytail (teto):** métodos no service existente (teto: policy/repo próprios → service novo); resultado computado (teto: período-close real → conta Equity + lançamento de encerramento); mapa fixture (teto: user-editável → tabela Prisma).

**Riscos:** **predicado de data novo em `groupByAccount`** afeta trialBalance — manter chamada sem bounds byte-idêntica (testes guardam); erro de sinal na injeção do PL (testes balanced + por-seção); `mappingVersion` só vale se bumpado (skill-audit falha edição sem bump); `openapi.json` stale.

---

## 4. Decisões descartadas (histórico, NÃO implementar)

| Incr. | Descartado | Por quê | Vencedor |
|---|---|---|---|
| 1 | Gate só antes da transação | TOCTOU (admin fecha entre check e commit); `@@unique` não fecha | Preflight + gate autoritativo in-tx |
| 1 | `resolveOrCreate` semeando `FUTURE` no post | Post não deve criar registro de domínio silenciosamente | Período ausente bloqueia; seed em setup/admin |
| 1 | `status String` | Typo-prone | enum `AccountingPeriodStatus` |
| 1 | Sem log de transição | Perde histórico de múltiplas transições | `AccountingPeriodTransition` no INCR-1 |
| 1 | Estorno gated no período original | Bloquearia estorno legítimo no período corrente | Gate na `reversalPostingDate` explícita |
| 2 | `userId(FK Cascade)` no audit | Deletar usuário apagaria a trilha | `scopeUserId` escalar, sem cascade |
| 2 | `seq Int` | Log permanente, alto volume | `seq BigInt` |
| 2 | "tamper-proof" | Operador com acesso ao DB reescreve a chain | "tamper-evident" + threat model + verify |
| 2 | 4 eventos auditados | Contradiz depends-on INCR-1 | + `period.*` (8 eventos) |
| 2 | `tail.seq+1` por `orderBy` solto | Concorrência ambígua | `AuditChainHead` ou retry da tx; P2002 nunca engolido |
| 2 | Audit como 5º arg | INCR-1 já tomou o 5º (period repo) | 6º arg após INCR-1 |
| 3 | "exigência legal gapless" | Sem citação normativa | Decisão conservadora de produto |
| 3 | Número em `create` genérico | Rascunho/staging consumiria número | `createPostedEntry` explícito na tx de post |
| 3 | `fiscalYear` de `date`/`createdAt` | Doc de dez/25 postado jan/26 erraria | Derivar de `postingDate` |
| 3 | Backfill `ORDER BY createdAt,id` | Não é ordem contábil | `postingDate, createdAt, id` |
| 3 | `JournalEntrySequence` com `id`+`@@unique` | Identidade composta é natural | `@@id([userId,unitId,fiscalYear])` |
| 4 | `from/to` aceito e ignorado (`cumulative`) | Bug silencioso (pede junho, recebe acumulado) | BP `as_of`, DRE `year_to_date`, `?from`→400 |
| 4 | Mapping `Record<AccountNature>` | Não separa receita bruta/deduções/custo/contra-receita | Regras declarativas `codePrefix`+`nature` |
| 4 | Sem `diagnostics` | Conta sem mapping/removida ignorada silenciosamente | `diagnostics`+`reportStatus` |
| 4 | "zero blast radius no repo" | `as_of`/`year_to_date` exigem data | Predicado de data em `groupByAccount` |

## 5. Definition of Done global

| Marco | Critério |
|---|---|
| **Núcleo 1 → 100%** | INCR-1 + INCR-2 + INCR-3 fechados. |
| **Núcleo 4 inicia** | INCR-4 entregue. |
| **Por incremento** | ADR ratificado (✓) · camadas completas · `tsc` limpo (2 pacotes) · Jest verde (sem regredir) · skill-audit `wiring` · `npm run docs:generate` · review por agente independente com PASS. |
| **Pendência herdada** | `/package-balances` fora do `openapi.json` — saldar no próximo `docs:generate`. |

Frontend fora de escopo até o backend fechar; contabilidade terá aba de dashboard própria.
