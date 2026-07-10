# ADR-INCR-REVENUE-SPLIT — Split de receita por natureza (serviço × revenda)

- **Status:** Accepted — decisões tomadas pelo usuário ("pode seguir") sobre o parecer `luminaris-accounting-architect` + master map + leitura de código (CBM-001). Implementação a seguir (ordem: ADR → impl → review independente).
- **Date:** 2026-07-10
- **Decision class:** PRISMA_FIRST_CLASS (plano de contas + seam de integração pós-commit; nunca DynamicTable — Contrato §2.1). Muda **como** a receita é distribuída em contas, **não** o total contabilizado.
- **Depends on:** INCR-C (`SalonSalesAccountingBridge`, `SalonSaleFinalizedMapper`, `AccountingSyncPort`), INCR-B (`AccountingSync` + job de reconciliação), INCR-9 (`ReferentialMapping` — a conta nova precisa de código RFB). Todos em `main`.
- **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 — este ADR entrega um **pré-requisito de dado** do Bloco P da **ECF-Presumido**; **NÃO** é a geração do arquivo ECF (essa segue diferida a ADR próprio, campo-a-campo).
- **Supersedes:** none · **Related:** ADR-C01 (mapper de receita que este estende), ADR-INCR9 (mapeamento referencial).

> **Nota de processo.** ADR escrito **antes** do código. Governança T12: PLAN → ADR → impl → test → review independente (worktree separado) → PR → closeout → memória.

---

## 1. Contexto

A ECF no regime **Lucro Presumido** aplica **presunção por atividade**: serviço = 32% (IRPJ) / 32% (CSLL); **revenda de mercadoria = 8% / 12%**. O Bloco P exige, portanto, saber **quanto da receita foi serviço e quanto foi produto**.

**Hoje o ledger não sabe distinguir** (evidência lida nesta sessão — CBM-001):
- `ChartOfAccountsFixture.ts:39` — existe **uma** folha de receita, `3.1 Receita de Vendas`.
- `SalonSaleFinalizedMapper.ts:54-55` — credita `totalAmount` inteiro numa **única** conta `3.1`.
- `AccountingSyncPort.ts` — `AccountingEvent` carrega `amount: number` **escalar**, sem quebra por natureza.
- `salonSaleItems.ts` — o classificador distingue `Service`/`Product`/`Package`, mas usa isso **só** como gate anti-receita (all-Package = pré-pago, pula). A granularidade existe em `saleItems` (`itemType`, `productId`/`serviceId`, `quantity`, `unitPrice`) mas é colapsada na fronteira contábil.

**Objetivo (MVP):** dar ao ledger a granularidade serviço × revenda **na origem**, para que a presunção-por-atividade vire leitura de saldo por conta. Nenhum total muda.

---

## 2. As decisões

### D1 — Regime de partida = **Lucro Presumido**
Definido por **obrigação legal**, não preferência: Simples Nacional é **isento de ECF**; o slice ECF-obrigado do público SMB é esmagadoramente Presumido; Lucro Real é raro (>R$ 78 mi/ano ou setor específico). Real (LALUR/Parte A/B) fica para INCR próprio.

### D2 — Modelagem = **rename-sibling**, sem reparent  **[trava ACC-018]**
`3.1` "Receita de Vendas" → renomeada para **"Receita de Serviços"** (code **estável** `3.1`); **adiciona-se** `3.3 Receita de Revenda de Mercadorias` (Revenue, `acceptsEntries:true`).

**Por quê (vencedor):** `3.1` é folha que **já guarda partidas postadas**. Torná-la pai (`acceptsEntries:false`) exigiria mover partidas postadas — proibido por **ACC-018** (lançamento postado é imutável). Manter `3.1` como folha de serviço + sibling `3.3` é a menor mudança que não toca partida postada. **Descartado:** `3.1.1`/`3.1.2` sob `3.1`-pai (exige estorno+repost do histórico).

