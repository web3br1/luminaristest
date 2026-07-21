Redigi o PRE-ADR em `C:/Users/smurf/Downloads/Luminaris/.claude/worktrees/council-accounting-decisions-42aa3c/docs/adr/ADR-CRM-SEAM-revenue-recognition.md`, seguindo o formato dos ADRs de subrazão (AP/AR/COUNTERPARTY). Segue o markdown integral:

---

# PRE-ADR-CRM-SEAM — Reconhecimento de receita do seam CRM → razão

- **Data:** 2026-07-20
- **Status:** **PROPOSTO — PRE-ADR (proposta para ratificação HUMANA fork-a-fork, §5.1). NADA aqui está ratificado nem implementado.** Este documento abre o desenho do seam de receita CRM→razão; a **decisão contábil-estrutural é do dono** (cruza decisões travadas do mapa-mestre §5.1: `postEntry` como fronteira única de escrita e a subrazão dedicada `1.1.5`). Origem: **Design Council do CRM 2026-07-20**, resolução de fechamento **D1** (5-0 ratificado-recomendado: "PRE-ADR do seam antes de qualquer trabalho novo de CRM que toque receita"), devolvido ao dono para a ratificação do desenho.
- **Autores:** par `luminaris-accounting-architect` (parecer de domínio contábil) + **CTO** (desenho do seam) — mesmo formato de `ADR-INCR-AP` / `ADR-INCR-AR` / `ADR-INCR-COUNTERPARTY`.
- **Nó do master map:** §7 Núcleo (seam salão/CRM → razão) + §5 "Subrazões" (AR já first-class, `1.1.5`). Colisão com §1 (T1–T12) e §4 (rejeitadas) verificada em §3 — **não colide**: o seam já está na camada certa (controller pós-commit, best-effort, reconcile re-drive; motor DynamicTable intocado). O defeito é de **desenho do mapeamento**, não de fronteira.
- **Gatilho de implementação (VINCULANTE, per resolução D1/D6):** nenhuma linha de receita CRM→razão pode ser commitada antes de **(1)** este ADR assinado pelo dono fork-a-fork **E** **(2)** o **kit de validação D6 verde** (as 7 provas §6 do council, incluindo a matriz adversarial de 2 tenants, rodadas em build de produção contra `server/prisma/prisma/dev.db`). PRE-ADR assinado sem kit verde ainda **não** libera código.

## TLDR (2 linhas)

O seam CRM→razão reconhece receita ao `Won` com um par de contas **hardcoded `D 1.1.2 / C 3.1`** no `CrmOpportunityWonMapper`, debitando a **conta de controle que o salão já usa (`1.1.2`) sem criar linha no subrazão AR (`1.1.5`)** — recebível órfão, invisível ao tie-out — e sofre de **quatro caminhos cegos CONFIRMED em código** (duplo-cego `advanceStage`; `advanceOpportunity` sem guard terminal e com `amount` mutável pós-`Won`; hardcode de contas contra a tese-compilador; `Won`-sem-`unitId` vira loop silencioso de reconcile). Este PRE-ADR enumera **F1–F4** para o dono ratificar: por onde a receita de oportunidade transita (subrazão AR × direta), binding conta-por-papel como **DADO** × runtime, guard de estado terminal, e tratamento do `Won`-imbookável — todos cruzando `postEntry` e `1.1.5` (§5.1).

---

## 1. Contexto e objetivo

O bridge salão→razão (`accounting-increment-c-salon-bridge`, MERGED) é a costura canônica cross-world: eventos de domínio pós-commit → `AccountingSyncService.sync` → mapper → `PostingService.postEntry`. O seam CRM reusa **exatamente** essa costura para reconhecer receita quando uma **Opportunity** é levada a `Won`. A costura (camada, best-effort, reconcile re-drive) está **certa** — o council a declarou DEFENDIDA. O que está em disputa é o **mapeamento contábil** que ela carrega e as **portas de entrada** que a alimentam.

**Objetivo sob a letra (T1):** o pedido é "abrir o desenho do seam". O objetivo real é **impedir que demonstração financeira falsa entre no razão** — receita reconhecida zero vez (duplo-cego), duas vezes ou com valor divergente (mutação pós-`Won`), no lugar errado do plano de contas (controle compartilhado sem subrazão), por uma origem que o compilador ERP-gen terá de absorver (binding hardcoded). Cada fork abaixo fecha um desses vetores.

