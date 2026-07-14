# ADR-INCR-AP — Contas a Pagar operacional (subrazão de fornecedores)

- **Status:** **DRAFT / PRE-ADR — proposta aguardando ratificação humana.** Nada decidido ainda:
  as decisões abaixo (D1–Dn) são **recomendações do agente** com base no master map, no parecer de
  domínio (`luminaris-accounting-architect`) e na leitura do código (CBM-001). Os pontos que **exigem
  o sinal do humano** estão consolidados no **§6 (Decisões em aberto)** — é o que o humano lê para
  ratificar. Nenhuma skill de geração roteia contra esta proposta até `Status: Accepted`.
- **Date:** 2026-07-13
- **Decision class:** PRISMA_FIRST_CLASS (subrazão contábil com invariante de saldo — Model + Service +
  Repository + Policy próprios; **nunca** DynamicTable; **nunca** serviço Prisma injetado no motor de
  plugins — Contrato §2.1 / T3).
- **Depends on:** INCR-D (`JournalEntry`/`Posting`, `PostingService.postEntry`/`reverseEntry`),
  INCR-1 (períodos + gate in-tx), INCR-2 (`AuditEvent` hash-chain), INCR-3 (numeração), INCR-8
  (`SourceDocument`/`JournalEntrySource`, opcional) — todos em `main`.
- **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 (linha "Subrazões (AR, AP, …)" — ⚫
  diferido; esta ADR promove **apenas** o ramo **AP** a ⏳ PRE-ADR).
- **Reusa o seam de:** ADR-D01 (Settlement & Reversal — `RegisterPaymentService` + evento
  `salon.sale.settled` → `SalonSaleSettledMapper` → `PostingService.postEntry`). **Contas a Pagar é a
  imagem-espelho da liquidação de A Receber** (passivo em vez de ativo; saída em vez de entrada) e
  **reusa o padrão event→mapper**, não inventa outro.
- **Supersedes:** none · **Related:** ADR-C01/D01 (bridge pós-commit por origem), T3/T4/T5/T6/T7/T8
  (decisões travadas — preservadas, não reabertas).

> **Nota de processo.** ADR escrito **antes de qualquer código** (ordem ideal: PLAN → ADR → BRIEF →
> impl → review). Este documento é **docs-only**: não altera schema, código nem teste. A ratificação
> das decisões-gate do §6 é **delegada ao humano**; as demais são recomendações de domínio, revisáveis.

---

## 1. Contexto / Problema

**Não existe subrazão de fornecedores hoje.** O ledger reconhece **receita** e liquida **A Receber**
(salão, ADR-C01/D01), mas o outro lado — a **obrigação com fornecedores** — não tem entidade própria.
Uma despesa/compra a prazo só poderia ser lançada como um `JournalEntry` manual `D despesa /
C 2.x Fornecedores`, sem nenhum controle operacional de:

- **quem** é o fornecedor e **qual documento** originou a obrigação (NF nº X, boleto nº Y);
- **quando vence** (data de vencimento) e **agendamento** de pagamento;
- **pagamentos parciais** (uma conta de R$ 1.000 paga em duas parcelas de R$ 500);
- **baixa/liquidação** parcial ou total contra caixa/banco, com o saldo devedor sempre visível;
- **vínculo explícito** entre a obrigação e os lançamentos contábeis que a criaram e a baixaram.

**Contas a Pagar operacional** é o **subrazão (subsidiary ledger)** que fecha esse buraco: um registro
first-class de cada obrigação (`Payable`), seus pagamentos (`PayablePayment`), sua máquina de estados
(OPEN → PARTIALLY_PAID → PAID → CANCELLED/REVERSED) e a contabilização de cada transição via o seam de
liquidação **já provado** em D01. O subrazão precisa **reconciliar** com a conta-controle do razão
(`2.x Fornecedores`): a soma dos saldos devedores dos `Payable` abertos == saldo credor da conta-controle.

