# PRE-ADR-INCR-AGING — Aging / posição por contraparte (AP + AR)

- **Data:** 2026-07-15
- **Status:** **Accepted — F-AG0 ratificado por sinal humano ("segue para o aging"); F-AG1..F-AG4 ratificados
  POR DELEGAÇÃO 2026-07-15** (humano pediu para seguir e dispensou a revisão fork-a-fork via AskUserQuestion
  ⇒ os defaults recomendados do par foram adotados: F-AG1→(a) read-time, F-AG2→(a) buckets fixos, F-AG3→(a)
  OPEN+em-trânsito, F-AG4→(a) só-aging, tie-out como follow-on). Registro honesto: não houve escolha explícita
  por fork; a delegação é o sinal. Implementação (Task pós-ADR) a seguir; **read-only ⇒ SEM migração ⇒ SEM
  smoke-migration-gate** (só review independente + FE).
- **Autores:** par `luminaris-orchestrator` + `luminaris-accounting-architect`.
- **Depende de:** **INCR-COUNTERPARTY (A1, PR #119)** — o aging agrupa por `counterpartyId`. Empilha sobre a
  branch `claude/incr-counterparty-a1` (re-aponta p/ `main` quando A1 mergear). **Não depende do PVA.**
- **Nó do master map:** §5 "Subrazões" / §7 Núcleo 2. É o follow-on que o A1 foi construído para habilitar
  (`dueDate // aging is a later increment — F3`).

## TLDR (2 linhas)
Aging = **relatório read-only** que responde "quem me deve / eu devo quanto, e há quanto tempo", recortado por
contraparte e por faixa de vencimento. Como o pagamento é **full-only** (sem saldo parcial), o outstanding de
cada linha é `amountCents` quando `status ∈ {OPEN, PAYING/RECEIVING}` — logo o aging é uma agregação simples
das linhas AP/AR abertas, **sem tabela nova, sem migração**, clonando o padrão dos report services de INCR-4.

## 1. Evidência de código (CBM-001)
| Claim | Grau | Evidência |
|---|---|---|
| Pagamento é full-only ⇒ saldo por linha é 0 ou `amountCents`; não há `paidCents`/`balanceCents` | verificado | `Payable.model.ts` (sem campo de saldo); ADR-INCR-AP F2→(b) / ADR-INCR-AR F2→(b) |
| Status: AP `OPEN\|PAYING\|PAID\|CANCELLED`; AR `OPEN\|RECEIVING\|RECEIVED\|CANCELLED` | verificado | `Payable.model.ts:14`; `Receivable.model.ts:14` |
| `dueDate` é date-only por linha; contraparte via `counterpartyId` (pós-A1) | verificado | `Payable.model.ts` (`dueDate`); ADR-INCR-COUNTERPARTY |
| Padrão de report read-only a clonar (as_of, groupBy, rota `/reports/*` 3-toques) | verificado | `services/{CashFlow,DailyJournal,DimensionReport,PeriodComparison}ReportService.ts`; `routes/accounting.ts:81-83` |
| Contas de controle p/ tie-out: AP `2.1.2 Fornecedores a Pagar`, AR `1.1.5 Clientes a Receber` (dedicada) | verificado | ADR-INCR-AP (2.1.2); ADR-INCR-AR F7 (1.1.5) |

## 2. Decisões-padrão (não-forks — defaults declarados)
- **`as_of` date** (default hoje, overridável) — espelha INCR-4; vencido = `dueDate < as_of`.
- **Ambas as subrazões** (AP e AR), simétricas — um `AgingReportService` com modo payable/receivable.
- **Agrupamento por contraparte** com drill por documento (linha) — é o ponto do aging; o drill é read barato.
- **Read-only, first-class Prisma, zero migração** — nenhuma escrita no ledger; exclui soft-deleted.

## 3. Forks (decisão do dono — ratificar fork-a-fork)

**F-AG0 — Construir agora?** → **SIM** (sinal humano dado). DIFERIR permanece a alternativa de 1ª classe se o
custo/benefício não fechar, mas o humano pediu explicitamente.

**F-AG1 — Modelo de cálculo:**
- **(a) Read-time puro** (recomendado) — agrega as linhas AP/AR abertas na hora da consulta. Zero tabela/
  migração. Dado o full-only, é exato e barato. Consistente com todos os outros reports (INCR-4).
- (b) Snapshot/materializado — tabela de aging por período. Só se o volume tornar o read-time caro (YAGNI hoje).

**F-AG2 — Faixas (buckets):**
- **(a) Fixas padrão** (recomendado): **A vencer · 1–30 · 31–60 · 61–90 · >90** dias de atraso. YAGNI.
- (b) Configuráveis por usuário — over-engineering sem demanda; reabre superfície de config.

**F-AG3 — O que conta como "em aberto":**
- **(a) `OPEN` + em trânsito** (`PAYING`/`RECEIVING`) (recomendado) — o valor em trânsito ainda é devido até
  liquidar. Exclui `PAID`/`RECEIVED`, `CANCELLED` e soft-deleted.
- (b) Só `OPEN` — deixaria de fora o valor em processo de pagamento (janela do CAS 2-tx); menos fiel.

**F-AG4 — Tie-out com a conta de controle:**
- **(a) Só o aging** (recomendado p/ este increment) — subledger analytic puro; o total do aging **pode** ser
  comparado à conta de controle depois. Menor acoplamento.
- (b) Incluir linha de tie-out (total do aging vs saldo de `2.1.2`/`1.1.5` na `as_of`, via o report service do
  ledger). Alto valor (prova subledger==razão), custo baixo — mas acopla o report AP/AR ao report do ledger.

## 4. Recomendação do par
**F-AG1→(a), F-AG2→(a), F-AG3→(a), F-AG4→(a).** Um `AgingReportService` read-time, buckets fixos, outstanding =
OPEN+em-trânsito, por contraparte com drill por documento, `as_of` overridável, AP e AR. Rota `/reports/aging`
(3-toques), DTO `.strict()`, policy `canReadPayable`/`canReadReceivable`. **Tie-out (F-AG4-b) fica como
follow-on** de 1 sessão — é a "prova" subledger↔razão, mas não bloqueia o aging básico. FE diferido
(`FE-INCR-AGING`, clona o padrão dos outros reports).

## 5. Fora de escopo
Pagamento parcial (o modelo é full-only — mudança seria outro ADR); cobrança/notificação; juros/multa por
atraso; projeção de fluxo futuro (é o DFC, já existe); tie-out automático (F-AG4-b, follow-on).
