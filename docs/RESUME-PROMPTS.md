# RESUME-PROMPTS — Retomada fora deste chat

> **Objetivo:** sobreviver ao fim desta sessão. Cole o prompt relevante num chat novo e o
> agente retoma com contexto suficiente. Gerado em **2026-07-14**.
>
> ⚠️ **Os 4 prompts de retomada abaixo são `RECONSTRUÍDO`** a partir do estado do roadmap
> (memória `MEMORY.md` + branches remotas), **não** dos originais — que não existiam em nenhum
> arquivo do repo nem no contexto da sessão em que este doc foi criado. Cada prompt cita a
> evidência em que se apoia. **Confira contra os originais e corrija qualquer divergência** antes
> de confiar neles. As **3 tasks** (§ final) estão **verbatim** como o usuário as passou.
>
> Fonte de verdade do roadmap: [`docs/accounting/ACCOUNTING-MASTER-MAP.md`](accounting/ACCOUNTING-MASTER-MAP.md).

---

## Snapshot do estado (2026-07-14)

Itens em voo relevantes para retomada, extraídos da memória e das branches remotas:

| Item | Estado | Evidência |
|---|---|---|
| CNAB parser (BE-INCR7) | PR **#61 OPEN**, refresh sobre main (merge, não rebase), CI+review PASS, **não mergeado** — pendente decisão humana + re-review da resolução de merge | branch `feat/…incr7…` / mem. `accounting-incr7-cnab-parser` |
| `LEDGER_STATUSES` 4º consumer | PR **#65 OPEN** (dobra `ExerciseClosingService`); #64 já mergeado | branch `claude/ledger-statuses-fold-4th` / mem. `ledger-statuses-consolidated-and-openapi-guard` |
| ECF Fase 2 (SPED Fiscal, Presumido) | **committed, não mergeado**; gate = *revenue-exhaustiveness* (segregar receita bruta 3.1/3.3 em P200/P400); bloqueio único = **código RFB da conta 3.3** (insumo externo) | branch `claude/ecf-readiness-phase-2` / mem. `accounting-sped-ecf-generation`, `accounting-incr-sped-ecf-adr` |
| Smoke-migration-gate | Vários increments **DEPLOY-CLEARED**, mas INCR-1 e INCR-2 seguem **HELD** pendentes de smoke em `dev.db` populado | mem. `accounting-incr1-db-risk` (RISK-INCR1-DB-001), `accounting-incr2-audit` (SMOKE-MIGRATION-GATE-001) |
| ADR Contas a Pagar | **não existe** ainda (`docs/adr/ADR-INCR-AP-accounts-payable.md` ausente) | — |
| Loop auto-merge | Após review PASS + tsc + CI green o loop **commita E mergeia**; smoke-gate/browser sign-off seguem humanos | mem. `loop-auto-merge-after-review` |

---

## Os 4 prompts de retomada `RECONSTRUÍDO`

Cada prompt agora carrega o **roteamento de skills** — qual agente/skill do repo executa cada fase,
para que a retomada não reinvente o pipeline que já existe em `.claude/skills/`.

### Prompt 1 — Fechar os PRs em voo (review-PASS, CI-green, não mergeados) `RECONSTRUÍDO`