**Classificação (STOP block):** o seam **não** é um módulo novo — é integração cross-módulo no nível controller/serviço-de-integração (o lugar certo, per `dynamictable-vs-prisma-boundary`). Nada aqui injeta serviço Prisma no `DynamicTableService`/`RuleContext`/`RulePlugin`. A decisão é **de mapeamento contábil**, e por isso cruza `postEntry` e `1.1.5` (§5.1) — daí a exigência de assinatura do dono.

## 2. Evidência de código (CBM-001 — tudo confirmado por leitura nesta sessão)

| # | Claim | Grau | Evidência |
|---|---|---|---|
| E1 | **Hardcode do par de contas** `D 1.1.2 / C 3.1`, constantes de classe; sem linha de subrazão AR; conversão float→centavos com guards (finito/safe-int/>0) | **verificado** | `CrmOpportunityWonMapper.ts:16-17` (`DEBIT_ACCOUNT='1.1.2'`, `CREDIT_ACCOUNT='3.1'`), `:26-42` (guards), `:50-53` (2 linhas, nenhum `Receivable`) |
| E2 | **Débito em controle COMPARTILHADO com o salão sem subrazão** — o salão já posta em `1.1.2`; o AR-formal usa a dedicada `1.1.5`. O seam CRM cai em `1.1.2` e **não** abre `Receivable` ⇒ `Σ Receivable != saldo(1.1.5)` não se aplica, e o `1.1.2` mistura origens salão+CRM sem tie-out | **verificado** | `CrmOpportunityWonMapper.ts:16`; `ADR-INCR-AR §F7→(a)` (dedicada `1.1.5`, o salão usa `1.1.2`); master map §5.1 item 8 |
| E3 | **Duplo-cego de receita** — `advanceStage` NÃO chama sync accounting; só `advanceOpportunity` chama `maybeSyncOpportunityWon`. Um lead/opp levado a estado de fechamento por `advanceStage` **nunca booka** | **verificado** | `crmController.ts:21-34` (`advanceStage`, zero sync) × `:81-99` (`advanceOpportunity` chama `maybeSyncOpportunityWon` em `:94`) |
| E4 | **`advanceOpportunity` sem guard de estado terminal** — nenhuma releitura do `status` corrente; `patch.amount = input.amount` aplicado incondicionalmente; `Won`+`closedAt` marcados a cada avanço a stage de fechamento | **verificado** | `CrmPipelineService.ts:274-313` (sem guard; `:287` `patch.amount`; `:294-297` `Won`/`closedAt`) |
| E5 | **Congelamento do PRIMEIRO valor pelo `postEntry`** — idempotência por `@@unique([userId,unitId,sourceType,sourceId])`; re-`Won` com `amount` mutado bate no idempotent-hit e o razão **fica no valor antigo**, CRM no novo (drift silencioso) | **verificado** | `AccountingSyncService.ts:30-33,63` (idempotência delegada 100% ao `postEntry`); `PostingService @@unique` (memória `accounting-is-first-class-prisma`) |
| E6 | **`Won`-sem-`unitId` = skip silencioso** — `maybeSyncOpportunityWon` faz `logger.warn(...); return;` se `unitId` vazio. A opp fica `Won` **sem lançamento**; o reconcile a re-encontra como `Won`-não-bookado e **nunca** consegue bookar (não há `unitId` para escopar) ⇒ loop | **verificado** | `crmController.ts:114-121` (skip sem `unitId`); `AccountingSyncService.ts:82-90` ("left for reconciliation") |
| E7 | **`unitId` obrigatório existe no serviço, mas só nas conversões** — `convertLead`/`convertLeadToOpportunity` rejeitam lead sem `unitId` (`ValidationError`); `advanceOpportunity` **não** tem essa checagem ⇒ uma opp pode chegar a `Won` sem `unitId` | **verificado** | `CrmPipelineService.ts:142-144` e `:353-355` (guard nas conversões) × `:274-313` (`advanceOpportunity` sem guard) |
| E8 | **Observabilidade do reconcile JÁ aplicada no Bloco A** (independente do subrazão) — dead-letter + max-retry/backoff + alerta em `summary.failed` foi ratificada como item 5 do Bloco A da resolução do council | **verificado** | Resolução council 2026-07-20, Bloco A item 5; `AccountingSyncService.ts:37,46-47,61-90` (retry/backoff já existente) |
| E9 | Seam na **camada certa** — `AccountingSyncService` é consumidor pós-commit legítimo (não é o motor), best-effort, reconcile re-drive; §2.1 respeitado | **verificado** | `AccountingSyncService.ts:23-34` (comentário §2.1); `crmController.ts:91-94` (pós-commit, best-effort) |
| E10 | `1.1.5 Clientes a Receber` é conta de controle **dedicada** com const resolvida por código; o AR-formal (`ReceivableService`) posta direto via `postEntry` (F0→a) | **verificado** | `ADR-INCR-AR` D1/D2/§F7; master map §5.1 item 8 (`ReceivableService`, `1.1.5`) |

