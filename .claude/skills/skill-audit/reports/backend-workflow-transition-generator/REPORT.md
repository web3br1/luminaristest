# Skill Audit Report — backend-workflow-transition-generator

- Skill: `backend-workflow-transition-generator` (id `SKL-WORKFLOW-TRANS`, v1.0.1)
- Executed at: 2026-07-17 (revisão de instrumento; execução de geração herdada de 2026-07-16)
- Overall score: **0.50 mecânico + 1 BLOCKED** — era 1.00 e o 1.00 era verdadeiro e vazio
- Minimum: 0.90
- Overall result: **BLOCKED** (não PASS, não FAIL: o núcleo da regra não é certificável aqui)

Casos: **1/2** de código PASS via `batch-eval`; `regression-1` (AC-2.1-B4) é **BLOCKED** — sua assertion
decisiva é `judge:`, qualitativa, e o julgamento é model-in-loop. Os **2 casos de trigger NÃO foram
re-executados** — herdados de 2026-06-25 (router-judge).
Regras: AC-2.1-B4 (não editar DynamicTableService) — gate autoritativo é **design-time** (reviewer),
NÃO este eval; AC-2.1-B1 injeção no motor via G6 (grep no APP, determinístico).

> **Por que o score CAIU sem nenhuma regressão de comportamento.** Nada na skill piorou. O que mudou é
> que o instrumento parou de mentir. O 1.00 anterior media uma assertion que, medida contra uma suíte
> adversarial, aceitava **0 de 6** respostas CORRETAS e deixava passar **2 de 10** erradas — um gate
> quase anticorrelacionado com a verdade, verde porque ninguém o havia medido. Score alto é sobre o
> instrumento, não sobre a skill; um BLOCKED honesto vale mais que um PASS vazio.

## Execução
Dialeto-piloto (governs-rules AC-* → gates G5/G6/P6/reviewer). Regras determinísticas (grep G5/G6) dispensam eval (SG-035); regras design-time cobertas por eval comportamental (geração em contexto limpo + batch-eval). Evidência: `./_eval.out.txt`.

**1ª tentativa invalidada e refeita** — o prompt de geração não proibia narração e o modelo fechava com um checklist de conformidade (`- [x] … sem prisma.* direto`), que `absent:prisma.` reprovava. Diagnóstico completo no REPORT de `backend-route-generator`.

## Correções de eval (de-brittle, com controle de negação provando que o gate ainda discrimina)

**2026-07-16 — política ratificada pelo dono: o eval crava a PROPRIEDADE, não a forma canônica.**

`regression-1` (AC-2.1-B4) media **ortografia**: o regex `(nunca|NUNCA|n[aã]o)[\s\S]{0,80}DynamicTableService` tem `n[aã]o` **minúsculo**, e reprovava a resposta certa — **"**Não** modifique `DynamicTableService.ts`"** — porque a frase começa com maiúscula. Também exigia proximidade de ≤80 caracteres, medindo distância entre palavras em vez da tese.

- ~~Agora: `regex-i:(nunca|n[aã]o)\s+(injete|…|tocar)[\s\S]{0,120}DynamicTableService` — exige o **verbo de proibição** ligado ao motor, sem depender de caixa.~~
  **DERRUBADO em 2026-07-17 — a afirmação era falsa.** O regex NÃO liga o verbo ao motor: `{0,120}` é
  uma janela, e qualquer negação perto do token satisfaz. `"Não modifique o controller."` + a regressão
  do incidente 2026-06-24 no mesmo texto passa 2/2. Medido contra suíte adversarial: **0/6 respostas
  corretas aceitas**, 2/10 erradas aprovadas. Ver a seção de 2026-07-17 abaixo.
- A 1ª assertion (onde a integração deve viver) virou `regex-i` pelo mesmo motivo.
- Harness ganhou o kind `regex-i` (case-insensitive), obrigatório em assertion de prosa: em português a frase começa com maiúscula.

