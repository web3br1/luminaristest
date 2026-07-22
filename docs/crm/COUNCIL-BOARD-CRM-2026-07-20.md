Verificação estrutural completa (5 achados mais severos confirmados em código). Segue o board.

---

# BOARD CONSULTIVO — Design Council do CRM (Luminaris)
**Chairman consultivo · 2026-07-20 · nada aqui é ratificado — ratificação é humana**

## Duas linhas de verdade
1. **O CRM está code-complete e arquiteturalmente coerente com a fronteira DynamicTable** — não há vazamento real para Prisma (os 2 modelos Prisma são infra transversal defensável), a mecânica de board foi corretamente extraída e o motor não recebeu serviço de domínio; o gargalo é o mesmo da contabilidade: **nunca foi validado num app vivo nem deployado**.
2. **Risco mais agudo verificado — o seam de receita CRM→razão é duplo-cego e mutável:** um lead levado a `Won` via `advanceStage` **não gera lançamento** (só a Opportunity gera), e `advanceOpportunity` **não tem guard de estado terminal** — receita real pode ser re-emitida/mutada pós-Won, com débito **hardcoded em 1.1.2** (controle compartilhado com o salão) e **sem linha de subrazão AR**.

---

## Nota de verificação (5 mais severos — leitura de código, não runtime)

| Achado | Claim | Evidência lida | Veredito |
|---|---|---|---|
| **CA-SEAM** | Mapper hardcoda par 1.1.2/3.1, debita controle compartilhado sem subrazão AR, converte float→centavos | `CrmOpportunityWonMapper.ts:16-17` (DEBIT `1.1.2`/CREDIT `3.1` constantes), `:26-42` (float→`Math.round(*100)` com guards finito/safe-int/>0), `:51-52` (2 linhas, nenhum Receivable) | **CONFIRMED** o hardcode + débito em 1.1.2 + conversão de float com guards. "Recebível órfão sem baixa" = CONFIRMED estrutural (o seam não cria linha de subrazão); efeito no tie-out do 1.1.5 = **PLAUSIBLE** (subrazão AR não relido nesta sessão) |
| **CA1** | Lead ainda carrega Won/Lost + snapshot de proposta; `advanceStage` não emite evento contábil; receita só entra pela Opportunity | `LeadsModule.ts:108-115` (`status` inclui `Won`/`Lost`), `CrmPipelineService.advanceStage:40-76` (sem chamada de sync), `crmController.ts:94,112` (`maybeSyncOpportunityWon` só dispara de `advanceOpportunity` e só quando `status==='Won'`) | **CONFIRMED** — ponto cego de receita real |
| **CB-MONEY-SEAM** | `advanceOpportunity` sem guard terminal; amount mutável após Won; re-Won repassa evento | `CrmPipelineService.advanceOpportunity:274-313` (nenhum guard de `status` corrente; `patch.amount` em `:287`; `Won`+`closedAt` em `:294-297`), `crmController.ts:94` | **CONFIRMED** ausência de guard + mutação de valor. Drift silencioso no razão = **PLAUSIBLE** (depende do dedup por `sourceId` do `postEntry`, não relido) |
| **CA4** | `useTableData` virou fetch-all (cap 1000 páginas × 200 = 200k linhas); blast radius em todo o dashboard; nunca smoke-testado em tabela grande | `crmFetch.ts:13-27` (`MAX_PAGES=1000`, `PAGE_SIZE=200`, loop sequencial), memória `crm-shared-table-loader-fetch-all` | **CONFIRMED** a técnica e o teto. Duplicação exata dentro de `useTableData` = **PLAUSIBLE** (baseado em memória; `useTableData` não relido) |
| **CA-IDEMP** | `advanceStage`/`createProposal` sem guard de idempotência vs `convertLead` que tem | `CrmPipelineService:58-72` (cria proposta em `leadProposals` a cada chamada, sem dedup por `leadId,stageId`) vs `:132` (`'Lead already converted'`) | **CONFIRMED** — assimetria dentro do mesmo serviço |

---

## SEÇÃO 1 — DECISÕES TOMADAS: aberturas para questionamento