**Diferença estrutural vs. o salão (registrada para não copiar o padrão errado):** a venda de salão é
uma **linha de DynamicTable** — daí a bridge pós-commit *best-effort* que cruza a fronteira §2.1 e o
bypass de `immutableAfter`. **Contas a Pagar é Prisma-nativa**: a origem (`Payable`) vive **dentro do
mundo contábil**, então **não há fronteira §2.1 a cruzar** e **não há motor de plugins envolvido**. O
seam event→mapper é reusado, mas o *locus* é um `PayableService` de domínio, não uma bridge de
integração. Isso **simplifica** (sem `isSystem` bypass, sem `findTableByInternalName`) e **abre uma
decisão de atomicidade** que o salão não tinha (§6-Q3).

**Objetivo (MVP):** dar ao contador um subrazão de fornecedores que (a) registra a obrigação e a
contabiliza (`D despesa/ativo / C Fornecedores`), (b) liquida total ou parcialmente reusando o padrão
de D01 (`D Fornecedores / C caixa/banco`), (c) mantém saldo devedor e estado sempre corretos, e (d)
reconcilia com a conta-controle. **Sem** multi-parcela agendada, **sem** integração fiscal/NF-e, **sem**
provisão/competência automática — esses são fatias/incrementos posteriores (§7, §8).

**Invariantes herdados aplicáveis:** T3 (Prisma first-class), T4 (centavo inteiro + `MAX_CENTS`), T5
(estorno é lançamento novo, post imutável), T6 (gate mutável re-checado **dentro** da `runTransaction`,
`tx` propagado), T7 (idempotência por identidade do evento — `sourceType`+`sourceId` —, nunca `userId`),
T8 (auditoria in-tx, exceção ao cascade). ACC-011/012 (gate + tx), ACC-013 (idempotência por evento).

---

## 2. Modelo de dados proposto (Prisma)

Duas entidades first-class. Valores **sempre centavo inteiro** (`Int`), teto `MAX_CENTS`
(`accounting/models/money.ts`) — nunca float (a armadilha do JSON-float do SQLite). Tenancy =
`AccountingScope` (`userId` = `ownerUserId`, `unitId`), plain scope strings.

