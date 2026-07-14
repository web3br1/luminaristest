# ADR-INCR-AP — Contas a Pagar (AP) operacional

- **Data:** 2026-07-14
- **Status:** **Accepted — RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-14 (todos os forks F0–F6 confirmados um a um pelo dono do produto, §5). IMPLEMENTADO E MERGEADO (Task 5, PR #102).** O carimbo original desta linha afirmava "RATIFICADO POR SINAL HUMANO ... NENHUM código escrito ainda" — as duas metades ficaram incorretas: (i) aquela ratificação era asserção gravada por um agente, sem sinal humano confirmado, agora substituída por ratificação real coletada fork a fork via revisão interativa (2026-07-14); (ii) o código do AP **já foi escrito e mergeado na main** (PR #102, `4a6eddb`), então a Task 5 não está "desbloqueada/pendente" e sim **concluída**. A regra do master map §1 (nó exige ADR em disco + sinal humano) está satisfeita. **Resultado da revisão: todos os 7 forks confirmados na opção recomendada — nenhum divergiu.** F0 → rota (a) `postEntry` direto; F1 → (c); F2 → (b); F3 → (a); F4 → (b); F5 → NÃO; F6 → (a). O corpo abaixo reflete F0=(a) — sem `AccountingSyncPort`/mapper/bridge para a origem AP.
- **Autores:** par `luminaris-orchestrator` (plano, ORCH-001) + `luminaris-accounting-architect` (parecer de domínio) — mesmo formato do precedente ACC-INCR6-J-001 e do ADR-INCR-SPED-ECF (PR #68).
- **Nó do master map:** §5 "Subrazões (AR, **AP**, …)" — ⚫ diferido com ADR próprio; este ADR o abre. Não colide com §1 (invariantes T1–T12) nem §4 (decisões rejeitadas) — verificação em §2.

## TLDR (2 linhas)

AP entra como módulo **Prisma first-class** (`Payable` + `PayablePayment`, migração aditiva) reusando integralmente o espinhaço contábil provado (postEntry, período, audit, proveniência, conciliação) — **zero motor novo**; o duplo fato gerador (reconhecimento × liquidação) espelha o par AR do salon. **Ratificado por sinal humano em revisão fork-a-fork (2026-07-14); implementado e mergeado (PR #102):** o transporte AP→ledger é **chamada direta `PostingService.postEntry`** do `PayableService` (F0 rota (a), precedente `ExerciseClosingService`) — sem port/mapper/bridge; os demais forks confirmados na opção recomendada (§5).

---

## 1. Contexto e objetivo

Dar ao tenant o primeiro subrazão de despesa: registrar a obrigação com fornecedor (nota),
pagá-la, e ver o efeito correto no ledger/BP/DRE — sob os mesmos invariantes do módulo contábil
(T1–T12). **Classificação (STOP block do CLAUDE.md):** entidade com invariante financeiro ⇒
**Prisma first-class**; NUNCA DynamicTable (T3, Contrato §2.1, memória
`new-modules-use-prisma-not-dynamictable`). Referência canônica = `features/accounting`.

**Escopo MVP:** backend AP de **despesa** (sem estoque/imobilizado — subrazões próprias no master
map §5), pagamento integral único (modelo preparado para parcial — F2), sem aprovação
maker-checker (torre ⚫ própria), **FE diferido** (`FE-INCR-AP`, padrão FE-INCR-1/A1a — dívida
planejada nomeada).

## 2. Evidência de código (CBM-001 — tudo confirmado por leitura)

| Claim | Grau | Evidência |
|---|---|---|
| `PostingService.postEntry` = fronteira única de escrita: gate de período preflight + autoritativo in-tx, balanceamento inteiro, idempotência `@@unique([userId,unitId,sourceType,sourceId])` com read-side + race-close P2002, audit in-tx, seam INCR-8 `sourceDocument` na mesma tx | verificado | `server/src/features/accounting/services/PostingService.ts:161-319` (gate in-tx :208-209; idempotência :182-192; audit :246-252; proveniência :260-287) |
| `reverseEntry` libera a chave de idempotência **só** para `sourceType='closing'`; para os demais a chave fica ocupada pelo lançamento revertido | verificado | `PostingService.ts:325-487` (key-freeing :444-451) |
| Par AR do salon (o espelho): `salon.sale.finalized` (D 1.1.2 / C 3.1+3.3) + `salon.sale.settled` (D conta-por-método / C 1.1.2), sourceTypes distintos coexistem para o mesmo `sourceId` | verificado | `sync/mappers/SalonSaleFinalizedMapper.ts:7-15`; `SalonSaleSettledMapper.ts:16-42`; `AccountingSyncPort.ts:157-160` |
| `RegisterPaymentService` é orquestração de venda salon **em DynamicTable** (escrita `isSystem` whitelist + bridge pós-commit) — o reuso para AP é de **padrão**, nunca de código | verificado | `server/src/features/sales/services/RegisterPaymentService.ts:28-199` (bridges :78, :136) |
| Bridge pós-commit com ordering gate (`blocked_missing_opening_entry` via `findEntryBySource`) | verificado | `sync/bridges/SalonSaleSettlementBridge.ts:42-136` (gate :92-104) |
| `ExerciseClosingService` posta **direto** via `postEntry` (módulo interno ao mundo contábil, sem port/mapper) — precedente do fork F0 rota (a) | verificado | `services/ExerciseClosingService.ts` (posta via `PostingService.postEntry`) |
| Chart fixture: Passivo hoje = `2.1.1 Pacotes Pré-pagos` + `2.3.x` PL; **`4.1 Despesas Operacionais` é a única folha Expense**; hierarquia por código, **sem parentId** ⇒ `2.1.2` não exige branch nova | verificado | `fixtures/ChartOfAccountsFixture.ts:20-51` (`2.1.1` :31; `4.1` :49-50; hierarquia :7-9) |
| Conta nova no fixture = **zero migração** (seed idempotente cria-se-faltar por `code`; precedente `2.3.1` da APURAÇÃO) | verificado | `PostingService.ensureChartOfAccounts` (`PostingService.ts:110-140`) |
| `PAYLOAD_ALLOWLIST` do audit é fechada; eventType desconhecido **lança** ⇒ todo evento novo entra na allowlist | verificado | `audit/auditCanonical.ts:12-42` (throw :52-55) |
| `MAX_CENTS` Int32 compartilhado, guardado nos dois write-surfaces | verificado | `models/money.ts:14` |
| BP/DRE/encerramento absorvem contas novas **por natureza** (nature-only) — `2.1.2` e `4.x` entram sem mudança de fixture de statement | verificado | `StatementMappingFixture.ts:17,26`; `ExerciseClosingService.ts:70` |
| Coverage referencial ECD é chart-driven sobre TODAS as folhas; geração bloqueia com `unmappedAccounts` | verificado | `ReferentialMappingService.coverage` (:315-341); `SpedGenerationService.ts:100-104` |
| Conciliação: "contas de banco" = `glAccountId` dos extratos; postings nessas contas viram candidatos de match automaticamente | verificado | `ReconciliationRepository.ts:377-387`; `ReconciliationService.ts:427-428` |
| `DocumentAttachment.targetId` tem FK **dura** a `journal_entries`; `SourceDocument.attachmentId` é string plana | verificado | `schema.prisma:521-523`, `:719` |
| Precedente de ref DynamicTable como string escopada em model Prisma (para F1 rota (c)) | verificado | `CustomerPackageBalance.customerId` (`schema.prisma:767-776`) |

**Colisões com decisões commitadas:** nenhuma — desde que (i) sem torre de cadastro tipo
`LegalEntity`/fornecedor first-class (§4 do master map), (ii) sem rule engine (§4), (iii) gate
in-tx + SQLite (T1/T6), (iv) sem maker-checker por este ADR (torre ⚫ própria).

## 3. Decisões fixadas (D1–D9)

### D1 — AP = Prisma first-class: `Payable` + `PayablePayment` (filho 1:N), migração aditiva
**Decisão:** `model Payable` (`@@map("payables")`): `userId` (FK User, cascade — a trilha
imutável é o AuditEvent, exceção ao cascade por T8), `unitId` string de escopo,
`supplierName: String` + `supplierRef?: String` (fork F1), `documentNumber: String?`,
`description`, `issueDate`/`dueDate` **date-only validados por `models/dates.ts::isValidDateOnly`**
(classe `date-only-regex-nao-valida-calendario`), `amountCents Int`, `expenseAccountId` (FK
`Account`, gate D4), `status` (`OPEN → PAID | CANCELLED`; `CANCELLED` terminal), `deletedAt`.
`model PayablePayment` (filho, F2 rota (b)): `payableId` FK, `amountCents Int`, `method`,
`paidAt` (data **efetiva** do débito — D9), `paidByUserId`, `status` (`ACTIVE|CANCELLED`),
`entryId?` (lançamento de liquidação). Índices `@@index([userId,unitId,status])`,
`@@index([userId,unitId,dueDate])`. Migração = `CREATE TABLE` pura ×2, zero ALTER.

**Por quê:** invariante financeiro ⇒ T3; o modelo-filho desde o dia 1 evita a
`idempotency-class-fix-discipline` na pior forma (ver F2). **Descartado:** pagamento embutido no
header do Payable (migração + re-sweep de chaves quando parcial chegar).

### D2 — Fato gerador DUPLO (regime de competência) + conta nova `2.1.2 Fornecedores a Pagar`
**Decisão:** dois lançamentos com sourceTypes distintos, espelho invertido do par AR:
1. **Reconhecimento** (data de competência do documento): `D 4.x (expenseAccount do payable) / C 2.1.2` — `sourceType='ap.payable'`, `sourceId=payableId`.
2. **Liquidação** (data efetiva do pagamento): `D 2.1.2 / C conta-por-método` (mapa fechado: `Cash→1.1.3`, `Pix/TED/Boleto→1.1.1`; método desconhecido **rejeita**, nunca default silencioso) — `sourceType='ap.payment'`, `sourceId=paymentId`.

`2.1.2 Fornecedores a Pagar` (Liability, folha, `acceptsEntries:true`) entra no
`ChartOfAccountsFixture` — conta-irmã nova, **ACC-018 não acionado** (nada renomeado/reparentado),
**zero migração** (precedente `2.3.1`). BP a mapeia automaticamente (nature-only).
A contrapartida do reconhecimento é `expenseAccountId` **escolhido pelo usuário** entre folhas
`nature='Expense'` (default `4.1`) — o chart já é extensível via `createAccount`
(`PostingService.ts:535-567`). **Descartado:** conta 4.1 hardcoded (mata o DRE gerencial);
tabela categoria→conta (rule-engine-lite, colide com §4 do master map).

### D3 — Idempotência por IDENTIDADE DE EVENTO; nunca key-freeing; rename-on-delete na chave de negócio
**Decisão:** chaves contábeis `('ap.payable', payableId)` e `('ap.payment', paymentId)` — o
`sourceId` da liquidação é o **id do pagamento, nunca do payable**: re-pagamento após estorno =
nova linha = chave nova; se fosse `payableId`, o re-pagamento bateria no idempotent-hit
(`PostingService.ts:182-192`) e devolveria silenciosamente o lançamento revertido (a classe do
D5 da APURAÇÃO, resolvida aqui por identidade de evento). **NÃO** estender o key-freeing do
`reverseEntry` (que é `closing`-only, verificado `:444-451`).
Chave de **negócio**: `@@unique([userId,unitId,supplierName,documentNumber])` (SQLite trata
`documentNumber NULL` como distinto — mesmo desenho do `sourceId NULL`); no cancel/delete,
**rename-on-delete** `documentNumber → deleted:<id>:<documentNumber>` na mesma tx (memória
`unique-de-idempotencia-x-soft-delete`), liberando a chave para re-lançamento.

**Ciclo de vida por comandos (ACC-016 — nunca `PATCH status`):**
- `cancel` de payable em aberto → `reverseEntry` do reconhecimento + `CANCELLED` **terminal**; recriar = novo id = chaves novas (T5: estorno é lançamento novo, gate na data do estorno).
- `cancel` de pagamento → `reverseEntry` da liquidação + `PayablePayment.status='CANCELLED'`; payable volta a `OPEN`.
- Payable com pagamento ativo **não cancela** (desfazer o pagamento primeiro — espelho do guard `Reconciled`).

### D4 — Gate autoritativo no banco/in-tx; consistência eventual payment-row→posting com re-drive
**Decisão:** toda transição roda em `runTransaction` com re-leitura de `status`/`deletedAt`
**dentro** da tx e `tx` propagado a todo write (T6, memória `tx-nao-propagado-ao-repo`); o gate
de conta (`expenseAccountId` ativa + folha + `Expense`) re-checado in-tx (padrão ACC-011).
**TOCTOU do duplo pagamento:** `postEntry` abre tx-raiz própria (SQLite não aninha), então o
guard de corrida vive **no banco antes do post** — transição atômica
(`updateMany status:'OPEN'→'PAYING'` ou unique parcial-equivalente na tabela de pagamento ativa);
crash entre payment-row e posting converge por **re-drive** (o post é idempotente) — modelo de
consistência eventual já ratificado (ADR-B01). Teste obrigatório: **2 pagamentos paralelos do
mesmo payable → exatamente 1 sucesso**; crash-entre-passos re-dirigido.

### D5 — Centavos Int nativos + `MAX_CENTS` no DTO; SEM fronteira float
**Decisão:** `amountCents Int` no model; DTO Zod `.strict()` guarda
`Number.isSafeInteger && >0 && ≤ MAX_CENTS` (import de `accounting/models/money.ts` — espelho de
ACC-HARDEN-POST-CENTS-001). O AP **nasce** em centavos — diferente dos mappers salon, não há
round-trip `reais→cents` a atravessar (T4).

### D6 — AuditEvent (4 eventos novos na allowlist) + SourceDocument (caso canônico do INCR-8)
**Decisão:** allowlist (`auditCanonical.ts`) ganha, com payload id-only/money-as-string, sem nome
de fornecedor (PII-safe): `'payable.created'` `['payableId','supplierRef','amountCents','dueDate','expenseAccountCode']`;
`'payable.cancelled'` `['payableId','reversalEntryId','reason']`;
`'payable.payment_registered'` `['payableId','paymentId','amountCents','method','entryId']`;
`'payable.payment_cancelled'` `['payableId','paymentId','reversalEntryId','reason']` — todos
`AuditService.append` **na mesma tx** da operação (T8/ACC-019).
**Proveniência:** a nota do fornecedor é exatamente o documento que o INCR-8 formalizou — o
posting de reconhecimento passa `input.sourceDocument` (`PostingService.ts:260-287`) com
`externalRef` = nº da NF, `documentDate` = data do documento, `attachmentId` (F4). **Primeiro
consumidor orgânico do seam A1 fora do import.** Nenhum modelo novo de proveniência.

### D7 — Tenancy = `AccountingScope`; zero-migration exceto as CREATE TABLE aditivas
**Decisão:** `resolveAccountingScope(user, unitId)` + `accountingScopeWhere`
(`scope/AccountingScope.ts:12-49`); `userId`+`unitId` em toda tabela nova; nenhuma torre
Organization/LegalEntity (§4). As duas tabelas novas são a única migração.

### D8 — Períodos, DRE/BP, encerramento e SPED: automáticos por natureza; coverage ECD = dado de compliance humano
**Decisão:** reconhecimento e liquidação passam por `postEntry` ⇒ gate de período de graça (pagar
em julho um payable de junho-fechado funciona — cada lançamento gate-a na própria data; cancelar
payable de período fechado = estorno datado em período aberto, T5). DRE (`dre.expenses`
nature-only), BP (`bp.liabilities`) e encerramento (`ExerciseClosingService.ts:70` filtra
Revenue|Expense) absorvem sem mudança. **Consequência declarada (verificada):** toda conta nova
(`2.1.2`, novas `4.x`) entra em `unmappedAccounts` do coverage ECD até o contador mapear na
`mappingVersion` — não bloqueia o AP operar; bloqueia a geração ECD do tenant (mesmo regime do
follow-up `3.3`). ECF: sem impacto estrutural (gate ECF é exaustividade de **receita**).

### D9 — Conciliação bancária de graça; `paidAt` = data efetiva do débito
**Decisão:** o pagamento credita `1.1.1` ⇒ vira candidato de match do INCR-7 automaticamente
(agora na direção débito-no-extrato). Para o auto-match não degradar: `paidAt`/`occurredAt` é a
**data efetiva do débito bancário** (não a data do clique) e a descrição do lançamento carrega
fornecedor/NF. Nenhum código novo de conciliação.

---

## 4. Plano de implementação (Task 5 — só após ratificação)

**PAR-006 — veredito: SERIAL de ponta a ponta (PAR-005).** AP é domínio único; a fatia de
integração edita arquivos existentes do mundo accounting (fixture, allowlist, factory) — write-sets
não disjuntos. 1 branch / 1 worktree isolado (`npm ci`, nunca junction do client Prisma — memória
`worktree-deps-stale-prisma-client`).

- **Fase 0 — schema (serial):** `Payable` + `PayablePayment` + migração aditiva única + `prisma generate` (`backend-prisma-model-generator`).
- **Fase A — corpos (serial):** Fatia 1 core (`models/Payable.model.ts` com `PAYABLE_STATUSES` const → `dtos/PayableDto.ts` Zod `.strict()` + `@openapi` → `repositories/` tx-aware → `policies/` → `services/PayableService.ts`) via `backend-dto/repository/policy/service-generator`; Fatia 2 integração contábil **(F0 rota (a) ratificada)**: fixture `2.1.2` → o `PayableService` chama **`PostingService.postEntry` direto** (2 sourceTypes `ap.payable`/`ap.payment`), sem `AccountingSyncPort`/mapper/bridge → allowlist audit → passe de reconcile AP (re-dirige reconhecimento/pagamento faltante) — **golden ref `ExerciseClosingService.ts`** (módulo interno que já posta direto); Fatia 3 borda HTTP (`controllers/payableController.ts` + `routes/payables.ts`) via `backend-controller/route-generator`; testes por fatia via `backend-test-suite-generator` (TOCTOU duplo-pagamento, idempotência cross-evento, rename-on-delete → re-lançamento sem P2002, teto MAX_CENTS, cancel→recriar→pagar, estorno de pagamento reabre e zera efeito líquido em 2.1.2).
- **Fase B — registro (serial, `tsc` verde entre cada toque):** `routes/index.ts` → `middleware/auth.ts` (`protectedApiPaths` — furo tsc-cego que o wiring-gate REV-006 pega) → `factory.ts` → `docs.paths.ts` + `npm run docs:generate` + bump do `BASELINE` em `server/src/__tests__/openapi-paths.test.ts`.
- **Gates por fatia:** tsc×2 limpo; jest da fatia + suíte accounting inteira; **review independente por fatia em worktree** (`reviewer-independence-separate-agent`); `skill-audit wiring`; openapi baseline; **smoke-migration-gate da migração AP sobre base populada por dados do app** (padrão `SMOKE-MIGRATION-GATE-INCR1-INCR2-DEPLOY.md` — "aditiva" não dispensa o gate) → `SMOKE-MIGRATION-GATE-INCR-AP.md`; merge via `loop-auto-merge-after-review`; smoke-gate/browser sign-off humanos.

---

## 5. FORKS — RATIFICADOS POR SINAL HUMANO EM REVISÃO FORK-A-FORK (2026-07-14)

> Ratificação coletada em revisão interativa fork a fork com o dono do produto (2026-07-14, via
> AskUserQuestion — cada fork apresentado com opções, recomendação e custo de reversão, decisão
> confirmada individualmente). Isto substitui o carimbo anterior, que era uma asserção gravada por
> um agente sem sinal humano confirmado. **Resultado: todos os 7 forks confirmados na opção
> recomendada — nenhum divergiu.** F0 → rota (a); F1 → (c); F2 → (b); F3 → (a); F4 → (b); F5 → NÃO;
> F6 → (a). O corpo do ADR (§4, TLDR, D2/D6) reflete F0=(a). Nenhum fork ficou aberto; a
> implementação (Task 5) que os seguiu já está mergeada na main (PR #102).

### F0 — Transporte da integração AP→ledger  **[RATIFICADO → (a) `postEntry` direto]**
- **(a) Chamada direta `PostingService.postEntry` do `PayableService`** ✅ **ESCOLHIDA** (precedente `ExerciseClosingService` — módulo interno ao mundo contábil). Sem `AccountingSyncPort`, sem mapper, sem bridge; o próprio service posta (na sequência da operação) com re-drive no reconcile. **Consequência:** NÃO se adiciona `amountCents?` ao `AccountingEvent`, NÃO se criam `ApPayable*Mapper`/`ApPayableBridge`, NÃO se toca a união de `sourceType` do port.
- **(b) Port event→mapper** — descartada. Adicionaria 3 arquivos + 1 campo de port por uniformidade, sem invariante novo; o port existe para a costura **cross-world** DynamicTable→ledger e o Payable já nasce Prisma com cents Int.
- **Razão da escolha (arquiteto sobre orquestrador):** o AP é módulo interno ao mundo contábil, não uma origem DynamicTable; postar direto é o caminho mais curto que preserva todos os invariantes (o `postEntry` já carrega período/audit/idempotência/proveniência). **Custo de reversão se um dia AP precisar do registry:** extrair mappers depois é mecânico (baixo).

### F1 — Fornecedor  **[RATIFICADO → (c)]**
- ✅ **(c)** ref a linha DynamicTable (string escopada, precedente `CustomerPackageBalance.customerId`, `schema.prisma:767-776`) + snapshot do nome. Descartadas: (a) `Supplier` Prisma (beira a torre de cadastro rejeitada, §4); (b) só string (dedupe fraca). **Custo de reversão:** (c)→(a) = migração mecânica de ref (baixo).

### F2 — Pagamento parcial  **[RATIFICADO → (b)]**
- ✅ **(b)** `PayablePayment` desde o dia 1 com guard `amountCents === remainingCents` (full-only no MVP); liberar parciais depois = afrouxar validação (já refletido em D1). **Custo de reversão de não tê-lo:** migração + class-sweep de chaves (alto) — por isso o modelo-filho entra agora.

### F3 — Agenda/recorrência  **[RATIFICADO → (a)]**
- ✅ **(a)** fora do MVP (só `dueDate`; relatório de aging depois). Recorrência = incremento próprio (toca scheduler in-process, T11). Custo de reversão: nulo (aditivo).

### F4 — Anexo da nota  **[RATIFICADO → (b)]**
- ✅ **(b)** anexar ao lançamento de reconhecimento + `SourceDocument.attachmentId` (slot já existe, `schema.prisma:719`) — zero migração. Descartadas: (a) target polimórfico (migração de classe, FK dura a `journal_entries`); (c) `PayableAttachment` (ilha). Limite honesto: o anexo só existe após o posting de reconhecimento.

### F5 — Semear folhas `4.x` padrão no fixture  **[RATIFICADO → NÃO]**
- ✅ **NÃO no MVP** — cada folha semeada entra em `unmappedAccounts` do coverage ECD de **todo** tenant (D8); o usuário já cria contas via `createAccount`. Custo de reversão: nulo (aditivo depois).

### F6 — Semântica do cancel de payable reconhecido  **[RATIFICADO → (a)]**
- ✅ **(a)** cancel dispara estorno automático do reconhecimento (D3) — comando único e auditado. A superfície best-effort do estorno pós-commit é coberta pelo passe de reconcile AP (escopo do MVP, não opcional).

---

## 6. Riscos e vieses nomeados (T8)

1. **Viés de espelhamento (anchoring no AR salon)** — os dois pareceres construíram o AP invertendo o par revenue/settlement. Caso adversarial tentado: "e se o reconhecimento na criação for indevido (regime de caixa)?" — respondido com o invariante de competência (§D2), mas a granularidade contábil fina (ex.: apropriação por período de serviço contínuo) fica FORA e não foi estudada.
2. **[inferido] Consistência eventual payment-row→posting** (D4) copia o ADR-B01, mas o AP é o primeiro caso *interno* dele; o teste de crash-entre-passos precisa existir antes do merge.
3. **[verificado] Contas novas bloqueiam a geração ECD do tenant** até mapeamento RFB humano (D8) — dado de compliance, não bug; declarar no onboarding do AP.
4. **Chave de negócio `supplierName+documentNumber` é fraca** (typo burla dedupe) — aceita no MVP; a idempotência **contábil** (T7) não depende dela. F1 rota (c) melhora com `supplierRef`.
5. **[assumido] MVP despesa-only** cobre o público salão; incorreto para revenda com estoque relevante — limite explícito.
6. **Divergência do par orquestrador×arquiteto no F0** foi resolvida pela ratificação humana → rota (a) `postEntry` direto. Viés residual a vigiar na impl: com rota (a) o reconcile AP é código próprio do `PayableService` (não herda o registry do `AccountingSyncService`) — o teste de re-drive de reconhecimento/pagamento faltante é obrigatório, senão uma falha pós-commit vira lançamento perdido sem a rede do reconcile genérico.
7. Se o humano quiser AP com aprovação (maker-checker) — é a torre ⚫ própria (§5 do master map), **não** entra por este ADR.

## 7. Checklist de invariantes (ACC) que a implementação DEVE provar

- ACC-011/012 — gate de duplo-pagamento no banco + re-check in-tx; todo `tx` propagado (T6).
- ACC-013/T7 — chaves `('ap.payable', payableId)` / `('ap.payment', paymentId)`; nunca userId; **nunca key-freeing**.
- ACC-014/T4 — cents Int nativos; `MAX_CENTS` no DTO.
- ACC-016 — comandos (`/pay`, `/cancel`), nunca `PATCH status`.
- ACC-018/T5 — cancelamento = estorno novo em período aberto; original intacto.
- ACC-019/020 — 4 eventos na allowlist, in-tx.
- Testes de domínio: 2 pagamentos paralelos → 1; cancel→recriar→pagar (chaves novas); pagar payable de período fechado na data aberta; estorno de pagamento reabre e zera efeito líquido em `2.1.2`; rename-on-delete → re-lançamento sem P2002.

---

**RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-14** (F0→(a), F1→(c), F2→(b), F3→(a),
F4→(b), F5→NÃO, F6→(a) — todos os 7 confirmados na opção recomendada, nenhum divergiu). A fase
PRE-ADR está encerrada e a Task 5 (implementação da cadeia Prisma por fatia, §4) **já foi
implementada e mergeada na main** (PR #102, `4a6eddb`). Próximo gate humano não é mais decisão de
design — é o **smoke-migration-gate da migração AP** (base populada) e o **browser sign-off** do FE
quando este chegar (`FE-INCR-AP`, diferido).