> Contexto: main = `Luminaris`, worktree isolado. Há dois PRs abertos que já passaram por review
> independente e CI verde mas seguem sem merge:
> - **PR #61 (CNAB parser, BE-INCR7)** — foi refrescado sobre a main via *merge* (não rebase),
>   3 conflitos resolvidos, 876 jest + CI green, MERGEABLE/CLEAN. Falta **re-review da resolução
>   de merge** (não do diff original) e o merge em si.
> - **PR #65 (`LEDGER_STATUSES` 4º consumer)** — dobra `ExerciseClosingService` na const
>   compartilhada `models/ledgerStatus.ts`, zerando cópias inline em src não-teste.
>
> Tarefa: para cada PR, delegar review independente (agente separado, worktree isolado, re-checa o
> commit do zero — regra `reviewer-independence-separate-agent`); se PASS + `tsc` limpo nos dois
> pacotes + CI green, **mergear** (política `loop-auto-merge-after-review`). Smoke-gate e browser
> sign-off permanecem humanos. Não abrir escopo novo.
>
> **Roteamento de skills:**
> - Review: **`luminaris-reviewer`** via `Agent` com `isolation: "worktree"` — um agente por PR,
>   em paralelo (write-sets disjuntos). Para o #61, o escopo do review é a **resolução de merge**
>   (diff `main...HEAD` do refresh), não o diff original já aprovado — diga isso explicitamente
>   no prompt do reviewer, senão ele re-audita 876 testes à toa.
> - Gate de wiring: o reviewer já cobre **REV-006** (rota/KPI/preset órfão + paridade i18n); se o
>   review tocar registro de rota, rodar também **`skill-audit`** modo `wiring` antes do merge.
> - OpenAPI: qualquer mudança em controllers/routes exige `npm run docs:generate` + o teste de
>   regressão de path-count (baseline 98) verde — o artefato `public/openapi.json` é commitado.
> - Fechamento: **`learning-log`** se o merge-resolution review achar algo que vire regra.
>
> *Evidência:* mem. `accounting-incr7-cnab-parser`, `ledger-statuses-consolidated-and-openapi-guard`,
> `loop-auto-merge-after-review`, `reviewer-independence-separate-agent`, `wiring-registry-gate`,
> `openapi-wiring-static-artifact`.

### Prompt 2 — Escrever e ratificar o ADR de Contas a Pagar `RECONSTRUÍDO`

