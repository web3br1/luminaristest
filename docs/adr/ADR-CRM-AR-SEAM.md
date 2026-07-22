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

### Idempotência (guards re-checados a cada passe; endurecidos por review independente FAIL→fix)

1. **Era legada:** oportunidade que JÁ tem `JournalEntry(sourceType='crm.opportunity.won')` (rota
   direta aposentada) é deixada em paz — criar receivable também dobraria a receita. Vale para
   **qualquer status** da entry, inclusive `Reversed`: um estorno humano do legado é decisão final
   e o bridge nunca re-contabiliza por cima (review L2, deliberado). As entradas legadas em 1.1.2
   continuam cobertas pelo diagnóstico tie-out (exceção (c) do E1: 1.1.2 salão+CRM-legado +
   1.1.5 + 2.1.2).
2. **Receivable existente — CLASSIFICADO, não bloqueio cego** (`findAllByDocumentNumber`, sem
   filtro de `deletedAt`, casa exato + forma rename-on-delete em **shape estrito**
   `deleted:<id-sem-dois-pontos>:CRM-<oppId>`, imune ao falso-positivo de sufixo — review L3):
   - linha **viva** → já contabilizado;
   - tombstone **com `cancelledById`** → cancelamento humano, final, nunca ressuscitado;
   - tombstone **sem `cancelledById`** → compensação de máquina de um reconhecimento FALHADO
     (`compensateFailedRecognition` não seta ator) → **re-tentável** (review H1: sem isso, uma
     falha transiente de posting viraria perda de receita permanente e silenciosa, classificada
     como hit idempotente).
   A validação do fato (dinheiro/data) roda **depois** dos guards (review L1), para que fato
   corrompido de oportunidade já contabilizada classifique em vez de falhar eternamente.
3. **Corrida live×reconcile com rename no meio** (review M1: o `@@unique` inclui `customerName`,
   então dois snapshots diferentes não colidem em P2002): convergência de gêmeas — havendo 2+
   linhas vivas com a chave, sobrevive o **menor id** e as demais em `OPEN` são canceladas
   (cancel = estorno ⇒ o reconhecimento duplicado zera). O sweep roda no pós-criação **e no
   guard 2 de qualquer passe** (review R1 — nunca single-shot: um cancel que falhe é re-dirigido
   pelo próximo passe). Gêmea que um humano já tocou (`RECEIVING`/`RECEIVED`) nunca é
   auto-cancelada — warn e decisão humana. Premissa documentada (review R3): "menor id = mais
   antiga" vale porque cuid do Prisma é prefixado por timestamp em processo único; com ids
   não-monotônicos a regra segue determinística, só deixa de ser "a mais velha vence".
4. **Tenant CRM-first sem plano de contas** (review M2): `3.1` ausente dispara o seed canônico
   idempotente (`PostingService.listAccounts`) antes de desistir — a rota direta aposentada
   auto-semeava dentro do `postEntry`; sem isso, tenant que nunca abriu contabilidade falharia
   para sempre.
5. **Preflight de período no bridge** (review R2): antes de criar a linha, o bridge re-lê o
   período da competência e falha limpo (`ACCOUNTING_PERIOD_NOT_OPEN`) se não estiver `OPEN` —
   senão, com o H1 re-tentável, uma falha determinística (ex.: `closedAt` em período fechado)
   cunharia linha + audit + tombstone de compensação a cada passe de 5 min, sem teto.
   Não-autoritativo: o gate in-tx do `postEntry` continua sendo a autoridade (T6); o preflight
   só mantém a falha row-free, em paridade com a rota direta aposentada.

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
`Σ Receivable abertos == saldo(1.1.5)` passa a incluir o CRM. O `TieOutDiagnosticService`
(lote Council, PR #133) trata `crm.opportunity.won` como **população legada fechada** na 1.1.2
(só entradas pré-seam) — o mapa de feeders é tipado contra a union de eventos vivos **+**
`CRM_LEGACY_SOURCE_TYPE` (constante no `AccountingSyncPort`), então um feeder novo ou um typo
continuam quebrando o tsc. O skip-list do lote (`syncSkipErrorCode`: período-fechado /
MAX_CENTS-poison) compõe com o bridge: o preflight R2 e o choke-point MAX_CENTS classificam
como BLOCKED no reconcile e warn no gatilho vivo, nunca loop de falha.
