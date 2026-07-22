# ADR-INCR-AR — Contas a Receber (AR) operacional

- **Data:** 2026-07-14
- **Status:** **Accepted — RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-14 (via AskUserQuestion).**
  Decisões confirmadas: **F7 → (a)** conta nova dedicada `1.1.5 Clientes a Receber` (subledger-exclusiva,
  tie-out limpo, espelha o `2.1.2` do AP); **F0 → (a)** `PostingService.postEntry` direto do `ReceivableService`
  (espelho AP); **F1 → (c)** cliente = ref DynamicTable + snapshot; **F2 → (b)** `ReceivableReceipt` filho
  full-only; **F4 → (b)** anexo via `SourceDocument`; **F6 → (a)** cancel = estorno automático; **F3 → (a)**
  sem recorrência; **F5 → NÃO** semear folhas de receita. **Implementação (Task pós-ADR) ainda NÃO iniciada**
  — este é o gate ADR+sinal que o master map §1 exige; o nó permanece ⚫ até a implementação fechar (ORCH-007
  promove no closeout). Abre o item **8 da fila §5.1**.
- **Autores:** par `luminaris-orchestrator` (roteamento, ORCH-001) + `luminaris-accounting-architect`
  (parecer de domínio) — mesmo formato do precedente `ADR-INCR-AP-accounts-payable.md`.
- **Nó do master map:** §5 "Subrazões restantes (**AR formal**, estoque, imobilizado, folha, fiscal)" —
  ⚫ diferido; este ADR o abre. Espelho direto do AP recém-fechado (máximo reuso do padrão canônico).
  Não colide com §1 (T1–T12) nem §4 (rejeitadas) — verificação em §2.

## TLDR (2 linhas)

AR entra como módulo **Prisma first-class** (`Receivable` + `ReceivableReceipt`, migração aditiva),
**espelho invertido do AP** e do par receita/liquidação do salão: reconhecimento por competência
(`D conta-de-controle-AR / C receita`) + recebimento (`D caixa-por-método / C conta-de-controle-AR`),
reusando integralmente o espinhaço provado (`postEntry`, período, audit, proveniência INCR-8, conciliação
INCR-7) — **zero motor novo**. Todos os forks espelham os do AP já ratificados; a **única decisão nova é
qual conta de controle o AR-formal usa** (dedicada nova vs a `1.1.2 A Receber` que o salão já usa) — F7, §5.

---

## 1. Contexto e objetivo

Dar ao tenant o subrazão de **receita a receber**: registrar a fatura/duplicata do cliente (competência),
recebê-la, e ver o efeito correto no ledger/BP/DRE sob os mesmos invariantes (T1–T12). É o **par simétrico
do AP** — fecha o subledger de dois lados (a pagar × a receber). **Classificação (STOP block):** entidade
com invariante financeiro ⇒ **Prisma first-class**; NUNCA DynamicTable (T3). Referência canônica =
`features/accounting` e, literalmente, o módulo AP (`Payable`/`PayablePayment`/`PayableService`).

**Escopo MVP:** backend AR de **fatura de cliente** (sem nota fiscal eletrônica — NF-e é subrazão fiscal
própria no master map §5), recebimento integral único (modelo preparado para parcial — F2), sem aprovação
maker-checker (torre já existe como fluxo próprio, opt-in, não entra por aqui), **FE diferido**
(`FE-INCR-AR`, padrão FE-INCR-AP).

**Fronteira com os recebíveis do salão (crítica — a diferença estrutural do AR vs o AP):** o bridge do salão
**já gera recebíveis** — `salon.sale.finalized` reconhece receita `D 1.1.2 / C 3.1+3.3` e `salon.sale.settled`
liquida `D caixa-por-método / C 1.1.2` (evidência §2). O AR-formal é para faturas **inseridas manualmente**
(cliente B2B, serviço faturado fora do PDV do salão), **não** para vendas do salão (essas já são
contabilizadas pelo bridge; lançar um AR-formal para uma venda do salão a contabilizaria em dobro — risco
nomeado §6). A `Receivable` table só rastreia os recebíveis **avulsos**, exatamente como a `Payable` table
só rastreia obrigações inseridas manualmente (não as de origem salão).

## 2. Evidência de código (CBM-001 — tudo confirmado por leitura)