```prisma
// Contas a Pagar — SUBRAZÃO de fornecedores (ADR-INCR-AP). First-class Prisma com invariante de saldo
// (Σ pagamentos <= amountCents; balanceCents derivado). NÃO é DynamicTable (T3). Tenancy = AccountingScope.
// A obrigação é reconhecida por 1 JournalEntry (D despesa/ativo / C Fornecedores) e liquidada por N
// PayablePayment (cada um D Fornecedores / C caixa/banco). O ledger é a fonte de verdade contábil; este
// subrazão é a projeção operacional que reconcilia com a conta-controle 2.x Fornecedores.
model Payable {
  id                 String    @id @default(cuid())
  userId             String    // AccountingScope.ownerUserId (plain scope key; ver Q6 p/ FK×cascade)
  unitId             String    // business unit (scoped string, not a FK)
  supplierName       String    // fornecedor (texto denormalizado; sem cadastro/FK no MVP — ver Q5)
  supplierRef        String?   // id/documento do fornecedor, quando houver (display/busca)
  externalRef        String?   // referência HUMANA do documento (NF nº X, boleto nº Y) — NÃO é chave de dedup (Q4)
  description        String
  documentDate       DateTime? // data de emissão do documento de origem
  dueDate            DateTime  // vencimento (date-only na fronteira — models/dates.ts)
  amountCents        Int       // valor total da obrigação (>0, <= MAX_CENTS)
  paidCents          Int       @default(0) // Σ pagamentos ativos; 0 <= paidCents <= amountCents (invariante in-tx)
  status             String    @default("OPEN") // OPEN | PARTIALLY_PAID | PAID | CANCELLED (ver §3)
  counterAccountCode String    // conta de DÉBITO do reconhecimento (despesa/ativo) — escolhida pelo caller (Q2)
  payableAccountCode String    // conta-controle de CRÉDITO (Fornecedores, ex. "2.1.2") — resolvida no fixture (Q1)
  recognitionEntryId String?   // JournalEntry do reconhecimento (D despesa/ativo / C Fornecedores)
  attachmentId       String?   // DocumentAttachment do arquivo (INCR-5), quando houver
  createdById        String?   // ator (AccountingScope.actorUserId); plain string
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  deletedAt          DateTime? // soft-delete p/ correção (Q4 trata a interação com @@unique)
  payments           PayablePayment[]

  // SEM @@unique de idempotência de ledger (segue T7/D2 do INCR-8): a dedup do lançamento vive no
  // JournalEntry.@@unique([userId,unitId,sourceType,sourceId]); Payable é a projeção operacional.
  @@index([userId, unitId, status])
  @@index([userId, unitId, dueDate])
  @@index([userId, unitId, externalRef])
  @@index([deletedAt])
  @@map("payables")
}

// Um pagamento (parcial ou total) de um Payable. Cada pagamento é uma baixa (D Fornecedores / C
// caixa/banco) com sourceId PRÓPRIO — é o eixo de idempotência que permite N pagamentos por conta sem
// colidir na @@unique do JournalEntry (a diferença-chave vs. salon.sale.settled, que é 1-por-venda).
model PayablePayment {
  id              String    @id @default(cuid())
  userId          String
  unitId          String
  payableId       String
  payable         Payable   @relation(fields: [payableId], references: [id], onDelete: Cascade)
  amountCents     Int       // valor deste pagamento (>0, <= saldo devedor no momento — gate in-tx)
  paidAt          DateTime  // data contábil da baixa (date-only na fronteira)
  paymentMethod   String    // escolhe a conta de CRÉDITO (Banco/Caixa/…) — mapa Q7
  paymentRef      String?   // referência do pagamento (comprovante, autenticação)
  settlementEntryId String? // JournalEntry da baixa (D Fornecedores / C caixa/banco)
  reversedAt      DateTime? // baixa estornada (soft) — pagamento inativo; libera o saldo (T5)
  reversedById    String?   // ator do estorno
  createdById     String?
  createdAt       DateTime  @default(now())

  @@index([userId, unitId, payableId])
  @@map("payable_payments")
}
```

**Chaves de contabilização (eixo `sourceType`/`sourceId`, T7):**

| Fato | `sourceType` | `sourceId` | Lançamento |
|---|---|---|---|
| Reconhecimento da obrigação | `ap.payable.recognized` | `payableId` | `D <counterAccountCode> / C <payableAccountCode>` |
| Pagamento (parcial/total) | `ap.payable.paid` | `paymentId` (o `PayablePayment.id`) | `D <payableAccountCode> / C <conta por paymentMethod>` |
| Estorno de reconhecimento (cancelamento) | via `reverseEntry` | `reversedById` | espelho do reconhecimento |
| Estorno de pagamento | via `reverseEntry` | `reversedById` | espelho da baixa |

> **A diferença de eixo vs. D01:** `salon.sale.settled` usa `sourceId = saleId` porque há **uma**
> liquidação por venda. Contas a Pagar admite **pagamentos parciais** → `sourceId = paymentId`
> (identidade do `PayablePayment`), de modo que N baixas do mesmo `Payable` coexistem sob a
> `@@unique([userId,unitId,sourceType,sourceId])` sem colidir. Reconhecimento fica em eixo distinto
> (`ap.payable.recognized`), então reconhecimento e baixas convivem para o mesmo `payableId`.

**Novas contas canônicas (fixture, `AccountFixture` — zero migração de schema):**

```
{ code:'2.1.2', name:'Fornecedores', nature:'Liability', acceptsEntries:true } // conta-controle do subrazão (código sujeito a Q1)
```

