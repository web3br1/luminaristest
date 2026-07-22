Escrito em `C:/Users/smurf/Downloads/Luminaris/.claude/worktrees/council-accounting-decisions-42aa3c/docs/adr/ADR-CRM-lead-opportunity-model.md`. Segue o markdown integral:

---

# ADR-CRM-lead-opportunity-model — Modelo de produto Lead × Opportunity no molde salão

- **Status:** **PROPOSTO — PRE-ADR (proposta para ratificação HUMANA, §5.1). NADA aqui é ratificado.**
  Este documento **abre o desenho** e recomenda um default; a decisão é do **dono** (produto). O Conselho de
  CRM (boards v1/v2/v3, 2026-07-20) devolveu este item ao dono — foi o **único** da cédula sem voto de
  ratify (D3: 4 defer + 1 abstain). Nenhum código de mudança de modelo é escrito antes de sinal humano.
- **Data:** 2026-07-20
- **Decision class:** PRODUTO / MODELAGEM DE MÓLDE (DynamicTable). **NÃO** é decisão de fronteira
  (o balde tecnológico — Lead e Opportunity como presets DynamicTable — está **correto** e não se reabre) e
  **NÃO** é, por si, decisão contábil (o desenho do seam de receita CRM→razão é o **ADR-CRM-revenue-seam**,
  separado, com parecer `luminaris-accounting-architect`). Este ADR trata **só** de quantas pipelines de
  valor o molde salão expõe e quem é a portadora de fechamento.
- **Autores:** arquiteto de produto CRM + CTO (desenho). Parecer de mercado/UX: boards v2 (operadora de
  salão, estrategista de mercado).
- **Nó do master map / roadmap:** `docs/crm/COUNCIL-BOARD-CRM-2026-07-20-v3-resolution.md` **D3**
  (DEVOLVIDO-AO-DONO) e `docs/crm/CRM_REMEDIATION_AND_ROADMAP.md`. Origem: achado **CA1** (v1) reenquadrado
  por **SALAO-2 / MARKET-2** (v2).
- **Supersedes:** none · **Related:** **ADR-CRM-revenue-seam** (o seam de receita — bloqueante, cruza
  `postEntry`; este ADR pressupõe que a portadora de valor definida aqui é quem alimenta aquele seam),
  board v1 §1-item2 (CA1), board v2 Eixo 2, board v3 D3.

> **Nota de processo (T12).** PRE-ADR escrito **antes** de qualquer código de modelo. A ratificação é
> coletada por sinal humano (AskUserQuestion), fork-a-fork, **depois** do gatilho (kit de validação verde +
> sinal do 1º operador de salão real). Até lá o modelo fica no **interino reversível** recomendado em §5.

---

## TLDR (2 linhas)

Hoje Lead e Opportunity são **duas pipelines de valor sobre as MESMAS etapas**, e só a Opportunity reconhece
receita — a separação é **nominal** (o Lead não é consumido ao virar oportunidade, segue dono de `Won`/`Lost`
+ snapshot de proposta, e a analytics conta os dois). O **eixo real em disputa** é se o molde salão é
**B2C-solo** (um funil: interessado→cliente) ou uma **porta B2B futura** (aparato Lead+Opportunity do
benchmark Salesforce). Recomendação de **menor arrependimento**: **interino reversível** — ocultar a 2ª
pipeline no preset do salão **sem deletar código** — porque *elevar* (v1) e *remover* (v2-salão) são ambos
apostas irreversíveis sobre um molde que **nunca reconheceu um centavo real**. A decisão é do dono.

---

## 1. Contexto e objetivo

O CRM nasceu com dois presets DynamicTable de valor — `leads` e `crmOpportunities` — e a intenção declarada
era o funil clássico de software B2B: **Lead** = pré-qualificação (SDR/BANT), **Opportunity** = pipeline de
receita que fecha em `Won`. Na prática, a separação **não foi realizada**: as duas entidades carregam valor
sobre as **mesmas etapas** (`leadStages`), só uma **booka** receita, e a conversão de uma para a outra
**não termina** a primeira. O resultado é fonte-de-verdade dupla, dupla-contagem em analytics e — para o
usuário-alvo do molde (a recepcionista de um salão de bairro) — duas pipelines visualmente idênticas com
botões concorrentes.