**Colisões com decisões travadas (§1) e rejeitadas (§4):** nenhuma. O seam não é torre multi-empresa (§4); não injeta serviço de domínio no motor (§2.1-B); `postEntry` segue fronteira única (T-lock); SQLite/scheduler in-process (T11) inalterados. **Ressalva nomeada:** F1 e F2 tocam decisões travadas do §5.1 (`1.1.5`, `postEntry`), por isso são **do dono**, não da diretoria.

## 3. Os quatro caminhos cegos (o que cada fork fecha)

1. **Duplo-cego (E3)** — a analytics de funil e o razão medem eventos diferentes. Fechado por **F2** (binding único conta-por-papel, mesma origem para todo caminho que fecha negócio) + disciplina de porta única de `Won` (ver F3/plano).
2. **Mutável pós-`Won` (E4/E5)** — dinheiro real re-emitido/mutado sem guard; razão congela o 1º valor. Fechado por **F3** (guard terminal + `amount` imutável pós-`Won`).
3. **Hardcode 1.1.2/3.1 sem subrazão (E1/E2)** — recebível órfão, tie-out quebrado, binding cravado no runtime contra a tese-compilador. Fechado por **F1** (por onde a receita transita) + **F2** (binding como dado).
4. **`Won`-imbookável (E6/E7)** — loop silencioso de reconcile queimando trabalho a cada ciclo sem sinal. Fechado por **F4** (dead-letter/quarentena × bloquear-no-ingresso × alerta-e-segura, cruzando a observabilidade E8 já aplicada no Bloco A).

---

## 4. FORKS — decisão do dono (ratificar fork-a-fork; nada aqui é default)

> Convenção herdada dos ADRs de subrazão: cada fork lista **opções → recomendação do par (não-vinculante) → consequência declarada**. **F1 e F2 cruzam decisões travadas do §5.1** (subrazão `1.1.5`, `postEntry`, tese-compilador ERP-gen) e são as genuinamente novas; F3 é um endurecimento do seam com lente contábil; F4 ratifica/estende a observabilidade do Bloco A e decide a política de ingresso.

### F1 — Por onde a receita de oportunidade transita: subrazão AR `1.1.5` × receita direta sem recebível

**Pergunta:** ao `Won`, o crédito de receita (`3.1`/`3.3`) tem como contrapartida um **recebível rastreado no subrazão AR** (tie-out `Σ Receivable == saldo(1.1.5)`), ou é **receita direta** sem linha de subrazão?

- **(a) Status quo — `D 1.1.2 / C 3.1` direto no controle compartilhado do salão.** Recebível órfão: debita `1.1.2` (que o salão posta sem subledger) e **não** abre `Receivable`. **DESCARTADA** — destrói o tie-out que o `ADR-INCR-AR §F7→(a)` construiu ao dedicar `1.1.5`; mistura origens salão+CRM no mesmo saldo de controle sem subrazão que as reconcilie. É o defeito E2.
- **(b) Raw 2-linhas em `1.1.5` (`D 1.1.5 / C 3.1`), SEM abrir `Receivable`.** Corrige o *lugar* (conta dedicada) mas **não** o tie-out: `1.1.5` acumula saldo sem linha de subrazão correspondente ⇒ `Σ Receivable != saldo(1.1.5)` (o subrazão não conhece o recebível-CRM). Meia-solução: paga a dívida do tie-out de novo quando alguém ler o aging. **NÃO recomendada** isolada.
- **(c) Integração plena com o subrazão AR — o seam CRM ABRE um `Receivable` via `ReceivableService`.** ★ **RECOMENDADA.** O `Won` deixa de postar um lançamento cru e passa a **criar uma fatura `Receivable`** (origem `crm.opportunity.won`), que é quem posta `D 1.1.5 / C receita` pela sua própria maquinaria já provada (postEntry direto, F0→a; competência; audit; proveniência INCR-8). Recebimento futuro segue o ciclo AR (`D caixa-por-método / C 1.1.5`). Tie-out preservado, aging por contraparte de graça (INCR-COUNTERPARTY), reuso máximo do canônico (§0), **zero mapper contábil bespoke**.
  - **Consequência declarada:** exige que o `Won` carregue os campos mínimos de um recebível (contraparte, vencimento — herda do lead/opp) e escolha a **natureza da receita** (`3.1` serviço × `3.3` revenda — `accounting-revenue-split-by-nature`). Um `Won` sem recebível-real (deal fechado e liquidado à vista, sem prazo) vira o caso-limite: recebível criado-e-liquidado no mesmo instante (aceitável) **ou** exceção explícita — decidir no BRIEF, não no runtime.