O lado **débito** do reconhecimento (`counterAccountCode`) é uma conta de **despesa** (ex. `4.x`) ou
**ativo** (estoque/imobilizado) **escolhida pelo caller** — o módulo AP **não** adivinha a natureza da
compra (Q2). O lado **crédito** do pagamento é resolvido por `paymentMethod` reusando a forma do
`DEBIT_ACCOUNT_BY_METHOD` de D01, **invertida** para saída (Q7).

---

## 3. Ciclo de vida / máquina de estados

```
                    (create + reconhecimento)
                    D <despesa/ativo> / C Fornecedores
        ┌─────────────────────────────────────────────┐
        ▼                                               │
      OPEN ──── pagamento parcial (Σpag < total) ───► PARTIALLY_PAID
        │                │                                │
        │                └──── pagamento parcial ─────────┘   (cada baixa: D Fornecedores / C caixa/banco)
        │                                                 │
        │  pagamento total (Σpag == total)                │ pagamento que zera o saldo (Σpag == total)
        ▼                                                 ▼
   ─────────────────────► PAID ◄──────────────────────────
        │
        │ cancelamento (SÓ se Σpag == 0)
        ▼
   CANCELLED  (reverseEntry do reconhecimento — libera a chave de idempotência, T5)
```

**Transições e contabilização:**

| Transição | Pré-condição (gate in-tx, T6) | Efeito contábil |
|---|---|---|
| **create → OPEN** | período aberto; `amountCents>0`; contas válidas/folha | 1 `JournalEntry` `D counterAccount / C payableAccount`, `sourceType='ap.payable.recognized'`, `sourceId=payableId` |
| **OPEN/PARTIALLY_PAID → PARTIALLY_PAID** | período aberto; `paymentAmount>0`; `paidCents+paymentAmount < amountCents`; saldo devedor ≥ pagamento | novo `PayablePayment` + `JournalEntry` `D payableAccount / C caixa/banco`, `sourceType='ap.payable.paid'`, `sourceId=paymentId`; `paidCents += paymentAmount` |
| **OPEN/PARTIALLY_PAID → PAID** | idem, com `paidCents+paymentAmount == amountCents` | idem; `status='PAID'` |
| **OPEN → CANCELLED** | `paidCents == 0` (nunca cancelar conta com pagamento — estorne o pagamento antes) | `reverseEntry(recognitionEntryId)` — espelho, `reversedById`; original intacto (T5) |
| **estorno de pagamento** (PAID/PARTIALLY_PAID → PARTIALLY_PAID/OPEN) | pagamento ativo; período aberto | `reverseEntry(settlementEntryId)`; `PayablePayment.reversedAt` setado; `paidCents -= amountCents`; re-derivar `status` |

**Invariante de saldo (autoritativo, re-checado DENTRO da `runTransaction` — T6/ACC-011):** a cada
pagamento, `Σ (PayablePayment ativo).amountCents + novo <= Payable.amountCents`. Um preflight de leitura
dá feedback rápido, mas **não fecha o TOCTOU** — dois pagamentos concorrentes só são barrados pela
re-checagem in-tx (o `@@unique` do JournalEntry sozinho não impede *over-payment*, apenas duplicidade).

---

## 4. Invariantes e gates de domínio (marcados)

1. **Gate de período (INCR-1, in-tx):** todo reconhecimento, pagamento e estorno re-checa período
   aberto **dentro** da tx do `postEntry`/`reverseEntry` (já embutido no `PostingService`). Data
   contábil = `dueDate`/`paidAt` conforme a transição.
2. **Gate de saldo (in-tx, T6):** `paidCents` nunca excede `amountCents`; re-checado in-tx (§3).
3. **Idempotência (T7):** reconhecimento por `(ap.payable.recognized, payableId)`; pagamento por
   `(ap.payable.paid, paymentId)`. Re-drive do mesmo evento retorna a entry existente (curto-circuito
   pré-tx do `postEntry`), nunca duplica.
4. **Tenancy (T2):** leitura/escrita sempre por `AccountingScope` (`userId`+`unitId`); acesso cross-unit
   → `NotFoundError`. Nenhum `unitId` inferido/defaultado.
