# ADR-FOLHA — Folha de pagamento (subrazão)

- **Data:** 2026-07-15
- **Status:** **PROPOSED — NÃO ratificado.** Enquadramento (passo `PLAN → ADR`). FORKS abertos; nada travado até
  revisão fork-a-fork + sinal humano (G0). Nó do master map **⚫ diferido**. **Nenhum código autorizado.**
- **Autores:** enquadramento do orquestrador (ORCH-006).
- **Nó do master map:** §5.1 Bloco B item **13 — "Folha (subrazão)"**; §5 *"O mais pesado dos diferidos
  (domínio legal denso); só com demanda explícita."*

## TLDR (2 linhas)

Folha é o diferido **mais perigoso**: cálculo trabalhista brasileiro (CLT, rubricas, INSS/FGTS/IRRF, 13º,
férias, rescisão) muda todo ano e é campo minado legal. A recomendação lazy e honesta é **NÃO construir um motor
de cálculo de folha** — integrar: **importar a folha já calculada** (de contador/eSocial/sistema de folha) e
**postar as provisões e pagamentos no ledger** como subrazão. Construir a calculadora é reinventar um produto
regulado inteiro.

---

## 1. Contexto e objetivo

O ledger sabe postar despesa e pagamento (AP é o padrão). Folha adiciona uma origem de fato: salários +
encargos (INSS patronal, FGTS) + retenções (INSS/IRRF do empregado) + provisões (13º, férias). Hoje `grep -rin
"folha\|payroll" server/src/features/accounting/` → **0** (a confirmar).

**Objetivo:** reconhecer o **custo de pessoal** no ledger de forma correta e auditável. A pergunta-mestre é
*onde o cálculo acontece* — dentro do Luminaris (motor próprio) ou fora (importa resultado). O objetivo NÃO é
virar um sistema de folha; é **contabilizar** a folha.

## 2. Rails que a subrazão DEVE respeitar (T1–T12) + colisões

| Rail | Como se aplica |
|---|---|
| **T3 Prisma first-class** | Se persistir folha, é subrazão própria (padrão AP/AR) — nunca DynamicTable, nunca motor de plugins. |
| **T10 bridge por origem / §4** | Folha importada posta via bridge determinística por origem, não por template de regras. |
| **T4 cents exatos** | Rubricas e encargos em centavo inteiro; alíquotas (INSS/IRRF) geram **divisão → arredondamento** com dono do resíduo. |
| **T7 idempotência** | Chave = competência + identidade do lote de folha (`sourceType='payroll'`, `sourceId=folhaId`), nunca `userId`. |
| **T8 auditoria in-tx** | PII de folha é sensível (LGPD, item 14) — audit id-only, sem valores/nomes no payload. |
| **AP golden ref** | Pagamento de salário/guia = padrão `PayablePayment` (fato gerador duplo: provisão por competência + baixa no pagamento). |

**Colisão nomeada:** folha carrega **PII sensível de terceiros** (empregados) — cruza com **LGPD (item 14)**.
Modelar dado de empregado sem a base de mascaramento/retenção do item 14 cria dívida de privacidade. Ordem
natural: LGPD-base antes de folha rica.

## 3. FORKS abertos (recomendação NÃO ratificada)

### F0 — Onde o cálculo acontece (o fork existencial)
- (a) **Integração: importa folha já calculada e posta no ledger** — *recomendação forte*: o cálculo trabalhista
  é produto regulado à parte (muda anualmente, risco legal alto). Luminaris contabiliza; não calcula. Reusa
  import (INCR-6) + bridge (T10) + AP.
- (b) Motor de cálculo próprio (rubricas, encargos, eSocial) — **desaconselhado**: reimplementa um sistema de
  folha inteiro; superfície legal enorme; só com demanda explícita e equipe dedicada de domínio.
- (c) Híbrido (calcula casos simples, importa o resto) — pior dos dois: mantém a superfície de cálculo sem cobrir
  os casos difíceis.

### F1 — Granularidade do lançamento (se F0→a)
- (a) **Consolidado por competência** (total salários / total encargos / total retenções) — *recomendação MVP*.
- (b) Por empregado — necessário só para relatório gerencial por pessoa; aumenta PII no ledger (agrava LGPD).

### F2 — eSocial
- (a) **FORA** — *recomendação*: eSocial (transmissão, eventos S-1000..S-5000) é domínio isolado gigante, como a
  emissão de NF-e. Não é pré-requisito para contabilizar folha.

## 4. Escopo provável / FORA

**Provável (se F0→a):** import de folha consolidada por competência → provisões + pagamento via bridge, idempotente
por competência, audit sem-PII, contas de pessoal semeadas no fixture.
**FORA:** cálculo de rubricas/encargos (F0→b, desaconselhado); eSocial (F2); ponto/jornada; benefícios; rescisão
complexa como calculadora.

## 5. Riscos e vieses nomeados (T8)

1. **[verificado] Construir a calculadora é a armadilha** — o viés "somos um ERP, ERP tem folha" empurra para
   F0→(b). O mapa (mais pesado dos diferidos) e o ponytail apontam para (a). A checagem que expõe o erro:
   estimar a superfície de manutenção anual (tabelas INSS/IRRF mudam todo ano) — se ninguém vai manter, não
   construa.
2. **[verificado] PII cruza LGPD (item 14)** — dado de empregado sem base de proteção é dívida; F1→(a) e audit
   sem-PII mitigam, mas o item 14 deveria vir antes de folha por-empregado.
3. **[inferido] Alíquota = fronteira de dinheiro** — mesmo importando, se algum rateio ocorrer no lado do
   ledger, o resíduo de arredondamento precisa de dono (como split de receita).
4. **[assumido] "Demanda explícita" ainda não existe** — sem cliente pedindo folha, F0 é diferir; nomeado.

---

**PROPOSED.** Próximo gate = revisão fork-a-fork + sinal humano. Nó ⚫ até lá. eSocial e calculadora ficam FORA.