- **(d) Receita direta genuína (`D caixa / C 3.1`), SEM recebível, só quando o `Won` já é caixa-à-vista.** Válida **apenas** se o produto garantir que `Won` == recebido (raro em B2B com prazo). **NÃO recomendada** como default — reintroduz um segundo caminho de binding e o risco de escolher a conta de caixa errada; mas registrável como sub-caso de (c) quando a opp carrega método+data de liquidação.

> **Recomendação do par: (c).** Alinha o seam CRM ao mesmo padrão do salão (que já abre recebível `1.1.2` e o liquida) e do AR-formal (`1.1.5` dedicada), fecha E1/E2 de uma vez e elimina o mapper hardcoded. Custo: maior blast radius (o seam passa a chamar `ReceivableService` em vez de emitir 2 linhas). **Cruza §5.1** — por isso é do dono.

### F2 — Binding conta-por-papel como DADO (config/tabela) × hardcode no runtime

**Pergunta:** o mapeamento "papel contábil → conta do plano" (recebível→`1.1.5`, receita-serviço→`3.1`, receita-revenda→`3.3`) vive como **dado** (resolvido em runtime de uma tabela/config) ou **cravado no código** do mapper/serviço?

- **(a) Status quo — constantes hardcoded no mapper.** `DEBIT_ACCOUNT`/`CREDIT_ACCOUNT` como literais de classe. **DESCARTADA como destino** — é exatamente o que a tese-compilador ERP-gen deveria **emitir como dado** (contas por papel); cada literal cravado entrincheira um CRM que o compilador terá de absorver (council B4/CB4).
- **(b) Binding como DADO pleno — tabela/registry `papel→conta` resolvida em runtime.** ★ **RECOMENDADA como DIREÇÃO, reservada ao dono (cruza D2).** Uma pequena tabela (ou config seed) mapeia `RECEIVABLE_CONTROL`, `REVENUE_SERVICE`, `REVENUE_RESALE` → código de conta, resolvida no create do `Receivable`/no serviço, nunca no mapper. É o primeiro teste concreto do "binding-como-dado gerado" que o council marcou como a porta de entrada do exercício ERP-gen (D2).
  - **Consequência declarada:** introduzir a tabela agora, **antes** do gerador existir, é infra especulativa (YAGNI) — só se justifica se o dono ratificar D2 (exercitar o gerador) como a próxima aposta. Sem D2, (b) é over-engineering.
- **(c) Piso pragmático — const canônica resolvida POR CÓDIGO, centralizada.** ★ **RECOMENDADA como PISO imediato.** Uma única const/módulo (espelho de `CLIENTES_A_RECEBER_CODE='1.1.5'` / `FORNECEDORES_A_PAGAR_CODE` do AP/AR — resolvida por código, nunca por nome) substitui os literais espalhados. Não é "dado" (ainda vive no código), mas **centraliza o papel→conta num ponto único** e mata o hardcode espalhado do E1. Custo ~zero, reversível, e é o passo que (b) estende quando o gerador chegar.
  - **Consequência declarada:** não entrega catálogo/config editável nem prepara o compilador; é o mínimo que remove o defeito E1 sem apostar em D2.

> **Recomendação do par: (c) como piso agora + (b) como direção reservada ao dono.** Se F1→(c) for escolhido, o binding some quase inteiro (o `ReceivableService` já resolve `1.1.5` por const canônica), e F2 recai apenas sobre a **escolha da conta de receita** (`3.1`×`3.3`), que já é dado do usuário via `revenueAccountId` no AR. **(b) é a aposta ERP-gen — só o dono a fecha (cruza D2).**