| Claim | Grau | Evidência |
|---|---|---|
| `PostingService.postEntry` = fronteira única de escrita: gate de período preflight + autoritativo in-tx, balanceamento inteiro, idempotência `@@unique([userId,unitId,sourceType,sourceId])` (read-side + race-close P2002), audit in-tx, seam INCR-8 `sourceDocument` na mesma tx | verificado | `services/PostingService.ts:161-319` |
| `reverseEntry` libera a chave de idempotência **só** para `sourceType='closing'`; demais ficam ocupadas | verificado | `PostingService.ts:325-487` (key-freeing :444-451) |
| **O salão JÁ usa `1.1.2 A Receber` como conta de recebível** — `salon.sale.finalized` faz `D 1.1.2 / C 3.1(+3.3)`; `salon.sale.settled` faz `D caixa-por-método / C 1.1.2`. sourceTypes distintos coexistem para o mesmo `sourceId` | verificado | `SalonSaleFinalizedMapper.ts:21,58-68`; `SalonSaleSettledMapper.ts:27,91-101` |
| Chart fixture: `1.1.2 A Receber` (Asset, folha), caixas `1.1.1 Banco`/`1.1.3 Caixa`/`1.1.4 A Receber Cartão`; receitas `3.1 Serviços`/`3.2 Devoluções (contra)`/`3.3 Revenda`; **`1.1.5` está livre** sob `1.1` | verificado | `ChartOfAccountsFixture.ts:22-27,50-54` (códigos usados 1.1.1–1.1.4; próximo livre 1.1.5) |
| Conta nova no fixture = **zero migração** (seed idempotente cria-se-faltar por `code`; precedentes `2.1.2` do AP, `2.3.1` da APURAÇÃO) | verificado | `PostingService.ensureChartOfAccounts`; `ChartOfAccountsFixture.ts:32-37` (comentário AP) |
| **Não existe** model `Receivable`/`AccountsReceivable` — nenhum subledger AR formal hoje (só o fluxo salão via bridge) | verificado | grep `Receivable` no `schema.prisma` → 0 models; `git ls-tree origin/main` sem AR |
| Módulo AP a espelhar: `Payable`+`PayablePayment`, `PayableService` posta **direto** via `postEntry` (F0 rota a), CAS `OPEN→PAYING` antes do post + reconcile re-drive, 4 eventos de audit, `@@unique([userId,unitId,supplierName,documentNumber])` com rename-on-delete | verificado | `ADR-INCR-AP-accounts-payable.md §3` (D1–D9); `services/PayableService.ts` |
| `ExerciseClosingService`/`PayableService` postam direto via `postEntry` (módulo interno ao mundo contábil, sem port/mapper) — precedente do F0 rota (a) | verificado | `services/ExerciseClosingService.ts`; `services/PayableService.ts:148` |
| `PAYLOAD_ALLOWLIST` do audit é fechada; eventType desconhecido **lança** ⇒ eventos AR novos entram na allowlist | verificado | `audit/auditCanonical.ts:12-47` |
| `MAX_CENTS` Int32 compartilhado, guardado nos write-surfaces | verificado | `models/money.ts:14` |
| BP/DRE/encerramento absorvem contas novas **por natureza** (nature-only) — uma conta Asset nova (`1.1.5`) e as receitas `3.x` entram sem mudança de statement-fixture | verificado | `StatementMappingFixture.ts`; `ExerciseClosingService.ts:70` (filtra Revenue|Expense) |
| Conciliação: recebimento credita/debita conta de banco ⇒ vira candidato de match do INCR-7 automaticamente | verificado | `ReconciliationRepository.ts:377-387` |
| Precedente de ref DynamicTable como string escopada em model Prisma (F1) | verificado | `CustomerPackageBalance.customerId` (`schema.prisma:767-776`) |

**Colisões com decisões commitadas:** nenhuma — desde que (i) sem torre de cadastro tipo `Customer`
first-class (§4), (ii) sem rule engine (§4), (iii) gate in-tx + SQLite (T1/T6), (iv) sem maker-checker por
este ADR. **Ressalva nomeada:** o AR toca a mesma conta que o salão usa (`1.1.2`) — F7 decide se
compartilha ou dedica.

## 3. Decisões fixadas (D1–D9 — espelho do AP, AR-específicas onde marcado)