### 1. Seam de receita CRM→razão: hardcode + duplo-cego + subrazão ausente `[CA-SEAM]`
- **Decisão:** `CrmOpportunityWonMapper` reconhece receita ao `Won` debitando `1.1.2` / creditando `3.1`, contas hardcoded, a partir do `amount` float da DynamicTable.
- **Levantado por:** BOUNDARY (high) · reforçado por crm-product-architect (CA1, high) e INVARIANT (CB-MONEY-SEAM, medium).
- **Abertura (3 defeitos distintos, todos verificados):**
  1. **Duplo-cego de receita** — lead a `Won` via `advanceStage` nunca vira lançamento; só a Opportunity booka. A analytics de lead mede um funil; o razão vê outro.
  2. **Débito em controle compartilhado sem subrazão** — cai em `1.1.2` (compartilhado com o salão), sem criar linha no subrazão AR (`1.1.5`) → recebível efetivamente órfão, invisível ao tie-out.
  3. **Binding hardcoded contra a tese-compilador** — o par de contas cravado no runtime é exatamente o que o compilador ERP-gen deveria emitir como dado (contas por papel).
- **Camada:** DEFENDIDA — o seam está no lugar certo (controller pós-commit, best-effort, reconcile re-drive; motor intocado). O defeito é de desenho do mapeamento, não de fronteira.
- **Severidade:** ALTA.
- **Ação proposta:** PRE-ADR + parecer `luminaris-accounting-architect` + sinal humano. Reabre desenho de seam (cruza decisão contábil travada `postEntry`) — não implementar direto. Decidir: (a) receita-de-oportunidade transita pelo subrazão AR ou é receita direta sem recebível; (b) binding como dado/conta-por-papel.

### 2. Separação Lead × Opportunity é hoje nominal — Lead não foi rebaixado `[CA1]`
- **Decisão:** Opportunity 1ª classe via `installTableFromPreset` + preset `crmOpportunities`, reusando `leadStages`; `convertLeadToOpportunity` **não consome/termina o lead**; o Lead segue dono de `Won`/`Lost` + `latestProposalAmount`.
- **Levantado por:** crm-product-architect (high) · BOUNDARY e MINIMAL (medium) · **REUSE DEFENDE** o outro facet (ver Divergências).
- **Abertura:** dois pipelines carregam valor sobre as MESMAS stages, só um booka; dupla-contagem em analytics; usuário vê duas pipelines idênticas. Fonte-de-verdade dupla.
- **Severidade:** ALTA (modelagem, não fronteira — o balde tecnológico DynamicTable está correto).
- **Ação proposta:** ADR de produto + sinal humano — declarar a Opportunity como **única portadora de valor/fechamento** e rebaixar o Lead (remover `Won`/`Lost`+snapshot OU bloquear `lead.status='Won'` sem opp vinculada) e marcar `CrmAnalyticsService` para excluir leads convertidos.

### 3. Guard de estado terminal ausente em `advanceOpportunity` `[CB-MONEY-SEAM]`
- **Decisão:** `advanceOpportunity` marca `Won`/`closedAt` e o controller posta receita; **sem guard de estado terminal** — opp já `Won` pode ser re-avançada com `amount` mutado e re-`Won`.
- **Levantado por:** INVARIANT (medium).
- **Abertura:** diferente de `convertLead` (guard `already converted`), aqui `postEntry` dedup por `sourceId` congela o PRIMEIRO valor → razão fica no valor antigo, CRM no novo. Agora é DINHEIRO real.
- **Severidade:** MÉDIA (agrava CA-SEAM).
- **Ação proposta:** guard terminal espelhando `convertLead` (Won/Lost = terminal ou amount imutável pós-Won) + reconcile que DETECTE drift de valor. Cruza lente contábil → ADR + parecer accounting-architect.