### F3 — Guard de estado terminal em `advanceOpportunity` (`Won`/`Lost` terminal; `amount` imutável pós-`Won`)

**Pergunta:** uma opportunity já `Won` (ou `Lost`) pode ser re-avançada, com `amount` mutado e re-`Won`?

- **(a) Status quo — sem guard.** `advanceOpportunity` re-marca `Won`/`closedAt` e re-aplica `patch.amount` a cada chamada (E4); o razão congela o 1º valor (E5). **DESCARTADA** — permite mutação de dinheiro real e drift silencioso razão×CRM.
- **(b) Guard terminal + `amount` imutável pós-`Won`.** ★ **RECOMENDADA.** Espelha o guard `already converted` do `convertLead`: releitura do `status` corrente **dentro** da operação; `Won`/`Lost` são **terminais** (re-avanço rejeitado com `ValidationError`); `amount`/`currency` **imutáveis** uma vez `Won`. Correção legítima de valor pós-`Won` passa a exigir um **comando explícito de reabertura/estorno** (ACC-016 — nunca `PATCH status`), auditado, que estorna o lançamento e re-reconhece (T5), em vez de mutação silenciosa.
  - **Consequência declarada:** operadores perdem o "corrigir o valor de um deal ganho" por edição direta — passa a ser reabrir→corrigir→re-ganhar, com trilha. É o preço correto de tratar `Won` como fato contábil.
- **(c) Permitir re-avanço, mas bloquear mutação de `amount` pós-`Won` + reconcile que DETECTA drift.** Deixa a stage re-avançar (flexibilidade de board) mas congela o valor e adiciona detecção de divergência razão×CRM no reconcile. **NÃO recomendada** isolada — mais superfície, mesmo objetivo que (b) alcança com menos código; a detecção de drift é útil como **complemento** de (b), não substituto.

> **Recomendação do par: (b), com a detecção de drift de (c) como reconcile-guard adicional.** É um patch T6 na fronteira, mas **cruza a lente contábil** (protege o seam de dinheiro), por isso entra no ADR e não como patch solto. Fecha E4/E5.

### F4 — Tratamento do `Won`-imbookável: dead-letter/quarentena × bloquear-no-ingresso × alerta-e-segura

**Pergunta:** o que acontece com um `Won` que o seam **não consegue bookar** (sem `unitId` — E6/E7 — ou `map()` lança `ValidationError` por valor inválido)?

- **(a) Dead-letter / quarentena.** Persistir o evento imbookável numa tabela de quarentena (com motivo) para triagem humana; o reconcile para de re-tentar cegamente o que é deterministicamente imbookável. Fecha o loop silencioso, mas adiciona uma tabela/superfície nova (**tensão com T11 "sem fila/outbox/DLQ"** — precisa ser nomeada como exceção deliberada, não DLQ genérica).
- **(b) Bloquear-no-ingresso — `unitId` obrigatório ANTES de `Won`.** ★ **RECOMENDADA como primária.** Levar a checagem de `unitId` que já existe em `convertLead`/`convertLeadToOpportunity` (E7) para `advanceOpportunity`: uma opp **não transita para `Won`** sem `unitId` (`ValidationError`). O fato imbookável **nunca nasce** — a causa-raiz do E6 (Won-sem-unitId) é eliminada na origem, sem tabela nova, sem tensão com T11. É a mesma disciplina "param aceito-e-ignorado é bug" invertida: não aceite um `Won` que você sabe que não pode bookar.
- **(c) Alerta-e-segura (status quo + observabilidade do Bloco A).** Manter o skip best-effort + o dead-letter leve/max-retry/backoff/alerta-em-`summary.failed` **já aplicado no Bloco A** (E8). Sozinho é **insuficiente** para o caso permanente (Won-sem-unitId nunca vira bookável ⇒ o alerta dispara para sempre sem ação possível), mas é o piso de observabilidade correto para faltas **transitórias**.

> **Recomendação do par: (b) como primária + (c)/E8 como rede para o residual transitório.** (b) mata a causa-raiz determinística (Won-sem-unitId) no ingresso; a observabilidade do Bloco A (E8, já aplicada) cobre as faltas transitórias (SQLite busy, etc.) que o reconcile legitimamente re-dirige. **(a) dead-letter só se o dono quiser quarentena durável para eventos `map()`-inválidos** — e então nomeada como exceção explícita a T11, não DLQ genérica. Combinação recomendada: **(b) + (c)**; (a) opcional sob nomeação de exceção.