O **objetivo sob a letra** do pedido (T1) não é "consertar um bug de conversão": é **decidir qual é o molde**.
As duas leituras do Conselho são genuinamente incompatíveis:
- **v1 (CA1):** a separação nominal é um **defeito a corrigir elevando** a Opportunity a portadora única.
- **v2 (SALAO-2/MARKET-2):** o par Lead+Opportunity é **aparato enterprise B2B importado** do benchmark
  Salesforce Sales Cloud; o comprador do molde salão não é comprador de CRM B2B → **remover** a 2ª pipeline.

Ambas as leituras concordam no fato de código; divergem no **produto**. Por isso escala ao dono.

## 2. Evidência de código (CBM-001 — confirmado por leitura nesta sessão)

| Claim | Grau | Evidência lida |
|---|---|---|
| `convertLeadToOpportunity` **cria a oportunidade mas NÃO consome/termina o lead** — a função retorna logo após criar a opp; **nenhum** update no `leadRow`, nem sequer para `status='Converted'` (que existe no enum) | **verificado** | `CrmPipelineService.ts:327-406` — cria opp em `runInTransaction` (`:394-401`), `logger.info` + `return opportunity` (`:402-406`); zero chamada de update ao lead |
| O **Lead segue dono de `Won`/`Lost`** + snapshot de proposta — é uma segunda portadora de fechamento | **verificado** | `LeadsModule.ts:109-112` (`status` inclui `'Won'`,`'Lost'`,`'Converted'`), `:83-100` (`latestProposalAmount`/`Currency`/`EtaClose`/`WinProbability` — snapshot da proposta no próprio lead) |
| **Duas pipelines sobre as MESMAS etapas** — a opportunity reusa `leadStages`/`pipelineId`; a etapa default é a 1ª etapa do pipeline de leads | **verificado** | `CrmOpportunityDto.ts:49-50` (`pipelineId`,`stageId`), `CrmPipelineService.ts:363-378` (resolve `stageId` a partir de `leadStages` do `input.pipelineId`) |
| **Dupla-contagem em analytics** — `CrmAnalyticsService` roda o funil/cards/status **sobre a tabela `leads`** (que inclui leads `Won`/`Lost`); a Opportunity que booka é uma segunda linha de valor sobre o mesmo negócio | **verificado** | `CrmAnalyticsService.ts:57-85` (funil/cards/status computados sobre `leadsTable`); receita só entra pela opp (board v1 CA-SEAM) |
| **Só a Opportunity gera lançamento** — lead levado a `Won` via `advanceStage` **não** vira receita; o mapper só dispara de `advanceOpportunity`+`status==='Won'` | **verificado (board v1)** | `crmController.ts:94,112` + `CrmOpportunityWonMapper.ts` (board v1, achado CA1/CA-SEAM, CONFIRMED) |

**Consequência estrutural:** a separação Lead×Opportunity é hoje **nominal** — não há um limite de responsabilidade
real entre elas (o Lead não deixa de ser portador de valor quando vira oportunidade), então o sistema tem
**duas fontes de verdade** sobre o mesmo negócio, e a analytics de funil e o razão medem coisas diferentes.

## 3. O EIXO REAL EM DISPUTA (o que escala ao dono)

> **Molde salão B2C-solo × porta B2B futura.**

Não é um eixo de arquitetura nem de invariante — é uma **aposta de produto** sobre o que o molde salão *é* e
para quem generaliza:

- **Se o molde é B2C-solo** (a recepção de um salão de bairro: um funil interessado→cliente, um operador,
  sem SDR nem pipeline de receita separado), então Lead+Opportunity é **ruído importado** — a operadora vê
  dois botões concorrentes ("Converter Lead" e "Criar Oportunidade") + uma aba "Oportunidades" que não
  corresponde a nada no balcão. A correção pró-molde é **remover** a 2ª pipeline.
- **Se o molde é a porta B2B futura** (o salão é só o **molde-semente** de uma engine que gera ERPs para
  verticais que **podem** ser B2B, onde pré-qualificação + pipeline de receita são requisito real), então
  Lead+Opportunity é a **superfície que um tenant enterprise futuro precisa** — removê-la agora amputa
  exatamente o que a tese ERP-gen quer poder gerar.

**Este eixo é genuinamente não-resolvido por falta de fato** (board v3, viés T8-1/T8-3): zero usuários, zero
deploy, zero centavo reconhecido. Nenhuma cadeira executiva pode fechá-lo — é a aposta de go-to-market do
dono. O que o PRE-ADR pode fazer é **evitar fechar a aposta cedo demais numa direção irreversível**.

## 4. Opções (o fork que vai ao dono)