### 4. Idempotência assimétrica: `advanceStage`/`createProposal` sem dedup `[CA-IDEMP]`
- **Decisão:** cada `advanceStage` para etapa de proposta cria uma `leadProposals` nova, sem dedup por `(leadId,stageId)`.
- **Levantado por:** INVARIANT (medium).
- **Abertura:** drag duplo / double-click / retry de rede → propostas DUPLICADAS. `convertLead` blindou; `advanceStage` não. Inconsistência intra-serviço.
- **Severidade:** MÉDIA.
- **Ação proposta:** patch (T6) — tornar `advanceStage` idempotente por `(leadId,stageId)` ou upsert na proposta + teste de dupla-chamada. Sem ADR.

### 5. Escala como correção: fetch-all em `useTableData` `[CA4]`
- **Decisão:** loader canônico de TODA tabela do dashboard virou fetch-all (`MAX_PAGES=1000 × 200`).
- **Levantado por:** INVARIANT (high) · REUSE (low, técnica re-inlinada).
- **Abertura:** N round-trips sequenciais + OOM/timeout silencioso no browser; blast radius em todo o dashboard; a única prova que o pegaria (`>50 registros` no §6) nunca rodou.
- **Severidade:** ALTA.
- **Ação proposta:** rodar §6 com tabela `>200` linhas ANTES de aprofundar; se mantiver fetch-all, ADR documentando o teto + guard server-side de página máxima. E colapsar a duplicação: `useTableData` chamar `fetchAllRows` (patch, não rewrite).

### 6. Dois modelos Prisma num módulo DynamicTable — sem ADR `[CA2]`
- **Decisão:** `SavedTableView` e `CrmAttachment` nasceram slice-a-slice, sem regra escrita.
- **Levantado por:** BOUNDARY + MINIMAL + crm-product-architect (convergência 3 lentes = sinal forte) — **todas concordam que o JULGAMENTO está certo** (infra transversal, não schema-de-usuário → Prisma é a casa certa), **o furo é a AUSÊNCIA de regra citável**.
- **Severidade:** MÉDIA.
- **Ação proposta:** ADR curto codificando "quando uma feature de módulo-DynamicTable ganha Prisma" (infra-transversal-da-plataforma × schema-de-usuário-runtime) + canonizar o SHAPE de metadados-de-anexo (`CrmAttachment` × `DocumentAttachment`) ANTES do 3º módulo pedir anexos. NÃO reabre Prisma-first — é regra nova.

### 7. WAIVER de unit-scoping + deleção do legado (já executada) `[CA3/CB5]`
- **Decisão:** eixo de segmentação por unidade abandonado (owner-centric); módulo legado de leads **já deletado** (glob = 0).
- **Levantado por:** INVARIANT + MINIMAL + crm-product-architect (convergência 3).
- **Abertura:** não é breach de tenancy (isolamento segue por `userId`, `unitId` no registro), mas o salão-molde pode ser multi-unidade e a deleção apagou a ÚNICA superfície unit-scoped; owner-centric em single-user é teatro (dono único).
- **Severidade:** MÉDIA (a deleção irreversível já elevou o custo — a ação vira retroativa/preventiva).
- **Ação proposta:** ADR ratificando o abandono do eixo unidade; se não ratificado, reintroduzir filtro por unidade no board canônico (`groupBy` plugável) — não reviver o legado.

### 8. Validações tx-aware no motor de plugins `[CA6]` — **DIVERGÊNCIA**
- **Decisão:** `DynamicTableService.createTableData/updateTableData` ganhou propagação de `tx` às validações para desbloquear `convertLead`.
- **Levantado por:** crm-product-architect **DEFENDE** (capacidade genérica, nenhum serviço Prisma injetado — camada certa) × BOUNDARY questiona (medium: motivação foi integração intra-CRM, a distinção "capacidade genérica × acoplamento de domínio" não está escrita, e o caminho no-tx só tem teste vivo). Ver Divergências.
- **Severidade:** MÉDIA (não é violação limpa).
- **Ação proposta:** ADR de 1 parágrafo fixando o critério "capacidade genérica do motor (OK) × acoplamento de domínio (proibido §2.1-B)", citando este caso como referência dourada + teste de integração no caminho no-tx + eixo no gate `skill-audit` G6.