### D1 — AR = Prisma first-class: `Receivable` + `ReceivableReceipt` (filho 1:N), migração aditiva
`model Receivable` (`@@map("receivables")`): `userId` (FK User cascade; trilha imutável = AuditEvent, T8),
`unitId`, `customerName: String` + `customerRef?: String` (F1), `documentNumber: String?`, `description`,
`issueDate`/`dueDate` date-only validados por `models/dates.ts::isValidDateOnly`, `amountCents Int`,
`revenueAccountId` (FK `Account`, gate D4 — folha `nature='Revenue'`), `status` (`OPEN → RECEIVED | CANCELLED`;
`CANCELLED` terminal), `deletedAt`. `model ReceivableReceipt` (filho, F2): `receivableId` FK, `amountCents Int`,
`method`, `receivedAt` (data efetiva do crédito — D9), `receivedByUserId`, `status` (`ACTIVE|CANCELLED`),
`entryId?`. Índices `@@index([userId,unitId,status])`, `@@index([userId,unitId,dueDate])`. Migração =
`CREATE TABLE` pura ×2, zero ALTER. **Espelha D1 do AP** (troca supplier→customer, expense→revenue,
2.1.2→conta-AR, PAID→RECEIVED).

### D2 — Fato gerador DUPLO (competência) + conta de controle AR (F7) + receita escolhida
Dois lançamentos com sourceTypes distintos, **espelho invertido do AP**:
1. **Reconhecimento** (data de competência da fatura): `D <conta-controle-AR (F7)> / C revenueAccount` —
   `sourceType='ar.receivable'`, `sourceId=receivableId`. `revenueAccountId` **escolhido pelo usuário**
   entre folhas `nature='Revenue'` (default `3.1 Receita de Serviços`; `3.3` para revenda) — o chart já é
   extensível via `createAccount`. **Descartado:** receita hardcoded (mata o DRE gerencial por natureza).
2. **Recebimento** (data efetiva): `D conta-por-método / C <conta-controle-AR>` — mapa fechado espelhando o
   AP: `Cash→1.1.3`, `Pix/TED/Boleto→1.1.1`; método desconhecido **rejeita** (nunca default silencioso).
   Cartão fica FORA do MVP (o salão manda cartão para `1.1.4` bruto; AR-avulso raramente é cartão — extensão
   futura). `sourceType='ar.receipt'`, `sourceId=receiptId`.

A **conta de controle do AR** é a decisão nova (F7): conta nova dedicada `1.1.5 Clientes a Receber` (proposta
recomendada — subledger-exclusiva, tie-out limpo `Σ Receivable abertos == saldo(1.1.5)`, espelha o `2.1.2`
dedicado do AP) **ou** reusar `1.1.2 A Receber` que o salão já usa (economicamente "a mesma coisa", mas o
saldo mistura origens e o subledger não bate com o razão). Entra no fixture como conta-irmã, ACC-018 não
acionado, **zero migração**. BP a mapeia automaticamente (nature-only).

### D3 — Idempotência por IDENTIDADE DE EVENTO; nunca key-freeing; rename-on-delete na chave de negócio
Chaves `('ar.receivable', receivableId)` e `('ar.receipt', receiptId)` — o `sourceId` do recebimento é o **id
do recebimento, nunca do receivable** (re-recebimento após estorno = linha nova = chave nova; senão bateria no
idempotent-hit e devolveria o lançamento revertido — a classe do D5 da APURAÇÃO). **NÃO** estender o
key-freeing do `reverseEntry` (closing-only). Chave de negócio `@@unique([userId,unitId,customerName,documentNumber])`
com **rename-on-delete** `documentNumber → deleted:<id>:<...>` no cancel/delete (memória
`unique-de-idempotencia-x-soft-delete`). **Espelha D3 do AP.**

**Ciclo de vida por comandos (ACC-016 — nunca `PATCH status`):**
- `cancel` de receivable em aberto → `reverseEntry` do reconhecimento + `CANCELLED` terminal (recriar = id novo).
- `cancel` de recebimento → `reverseEntry` do recebimento + `ReceivableReceipt.status='CANCELLED'`; receivable volta a `OPEN`.
- Receivable com recebimento ativo **não cancela** (desfazer o recebimento primeiro).