### (a) ELEVAR a Opportunity a portadora única e rebaixar o Lead [v1 / CA1]
Opportunity vira a **única** portadora de valor/fechamento. Remover `Won`/`Lost`+snapshot do Lead (ou
bloquear `lead.status='Won'` sem opp vinculada); `convertLeadToOpportunity` **consome** o lead
(`status='Converted'`, terminal); `CrmAnalyticsService` exclui leads convertidos do funil de receita.
- **A favor:** resolve a fonte-de-verdade dupla no sentido "certo" para software B2B; alinha com o seam de
  receita (uma portadora → um lançamento).
- **Contra:** é **trabalho de modelo irreversível** que **entrincheira o aparato B2B** — se o molde for
  B2C-solo, elevamos a pipeline errada e mantemos dois conceitos onde o balcão só quer um. Reescreve
  analytics e conversão antes de um usuário real dizer que precisa de dois funis.

### (b) REMOVER a 2ª pipeline no molde salão [v2-salão / SALAO-2 / MARKET-2]
Um único funil (interessado→cliente). Deletar o preset `crmOpportunities`, a aba "Oportunidades", o botão
"Criar Oportunidade" e o seam `opportunity.won`; o Lead vira a única entidade, e o fechamento/receita passa
pelo Lead.
- **A favor:** **máxima fidelidade ao molde salão B2C**; elimina o ruído do balcão; menos superfície bespoke
  para o compilador ERP-gen ter de absorver.
- **Contra:** **irreversível e o mais arriscado** — deletar código B2B é fácil, **regenerá-lo** quando um
  vertical B2B pedir é caro; move o seam de receita para o Lead (que hoje **não** booka), reabrindo o desenho
  contábil que o ADR-CRM-revenue-seam ainda nem fechou. Aposta a tese inteira em "o molde é B2C-solo" sem
  um único tenant real. É a mesma classe da **deleção já-executada do módulo de leads legado** (board v1
  CA3): irreversível eleva o custo do erro.

### (c) MANTER-E-ADIAR com interino REVERSÍVEL [diretoria] **← recomendado**
**Ocultar** a 2ª pipeline no **preset do salão** (não instalar/não expor `crmOpportunities` + aba + botão no
molde salão por default) **SEM deletar código**. O aparato Lead+Opportunity continua vivo no repositório,
reativável por config; o molde salão exibe um funil só. Nenhuma mudança no modelo de dados, no seam ou na
analytics — só **o que o preset do salão expõe**.
- **A favor:** entrega a UX B2C do salão **hoje** (resolve o ruído do balcão que a operadora nomeou) e
  **preserva a porta B2B** para quando um tenant real pedir; **não** reescreve modelo, **não** deleta código,
  **não** toca o seam de receita (que é bloqueado por ADR próprio). Reversível nos dois sentidos.
- **Contra:** não *resolve* a separação nominal — **adia**; deixa o par Lead+Opportunity vivo (dívida de
  modelo dormente) e depende de o preset ser a única superfície de exposição (verificar que ocultar no preset
  realmente esconde as duas pipelines do salão).

## 5. Recomendação (default de MENOR ARREPENDIMENTO) — não-ratificada

**Recomenda-se a opção (c), o interino reversível**, como default até o gatilho de §6. Racional:

1. **As opções (a) e (b) são apostas irreversíveis sobre um eixo não-resolvido por falta de fato.** Elevar
   entrincheira o aparato B2B; remover deleta a porta B2B. Nenhuma das duas é reversível de graça, e o dado
   que decidiria entre elas — como um operador de salão real usa o funil — **não existe ainda**. Comprometer
   agora é decidir a aposta de produto **no escuro**.
2. **O interino compra a UX B2C sem gastar a opção B2B.** A operadora de salão ganha o funil único (o ganho
   concreto e verificado — o ruído do balcão some) e a engine mantém a capacidade de gerar o aparato
   Lead+Opportunity para um vertical B2B futuro. É o único movimento que **não fecha nenhuma porta**.
3. **Custo baixo, blast radius contido.** Mexe só no que o preset do salão expõe; **não** toca modelo de
   dados, analytics nem o seam de receita CRM→razão (que está bloqueado pelo **ADR-CRM-revenue-seam** e pelo
   kit de validação). Não reabre a fronteira DynamicTable×Prisma.
4. **Consistente com o princípio já aplicado no projeto:** "interino reversível > mudança irreversível
   quando o dado que decidiria ainda não existe" — é o mesmo instinto que o board v3 honrou em D2 (gate
   "operar 1 negócio real primeiro" antes de exercitar o gerador) e o oposto do erro CA3 (deleção
   irreversível do legado que elevou o custo).

