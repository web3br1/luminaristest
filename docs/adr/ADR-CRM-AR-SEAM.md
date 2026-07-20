# ADR-CRM-AR-SEAM — Oportunidade CRM ganha entra no subrazão de Contas a Receber

**Status:** implementado 2026-07-20 (decisão delegada pelo dono no chip do resíduo N4a; consultivo
do council em board v2 `ac963914` item N4 + emenda v1·1.3).
**Contexto:** fecha o eixo (a) do achado **N4** do Council board v2 — o recebível-órfão do seam CRM.

## Problema

`crm.opportunity.won` postava direto `D 1.1.2 (A Receber) / C 3.1` via `CrmOpportunityWonMapper`.
Não existe fato de pagamento no domínio CRM (`OpportunitiesModule` não tem `paymentStatus`/`paidAt`),
logo **nenhum settlement jamais baixava esse débito**: o recebível CRM não aparecia no aging, não
entrava no tie-out do AR (1.1.5) e poluía para sempre a 1.1.2 do salão (que TEM ciclo próprio de
settlement via `salon.sale.settled`).

## Decisão — rota (a): o seam cria um `Receivable` (subrazão AR)

Uma oportunidade ganha é um **direito a receber**, não caixa. O seam agora cria uma Contas a Receber
via `CrmReceivableBridge` (`server/src/features/accounting/sync/bridges/CrmReceivableBridge.ts`):

- **Reconhecimento:** `ReceivableService.createReceivable` → `D 1.1.5 Clientes a Receber / C 3.1`
  (`sourceType='ar.receivable'`), exatamente o padrão INCR-AR.
- **Settlement:** o fato de pagamento que faltava no CRM é fornecido onde o AR já o define — o
  humano registra o recebimento na aba Contas a Receber (`registerReceipt`, `D conta-por-método /
  C 1.1.5`). Aging, cancelamento (estorno) e reconcile vêm de graça.
- **Chave de negócio:** `documentNumber = CRM-<opportunityId>` sob o
  `@@unique([userId,unitId,customerName,documentNumber])` existente — zero migração, zero rota nova
  (critério E1 do freeze atendido).
- **Fronteira §2.1:** o bridge é serviço de integração pós-commit (mesma altitude dos
  `Salon*Bridge`), invocado pelo `crmController` (gatilho vivo) e pelo `accountingSyncReconcile.job`
  (rede de durabilidade). Nada entra no motor DynamicTable.

### Idempotência (dois guards, re-checados a cada passe)

1. **Era legada:** oportunidade que JÁ tem `JournalEntry(sourceType='crm.opportunity.won')` (rota
   direta aposentada) é deixada em paz — criar receivable também dobraria a receita. As entradas
   legadas em 1.1.2 continuam cobertas pelo diagnóstico tie-out (exceção (c) do E1: 1.1.2
   salão+CRM-legado + 1.1.5 + 2.1.2).
2. **Receivable existente:** lookup **tombstone-aware** (`findAnyByDocumentNumber` casa também a
   forma rename-on-delete `deleted:<id>:CRM-<oppId>`, sem filtro de `deletedAt`) — um cancelamento
   humano é decisão final, nunca ressuscitado pelo reconcile.
   Corrida live×reconcile no mesmo instante cai no `@@unique` (P2002 numa das pontas; o passe
   seguinte classifica como já-contabilizado).

## Alternativas rejeitadas

- **(b) Ratificar "venda CRM é à vista":** contabilmente falso para pipeline (ganho ≠ caixa) — e se
  fosse à vista o débito honesto seria caixa, não 1.1.2. Seria documentação legitimando o defeito.
- **Bridge de settlement estilo salão:** exigiria um fato de pagamento que o CRM não registra;
  inventá-lo fabricaria movimento de razão (recusado já no FIX-CORE-POSTING).

## Tetos conhecidos (ponytail)

- **Uma natureza de receita por receivable** (`revenueAccountId` único → sempre 3.1). O CRM hoje não
  tem line items, então nada se perde; se ganhar, o split 3.1×3.3 exige natureza por linha no AR.
  (Nota: isso reverte a "split-capability" do seam introduzida no slice FIX-CORE-POSTING — que era
  capacidade especulativa; o órfão era defeito real.)
- **`dueDate = data do fechamento`** (CRM não tem vencimento; aging conta a partir do ganho).
- **`customerName` = nome da oportunidade** (snapshot); `customerRef` = `accountId` do CRM quando
  presente. Resolver o nome real da conta CRM fica para quando a linkagem importar.
- **Sem reversão automática de "des-ganho"** — igual antes (o CRM não tem guard terminal); o
  operador cancela o receivable manualmente (estorno automático do reconhecimento).

## Efeito no tie-out

Novos ganhos CRM param de tocar 1.1.2 → a conta volta a ser exclusiva do ciclo do salão e
`Σ Receivable abertos == saldo(1.1.5)` passa a incluir o CRM. O diagnóstico tie-out (lote Council,
pendente de merge) deve tratar 1.1.2-CRM como **população legada fechada** (só entradas
pré-ADR-CRM-AR-SEAM).