### D4 — Gate autoritativo no banco/in-tx; consistência eventual receipt-row→posting com re-drive
Toda transição em `runTransaction` com re-leitura de `status`/`deletedAt` **dentro** da tx e `tx` propagado
(T6); gate da conta de receita (`revenueAccountId` ativa + folha + `Revenue`) re-checado in-tx (ACC-011).
**TOCTOU do duplo recebimento:** guard atômico no banco **antes do post** (`updateMany status:'OPEN'→'RECEIVING'`,
count===1 vence — o CAS-before-post canônico do AP); crash entre receipt-row e posting converge por
**re-drive** (post idempotente). **Espelha D4 do AP** (o padrão 2-tx CAS + reconcile re-drive é o load-bearing
da subrazão-posta-direto — memória `accounting-incr-ap`). Teste obrigatório: **2 recebimentos paralelos → 1**.

### D5 — Centavos Int nativos + `MAX_CENTS` no DTO; SEM fronteira float
`amountCents Int`; DTO Zod `.strict()` guarda `Number.isSafeInteger && >0 && ≤ MAX_CENTS` (import de
`accounting/models/money.ts`). O AR **nasce** em centavos (diferente dos mappers salon, sem round-trip
reais→cents). **Espelha D5 do AP.**

### D6 — AuditEvent (4 eventos novos na allowlist) + SourceDocument (INCR-8)
Allowlist ganha, payload id-only/money-as-string, sem nome de cliente (PII-safe): `'receivable.created'`,
`'receivable.cancelled'`, `'receivable.receipt_registered'`, `'receivable.receipt_cancelled'` — todos
`AuditService.append` **na mesma tx** (T8/ACC-019). **Proveniência:** a fatura é o documento que o INCR-8
formalizou — o posting de reconhecimento passa `input.sourceDocument` (`externalRef`=nº da fatura,
`documentDate`, `attachmentId` F4). **Espelha D6 do AP.**

### D7 — Tenancy = `AccountingScope`; zero-migration exceto as CREATE TABLE aditivas
`resolveAccountingScope` + `accountingScopeWhere`; `userId`+`unitId` em toda tabela nova; nenhuma torre
Organization/Customer (§4). As duas tabelas novas + a conta de controle (se F7=dedicada, zero-migração via
fixture) são a única mudança. **Espelha D7 do AP.**

### D8 — Períodos, DRE/BP, encerramento, SPED: automáticos por natureza; coverage ECD = compliance humano
Reconhecimento e recebimento passam por `postEntry` ⇒ gate de período de graça. DRE (`dre.revenue`
nature-only), BP (`bp.assets`) e encerramento absorvem sem mudança. **Consequência declarada:** a conta nova
(`1.1.5` se F7=dedicada) entra em `unmappedAccounts` do coverage ECD até o contador mapear (não bloqueia o AR
operar; bloqueia a geração ECD do tenant — mesmo regime do `3.3`/`2.1.2`). **Espelha D8 do AP.**

### D9 — Conciliação bancária de graça; `receivedAt` = data efetiva do crédito
O recebimento debita `1.1.1` ⇒ candidato de match do INCR-7 (agora crédito-no-extrato). `receivedAt` é a
**data efetiva do crédito bancário** (não a do clique); descrição carrega cliente/fatura. **Espelha D9 do AP.**

---

## 4. Plano de implementação (Task pós-ADR — só após ratificação)

**PAR-006 — veredito: SERIAL de ponta a ponta (PAR-005).** Domínio único; a fatia de integração edita
arquivos existentes do mundo accounting (fixture, allowlist, factory). 1 branch / 1 worktree isolado
(`npm ci`, nunca junction do client Prisma — memória `worktree-deps-stale-prisma-client`). **O AP é o
golden ref literal — copiar o módulo, não os mappers do salão** (memória `accounting-incr-ap`).