### D3 — Histórico = **cutover, backfill ZERO**
Vendas **novas** nascem separadas a partir do deploy. Histórico permanece em `3.1`. **Assunção nomeada:** a primeira ECF é de ano-calendário **corrente/futuro (≥2026)**; se for preciso entregar ECF de um ano-calendário já movimentado, este ADR **reabre** (estorno+repost vira trabalho real — landmine #1 do parecer).

### D4 — `AccountingEvent` = mudança **ADITIVA**, não substitutiva
Mantém `amount` (total) e **adiciona** `revenueByNature?: { serviceReais: number; productReais: number }` (raw reais, coerente com o contrato do port "valor bruto; mapper converte"). Consumido **só** pelo `SalonSaleFinalizedMapper`. Os outros 3 mappers/bridges (returned/settled/package) e os builders correspondentes **não** são tocados — o campo opcional é ignorado por quem não o lê. Blast radius mínimo.

### D5 — Split proporcional no **mapper** (a fronteira de dinheiro), resíduo documentado
O `SalonSaleFinalizedMapper` é o único ponto de conversão float→centavos (invariante ACC-014). O split acontece lá:
```
totalCents  = round(amount * 100)                       // inalterado
base        = serviceReais + productReais
serviceCents = round(totalCents * serviceReais / base)
productCents = totalCents - serviceCents                // resíduo de arredondamento cai aqui
```
- **Rateio proporcional** do total (que já embute desconto/imposto do header) entre as naturezas, na proporção dos subtotais de item (`Σ quantity×unitPrice`). Isso resolve "desconto no header (Σitens ≠ totalAmount)": o desconto rateia proporcional, não distorce a base de uma atividade.
- **Resíduo de arredondamento** absorvido pela conta de **revenda (`3.3`)** por construção (`productCents = totalCents − serviceCents`), garantindo **`serviceCents + productCents == totalCents`** (invariante "nenhum centavo perdido").
- **Linhas de valor zero são omitidas:** venda só-serviço → 1 linha `3.1`; só-produto → 1 linha `3.3`; mista → 2 linhas. O **débito** é sempre `1.1.2 A Receber` pelo total (a receber independe da natureza).
- **Fallback compat:** evento **sem** `revenueByNature` (ou base = 0) → credita tudo em `3.1` como hoje. Preserva idempotência/comportamento de qualquer evento legado ou degenerado.

### D6 — Consumo de pacote = **FORA de escopo**
A receita diferida do consumo de pacote (reconhecida no consumo, não na venda) não entra neste incremento. O gate anti-receita all-Package é **inalterado**.

---

## 3. Invariantes garantidos
- **ACC-018** — nenhuma partida postada é mutada (D2 evita reparent).
- **ACC-013** — idempotência em `(sourceType, sourceId)` **inalterada**: o split muda as *linhas* do lançamento, não a chave; re-drive não duplica.
- **ACC-014** — conversão float→centavos permanece única, no mapper; `BigInt` não é necessário aqui (valores de venda de salão, centavos safe-integer) mas o teto continua guardado pelo check existente.
- **ACC-021** — só POSTED entra em relatório; regra de sinal centralizada (inalterada).
- **Consistência live × reconcile:** os **dois** caminhos que emitem `salon.sale.finalized` (bridge pós-commit e `reconcileSalonSales`) populam `revenueByNature` a partir do **mesmo** `loadSalePackageInfo` — uma venda re-dirigida contabiliza idêntico à viva.

## 4. Riscos
- Venda mista com desconto de header: coberto por D5 (rateio proporcional + resíduo em `3.3`), com teste dedicado.
- `3.3` fica **não-mapeada** no diagnóstico referencial (INCR-9, CHART-driven) até receber código RFB — **comportamento correto** do gate de prontidão; registrado como follow-up, **não** bloqueia este incremento.
- Se a assunção D3 (1ª ECF ≥2026) for falsa, o backfill histórico volta ao escopo.