5. **Estorno libera a chave (T5):** cancelar/estornar usa `reverseEntry` (lançamento novo, `reversedById`,
   original imutável). Se um `Payable` cancelado puder ser recriado, o `reverseEntry` deve liberar a
   chave `(ap.payable.recognized, payableId)` — **exatamente** o padrão de
   `ExerciseClosingService.reverseEntry` closing-aware (`unique-de-idempotencia-x-soft-delete`,
   `accounting-apuracao-encerramento`). **Cuidado de classe:** o `@@unique` cobre linhas soft-deletadas;
   quem libera a chave no delete é decisão de modelagem (Q4).
6. **Money boundary (T4):** conversão float→centavo isolada **uma vez** por evento, com `MAX_CENTS`
   guard e `Number.isSafeInteger`, no mapper — espelho exato de `SalonSaleSettledMapper`.
7. **Auditoria in-tx (T8):** cada transição grava `AuditService.append` na **mesma tx** do lançamento
   (`payable.recognized` / `payable.paid` / `payable.cancelled` / `payment.reversed`), payload em
   allowlist (`payableId`, `paymentId`, `amountCents`, contas) — PII (nome do fornecedor) fora do audit.
8. **Fronteira §2.1:** nenhum serviço Prisma injetado em `DynamicTableService`/`RuleContext`/`RulePlugin`;
   AP é inteiramente Prisma-nativo, não toca `features/dynamicTables/**`.

---

## 5. Superfície de relatório

**Reuso, não novo motor** (`AccountingReportService`, INCR-4). O impacto contábil já aparece nos
relatórios existentes **sem código novo de relatório**, porque tudo é `Posting` normal:

- **Balancete / Razão:** a conta-controle `2.1.2 Fornecedores` mostra o saldo credor agregado; o drill
  por lançamento já resolve reconhecimento e baixas.
- **Balanço Patrimonial (BP):** `Fornecedores` entra no **Passivo Circulante** (natureza Liability).
- **DRE:** a **despesa** do reconhecimento (quando `counterAccountCode` é conta de resultado) aparece na
  DRE no período de competência do reconhecimento — **não** na data do pagamento (competência, não caixa).
- **DFC (método indireto, Núcleo 4):** a saída de caixa aparece na baixa (`C Banco/Caixa`).

**Relatório operacional próprio (subrazão) — fatia B (não no MVP-core):** um **aging de contas a
pagar** (open/partially-paid por faixa de vencimento) é leitura do subrazão `Payable`, read-only,
espelhando a shape as-of do INCR-4. Marcado como fatia separada porque não é pré-requisito da
contabilização — é visão gerencial (Q8).

---

## 6. Decisões em aberto — **exigem o sinal do humano** (é isto que se ratifica)

> Cada item traz **opções** e um **trade-off curto**. A recomendação do agente está marcada
> **[rec]**; o humano confirma, muda ou pede mais análise. Nada roteia até estas fecharem.

1. **Q1 — Código e granularidade da conta-controle `Fornecedores`.**
   - (a) **[rec]** Uma única conta-controle `2.1.2 Fornecedores` (leaf), subrazão faz o detalhe por
     fornecedor. *Trade-off:* simples, casa com o padrão de conta-controle contábil; detalhe por
     fornecedor vive no subrazão, não no plano de contas.
   - (b) Uma sub-conta por fornecedor no próprio plano (`2.1.2.001`, `2.1.2.002`…). *Trade-off:* explode
     o plano de contas, vira o anti-padrão que o subrazão existe para evitar; rejeitável.
   - **Confirmar o código exato** (`2.1.2` vs outro livre no fixture) — depende do que já está semeado.