---

## 5. Recomendação consolidada do par (não-vinculante) e o que fica com o dono

| Fork | Recomendação do par | Cruza §5.1? | Quem fecha |
|---|---|---|---|
| **F1** — por onde a receita transita | **(c)** seam abre `Receivable` no subrazão `1.1.5` (tie-out preservado, mapper hardcoded some) | **SIM** (`1.1.5`, `postEntry`) | **Dono** |
| **F2** — binding conta-por-papel | **(c)** const canônica por código agora (piso) + **(b)** dado/config reservado a D2 (ERP-gen) | **SIM** (tese-compilador, D2) | **Dono** |
| **F3** — guard terminal | **(b)** `Won`/`Lost` terminal + `amount` imutável + comando de reabertura (ACC-016), com drift-detect de (c) como complemento | parcial (lente contábil) | Dono (recomendação forte) |
| **F4** — `Won`-imbookável | **(b)** bloquear-no-ingresso (`unitId` antes de `Won`) + **(c)/E8** observabilidade Bloco A p/ transitório; (a) dead-letter opcional sob exceção nomeada a T11 | não | Dono (recomendação forte) |

**Nota de coerência entre forks:** se **F1→(c)**, F2 encolhe (o `ReceivableService` já resolve `1.1.5` por const; sobra só `3.1×3.3`, que já é dado do usuário) e o mapper `CrmOpportunityWonMapper` **deixa de existir** como emissor de 2 linhas (vira criação de `Receivable`). F1→(c) é a decisão de maior alavancagem — resolve E1, E2 e metade de F2 de uma vez.

## 6. Plano de implementação (Task pós-ADR — SÓ após assinatura do dono E kit D6 verde)

**Nada abaixo é autorizado por este documento.** É o esboço que a Task herdará quando as duas condições do gatilho fecharem.

