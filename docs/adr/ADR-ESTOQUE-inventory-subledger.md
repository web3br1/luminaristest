# ADR-ESTOQUE — Estoque / Imobilizado (subrazão)

- **Data:** 2026-07-15
- **Status:** **PROPOSED — NÃO ratificado.** Enquadramento (passo `PLAN → ADR`). FORKS abertos; nada travado até
  revisão fork-a-fork + sinal humano (G0). Nó do master map **⚫ diferido**. **Nenhum código autorizado.**
- **Autores:** enquadramento do orquestrador (ORCH-006).
- **Nó do master map:** §5.1 Bloco B item **12 — "Estoque / Imobilizado (subrazões)"**; §5 *"Módulos ERP
  próprios; dependem de demanda do setor-alvo."* O molde é o salão (baixo estoque; mas há **revenda de
  mercadoria**, conta `3.3`, já reconhecida no split de receita).

## TLDR (2 linhas)

Estoque é uma subrazão first-class (padrão AP/AR): item, movimento (entrada/saída), custo. O **fork travante** é
o **método de custeio** (média ponderada móvel × PEPS) e se a **baixa de estoque posta CMV automaticamente** na
venda via bridge. Imobilizado (depreciação) é domínio vizinho mas separável — provavelmente ADR próprio. O molde
salão pede pouco: revenda de produtos (`3.3`), não indústria.

---

## 1. Contexto e objetivo

O split de receita já distingue **serviço (3.1)** de **revenda (3.3)**. Onde há revenda, há **custo da mercadoria
vendida (CMV)** e um **saldo de estoque** que hoje o ledger não modela: `grep -rin "estoque\|inventory"
server/src/features/accounting/` → **0** (a confirmar). Sem estoque, o CMV da revenda não é reconhecido e a
margem por produto fica cega.

**Objetivo:** subrazão de estoque que mantém saldo por item, valoriza movimentos por um método de custeio, e
(fork) reconhece CMV no ledger quando o produto é vendido — respeitando que o ledger continua a autoridade.

## 2. Rails que a subrazão DEVE respeitar (T1–T12) + colisões

| Rail | Como se aplica |
|---|---|
| **T3 Prisma first-class** | `InventoryItem` + `InventoryMovement` (Model+Service+Repo+Policy) — padrão canônico AP/AR/DIM. Nunca DynamicTable para o saldo contábil. |
| **T4 dinheiro = cents, exato** | Custo unitário e CMV em centavo inteiro. **Cuidado:** custo médio gera **divisão** → arredondamento com resíduo controlado (fronteira de dinheiro, como o rateio do split de receita). `MAX_CENTS`. |
| **T10 bridge pós-commit** | A baixa de CMV na venda é bridge por origem (salon), **não** motor de regras. |
| **§4 Motor de Regras REJEITADO** | "Vendeu produto X → baixa estoque e posta CMV" é bridge determinística por origem, não template. |
| **T6 gate in-tx** | Saldo não pode ficar negativo (fork) — gate mutável re-checado dentro da `runTransaction`. |
| **T5 imutabilidade** | Correção de movimento = movimento de ajuste novo, nunca edição destrutiva (espelha estorno). |
| **AP como golden ref** | Item de estoque referencia fornecedor/produto (DynamicTable-ref, F1 do AP) para não modelar catálogo de produto duas vezes. |

## 3. FORKS abertos (recomendação NÃO ratificada)

### F0 — Existencial / demanda
- (a) **DIFERIR até demanda de revenda real** — *recomendação*: o mapa condiciona ao setor-alvo; o salão-molde
  tem estoque marginal. Construir sob demanda de um ERP setorial que gira mercadoria.
- (b) Construir MVP de revenda simples (entrada por compra, saída por venda, saldo + CMV) — justificável já,
  porque `3.3` existe e o CMV está cego; menor que indústria.

### F1 — Método de custeio (o fork travante)
- (a) **Média ponderada móvel** — *recomendação*: mais simples, aceito pelo fisco BR, um saldo/custo por item.
- (b) PEPS (FIFO) — exige camadas de custo por lote; mais pesado; necessário só em cenários específicos.
- (c) Custo específico — só para itens serializados; nicho.

### F2 — Reconhecimento de CMV
- (a) **Perpétuo: baixa + CMV a cada venda, via bridge salon** — *recomendação se F0→(b)*: margem por venda em
  tempo real; reusa o seam da bridge C01.
- (b) Periódico: inventário + CMV por diferença no fechamento — menos escrita, menos granularidade.

### F3 — Saldo negativo
- (a) **Bloquear (gate in-tx T6)** — *recomendação*: consistência física.
- (b) Permitir com alerta — só se a operação real tiver entrada atrasada crônica; nomear o ceiling.

### F4 — Imobilizado/depreciação
- (a) **ADR próprio, fora deste** — *recomendação*: depreciação (vida útil, métodos, ajuste a valor) é domínio
  distinto de giro de estoque; separar evita um ADR gigante.

## 4. Escopo provável / FORA

**Provável (se F0→b):** `InventoryItem`+`InventoryMovement` first-class, custeio médio (F1a), bridge de CMV na
venda (F2a), gate de saldo (F3a).
**FORA:** imobilizado/depreciação (F4→ADR próprio); MRP/produção/ordens; múltiplos depósitos; NF-e item-a-item
(depende do item 11).

## 5. Riscos e vieses nomeados (T8)

1. **[verificado] Custo médio é fronteira de dinheiro** — divisão de custo total por quantidade gera dízima; o
   resíduo tem de ter dono (como o rateio do split de receita `Σlinhas==total`). Teste que falha se vazar:
   soma dos CMVs ≠ custo total baixado.
2. **[inferido] Acoplamento com NF-e (item 11)** — entrada de estoque "de verdade" vem da NF-e de compra
   item-a-item; sem ela, entrada é digitação manual. Ordem natural: NF-e ingestão antes de estoque rico.
3. **[assumido] Salão-molde não precisa disso** — se o próximo ERP setorial girar mercadoria (varejo), o valor
   sobe; a decisão F0 depende dessa demanda, não de gosto arquitetural.
4. **[verificado] Não é motor de regras** — a bridge de CMV é por origem e determinística; qualquer
   `templateJson` de baixa reabre §4.

---

**PROPOSED.** Próximo gate = revisão fork-a-fork + sinal humano. Nó ⚫ até lá. Imobilizado = ADR separado (F4).