> Contexto: o módulo de Contas a Pagar (AP) é **Prisma first-class** — entidade com invariante
> financeiro, NÃO DynamicTable (regra `new-modules-use-prisma-not-dynamictable`,
> STOP block do `CLAUDE.md`). O padrão de referência é o módulo de contabilidade
> (`accounting-is-first-class-prisma`).
>
> Tarefa: escrever `docs/adr/ADR-INCR-AP-accounts-payable.md` e **fechar as decisões em aberto**
> antes de qualquer código. Decisões que o ADR precisa fixar (mínimo):
> 1. Reuso do seam **`RegisterPaymentService`** + padrão **event→mapper** (como Increment D).
> 2. **Idempotency key** × soft-delete — quem libera a chave no delete (regra
>    `unique-de-idempotencia-x-soft-delete`: rename-on-delete `deleted:<id>`).
> 3. Gate de invariante **dentro da tx** (período/saldo/status) — não confiar em preflight + `@@unique`
>    (regra `authoritative-gate-inside-tx`).
> 4. Centavos inteiros + **MAX_CENTS** (Int32 guard, `accounting/models/money.ts`).
> 5. Trilha **AuditEvent** (hash-chain) + **SourceDocument** provenance.
> 6. Tenancy = `AccountingScope` (ownerUserId≠actorUserId + unitId), zero-migration se possível.
>
> **NÃO implementar** — só ADR + decisões. Submeter para ratificação humana. Task 5 depende disto.
>
> **Roteamento de skills:**
> - Plano: **`luminaris-orchestrator`** (só plano — ORCH-001 proíbe implementar; ORCH-006 lê o
>   master map, ORCH-007 o atualiza com o nó AP, ORCH-008 já produz a seção PAR-006 de
>   paralelização que a Task 5 vai consumir).
> - Parecer de domínio: **`luminaris-accounting-architect`** ao lado do orquestrador — invariantes
>   contábeis do AP (competência × caixa, contas 2.x de passivo, contrapartidas no pagamento via
>   `RegisterPaymentService`) e reconciliação com decisões já commitadas. Foi esse par que decidiu
>   a rota do ACC-INCR6-J-001; repita o formato.
> - Evidência pré-ADR: **cbm** (`search_graph` / `trace_path`) para confirmar que o seam
>   `RegisterPaymentService` e o padrão event→mapper estão vivos e onde — conclusão confirmada
>   lendo o código (CBM-001), citada no ADR com `file:line`.
> - O ADR encerra com a seção de forks abertos no formato do ECF (PR #68) — cada fork com
>   recomendação + custo de reversão, para a ratificação humana ser um sim/não por fork.
>
> *Evidência:* Task 5 (usuário), mem. `new-modules-use-prisma-not-dynamictable`,
> `accounting-is-first-class-prisma`, `accounting-increment-d1-settlement`,
> `unique-de-idempotencia-x-soft-delete`, `authoritative-gate-inside-tx`,
> `accounting-incr8-source-document-provenance`, `accounting-master-map-source-of-truth`,
> `accounting-incr6-data-exchange-plan` (precedente orquestrador+arquiteto).

### Prompt 3 — Destravar ECF Fase 2 (coverage-gate revenue-exhaustiveness) `RECONSTRUÍDO`

> ⚠️ *Este prompt e a **Task 6** são o mesmo trabalho em fases diferentes: o prompt é o passo de
> **desbloqueio** (conseguir o insumo externo); a Task 6 é **landar** quando ele chegar.*
>
> Contexto: a geração do ECF (SPED Fiscal, Presumido) já está **implementada e commitada** (branch
> `claude/ecf-readiness-phase-2`), **não mergeada**. Passo A (transcrição) já confirmou que C/E são
> PVA-recovered, P é numeração própria e o PVA computa o tributo — nós só segregamos receita bruta
> **3.1/3.3** em linhas E de P200/P400. O gate é **revenue-exhaustiveness**, não referencial.
>
> Tarefa: **confirmar com o contador** o **código RFB da conta 3.3** — é o único bloqueio externo
> restante (nenhum blocker de decisão). Quando o código chegar, prosseguir para a Task 6.
>
> **Roteamento de skills:**
> - Enquanto o insumo não chega: **nenhuma skill roda** — não abrir frente nova aqui; a espera é
>   externa, não técnica.
> - Quando o código 3.3 chegar: **`luminaris-accounting-architect`** valida o fechamento do
>   coverage-gate (a receita bruta segregada é exaustiva? nenhuma conta 3.x fora de P200/P400?);
>   depois **`luminaris-reviewer`** em worktree isolado sobre a branch inteira; merge segue a
>   política `loop-auto-merge-after-review`. O de-para oficial entra pelo import RFB já pronto
>   (spec B0 + conversor, mem. `accounting-incr9-referential-mapping`) — não digitar catálogo à mão.
>
> *Evidência:* mem. `accounting-sped-ecf-generation`, `accounting-incr-sped-ecf-adr`,
> `accounting-revenue-split-by-nature`, `accounting-incr9-referential-mapping`.

### Prompt 4 — Smoke-migration-gate dos increments HELD `RECONSTRUÍDO`

> ⚠️ *Este prompt e a **Task 7** cobrem o mesmo gate; a Task 7 é a versão completa e documentada.*
>
> Contexto: INCR-1 (períodos) e INCR-2 (audit hash-chain) estão mergeados na main mas seguem
> **HELD** — `RISK-INCR1-DB-001` e `SMOKE-MIGRATION-GATE-001` não foram validados. O risco é
> migração em banco **com dados**, não recriado do zero.
>
> Tarefa: rodar as migrations acumuladas contra uma **cópia de um `dev.db` já populado**, validar
> que nada quebra, documentar o gate por increment (padrão `SMOKE-MIGRATION-GATE-BE-INCR7-DEPLOY.md`),
> e liberar deploy. Ver Task 7 para o escopo completo.
>
> **Roteamento de skills:**
> - Isto é tarefa de **ops, não de geração** — nenhum generator roda. Sequência: copiar o `dev.db`
>   populado para fora do repo → `npx prisma migrate deploy` na cópia → checks de integridade
>   (contagens antes/depois, `PRAGMA integrity_check`, hash-chain do AuditEvent re-verificado,
>   BP com A=P nas duas pontas) → doc de gate por increment no padrão INCR-7.
> - Verificação viva: **`verify`** (ou **`run`**) contra **build de produção apontando para a cópia
>   migrada** — nunca `next dev`, e nunca um servidor antigo (regra `stale-dev-server-serves-old-code`:
>   reiniciar do commit exato antes de confiar em qualquer check funcional).
> - Fechamento: **`learning-log`** com o resultado do gate (ele fecha dois riscos nomeados — cite-os
>   pelos IDs) + atualizar o master map (⏳→✅ nos nós HELD).
>
> *Evidência:* mem. `accounting-incr1-db-risk`, `accounting-incr2-audit`,
> `accounting-next-increment-reconciliation` (padrão do doc de gate), `stale-dev-server-serves-old-code`.

---

## As 3 tasks (verbatim)

### Task 5 — Implementar Contas a Pagar operacional *(depende do Prompt 2: ADR ratificado)*

Só começa depois que você ratificar o ADR (`docs/adr/ADR-INCR-AP-accounts-payable.md`) e fechar as
decisões em aberto. Aí implementa a cadeia Prisma completa por fatia (schema serial → corpos →
registro), reusando o seam `RegisterPaymentService` + padrão event→mapper. Gates herdados:
centavos+MAX_CENTS, gate de invariante dentro da tx, @@unique×soft-delete, AuditEvent/SourceDocument.
Review independente por fatia. **Bloqueio:** a ratificação do ADR — não escreva código antes disso.

> **Roteamento de skills (nota adicionada, fora do verbatim):** a "cadeia por fatia" acima é
> exatamente o pipeline **`parallel-batch`** (`_PARALLELIZATION-CONTRACT.md`, PAR-001..006):
> - **Fase 0 — schema (serial):** `backend-prisma-model-generator` (modelos AP + migration única;
>   duas mudanças de schema nunca paralelizam — PAR-002).
> - **Fase A — corpos (paralelo, worktree por slice):** `backend-dto-generator` →
>   `backend-repository-generator` → `backend-service-generator` → `backend-policy-generator` →
>   `backend-controller-generator` + `backend-test-suite-generator`. Slices só paralelizam se os
>   write-sets forem disjuntos provados (PAR-002 via cbm, confirmado no código — CBM-001); AP é
>   um domínio só, então **em dúvida → serial** (PAR-005).
> - **Review por branch:** `luminaris-reviewer` em worktree isolado, por slice, antes da Fase B.
> - **Fase B — registro (serial, integrador único):** `backend-route-generator` +
>   `api-contract-sync-generator`; deltas de choke point (router.use, factory, `docs:generate`)
>   uma a uma, `tsc` verde entre cada.
> - Pós-merge: `skill-audit` modo `wiring` + `learning-log`.
> - Worktrees novos: `npm ci` (nunca junction do client Prisma da main — mem.
>   `worktree-deps-stale-prisma-client`).

### Task 6 — Landar BE-INCR-SPED-ECF Fase 2 *(código já committed, não mergeado)*

A geração do ECF (SPED Fiscal, Presumido) já está implementada e commitada, mas **não mergeada**. O
gate é *revenue-exhaustiveness* (segregar receita bruta 3.1/3.3 em P200/P400), e o único bloqueio
externo é o **código RFB da conta 3.3** que o contador precisa fornecer. Task: quando o código 3.3
chegar, fechar o coverage-gate, rodar a suíte, review independente, e mergear. **Bloqueio:** insumo
externo (código RFB) — confirme com o contador antes.

> **Roteamento de skills (nota adicionada, fora do verbatim):** ver o roteamento do **Prompt 3** —
> `luminaris-accounting-architect` (coverage-gate) → `luminaris-reviewer` (worktree isolado, branch
> inteira) → merge via política `loop-auto-merge-after-review`.

### Task 7 — Smoke-migration-gate + deploy-readiness sweep *(independente; destrava deploy)*

Vários increments estão marcados "DEPLOY-CLEARED" mas outros seguem **HELD pendente de
smoke-migration-gate** (ex.: INCR-1 DB risk, INCR-2 audit). Task: rodar as migrations acumuladas
contra uma cópia de um `dev.db` **já populado** (não recriado do zero — o risco é justamente
migração em banco com dados), validar que nenhuma quebra, documentar o gate por increment, e liberar
deploy. É o único passo entre "merged na main" e "seguro pra produção". **Sem bloqueio** — dá pra
rodar assim que o limite resetar.

> **Roteamento de skills (nota adicionada, fora do verbatim):** ver o roteamento do **Prompt 4** —
> tarefa de ops sem generator: cópia do `dev.db` → `migrate deploy` → checks de integridade →
> `verify`/`run` contra build de produção na cópia migrada → doc de gate por increment +
> `learning-log` + flip ⏳→✅ no master map.

---

## Ordem lógica

**7** (destrava deploy do que já está pronto) → **6** (quando o 3.3 chegar) → **5** (quando você
ratificar o ADR). As três independem entre si; só têm os bloqueios anotados acima.

| # | Bloqueio | Destrava |
|---|---|---|
| **Task 7** | nenhum | deploy dos increments já mergeados |
| **Task 6** | insumo externo (código RFB 3.3) — Prompt 3 | ECF Fase 2 na main |
| **Task 5** | ratificação do ADR — Prompt 2 | Contas a Pagar operacional |