2. **Q2 — Quem escolhe a conta de débito do reconhecimento (`counterAccountCode`)?**
   - (a) **[rec]** O caller informa a conta (despesa/ativo) por requisição; o módulo AP valida que é
     folha e ativa, nunca adivinha. *Trade-off:* correto (a natureza da compra é do negócio, não do AP);
     exige o campo no DTO.
   - (b) AP hardcoda uma despesa genérica (ex. `4.x Despesas Gerais`). *Trade-off:* esconde a natureza
     real, polui a DRE; só serviria a um MVP-brinquedo.

3. **Q3 — Atomicidade do reconhecimento: post-commit *best-effort* (como o salão) vs. in-tx atômico.**
   - (a) **[rec p/ MVP]** `PayableService` cria o `Payable` (tx 1) e posta o reconhecimento via
     `PostingService.postEntry` (tx 2, raiz própria), com **ordering + idempotência + re-drive** — o
     padrão provado de D01. `postEntry(scope, input)` **não aceita `tx`** hoje (abre sua própria raiz;
     SQLite não aninha), então o atômico verdadeiro exigiria mudar essa assinatura. *Trade-off:*
     consistência **eventual** entre `Payable` e o lançamento (janela curta re-fechada por reconcile);
     zero mudança em contrato travado.
   - (b) Estender `PostingService.postEntry` para aceitar um `tx` injetado e criar `Payable` + entry na
     **mesma** `runTransaction`. *Trade-off:* atomicidade real (nunca um `Payable` sem lançamento), mas
     **reabre** o contrato "postEntry é dono da própria raiz" (`orchestration-service-tx-repo-smell`,
     `tx-nao-propagado-ao-repo`) — blast radius e risco maiores; provavelmente **fatia própria**, não MVP.
   - **Nuance:** diferente do salão, aqui **não há** fronteira §2.1 nem `immutableAfter` — então (b) é
     tecnicamente possível de um jeito que não era lá; a pergunta é se vale o custo agora.

4. **Q4 — Idempotência/dedup do `Payable` × soft-delete.**
   - (a) **[rec]** **Nenhuma** `@@unique` no `Payable` (dedup do ledger fica no `JournalEntry`, como o
     `SourceDocument` do INCR-8/D2); `externalRef` é só índice de busca. *Trade-off:* evita o class-bug
     `@@unique × soft-delete` (P2002 no re-import de linha deletada); duplicata de conta é responsabilidade
     de UX/app, não do banco.
   - (b) `@@unique([userId,unitId,externalRef])` para impedir duas contas com o mesmo documento.
     *Trade-off:* pega o class-bug soft-delete×unique (quem libera a chave no cancelamento? rename-on-delete
     `deleted:<id>`?) — só vale se o humano quiser essa trava dura, com o custo de decidir a liberação.

5. **Q5 — Cadastro de fornecedor: entidade própria vs. texto denormalizado.**
   - (a) **[rec p/ MVP]** `supplierName`/`supplierRef` denormalizados (string), **sem** cadastro/FK.
     *Trade-off:* YAGNI; um `Supplier` first-class é módulo próprio (como "cadastro" é do ERP, não do
     ledger) e pode virar DynamicTable-preset **ou** Prisma dependendo de ter invariante — **decidir na
     hora, fora deste ADR**. Denormalizar não fecha esse caminho.
   - (b) Modelar `Supplier` já agora. *Trade-off:* escopo maior, reabre a pergunta DynamicTable×Prisma
     para um cadastro sem invariante financeiro — provavelmente DynamicTable, o que **não** é este ADR.

6. **Q6 — Tenancy/cascade do `Payable`.**
   - (a) FK a `User` com `onDelete: Cascade` (como `Account`/`JournalEntry`). *Trade-off:* apagar o
     usuário apaga o subrazão — aceitável se o subrazão é dado operacional do dono.
   - (b) **[rec]** Plain scope strings **sem** FK a `User` (como `AuditEvent`/`DocumentAttachment`/
     `SourceDocument`), já que o `Payable` carrega evidência de obrigação. *Trade-off:* consistente com a
     regra "trilha/evidência é exceção ao cascade" (`audit-log-no-fk-cascade`); mas o `Payable` **não** é
     append-only puro (tem estado mutável), então o humano decide se ele é "evidência" (b) ou "dado do
     dono" (a). O `JournalEntry` do reconhecimento já é imutável e sobrevive independentemente.