**Nomeando o risco da própria recomendação (T8):** (c) pode ser **procrastinação disfarçada de prudência** —
a separação nominal continua no código como dívida dormente, e "adiar reversível" pode virar "nunca decidir".
A mitigação é o **gatilho durável** de §6: o interino tem uma **condição de saída explícita**, não é
open-ended. Segundo viés: a recomendação favorece reversibilidade porque é barata de defender — pode
subvalorizar o ganho de foco de **cravar** o molde B2C agora (b), se a convicção do dono na tese B2C-solo for
alta.

## 6. Gatilho de reabertura (condição de saída do interino)

A escolha definitiva (a) × (b) × manter (c) permanente **só reabre** quando **ambos**:

1. **Kit de validação verde** (board v3, D6 / Bloco A) — o seam de receita provado ponta-a-ponta num app de
   produção, os 4 furos de dinheiro falsificados, o backfill de `unitId` feito sob tenancy explícita. Sem
   isso, qualquer decisão de modelo pressupõe um seam que **ninguém provou que booka**.
2. **Sinal do 1º operador de salão real** — um negócio real na cadeira por ~2 semanas mostrando **como o
   funil é usado de fato**: um funil ou dois? pré-qualificação separada existe no balcão? É o único dado que
   decide entre B2C-solo (→ b) e porta-B2B (→ a/c permanente).

Enquanto os dois não acontecerem, o default é **(c)**. Quando acontecerem: **ADR de produto de sucessão,
ratificado pelo dono**, escolhendo (a)/(b)/manter-(c) com o fato do operador real na mão.

## 7. O que este ADR NÃO decide (fronteiras)

- **NÃO** decide o desenho do seam de receita CRM→razão (subrazão AR 1.1.5 vs receita direta; binding
  conta-por-papel como dado; guard terminal em `advanceOpportunity`; dead-letter do Won-imbookável) — isso é
  o **ADR-CRM-revenue-seam**, com parecer `luminaris-accounting-architect`, bloqueante e independente.
- **NÃO** reabre a fronteira DynamicTable×Prisma — Lead e Opportunity **são** presets DynamicTable e
  continuam sendo; o balde tecnológico está correto (board v1, camada DEFENDIDA).
- **NÃO** ratifica a aposta da tese ERP-gen nem a ordem exercitar-gerador × aprofundar-à-mão (board v3, D2) —
  este ADR só escolhe o que o **molde salão** expõe, não a estratégia de plataforma.
- **NÃO** autoriza deletar código (opção b) nem reescrever modelo (opção a) sem o gatilho de §6 + sinal do
  dono.

## 8. Riscos e vieses nomeados (T8)

1. **[verificado] Decisão sobre um molde nunca operado.** Todo o eixo B2C-solo × porta-B2B é apostado sob
   incerteza estrutural: zero usuários, zero deploy. O interino (c) é a resposta honesta a isso — não decide
   o que não pode ser decidido sem fato.
2. **[inferido] O interino pode não ocultar de verdade.** (c) assume que não-instalar `crmOpportunities` no
   preset do salão realmente esconde a 2ª pipeline de ponta a ponta (aba, botão, board). **Checagem que
   falharia se eu estivesse errado:** instalar o preset salão num tenant limpo e confirmar que nenhuma
   superfície de Opportunity aparece. Obrigatória antes de considerar (c) entregue.
3. **[assumido] Reversibilidade barata da (c).** Assume-se que reativar Lead+Opportunity por config é barato.
   Se o preset acumular acoplamento ao funil-único, a reversibilidade encarece silenciosamente — nomeado.
4. **[verificado] Viés de moldura salão-solo (importado do board v2).** Tratar Lead+Opportunity como "aparato
   a remover" pode impor uma lente B2C-solo a um produto cuja tese é gerar verticais que **podem** ser B2B.
   O interino (c) é deliberadamente o movimento que **não** compra essa moldura — mantém as duas leituras
   vivas até o fato chegar.
5. **[verificado] Adiar pode virar nunca-decidir.** O maior risco de (c) é a dívida dormente; o gatilho §6
   com condição de saída explícita é a mitigação, não a eliminação, do risco.

---

**STATUS: PROPOSTO — aguarda sinal humano (§5.1).** Recomendação: **(c) interino reversível** (ocultar a 2ª
pipeline no preset do salão sem deletar código) como default de menor arrependimento, com reabertura no
gatilho **kit verde + sinal do 1º operador de salão real**. A escolha definitiva (a)/(b)/manter-(c) é do
**dono** — nenhuma cadeira executiva a fecha. Este PRE-ADR abre o desenho; não escreve código de modelo.