### Aberturas DEFENDIDAS (registro de 1 linha)
- **CA1 board-mechanics `[REUSE]`** — `usePipelineBoard` é fonte única; wrappers finos não clonam. Manter.
- **CA-INSTALL** — `installTableFromPreset` é infra genérica de preset, camada certa. Manter.
- **CA-AUTH** — `/api/crm` coberto por prefixo, sem regra method-keyed → furo HEAD→GET não o atinge. Manter (torcer pela migração deny-by-default).
- **CA8 anexos** — path-traversal + magic-bytes + Content-Disposition fechados em 2 camadas. Manter (residual low: reforçar assinatura PNG/JPEG + checar posse do `entityId`).
- **CA-DATES** — `crm/lib/dates.ts` diverge do canônico COM justificativa escrita (locale). Reuso maduro. Manter.

---

## SEÇÃO 2 — PASSOS FUTUROS: mudanças de direção (ordenado por impacto)

### A. Provar antes de aprofundar — rodar o §6 num app vivo `[CB3/CB-PROVE-FIRST/CB-VALIDATE]` — ALTA
**Convergência 3 lentes.** As duas descobertas de invariante mais fortes vivem exatamente nas provas nunca executadas: `advanceStage` idempotência (CA-IDEMP) e fetch-all (CA4). Bloqueio de dado concreto: **80 leads seed com `unitId` nulo fazem `convertLead` E `convertLeadToOpportunity` FALHAREM** (guard `CrmPipelineService:142-144,353-355`) — a feature-carro-chefe é indemonstrável no seed atual. **Antes de qualquer slice novo:** (1) backfill de `unitId` via Prisma; (2) rodar as 5 provas §6 priorizando drag-duplo (conta propostas), tabela `>200` linhas (fetch-all), e o seam `opportunity.won` ponta-a-ponta.

### B. CRM como superfície para exercitar o gerador ERP-gen `[CB4]` — ALTA
**Convergência das 4 lentes analíticas — sinal de direção mais forte do board.** CRM é módulo canônico que a engine (forma-final COMPILADOR) DEVERIA gerar; a tese NUNCA foi exercitada. Cada slice hand-built + o mapper hardcoded (CA-SEAM) entrincheiram um CRM que o compilador terá de absorver. **Direção:** congelar profundidade P1 manual; usar o seam `opportunity.won` como o PRIMEIRO teste do binding-como-dado gerado (contas por papel). Decisão = ADR + sinal humano escolhendo "exercitar gerador" sobre "aprofundar à mão". Espelha o B4 da contabilidade.

### C. Congelar o Bloco B (22 gaps vs Salesforce) `[CB1]` — ALTA
**Convergência todas as lentes.** O próprio roadmap admite que a engine já dá "de graça": custom objects → DynamicTable presets; automação parcial → rules-engine + ActionProposal; analytics extensível → contrato `AnalyticsProcessor`. Vários gaps (16 automação, 20 web-to-lead, campos customizados) são DUPLICAÇÃO manual do motor. Além disso são features enterprise B2B (territórios, quotas, price-books, forecast) irrelevantes ao molde salão B2C. **Direção:** congelar; reclassificar cada gap em 3 baldes — (a) motor já provê → config, não código; (b) ausente e setor-variável → preset; (c) invariante → Prisma+ADR. Só (b/c) vira trabalho. Manter só piso universal: lembrete de tarefa (CB6), notas/anexos em account/contact (CA7).

### D. Resolver a duplicação de Kanban explicitamente `[CB-KANBAN/CA1-DUP]` — MÉDIA
`useKanbanLogic` (dashboard, por status-enum) × `usePipelineBoard` (CRM, por stageId com efeito colateral `advanceStage`) — o gatilho do próprio roadmap ("generalizar no 3º board") disparou dentro do CRM, mas a duplicação ATRAVESSA a fronteira CRM↔dashboard e ninguém reabriu. **Direção:** ADR — generalizar `useKanbanLogic` (`groupByField`+`onMove` plugável) OU ratificar divergência permanente pela transição-com-efeito-colateral. Não deixar como "pragmático indefinido".