- **Fase 0 — pré-condição (não é código de seam):** o **kit de validação D6** roda verde (backfill dos 80 `unitId` nulos sob tenancy explícita → seed >200 linhas → 7 provas §6 em build de produção contra `server/prisma/prisma/dev.db`, incluindo a matriz adversarial de 2 tenants). Sem isso, os 4 furos permanecem "CONFIRMED em código", não "provados em runtime" (viés T8 #1 do council).
- **Fase A — corpos (serial, domínio único, worktree isolado `npm ci`):**
  - **F3 (menor blast, faz sentido primeiro):** guard terminal em `advanceOpportunity` (releitura de `status` in-op; `Won`/`Lost` terminal; `amount`/`currency` imutáveis pós-`Won`) + teste re-`Won`→rejeitado + comando de reabertura/estorno (ACC-016) se o dono quiser correção pós-`Won`.
  - **F4 (b):** checagem de `unitId` antes de `Won` em `advanceOpportunity` (espelho de `convertLead`) + teste `Won`-sem-`unitId`→`ValidationError` sem escrita. Ratificar/documentar a observabilidade E8 do Bloco A.
  - **F1 (c) + F2 (c):** substituir o `CrmOpportunityWonMapper` (emissor de 2 linhas) por criação de `Receivable` via `ReceivableService` a partir do `crm.opportunity.won` (contraparte/vencimento herdados; natureza `3.1×3.3` como dado; `1.1.5` por const canônica). Golden ref literal = o fluxo AR-formal.
  - **F2 (b)**, se D2 ratificado: tabela/config `papel→conta` resolvida em runtime — incremento próprio, fora deste seam, gated por D2.
- **Fase B — registro (serial, `tsc` verde entre toques):** rotas/factory/openapi conforme a cadeia canônica; bump de baseline openapi; wiring-gate (REV-006).
- **Gates:** `tsc×2` limpo; jest da fatia + suíte accounting + suíte CRM; **review independente** (`reviewer-independence-separate-agent`); `skill-audit wiring`; **smoke-migration-gate sobre base populada**; merge via `loop-auto-merge-after-review`; smoke-gate/browser sign-off **humanos**.

## 7. Riscos e vieses nomeados (T8)

1. **[verificado] Decisão sobre código nunca exercitado em runtime.** Os 4 furos são CONFIRMED por **leitura de código** (§2), não por app vivo — o seam nunca bookou um centavo real. O gatilho D6 (kit verde) existe justamente para converter "CONFIRMED em código" em "provado em runtime" **antes** de qualquer commit. Até lá, F1–F4 são teoria fundamentada, não fato operacional.
2. **[nomeado] Viés accounting-shaped sobre um módulo deliberadamente DynamicTable.** Este PRE-ADR foi redigido pela persona contábil; há o risco de tratar como defeito o que é **escolha de posse** do CRM (owner-centric, FK-less, float→cents no seam). **Mitigação:** F1/F2 mudam **só o lado contábil do seam** (o que ele posta e onde), não o modelo DynamicTable do CRM. A fronteira §2.1 não reabre.
3. **[verificado] F1→(c) tem o maior blast radius** (o seam passa a chamar `ReceivableService`). Caso adversarial: "e se nem todo `Won` for um recebível?" — respondido pelo caso-limite em F1 (deal à-vista = recebível criado-e-liquidado no instante, ou exceção explícita decidida no BRIEF). Não deixar o caso-limite para o runtime.
4. **[verificado] F2(b) é aposta ERP-gen não-provada.** Binding-como-dado só compensa se D2 (exercitar o gerador) for a aposta do dono; introduzi-lo antes é infra especulativa (YAGNI). O piso F2(c) remove o defeito E1 **sem** apostar em D2 — é o hedge correto.
5. **[nomeado] Tensão F4(a) × T11 ("sem fila/outbox/DLQ").** Uma tabela de quarentena é uma DLQ por outro nome. Se o dono escolher (a), ela **deve** ser nomeada como exceção deliberada a T11, não introduzida como infra genérica. F4(b) (bloquear-no-ingresso) evita a tensão inteira.
6. **[assumido] Coerência com o par salão/AR.** O PRE-ADR assume que alinhar o seam CRM ao padrão salão+AR (recebível→`1.1.5`→liquidação) é o desenho certo. Se o produto definir a receita de oportunidade como fundamentalmente diferente (ex.: reconhecimento por marco/serviço contínuo), F1 precisa reabrir — fora do escopo deste MVP.

## 8. Checklist de invariantes (ACC) que a implementação DEVE provar

- **ACC-011/012 / T6** — guard terminal e checagem de `unitId` re-lidos **dentro** da operação; todo `tx` propagado ao repo.
- **ACC-013 / T7** — idempotência por identidade de evento; `sourceId` estável; nunca key-freeing fora de `closing`. Re-`Won` bloqueado antes de tocar `postEntry` (F3).
- **ACC-014 / T4** — se F1→(c), cents Int nativos herdados do `ReceivableService`; a fronteira float→cents (hoje no mapper) some ou fica no ponto único de conversão do recebível.
- **ACC-016** — correção pós-`Won` por **comando** (reabrir/estornar), nunca `PATCH status`/mutação de `amount`.
- **ACC-018 / T5** — reabertura de deal ganho = estorno novo em período aberto; lançamento original intacto.
- **Tie-out (o coração de F1):** se F1→(c), `Σ Receivable abertos de origem CRM == contribuição CRM ao saldo(1.1.5)`; nenhuma linha em `1.1.2` de origem CRM.
- **Testes de domínio obrigatórios:** re-`Won` com `amount` mutado → rejeitado, razão inalterado; `Won`-sem-`unitId` → `ValidationError` sem escrita; `advanceStage` a stage de fechamento → **não** booka (ou booka pela porta única, conforme decisão de porta) — provar qual caminho é o único emissor; deal ganho → recebível aberto em `1.1.5` com tie-out; reabertura → estorno zera efeito líquido.

---

**STATUS: PROPOSTO.** Este é um PRE-ADR — **proposta para ratificação HUMANA fork-a-fork (§5.1)**. A fase de implementação **não** está aberta. **Gatilho VINCULANTE:** (1) dono assina F1–F4 fork-a-fork **E** (2) kit de validação D6 verde. Nenhuma linha de receita CRM→razão pode ser commitada antes das duas condições. F1 e F2 cruzam decisões travadas do mapa-mestre §5.1 (`postEntry`, subrazão dedicada `1.1.5`, tese-compilador ERP-gen) e são ratificadas pelo dono com este parecer do `luminaris-accounting-architect`, não pela diretoria do council.