- **Fase 0 — schema (serial):** `Receivable` + `ReceivableReceipt` + migração aditiva única + `prisma generate`.
- **Fase A — corpos (serial):** Fatia 1 core (`models/Receivable.model.ts` com `RECEIVABLE_STATUSES` → `dtos/ReceivableDto.ts` Zod `.strict()` + `@openapi` → `repositories/` tx-aware → `policies/` → `services/ReceivableService.ts`); Fatia 2 integração contábil **(F0 rota (a)): `ReceivableService` chama `PostingService.postEntry` direto** (2 sourceTypes `ar.receivable`/`ar.receipt`) + conta de controle no fixture (F7) + allowlist audit + passe de reconcile AR (re-drive) — golden ref `PayableService`; Fatia 3 borda HTTP (`controllers/receivableController.ts` + `routes/receivables.ts`); testes por fatia (TOCTOU duplo-recebimento, idempotência cross-evento, rename-on-delete → re-lançamento, teto MAX_CENTS, cancel→recriar→receber, estorno de recebimento reabre e zera efeito líquido na conta-controle).
- **Fase B — registro (serial, `tsc` verde entre toques):** `routes/index.ts` → `middleware/auth.ts` (`protectedApiPaths` — furo tsc-cego que o wiring-gate REV-006 pega) → `factory.ts` → `docs.paths.ts` + `npm run docs:generate` + bump do `BASELINE` do openapi-paths.test.
- **Gates por fatia:** tsc×2 limpo; jest da fatia + suíte accounting; **review independente** (`reviewer-independence-separate-agent`); `skill-audit wiring`; openapi baseline; **smoke-migration-gate sobre base populada** → `SMOKE-MIGRATION-GATE-INCR-AR.md`; merge via `loop-auto-merge-after-review`; smoke-gate/browser sign-off humanos.

---

## 5. FORKS — RATIFICADOS POR SINAL HUMANO EM REVISÃO FORK-A-FORK (2026-07-14)

> Ratificação coletada via AskUserQuestion (2026-07-14). **F7 (conta de controle) era a única decisão
> genuinamente nova** — o AP não a teve porque `2.1.2` nasceu net-new; o AR toca `1.1.2` que o salão já usa.
> F0 (transporte, arquiteturalmente definidor) foi confirmado explicitamente; F1/F2/F4/F6 foram ratificados
> como **espelho dos forks do `ADR-INCR-AP` já ratificados**; F3/F5 seguem o espelho. **Resultado: F7→(a),
> F0→(a), F1→(c), F2→(b), F3→(a), F4→(b), F5→NÃO, F6→(a).** Nenhum fork ficou aberto.

### F7 — Conta de controle do AR-formal  **[RATIFICADO → (a) conta dedicada `1.1.5`]**
- ✅ **(a) Conta nova dedicada `1.1.5 Clientes a Receber`** — subledger-exclusiva: só o AR-formal posta nela
  ⇒ `Σ Receivable abertos == saldo(1.1.5)` (tie-out limpo, o propósito de uma conta de controle). Espelha o
  `2.1.2` dedicado do AP. Deixa `1.1.2` como recebível-de-origem-salão, separando as origens no razão (BP soma
  por natureza). Zero migração (fixture). Entra no `ChartOfAccountsFixture` como conta-irmã sob `1.1`
  (`1.1.5` estava livre), `nature='Asset'`, folha, com uma const canônica `CLIENTES_A_RECEBER_CODE='1.1.5'`
  (resolvida por código, nunca por nome — espelho de `FORNECEDORES_A_PAGAR_CODE`).
- (b) Reusar `1.1.2` (compartilhada com o salão) — descartada: o saldo misturaria salão + avulsos ⇒ o
  subledger `Receivable` não bateria com o razão (sem tie-out), apesar de os *postings* coexistirem por sourceType.
- **Razão da escolha:** uma conta de controle existe para bater com seu subledger; compartilhar `1.1.2`
  (que o salão posta sem subledger) destruiria esse tie-out. Custo de reversão: baixo.

### F0 — Transporte AR→ledger  **[RATIFICADO → (a) `postEntry` direto]**
- ✅ **(a)** `ReceivableService` chama `PostingService.postEntry` direto (precedente `PayableService`/`ExerciseClosingService`) — sem port/mapper/bridge. Padrão canônico 2-tx CAS-before-post + reconcile re-drive.
- (b) port event→mapper — descartado (o AR nasce Prisma com cents Int, não é origem DynamicTable cross-world).

### F1 — Cliente  **[RATIFICADO → (c), espelho AP-F1]**
- ✅ **(c)** ref a linha DynamicTable (string escopada, precedente `CustomerPackageBalance.customerId`) + snapshot do nome. Descartadas: (a) `Customer` Prisma (beira a torre de cadastro §4); (b) só string (dedupe fraca).

### F2 — Recebimento parcial  **[RATIFICADO → (b), espelho AP-F2]**
- ✅ **(b)** `ReceivableReceipt` filho desde o dia 1, guard `amountCents === remainingCents` (full-only no MVP); parciais depois = afrouxar validação. Modelo-filho agora evita a `idempotency-class-fix-discipline` na pior forma.