**Controle de negação:** a regressão do incidente 2026-06-24 —
```
A integração deve viver dentro do próprio motor: injete o PostingService no
DynamicTableService e chame-o no runInTransaction da transição…
Edite DynamicTableService.ts para receber o PostingService pelo construtor.
```
→ `regression-1` **0/2** (ambas as assertions reprovam). O gate discrimina.

## Skipped / blocked
- Casos de trigger: não re-executados — exigem router-judge, fora do `batch-eval`.

---

## 2026-07-17 — o instrumento reprovado, e a regra de processo que faltava

**Achado (reviewer independente, confirmado por medição).** A assertion de `AC-2.1-B4` media a
**presença da frase proibitiva**, não o objeto da proibição. Dois furos, um em cada direção:

| | assertion anterior | agora |
|---|---|---|
| respostas CORRETAS aceitas | **0 / 6** | **6 / 6** |
| negativos barrados (mecânico) | 8 / 10 — mas rejeitava tudo, inclusive o certo | 3 / 10 + 7 no `judge:` |

O 8/10 anterior não era discriminação: era um relógio parado. Ele reprovava `good-1` (resposta
exemplar) porque a frase certa é "NÃO **pode** editar" — uma palavra entre a negação e o verbo — e
aprovava `bad-4`, que manda injetar `PostingService` no motor no 1º parágrafo e **cita o contrato
verbatim** no fecho.

**O resultado que decidiu o desenho:** `good-1` e `bad-4` contêm a **mesma sentença normativa**. Nenhum
regex separa os dois, porque o que difere é a **ação endossada** — semântica. Citar a regra é grátis.
Por isso o regex de proibição foi **removido** (não discriminava e só gerava falso-reprovado), o
mecânico passou a medir o que é mecânico (nomear a camada de aplicação; nenhum diff/marcador de arquivo
editando o motor — pega `bad-2`, que enuncia a regra e a viola no código), e o núcleo virou `judge:`.

**A regra de processo (a lição que vale mais que as duas correções).**
Os negativos de um eval **não podem ser escritos por quem escreveu a assertion** — é a independência do
reviewer aplicada um nível abaixo, no instrumento. Os negativos anteriores eram meus, escritos *depois*
das assertions, e convergiam para o que elas já pegavam: nenhum deles tinha uma cláusula `não <verbo>`,
que era a única coisa que a assertion procurava. Declarar o viés não o remove — só permite que outro o
explore. Estes 16 fixtures foram escritos por um agente **adversário cego às assertions e antes delas**.

**Gates novos desta rodada** (o furo passou por 5 gates verdes; estes existem para que essa classe não
passe de novo):
- `skill-audit adversarial` — roda as assertions do CASO (conjunção, o grão certo; `controls` roda uma
  assertion isolada) contra os fixtures adversariais. Exige: toda saída correta passa, todo negativo
  mecânico é barrado. Fixtures em `evals/adversarial/<caseId>.json`, versionados.
- `CONTROL_DRIFT` — o campo `assertion` do control é cópia à mão e **tinha derivado**: provava o regex
  antigo do `CTL-001` enquanto o `evals.json` já embarcava outro. Agora a cópia tem de existir na fonte.
- `batch-eval` BLOCKED — `fail` contava só `ok === false`; uma assertion qualitativa devolve `null`,
  sumia da conta e o caso imprimia `✅ (0/0)`. Um caso com `judge:` **nunca** conta como PASS sem
  julgamento model-in-loop.

**Teto declarado (impresso em todo run do gate `adversarial`).** 7 dos 10 negativos são prosa pura
(`bad-1/3/4/5/7/9/10`) e estão fora do alcance mecânico — só o `judge:` os separa. Isto não é uma
lacuna a esconder: **`AC-2.1-B4` é regra de design-time**. Seu gate autoritativo é o reviewer; o da
regra irmã `AC-2.1-B1` é o **G6, que lê o APP** (`grep -rn 'PostingService' server/src/features/dynamicTables/`).
Um eval de prosa nunca substituiu nenhum dos dois — ele só não pode mais fingir que substitui.
Vale aqui o `gate-eval-prova-o-texto-nao-o-app`: **o melhor gate é o que o desenho dispensa.**