7. **Q7 — Mapa `paymentMethod → conta de crédito` do pagamento.**
   - (a) **[rec]** Reusar a forma de `DEBIT_ACCOUNT_BY_METHOD` (D01), invertida para saída:
     `Pix/Transferência → 1.1.1 Banco`, `Cash → 1.1.3 Caixa`. Sem default silencioso; método
     desconhecido → erro. *Trade-off:* consistente com a liquidação de A Receber; confirmar o conjunto de
     métodos válidos para **saída** (cartão de crédito da empresa? cheque? adiantamento?).
   - **Confirmar** os métodos e as contas exatas.

8. **Q8 — Aging report no MVP ou fatia posterior.**
   - (a) **[rec]** Fatia **posterior** (não bloqueia a contabilização). *Trade-off:* MVP entrega o
     controle contábil; o aging é visão gerencial que se acopla depois sem retrabalho.
   - (b) Incluir no MVP. *Trade-off:* mais superfície para revisar de uma vez.

9. **Q9 — Multi-parcela agendada (`PayableInstallment`) agora ou depois.**
   - (a) **[rec]** **Depois.** MVP = 1 `Payable` com **um** `dueDate` + N pagamentos parciais ad-hoc.
     Um cronograma de parcelas (boleto em 3×, cada parcela com vencimento próprio) é `PayableInstallment`
     numa fatia futura — a mesma disciplina "N:M estrutural, MVP-constrangido" do INCR-7/INCR-8.
     *Trade-off:* cobre o caso comum (pagar em partes) sem fixar shape especulativo de cronograma.
   - (b) Modelar `PayableInstallment` já. *Trade-off:* escopo e superfície maiores antes de haver demanda.

10. **Q10 — Numeração/nome deste ADR e do incremento.** Sequência atual mistura `ADR-INCR<n>` e nomes
    descritivos (`ADR-INCR-SPED-*`, `ADR-INCR-REVENUE-SPLIT`, `ADR-RECIBOS`). Proposta: manter o nome
    descritivo **`ADR-INCR-AP`** e registrar o nó no master map como `BE-INCR-AP`. Confirmar se o humano
    prefere um número (`INCR-10`).

---

## 7. PLAN — fatiamento em incrementos executáveis

Segue o contrato de geração (Prisma model → DTO → Repository → Service → Policy → Controller → Route
3-toques → Test) e o `_PARALLELIZATION-CONTRACT.md` (Fase 0 schema serial → Fase A corpos → Fase B
registro). Cada fatia tem gate objetivo. **Nada começa antes do §6 fechar** (ADR Accepted + sinal humano).

**Fatia 0 — Schema + fixture (serial, migração aditiva).**
- `Payable` + `PayablePayment` no `schema.prisma`; nova conta `Fornecedores` no `AccountFixture`.
- Novos `sourceType`: `ap.payable.recognized`, `ap.payable.paid` (estender a taxonomia viva do
  `AccountingEvent`/mappers).
- **Gate:** `prisma migrate` aditivo (tabelas novas vazias, 0 ALTER destrutivo); `tsc` limpo; smoke-
  migration-gate sobre backup do `dev.db` real **antes** de qualquer deploy (`accounting-incr1-db-risk`).

**Fatia A1 — Reconhecimento (corpo, paralelizável).**
- DTO `.strict()` `CreatePayableInput` (`supplierName`, `dueDate`, `amountCents`, `counterAccountCode`,
  `unitId`, opcional `externalRef`/`documentDate`/`attachmentId`).
- `PayableRecognizedMapper` (event→`PostEntryInput`, money boundary, espelho de `SalonSaleSettledMapper`).
- `PayableService.createPayable` (cria `Payable` + posta reconhecimento; atomicidade conforme Q3),
  `PayableRepository`, `PayablePolicy`, controller + rota (3-toques), factory.
