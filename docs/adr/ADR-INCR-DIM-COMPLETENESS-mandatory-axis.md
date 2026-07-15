# PRE-ADR-INCR-DIM-COMPLETENESS — Completude da DRE por dimensão (eixo opcional × obrigatório)

- **Data:** 2026-07-15
- **Status:** **Accepted — RATIFICADO POR SINAL HUMANO FORK-A-FORK 2026-07-15 (via AskUserQuestion).**
  Decisão: **F-DC0 → B1**, etiqueta **obrigatória em classes de conta designadas** (posting-time).
  **Isto EMENDA `ADR-INCR-DIM` F5** ("dimensão sempre opcional" → "opcional por padrão, **condicionalmente
  obrigatória** por flag de conta"): é `DECISÃO ARQUITETURAL` por sinal humano. **Não reintroduz o §4** (ver
  §3 abaixo, precisão corrigida): B1 é um **gate de validação por flag booleano por `Account`** (rejeita
  partida sem tag), não um motor que *gera* lançamento a partir de template/condições. Implementação (Task
  pós-ADR) NÃO iniciada; migração toca `accounts` (add flag) + gate no `postEntry` → smoke-migration-gate.
- **Autores:** par `luminaris-orchestrator` + `luminaris-accounting-architect`.
- **Nó do master map:** §7 Núcleo 4 (caveat de completude na "análise por dimensão") + §4 (roça a rejeição
  "Motor de Regras Contábeis"). Relação com `ADR-INCR-DIM` F5 explícita em §3.

## TLDR (2 linhas)

`ADR-INCR-DIM` ratificou a etiqueta de dimensão como **sempre opcional** (F5→a) — de propósito, porque
"obrigar dimensão em certas contas" tem o cheiro do **Motor de Regras Contábeis** que o §4 rejeita. Efeito
colateral honesto: a **DRE por dimensão pode sub-reportar em silêncio** — uma despesa postada **sem** centro
de custo simplesmente **não aparece** em nenhum recorte, e a soma dos recortes **não bate** com a DRE total
sem que nada avise. Esta ADR decide como dar **completude/honestidade** ao relatório **sem** necessariamente
reabrir o §4.

---

## 1. Contexto e objetivo

Um relatório gerencial que **cala** o que não sabe é pior que um que **mostra** o buraco: o leitor soma os
centros de custo, fecha um número menor que a DRE total, e não sabe se é erro de dado ou de sistema. O
objetivo aqui **não** é (necessariamente) forçar etiqueta — é garantir que `Σ(recortes por dimensão) == DRE
total` seja **sempre visível e explicável**, mesmo quando parte das partidas não foi etiquetada.

## 2. Evidência de código (CBM-001)

| Claim | Grau | Evidência |
|---|---|---|
| Não há constraint que force uma `Posting` a ter `PostingDimension` — etiqueta é 100% opcional | verificado | `schema.prisma` `PostingDimension` só tem `@@unique([postingId, definitionId])` (≤1 valor por eixo por partida); nenhuma required |
| `ADR-INCR-DIM` decidiu opcional **de propósito**, ligando obrigatoriedade-por-conta ao §4 | verificado | `ADR-INCR-DIM` §2: "§4 rejeita Motor de Regras... 'obrigar dimensão em certas contas' é regra dirigida por dado, o mesmo cheiro ⇒ descartado no F5" |
| DRE por dimensão agrega via ponte `PostingDimension`; partida sem ponte não entra em recorte nenhum | verificado | `ADR-INCR-DIM` §2 (groupBy não cruza tabela-ponte; recorte por dimensão via join/include) |

## 3. Relação com `ADR-INCR-DIM` F5 e com o §4

- **Precisão corrigida na ratificação (o par foi cauteloso demais):** B1 **NÃO reintroduz o §4**. O §4 rejeita
  o **Motor de Regras Contábeis** = template/`conditionsJson` que **GERA/valida um lançamento inteiro** por
  dado configurável. B1 é um **flag booleano `requiresDimension` por `Account`** consumido por um **gate de
  validação** no `postEntry` que **rejeita** (não gera) uma partida sem etiqueta — a mesma classe do gate de
  período (INCR-1) e do gate de conta-folha já existentes. Não há DSL de condições, não há geração. Logo B1
  **emenda F5** (opcional→condicionalmente obrigatório), mas fica **dentro** dos padrões travados, não os viola.
- **F5 (opcional) permanece o *default*.** A obrigatoriedade é **opt-in por conta** (o flag), não global; contas
  sem flag seguem 100% opcionais como INCR-DIM ratificou.
- **B0 (bucket read-time) continua recomendado como complemento**, não substituto: mesmo com B1, contas
  **não** marcadas ainda produzem partidas sem tag, então o relatório ainda precisa do "(Não alocado)" para
  `Σ == total`. **Decisão prática: B1 (gate) + B0 (bucket) juntos** — B1 fecha a origem nas contas críticas,
  B0 mantém a honestidade nas demais.

## 4. Forks (decisão do dono)

**F-DC0 — Nível de garantia de completude desejado:**
- **B0 — Bucket "(Não alocado)" visível no relatório (read-time, recomendado).** A DRE por dimensão passa a
  incluir uma linha/coluna explícita "(Não alocado)" = Σ das partidas sem etiqueta naquele eixo. `Σ(recortes)
  + Não-alocado == DRE total` por construção. **Não reabre F5, não colide §4** (é apresentação). Custo: lógica
  no report service + label i18n. Torna o buraco **visível**, não o elimina.
- **B1 — Etiqueta obrigatória em classes de conta designadas (posting-time).** `postEntry` rejeita partida a
  conta marcada "exige dimensão" sem tag. Elimina o buraco na origem. **REABRE `ADR-INCR-DIM` F5 e roça o §4**
  (enforcement dirigido por dado) — precisa de justificativa forte e de um modelo de configuração que não seja
  um mini-motor-de-regras (ex.: um flag `requiresDimension` por `Account`, não um DSL de condições).
- **B2 — Ambos:** B0 agora (honestidade imediata, sem colisão) + B1 depois **se** o bucket "Não alocado" na
  prática vier grande demais para ser útil (evidência empírica de que opcional não basta).

## 5. Recomendação do par e decisão do dono

**Recomendação do par:** B0 (bucket) primeiro; B1 só com evidência de uso. **Decisão do dono (ratificada):
B1** — etiqueta obrigatória por classe de conta. **Interpretação de implementação (par):** B1 **inclui** B0
por necessidade (contas não-marcadas seguem opcionais ⇒ o bucket "(Não alocado)" continua obrigatório para
`Σ == total`). Entrega:
1. `Account.requiresDimension` (flag booleano, default `false`) + qual(is) eixo(s) exige (ou "qualquer eixo");
2. gate no `postEntry`: partida a conta com `requiresDimension` **sem** `PostingDimension` no(s) eixo(s)
   exigido(s) → rejeita (mesma forma do gate de período/conta-folha, T6 in-tx);
3. bucket "(Não alocado)" no relatório de DRE por dimensão (B0), para as contas ainda opcionais.
**Fora:** UI de marcar conta como obrigatória (parte do FE do incremento); rateio automático (§4, fora).

## 6. Fora de escopo

Alçada/RBAC de quem pode definir eixo obrigatório; rateio automático de despesa entre centros de custo
(isso **é** motor de alocação, §4 — fora); dimensão em relatórios fiscais/SPED (dimensão é gerencial, não sai
no arquivo oficial).