### E. Fechar o loop de `reminderAt` — job de lembrete `[CB6/CB-TASK-REMINDER]` — MÉDIA
`tasks.reminderAt` é gravado sem consumidor — classe "param aceito-e-ignorado é bug silencioso": a UI promete lembrete, nada dispara. **Direção:** construir a entrega via canal mínimo (notificação in-app, não bloquear em email/gap P1 #13) OU ocultar `reminderAt` até o job existir. Enquanto isso, parar de marcar "tarefas reais" como FEITO. Patch, sem ADR.

### F. Resolver `CA2-ATT` antes de estender anexos a novas entidades `[CB-ATT]` — MÉDIA
Estender `CrmAttachment` polimórfico (lead→account/contact/opportunity) sem decidir a relação com `DocumentAttachment` metastatiza o quase-clone. **Direção:** resolver CA2 primeiro; se ratificar divergência, tornar `CrmAttachment` a fonte única de TODAS as entidades DynamicTable — não abrir 3º modelo.

### G. Sequenciar o dashboard de analytics de Opportunity `[CB2]` — BAIXA
Confirmado NÃO-construído. **Direção:** manter congelado até o ADR de CA1 fixar a Opportunity como portadora única de valor; depois, reusar o contrato `AnalyticsProcessor` (mais um processor keyed), zero componente `*KpiCard/*Chart` bespoke. YAGNI puro até um tenant real acumular opps.

---

## DIVERGÊNCIAS DO COUNCIL (o que escala ao dono)

1. **`CA6` — tocar o motor compartilhado para orquestração intra-CRM.** crm-product-architect DEFENDE (capacidade genérica, motor limpo, camada certa) × BOUNDARY questiona (motivação foi integração, critério não escrito, caminho no-tx sem teste de não-regressão). **Eixo real em disputa:** uma mudança de *capacidade genérica* no motor compartilhado, *motivada por* integração de um módulo, precisa de codificação (ADR + teste), ou é limpa por não injetar serviço de domínio? Ambos concordam que nenhum `PostingService`/`CrmService` entrou — divergem sobre se "genérico + boa intenção" dispensa a regra escrita.

2. **`CA1` — o facet sob julgamento.** REUSE trata CA1 como desfecho CORRETO (mecânica de board extraída, não clonada) enquanto crm-product-architect/MINIMAL atacam como separação NOMINAL (mesmas stages, lead não consumido, ponto cego de receita). **Não é contradição de fato — é contradição de recorte:** REUSE olha a mecânica FE (defensável); crm-arch olha a modelagem de domínio (defeituosa). **Eixo que escala:** o Lead deve ser rebaixado a pura pré-qualificação, tornando a Opportunity a única portadora de valor? Isso é decisão de produto, não de arquitetura.

3. **`CA9` — quanto da profundidade P0 contradiz a tese-compilador.** MINIMAL diz ALTA (todo slice hand-built entrincheira) × crm-product-architect diz PARCIALMENTE DEFENDIDA (o DADO já está na forma gerável — preset + orquestração fina + seam; o risco é o crescimento da superfície bespoke de orquestração/FE). **Eixo real:** o débito é o modelo (baixo) ou a superfície hand-coded que o compilador terá de absorver (alto)?

---

## VIÉSES DO PRÓPRIO COUNCIL (T8)
- **Verificação foi ESTRUTURAL, não runtime.** Todo "ponto cego de receita", "OOM do fetch-all", "proposta duplicada" e "drift de valor no razão" é inferência de caminho de código — o §6 vivo nunca rodou, o sistema nunca foi deployado. As consequências marcadas PLAUSIBLE (tie-out do subrazão, dedup por `sourceId`) dependem de código contábil não relido nesta sessão.
- **Ancoragem na tese ERP-gen.** As 4 lentes convergem para "congelar e exercitar o gerador" — convergência forte pode ser groupthink sobre o doc de tese, que ele próprio NUNCA foi exercitado. O council pode estar sobrepesando uma aposta não-provada contra profundidade de produto concreta.
- **Moldura importada da contabilidade.** O board espelha o council contábil (B4, seam, gargalo humano) e pode impor uma lente accounting-shaped a um módulo DELIBERADAMENTE DynamicTable — o risco é tratar como defeito o que é escolha de posse (owner-centric, FK-less, float→cents no seam).