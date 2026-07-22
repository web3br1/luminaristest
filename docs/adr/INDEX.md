# Índice de ADRs — Luminaris

> Registro de **decisões arquiteturais** do projeto (o "por quê / vencedor" durável). Ponteiro rápido
> para o orquestrador e revisores localizarem a decisão antes de re-decidir. Uma linha por documento;
> o arquivo é o índice — sem camada separada.
>
> **Convenção:** `ADR-<trilho><n>` = decisão; `D0-*` = registro de ratificação humana (gate G0) de uma fase.
> Onde uma decisão de módulo **não** tem ADR próprio, o ponteiro para onde ela vive está em §Fora-de-ADR.
> Última atualização: **2026-07-20**.

## Buildout contábil (INCR-*)

| ADR | Título | Status | Data | Classe |
|---|---|---|---|---|
| [INCR-1](ADR-INCR1-accounting-periods.md) | Períodos Contábeis + Gate de Fechamento | Accepted w/ amendments (ratif.) | 2026-06-27 | PRISMA_FIRST_CLASS |
| [INCR-2](ADR-INCR2-audit-trail.md) | AuditEvent append-only (hash-chain, tamper-evident) | Accepted w/ amendments (ratif.) | 2026-06-27 | PRISMA_FIRST_CLASS |
| [INCR-3](ADR-INCR3-entry-numbering.md) | Numeração sequencial gapless (Livro Diário) | Accepted w/ amendments (ratif.) | 2026-06-27 | PRISMA_FIRST_CLASS |
| [INCR-4](ADR-INCR4-bp-dre.md) | Demonstrações BP + DRE | Accepted w/ amendments (ratif.) | 2026-06-27 | READ_ONLY_REPORT |
| [INCR-7](ADR-INCR7-bank-reconciliation.md) | Conciliação Bancária (7 decisões) | Accepted w/ amendments (ratif. por delegação) — backend implementado (PRs #32–#37+) | 2026-07-03 | PRISMA_FIRST_CLASS |
| [INCR-8](ADR-INCR8-source-document-provenance.md) | Proveniência Formal (SourceDocument + JournalEntrySource) | Accepted — altitude A1 (seam fino) ratif.; impl. não iniciada (PRE-ADR fechado) | 2026-07-03 | PRISMA_FIRST_CLASS |
| [SPED-ECF](ADR-INCR-SPED-ECF-file-generation.md) | Geração do arquivo ECF (SPED Fiscal · IRPJ/CSLL · Lucro Presumido) | **FASE 2 implementada (commit `6192799`, não mergeada); Emenda FASE 2 corrigiu 3 pontos inferidos (C/E recuperados pelo PVA, numeração Bloco P, PVA computa o imposto — só segregamos receita bruta)** | 2026-07-12 | PRISMA_FIRST_CLASS (READ/EXPORT) |
| [RECIBOS](ADR-RECIBOS-pdf-generation.md) | Comprovante de lançamento em PDF (puppeteer HTML→PDF, sem persistência) | Accepted (escolha do dono do produto); backend Fase A+B **mergeado** (PR #84); dep nova puppeteer/Chromium → smoke-launch-gate no deploy | 2026-07-13 | READ_ONLY (geração de documento) |
| [INCR-AP](ADR-INCR-AP-accounts-payable.md) | Contas a Pagar operacional (`Payable`+`PayablePayment`, duplo fato gerador, `2.1.2 Fornecedores`) | **Accepted — RATIFICADO 2026-07-14** (F0→(a) `postEntry` direto; F1–F6 conforme recomendado); impl. + FE mergeados (PRs #102/#106) | 2026-07-14 | PRISMA_FIRST_CLASS |
| [INCR-APPROVAL](ADR-INCR-APPROVAL-maker-checker.md) | Torre de aprovação (maker-checker / SoD) — `Draft→PendingApproval→Posted` no `JournalEntry` | **Accepted — MERGEADO** (PR #108, `1f4ff78`); **Emenda F3 re-ratificada fork-a-fork 2026-07-14** (§9): SoD hard→desligada single-user (`enforcesSegregationOfDuties = owner≠actor`), staging usável, endurece via membership | 2026-07-14 | PRISMA_FIRST_CLASS |
| [INCR-AR](ADR-INCR-AR-accounts-receivable.md) | Contas a Receber (AR) operacional (`Receivable`+`ReceivableReceipt`, duplo fato gerador, conta dedicada `1.1.5`) | **Accepted — RATIFICADO FORK-A-FORK 2026-07-14; IMPLEMENTADO E MERGEADO** (PR #111 `87ab95b`, 2026-07-15; review indep. PASS; smoke-gate DEPLOY-CLEARED) — F7→(a) conta dedicada `1.1.5`; F0→(a) `postEntry` direto; F1–F6 espelho do AP | 2026-07-15 | PRISMA_FIRST_CLASS |
| [INCR-DIM](ADR-INCR-DIM-dimensions.md) | Dimensões (centro de custo/projeto) — `DimensionDefinition`+`DimensionValue`(hierárquico)+`PostingDimension`, etiqueta ortogonal ao ledger | **Accepted — RATIFICADO FORK-A-FORK 2026-07-15; IMPLEMENTADO E MERGEADO** (PR #113 `9a73392` + FE #116 `eeb33c1`; review indep. PASS; 1114/1114 jest; smoke-gate DEPLOY-CLEARED) — F0→CONSTRUIR build completa; F1→(a) catálogo Prisma; F2→(a) partida; F3→ponte + F4→N eixos; F5→(a) opcional/não-reabre-§4; F6→(a) razão/balancete + DRE por dimensão. **EMENDA 2026-07-15 (fork-a-fork): F5 emendado** por [DIM-COMPLETENESS](ADR-INCR-DIM-COMPLETENESS-mandatory-axis.md) → "opcional por padrão, condicionalmente obrigatória por flag de conta" (B1) | 2026-07-15 | PRISMA_FIRST_CLASS |
| [COUNTERPARTY](ADR-INCR-COUNTERPARTY-first-class.md) | Contraparte (Fornecedor/Cliente) first-class × ref DynamicTable — identidade do subledger p/ aging | **Accepted — RATIFICADO FORK-A-FORK 2026-07-15** (F-CP0→(a) sim; **F-CP1→A1** `Counterparty` Prisma first-class + FK — dono escolheu integridade máxima sobre a rec. A2 do par); impl. NÃO iniciada | 2026-07-15 | DECISÃO ARQUITETURAL |
| [AGING](ADR-INCR-AP-AR-AGING.md) | Aging / posição por contraparte (AP+AR) — report read-only por faixa de vencimento | **Accepted — RATIFICADO (F-AG0 humano + F-AG1..4 delegação) + IMPLEMENTADO + REVIEW PASS 2026-07-15** (branch `claude/incr-aging` @ `083ad5c`, PR #127 draft, empilhado sobre A1 #119); read-time, buckets fixos, OPEN+trânsito, só-aging (tie-out follow-on); read-only, SEM migração/smoke-gate; FE diferido | 2026-07-15 | READ_ONLY_REPORT |
| [DIM-COMPLETENESS](ADR-INCR-DIM-COMPLETENESS-mandatory-axis.md) | Completude da DRE por dimensão (opcional × obrigatório × bucket "Não alocado") — **EMENDA INCR-DIM F5** | **Accepted — RATIFICADO FORK-A-FORK 2026-07-15** (**F-DC0→B1** etiqueta obrigatória por classe de conta = flag `requiresDimension` por `Account` + gate no `postEntry`; inclui B0 bucket; NÃO reintroduz §4 — é gate de validação, não motor); impl. NÃO iniciada | 2026-07-15 | DECISÃO ARQUITETURAL |
| [INCR-INVENTORY](ADR-INCR-INVENTORY-stock-subledger.md) | Estoque — subrazão de inventário perpétuo + CMV (`InventoryItem`+`StockMovement`, custo médio móvel, `1.1.6 Estoques`/`4.2 CMV`, baixa de CMV via bridge de venda + entrada via seed manual + ponte de compra AP→estoque) | **Proposed — RATIFICADO FORK-A-FORK 2026-07-20 (via AskUserQuestion); impl. NÃO iniciada.** Perna A (Prisma first-class perpétuo) + reuso máximo (F-INV2 bridge-only, CRUD público diferido); **F-INV1→custo médio móvel**; **F-INV3→seed manual + ponte compra AP→estoque** (parser NF-e = **próximo incremento sequenciado** `ADR-INCR-NFE`, não diferido — re-prioriz. dono 2026-07-20). Insumo: council `plan-council` (A 3/4 lentes). Imobilizado = ADR próprio | 2026-07-20 | DECISÃO ARQUITETURAL |
| [INCR-NFE](ADR-INCR-NFE-fiscal-ingestion.md) | Ingestão fiscal de NF-e — parser puro `lib/nfe.ts` (XML→`ParsedNfe`) que pré-preenche a `Payable`/entrada de estoque (compra) e cruza com a venda de salão (venda), sem subrazão fiscal novo | **Accepted — RATIFICADO FORK-A-FORK 2026-07-20** (**F-NFE1→(b) COMPRA+VENDA** divergiu da rec. compra-only; F-NFE5→(a) impl bloqueada até PR #130 mergear; F-NFE6→(a) custo = `vProd−vDesc+vFrete+vOutro+vIPI+vICMS-ST`; F-NFE2→(a) `fast-xml-parser`; F-NFE3→(a) ingestão; F-NFE4→(a) `SourceDocument`); impl. NÃO iniciada (bloqueada por #130) | 2026-07-20 | INGESTÃO (reusa Payable/estoque/SourceDocument) |

## Bridges de integração (venda DynamicTable → ledger Prisma)

| ADR | Título | Status | Data | Classe |
|---|---|---|---|---|
| [C01](ADR-C01-salon-sales-accounting-bridge.md) | Salon Sales Accounting Bridge (reconhecimento de receita) | Approved (R2/Q3 ratif.) | 2026-06-25 | PRISMA_FIRST_CLASS + origem DynamicTable |
| [D01](ADR-D01-settlement-reversal.md) | Settlement & Reversal (baixa de A Receber + estorno) | Retroactively ratified | 2026-06-26 | PRISMA_FIRST_CLASS + origem DynamicTable |
| [D0-d-settlement](D0-d-settlement-ratification.md) | Ratificação humana — fase D-settlement (gate G0) | Retroactively ratified | 2026-06-26 | (registro de ratificação) |
| [D0-d-reversal](D0-d-reversal-ratification.md) | Ratificação humana — fase D-reversal (gate G0) | Retroactively ratified | 2026-06-26 | (registro de ratificação) |

## Fora-de-ADR — decisões de módulo que vivem em outro lugar

Nem todo incremento tem ADR próprio; alguns foram documentados por brief ou ainda estão pré-ADR.
Registrado aqui para a rastreabilidade não ter buraco silencioso:

| Módulo | Onde a decisão vive | Estado |
|---|---|---|
| INCR-5 Anexos/Evidências | `docs/accounting/BE-INCR5-attachments-evidence-brief.md` | Mergeado (sem ADR dedicado) |
| INCR-6 Data Exchange (import/export) | `docs/accounting/BE-INCR6-data-exchange-brief.md` (+ closeouts) | Mergeado (sem ADR dedicado) |
| ~~INCR-7 Conciliação Bancária~~ | ~~PRE-ADR~~ → **backend implementado** [ADR-INCR7](ADR-INCR7-bank-reconciliation.md) | 7 decisões travadas 2026-07-03; backend mergeado (PRs #32–#37+); FE deferido |
| Roadmap/decisões travadas & rejeitadas | `docs/accounting/ACCOUNTING-MASTER-MAP.md` (§1, §4) | Fonte de verdade do roadmap |
| ADR-B01 (idempotência AccountingSync) | referenciado por C01/D01 como *Related* | **Ausente deste dir** — decisão vive na memória `accounting-sync-b1` |

> **Manutenção:** ao ratificar um ADR novo, adicione uma linha aqui na mesma tarefa (é o passo de
> closeout, não trabalho separado). Ao promover um incremento no master map (`ORCH-007`), confira
> se a decisão correspondente tem entrada aqui.