### F3 — Agenda/recorrência (faturas recorrentes)  **[RATIFICADO → (a), espelho AP-F3]**
- ✅ **(a)** fora do MVP (só `dueDate`; aging depois). Recorrência = incremento próprio (scheduler in-process, T11).

### F4 — Anexo da fatura  **[RATIFICADO → (b), espelho AP-F4]**
- ✅ **(b)** anexar ao lançamento de reconhecimento + `SourceDocument.attachmentId` (slot existe) — zero migração.

### F5 — Semear folhas de receita extras  **[RATIFICADO → NÃO, espelho AP-F5]**
- ✅ **NÃO** — `3.1`/`3.3` já existem; o usuário cria contas via `createAccount`. Cada folha semeada entra em `unmappedAccounts` do coverage ECD de todo tenant.

### F6 — Semântica do cancel de receivable reconhecido  **[RATIFICADO → (a), espelho AP-F6]**
- ✅ **(a)** cancel dispara estorno automático do reconhecimento — comando único e auditado; a borda best-effort é coberta pelo passe de reconcile AR.

---

## 6. Riscos e vieses nomeados (T8)

1. **[verificado] Duplo-registro salão × AR-formal** — o risco AR-específico: um usuário lançar um AR-formal
   para uma venda que o salão já contabilizou via bridge ⇒ receita em dobro. Mitigação: o AR-formal é
   explicitamente para faturas **avulsas** (não-PDV); nomear no onboarding do AR; não há gate automático que
   impeça (o AR não conhece o `saleId` do salão). Aceito como risco de uso, não de código.
2. **Viés de espelhamento (anchoring no AP)** — os dois pareceres construíram o AR invertendo o AP. Caso
   adversarial: "e se o reconhecimento de receita na criação for indevido (regime de caixa)?" — respondido pelo
   invariante de competência (D2); granularidade fina (apropriação por período de serviço contínuo) fica FORA.
3. **[verificado] F7 é a diferença real do AR** — se F7=(b) compartilha `1.1.2`, o subledger AR perde tie-out
   com o razão (§F7). É a única decisão onde AR ≠ espelho mecânico do AP.
4. **[inferido] Consistência eventual receipt-row→posting** (D4) herda o padrão do AP (`accounting-incr-ap`);
   o teste de crash-entre-passos + 2-recebimentos-paralelos é obrigatório antes do merge.
5. **[verificado] Conta nova bloqueia geração ECD** do tenant até mapeamento RFB humano (D8) — compliance, não bug.
6. **[assumido] MVP fatura-avulsa-only** cobre B2B/serviço faturado; NF-e (ingestão fiscal) é subrazão própria (§4/§5).

## 7. Checklist de invariantes (ACC) que a implementação DEVE provar

- ACC-011/012 — gate de duplo-recebimento no banco + re-check in-tx; todo `tx` propagado (T6).
- ACC-013/T7 — chaves `('ar.receivable', receivableId)` / `('ar.receipt', receiptId)`; nunca userId; nunca key-freeing.
- ACC-014/T4 — cents Int nativos; `MAX_CENTS` no DTO.
- ACC-016 — comandos (`/receive`, `/cancel`), nunca `PATCH status`.
- ACC-018/T5 — cancelamento = estorno novo em período aberto; original intacto.
- ACC-019/020 — 4 eventos na allowlist, in-tx.
- Testes de domínio: 2 recebimentos paralelos → 1; cancel→recriar→receber (chaves novas); receber fatura de período fechado na data aberta; estorno de recebimento reabre e zera efeito líquido na conta-controle; rename-on-delete → re-lançamento sem P2002.

---

**RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-14** (F7→(a) conta dedicada `1.1.5`; F0→(a)
`postEntry` direto; F1→(c), F2→(b), F3→(a), F4→(b), F5→NÃO, F6→(a) — espelho do AP). A fase PRE-ADR está
encerrada. **Próximo gate = Task de implementação** (cadeia Prisma por fatia, §4 — golden ref literal =
módulo AP), não decisão de design. O nó do master map permanece ⚫ até a implementação fechar; a promoção
⚫→✅ é o closeout da Task (ORCH-007), não deste ADR.
