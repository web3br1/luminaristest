# PRE-ADR-INCR-DIM-COMPLETENESS — Completude da DRE por dimensão (eixo opcional × obrigatório)

- **Data:** 2026-07-15
- **Status:** **PRE-ADR — aguardando ratificação humana fork-a-fork.** Nenhuma linha de código até o sinal.
  **REABRE parcialmente `ADR-INCR-DIM` F5 (dimensão sempre opcional)** — portanto é `DECISÃO ARQUITETURAL`,
  não tarefa. Levantado pelo debate de personas (Arquiteto Contábil), aterrado no código (CBM-001).
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

- **F5→a (opcional) permanece correto para o *posting-time*.** Forçar etiqueta na escrita, condicionada à
  conta, **é** uma regra dirigida por dado no caminho do ledger — exatamente o antipadrão §4. A opção B1 abaixo
  reabre isso e deve ser tratada como reversão arquitetural séria.
- **Completude é um problema de *read-time*, e read-time não colide com §4.** Um "bucket Não Alocado" no
  relatório é **convenção de apresentação**, não regra de postagem — não reintroduz motor nenhum. Este é o
  ponto que separa "honestidade do relatório" (barato, sem colisão) de "obrigar dado" (caro, colide).

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

## 5. Recomendação do par (não-vinculante)

**B0.** É a correção proporcional: entrega a propriedade que o Arquiteto quer (`Σ == total`, sem mentira por
omissão) **sem** reabrir uma decisão travada nem tocar o §4. B1 só se, depois de usar o sistema de verdade, o
"(Não alocado)" for grande a ponto de esvaziar o relatório — aí há **evidência** para pagar o custo
arquitetural de reabrir F5. Decidir B1 agora, sem esse dado, é reabrir um lock por hipótese.

## 6. Fora de escopo

Alçada/RBAC de quem pode definir eixo obrigatório; rateio automático de despesa entre centros de custo
(isso **é** motor de alocação, §4 — fora); dimensão em relatórios fiscais/SPED (dimensão é gerencial, não sai
no arquivo oficial).