- **Gate:** teste — reconhecimento posta `D counter / C Fornecedores` balanceado; idempotência
  `(ap.payable.recognized, payableId)`; gate de período; tenancy cross-unit → NotFound.

**Fatia A2 — Pagamento parcial/total (corpo, paralelizável após A1).**
- DTO `RegisterPayablePaymentInput` (`payableId`, `amountCents`, `paidAt`, `paymentMethod`, opc.
  `paymentRef`); `PayablePaidMapper` (invert D01 QMAP, Q7).
- `PayableService.registerPayment` (**padrão `RegisterPaymentService`**): gate de saldo in-tx (T6), cria
  `PayablePayment` + posta baixa, atualiza `paidCents`/`status`.
- **Gate:** teste — baixa parcial → `PARTIALLY_PAID`; baixa que zera → `PAID`; over-payment barrado
  in-tx; duas baixas do mesmo `Payable` coexistem (`sourceId=paymentId`); idempotência por pagamento.

**Fatia A3 — Cancelamento + estorno de pagamento (corpo).**
- `PayableService.cancel` (só `paidCents==0` → `reverseEntry` do reconhecimento, libera a chave — Q4/T5).
- `PayableService.reversePayment` (`reverseEntry` da baixa, `reversedAt`, re-deriva saldo/estado).
- **Gate:** teste — cancelar conta paga é bloqueado; estorno de pagamento reabre estado e libera saldo;
  re-criação após cancelamento não bate P2002 (chave liberada); auditoria in-tx.

**Fatia B — Registro + relatório opcional (serial).**
- Wiring final (rota no `docs.paths.ts`/openapi via `docs:generate`; skill-audit `wiring`); i18n se FE.
- (Opcional, Q8) Aging report read-only sobre o subrazão.
- (Diferido, Q9) `PayableInstallment` (cronograma multi-vencimento).
- **Gate por fatia:** `tsc`×2 limpo; Jest verde sem regressão; openapi path-count guard; **review por
  agente independente** (worktree isolado, `reviewer-independence-separate-agent`); smoke-migration-gate;
  closeout + promoção do nó no master map (⚫→⏳→✅) e linha no `INDEX.md`.

---

## 8. Rejeitados / fora de escopo (resumo "por quê / vencedor")

| Alternativa | Vencedor | Motivo |
|---|---|---|
| Contas a Pagar como preset **DynamicTable** | Prisma first-class (T3) | Tem invariante de saldo e contabiliza — é subrazão contábil, não schema de runtime do usuário |
| **Motor de regras** template-driven gerando o lançamento da compra | Mapper explícito event→`PostEntryInput` | Rejeitado no master map §4 (ADR-C01); template no caminho do ledger reintroduz o motor de plugins no ponto crítico |
| `sourceId = payableId` para o pagamento | `sourceId = paymentId` | Pagamento parcial → N baixas por conta; `payableId` colidiria na `@@unique` do JournalEntry |
| Cadastro `Supplier` first-class no MVP | Texto denormalizado (Q5) | YAGNI; cadastro sem invariante é módulo próprio, decisão DynamicTable×Prisma fora deste ADR |
| `PayableInstallment` (cronograma) no MVP | 1 `dueDate` + N pagamentos ad-hoc (Q9) | Cobre o caso comum sem fixar shape especulativo de parcelamento |
| Estender `postEntry` p/ `tx` injetado (atômico) no MVP | Post-commit + reconcile (Q3-a) | Reabre contrato travado ("postEntry é dono da raiz"); blast radius — fatia própria se demandado |
| Multi-moeda no `Payable` | BRL-only (T9) | Sem multi-moeda no ledger; fora de escopo |
| Provisão/competência automática (accrual) além do reconhecimento manual | Reconhecimento explícito por requisição | Accrual automático é domínio próprio (fechamento/competência), não o MVP operacional de AP |
