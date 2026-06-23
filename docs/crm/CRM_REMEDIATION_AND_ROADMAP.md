# CRM — Plano de Remediação + Roadmap (gap vs. Salesforce)

> Documento de planejamento. **Parte A** = plano detalhado para corrigir o CRM atual (aplicando as skills endurecidas + `_ARCHITECTURE-CONTRACT.md`). **Parte B** = análise de lacunas vs. um CRM maduro (Salesforce Sales Cloud), priorizada e aterrada na arquitetura Luminaris.
>
> Baseado na auditoria de `feature/crm-module`: frontend em `my-app/features/crm/` + `my-app/pages/crm/`, backend em `server/src/features/crm/`.

---

## Estado atual (linha de base factual)

### O que JÁ existe e funciona (backend)
- **Orquestração de pipeline** (`CrmPipelineService`, transacional):
  - `advanceStage` — move o lead de etapa; se a etapa é `proposal` e há `amount`, cria a proposta e atualiza o snapshot no lead.
  - `createProposal` — cria proposta standalone + refresca snapshot do lead.
  - `recordNoShow` — loga atividade + reagenda ou reverte a etapa.
- **Analytics** (`CrmAnalyticsService`): bundle keyed de 7 processors sobre `leads` — funnel, conversão (cards/KPIs), fonte, status, BANT, propostas por status, atividades por tipo. Backend é sólido e reusa o contrato `AnalyticsProcessor`.
- **Modelo de dados** (DynamicTable presets): `crmAccounts`, `crmContacts` (com `accountId`/`leadId`/buying role), `leads` (BANT, `stageId`, snapshot de proposta, `status` Open/Won/Lost/Disqualified, `nextActionAt`), `leadProposals` (status Draft/Sent/Accepted/Rejected/Expired, `estimatedCloseDate`), `leadActivities`, `leadPipelines`, `leadStages`.
- **CRUD genérico**: contatos/contas/propostas/leads têm CRUD completo via os endpoints genéricos de DynamicTable (`createTableData`/`updateTableData`/`deleteTableData`) — já com validação, rules e policy.

### O que está QUEBRADO (frontend — diagnóstico já feito)
| # | Problema | Causa |
|---|---|---|
| 1 | Tabelas (Contatos/Contas/Propostas) sem add/edit/delete inline, sem filtros, estilo fora do padrão | `RecordTable.tsx` bespoke em vez de `GenericTable` |
| 2 | Sem paginação (tabelas e atividades) | `rows.map` direto, sem `StandardPagination` |
| 3 | Views mudam de tamanho ao navegar | cada página fixa `max-w-*` próprio (3xl→7xl) |
| 4 | Atividades sem paginação, posição varia | timeline própria `max-w-3xl` |
| 5 | Analytics fora do padrão (KPI/explicação/lista) | `CrmKpiCard`/`CrmBarChart`/`CrmPieChart` próprios em vez de `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard` |
| 6 | Lead360 troca de tela em vez de modal | `router.push('/crm/leads/[id]')` → página `leads/[id].tsx` |
| 7 | CRUD inexistente na UI | frontend nunca cabeou os endpoints de DynamicTable |
| 8 | **Pipeline reimplementa um Kanban estático** — sem drag-drop, sem criar/filtrar, clique = troca de tela | `pipeline.tsx` ignora o `InternalKanbanView` canônico (que já tem dnd-kit + `KanbanCardDetailModal` + `FloatingActionButton` + full-height) |

---

# PARTE A — Plano de Remediação

> **Status de execução (2026-06-16): TODAS as Fases 0–6 implementadas e verificadas.** Gates §6 factíveis = verdes: `tsc` limpo (`my-app` + `server`); `next build` prod OK (e o dynamic import da Fase 6 derrubou o pipeline de 9.4→3.08 kB de First Load JS); runtime SSR das 9 rotas CRM = 200, zero erro de servidor; auditoria DS estática limpa (zero `zinc-`, `rounded-2xl`, paridade i18n exata 102 chaves en/pt). Revisão multi-agente adversarial rodou em cada lote (entender → spec SDD → implementar → revisar → corrigir) e a final holística passou sem blocker/major em aberto. Spec executável: [`specs/PHASE_0_1_2_SPEC.md`](specs/PHASE_0_1_2_SPEC.md) (seções 0–6). Bespoke removidos: `RecordTable`, `CrmKpiCard`, `CrmBarChart`, `CrmPieChart`, `CrmAnalyticsBoard`.
>
> Descobertas-chave: (a) o backend de transição (`CrmPipelineService.advanceStage` + DTO/controller/rota/factory/teste) **já existia** — Fase 2 foi só frontend; (b) o `AnalyticsDashboard` canônico é acoplado ao engine de presets do dashboard — a Fase 4 reusou as **folhas** canônicas (`DashboardKpiCard` + `ChartRenderer`) via adaptador do `CrmAnalyticsBundle`; (c) a Fase 1 corrigiu o loader canônico `useTableData` para paginar (fetch-all) — blast radius em todas as tabelas do dashboard.
>
> **Único gate §6 NÃO concluído** (exige credenciais de login + backend com seed, indisponíveis neste ambiente): provas interativas — `preview_inspect` de estilos computados (`rgb(23,23,23)`/16px), drag-persiste a etapa via `advanceStage`, captura de proposta, modal Lead360, CRUD nas tabelas, e validação com **>50 registros** e **>1 pipeline**. Tudo o mais de §6 está satisfeito.
>
> **Follow-ups conhecidos (fora do escopo CRM):** `useTableRelationLookups` ainda trunca alvos de relação em 50; `DashboardKpiCard` (componente compartilhado finance) mostra badge ▼ vazio em cards `flat` — comportamento pré-existente, fix limpo seria `change !== ''` no componente compartilhado (decisão de time, blast radius em todos os dashboards). **Nada commitado** — toda a remediação está na working tree.

Princípio: **reusar canônicos, não recriar** (contrato §0). O backend praticamente não muda; o trabalho é quase todo no frontend, trocando bespoke por canônico.

### Decisão arquitetural (Fase 0) — container compartilhado

Hoje cada tela CRM é uma página standalone com container próprio. Duas opções:

- **Opção A (recomendada): `CrmLayout` shell compartilhado.** Um único componente de layout full-height (`flex h-full … flex-col`, padrão do dashboard) que envolve todas as telas CRM e renderiza o `CrmNav` como abas. Mantém o CRM como seção dedicada (ele é legitimamente mais rico que um `GenericTabbedView` — tem pipeline kanban, analytics board, calendário), mas dá container consistente. As telas de tabela dentro do shell reusam `GenericTable`.
- **Opção B: integrar como category-view do dashboard.** Colapsar o CRM em `features/dashboard/category-views/crm/` usando `GenericTabbedView`. Mais consistente, porém força as telas ricas (pipeline/analytics/calendário) num molde tabular — perde-se fidelidade.

➡️ **Recomendação: Opção A.** Consistência de container sem sacrificar as telas ricas.

---

### Fase 0 — Fundação (shell + container)
- **Criar** `my-app/features/crm/components/CrmLayout.tsx` — container full-height + `CrmNav` (abas) + área scrollável interna. Remover os `max-w-*` divergentes de cada página; cada `pages/crm/*.tsx` passa a renderizar `<CrmLayout><Screen/></CrmLayout>`.
- **Skill**: `frontend-feature-module-generator` + `frontend-design-system`.
- **Resolve**: #3, #4 (parte de layout). **Esforço**: S. **Risco**: Baixo.
- **Aceite**: navegar entre as 8 abas não muda largura/altura; `grep zinc-` = 0; container = `flex h-full`.

### Fase 1 — Tabelas sobre `GenericTable` (com CRUD)
- **Reescrever** Contatos/Contas/Propostas para reusar `GenericTable` + `RowActionsCell` (via um wrapper estilo `GenericTabbedView`), cabeando CRUD aos endpoints de DynamicTable:
  - Add → `FloatingActionButton` + modal de criação (`createTableData`).
  - Edit → `EditRecordButton` (modal de form dinâmico → `updateTableData`).
  - Delete → `ConfirmDeleteModal` (soft-delete → `deleteTableData`).
  - Filtros → `GenericFilterBar`. Paginação → `StandardPagination` (25/página).
- **Deletar** `RecordTable.tsx`.
- **Skill**: `frontend-component-generator` + `frontend-feature-module-generator`. Golden ref: `GenericTabbedView.tsx`.
- **Resolve**: #1, #2, #7. **Esforço**: M. **Risco**: Médio (validar com >50 registros).
- **Aceite**: add/edit/delete na linha funcionando; filtros; paginação; estilo idêntico às tabelas do dashboard.

### Fase 2 — Pipeline sobre o Kanban canônico + Lead360 em modal

**SIM, o Kanban funcional já existente DEVE ser usado.** Hoje `pipeline.tsx` é um board estático bespoke; o `InternalKanbanView` canônico já tem drag-drop (`@dnd-kit`), `KanbanCardDetailModal`, `FloatingActionButton`, filtros e container full-height. O pipeline do CRM deve reusar essa UX.

**Nuance de adaptação** (por que não é cópia-cola): o Kanban canônico move cartões mudando um `status` (enum) simples no drag-end; o pipeline do CRM agrupa por `stageId` (relação a `leadStages`) e **avançar etapa tem efeitos colaterais** (`advanceStage`: cria proposta em etapa "proposal", atualiza snapshot do lead). Logo:

- **2a — Pipeline:** reusar os **primitivos do Kanban** (`DndContext`/dnd-kit setup, `KanbanColumn`, `DragOverlay`, `KanbanCardDetailModal`, container full-height) com um **drag-end específico do CRM** que chama `advanceStage` (e abre um mini-modal para capturar `amount`/`winProbability` quando a etapa de destino é "proposal"). Manter o agrupamento por `stageId` filtrado pelo pipeline ativo (lógica que já está correta no `pipeline.tsx` — preservar) + o seletor de pipeline.
  - **Opção limpa de longo prazo:** generalizar `InternalKanbanView` para aceitar `groupByField` (status | relação) + `onMove(card, toColumn)` plugável — assim CRM e dashboard compartilham 1 só componente. (L)
  - **Opção pragmática:** um `CrmPipelineBoard.tsx` que reusa os primitivos + `KanbanCardDetailModal`, com drag-end → `advanceStage`. (M)
- **2b — Lead360 em modal:** o clique no card do pipeline abre o detalhe do lead em **modal** (`Modal.tsx`, padrão `KanbanCardDetailModal`) — não `router.push`. Reaproveitar o conteúdo atual do Lead360 (`GradientHeader`, `ScoreGauge`, `StatusBadge`, `BantBars`, contato, "Avançar etapa" → `advanceStage`). Manter `pages/crm/leads/[id].tsx` só como rota deep-link opcional (ou remover).
- **Skill**: `frontend-kanban-workflow-generator` (board) + `backend-workflow-transition-generator` (transição `advanceStage`). Golden refs: `InternalKanbanView.tsx`, `useKanbanLogic.tsx`, `KanbanCardDetailModal.tsx`, `CrmPipelineService.ts`.
- **Resolve**: #6, #8. **Esforço**: M (pragmática) / L (generalização). **Risco**: Médio (mapear drag-end → side effects do `advanceStage`; validar com >1 pipeline).
- **Aceite**: arrastar um lead entre etapas chama `advanceStage` e persiste (com captura de proposta quando aplicável); clicar abre modal sem trocar de tela; criar/filtrar disponíveis.

### Fase 3 — Atividades + Reuniões consistentes
- **Atividades**: manter a timeline (é um bom formato), mas dentro do `CrmLayout`, com `StandardPagination` (ou scroll virtualizado) e container consistente.
- **Reuniões**: `MeetingsCalendar` dentro do shell; wrapper do FullCalendar tratado como card (`neutral`, `rounded-2xl`).
- **Skill**: `frontend-feature-module-generator` + `frontend-design-system`.
- **Resolve**: #4. **Esforço**: S. **Risco**: Baixo.

### Fase 4 — Analytics canônico
- **Reescrever** `analytics.tsx` para renderizar o bundle do `CrmAnalyticsService` via os componentes canônicos: cards de KPI → `DashboardKpiCard`; gráficos → `ChartRenderer`; explicações → `KpiInfoFooter`/`KpiTooltip`; grid no padrão `AnalyticsDashboard`.
- **Adaptador**: mapear o `CrmAnalyticsBundle` (já em `ChartDataPoint[]`) para o formato que o `ChartRenderer`/`DashboardKpiCard` esperam. Backend não muda.
- **Deletar** `CrmKpiCard`/`CrmBarChart`/`CrmPieChart`/`CrmAnalyticsBoard` bespoke.
- **Skill**: `dashboard-kpi-end-to-end-generator` (frontend) + `frontend-widget-generator`. Golden ref: `AnalyticsDashboard.tsx` + `ChartRenderer.tsx`.
- **Resolve**: #5. **Esforço**: M. **Risco**: Médio (mapear o bundle ao contrato de chart).
- **Aceite**: KPIs com trend + explicação + lista, visual idêntico ao analytics de finance.

### Fase 5 — Polimento de design system + i18n
- Varredura: `neutral` (zero `zinc`), cards `rounded-2xl`, `font-black` em valores, badges `color/10+/20`, dark mode em tudo. Strings em `locales/{en,pt}/crm.json`.
- **Skill**: `frontend-design-system`. **Esforço**: S. **Risco**: Baixo.

### Fase 6 — Verificação (gate do contrato §6)
- `cd my-app && npx tsc --noEmit` + `next build && next start` (prod, não dev).
- `preview_inspect` para provar superfícies (`rgb(23,23,23)`), `rounded-2xl` (16px).
- Validar com **>50 registros** (paginação) e **>1 pipeline** (board filtrado por pai).
- Rodar `luminaris-reviewer` no diff do CRM.

### Sequenciamento e esforço total
```
Fase 0 (S) → Fase 1 (M) → Fase 2 (M) → Fase 3 (S) → Fase 4 (M) → Fase 5 (S) → Fase 6 (S)
```
Fases 1–4 são independentes após a Fase 0 (paralelizáveis). **Estimativa**: ~4–6 dias de trabalho focado. **Risco geral**: Médio — quase tudo é troca-por-canônico, backend estável.

---

# PARTE B — Gap vs. Salesforce (o que ficou de fora)

Comparação com **Salesforce Sales Cloud**. Aterrada na arquitetura Luminaris: a engine de DynamicTable já dá "objetos/campos customizados" de graça (equivalente a custom objects/fields), e a rules engine + agente de chat (ActionProposal) cobrem parte de automação. Prioridade: **P0** (esperado num CRM básico), **P1** (diferencial competitivo), **P2** (enterprise/avançado).

### Objetos centrais — presença
| Objeto Salesforce | Luminaris hoje | Lacuna |
|---|---|---|
| Lead | ✅ `leads` (com BANT) | Falta **conversão Lead→(Account+Contact+Opportunity)** |
| Account | ✅ `crmAccounts` | Sem hierarquia de contas (parent/child) |
| Contact | ✅ `crmContacts` | Sem papéis em oportunidade (contact roles) |
| Opportunity | ⚠️ híbrido em `leads`+`leadProposals` | **Opportunity não é objeto de 1ª classe** (ver P0) |
| Activity (Task/Event) | ⚠️ `leadActivities` (log) | Sem distinção task/event, sem reminders/due, sem owner |
| Campaign | ❌ | Ausente (ver P1) |
| Product/PriceBook/Quote | ❌ | Ausente (ver P1) |

> **Execução Parte B — Slice 1 (2026-06-16/17): #1 Conversão de Lead (pragmática) + #3 Owner/"meus registros" — code-complete, revisado e verificado** (server+my-app tsc 0; jest 28 verdes; next build OK). Spec: [`specs/PARTB_P0_SLICE1_SPEC.md`](specs/PARTB_P0_SLICE1_SPEC.md). Entregue: (A) **mecanismo de evolução de schema** `PresetSyncService` aditivo-only + endpoint admin `POST /api/dynamic-tables/sync-preset` (gate de toda feature P0 com campo novo); (B) preset `leads` evoluído (`accountId`/`contactId`/`convertedAt` + status `Converted`); (C) `CrmPipelineService.convertLead` atômico (cria Account+Contact, herda owner, marca lead); (D) filtro de vendedor + "Meus registros" no pipeline E nas tabelas; (E) botão "Converter Lead" + `LeadConvertModal`. Revisão adversarial corrigiu: leitura cross-tenant do lead (→NotFoundError, contrato §2), guard de tabela não-sincronizada, enums no DTO. **Rollout na instância viva CONCLUÍDO (2026-06-17):** backup do schema de `leads` → `sync-preset {internalName:'leads'}` (added `accountId`/`contactId`/`convertedAt` + opção `Converted`, 80 linhas intactas) → conversão validada ponta a ponta (lead→Account+Contact com `unitId`/`ownerId` herdados, lead `Converted`+links+`convertedAt`; idempotência 400). Duas melhorias de engine descobertas no rollout real: (i) `PresetSyncService` aplica com revalidação `'none'` + guard de invariante aditivo (não bloqueia por dados seed malformados, ex.: `unitId` nulo); (ii) **validações de `createTableData`/`updateTableData` agora são tx-aware** quando recebem `options.tx` (writes compostos em `runInTransaction` enxergam linhas criadas antes na mesma tx) — bug que só apareceu no teste vivo (os unit tests mockavam `createTableData`). Opportunity de 1ª classe (#2) continua adiada para fase dedicada (usará o mesmo `PresetSyncService`). **Nota de dados:** o seed tem 80 leads com `unitId` nulo e nenhuma unidade — criei 1 unidade de teste; backfill dos leads é um follow-up de qualidade de dados.

### P0 — Esperado num CRM básico (preencher antes de chamar de "CRM completo")
1. **Conversão de Lead** — botão "Converter" que cria/associa Account + Contact + Opportunity e marca o lead como convertido. Hoje lead e conta/contato vivem soltos. *(M, engine já suporta as escritas)*
2. **Opportunity como objeto de 1ª classe** — separar "oportunidade" (negociação com valor, etapa, fechamento) do "lead" (qualificação). Hoje o lead acumula os dois papéis + snapshot de proposta. Salesforce separa Lead (pré-qualificação) de Opportunity (pipeline de receita). *(L — decisão de modelagem)* — ✅ **FEITO (MVP, Slice 6, 2026-06-17, separação completa):** novo preset `crmOpportunities` (dona de valor/etapa/fechamento/status, reusa leadPipelines/leadStages); **infra nova `installTableFromPreset`** (instala tabela em tenant já instalado: idempotente, resolve marcadores p/ ids reais, admin-only `POST /api/dynamic-tables/install-table`); `CrmPipelineService.advanceOpportunity` (fecha Won/Lost+closedAt) + `convertLeadToOpportunity` (cria opp a partir do lead, herda owner/unit/account, stageId default=1ª etapa); frontend pipeline de Oportunidades em paralelo (`/crm/opportunities`, aba no CrmNav, `useOppPipelineBoard`/`OppPipelineBoard`/`Opp360Modal`) + "Criar Oportunidade" no Lead360. Tabela instalada na instância viva; E2E ok (install idempotente+marcadores resolvidos, convert c/ e sem stageId, advance, close Won, advance cross-tenant→404). Pipeline/analytics de lead inalterados. **Follow-up:** dashboard de analytics de oportunidade (revenue por opp).
3. **Owner / atribuição de registro** — todo lead/conta/oportunidade tem um "dono" (vendedor). Hoje não há ownership por vendedor (só o `userId` tenant). Sem isso não há pipeline por vendedor nem relatórios por dono. *(M)*
   - **WAIVER (2026-06-18) — eixo de segmentação por UNIDADE intencionalmente abandonado (NÃO é regressão):** o módulo legado de leads do dashboard (`my-app/features/dashboard/category-views/leads`) escopava o board kanban por **unidade** (`selectedUnitId`). O pipeline canônico em `features/crm` é **owner-centric por design** (filtro por dono + "meus registros"), consistente com a direção do redesenho do CRM. O eixo de unit-scoping é **deliberadamente descartado**, não uma regressão: `unitId` continua nos registros e permanece acessível via filtros de tabela. Esta dispensa **desbloqueia a deleção do módulo legado** na dimensão de segmentação por unidade. (Registrada para que um revisor futuro não re-sinalize o gap 5 como regressão.)
4. **Atividades como tarefas reais** — Task (com `dueDate`, `status`, `owner`, lembrete) e Event (reunião com horário). Hoje é só log read-only. *(M)* — ✅ **FEITO (Slice 2, 2026-06-17, commit `197128e`):** `tasks` estendida (core-safe `leadId` + `reminderAt`; reusa `date`=vencimento, `status`); `LeadTasksPanel` no Lead360 (criar/listar/concluir, dono, prioridade); rollout live + E2E ok. Follow-ups: entrega de lembrete (job), distinção Task/Event, accountId/contactId em task (relação não-core).
5. **List views salvas + edição inline + ações em massa** — Salesforce tem list views filtráveis/compartilháveis e edição inline na lista. O `GenericTable` já dá base; falta saved views e bulk actions. *(M)* — ✅ **FEITO (Slice 5, 2026-06-17):** modelo Prisma `SavedTableView` (por-usuário, cross-device) + slice em camadas + CRUD `/api/saved-views`; bulk delete atômico `POST /api/dynamic-tables/:tableId/data/batch-delete` (per-id tenant+table guard → rollback); frontend `SavedViewsMenu` + barra de ações em massa + coluna de seleção, **opt-in** (`enableSavedViews`/`enableBulkActions`, só `CrmTableScreen` → zero impacto nas outras tabelas). Migration aplicada; E2E ok (view round-trip + bulk atômico). Edição inline já existia (`EditRecordButton`). Guards de segurança verificados (jest + auto-revisão; revisão por subagente adiada por 529 da API). Colunas salvas seguem no localStorage (fora da view v1).
6. **Notas & anexos** por registro. *(S — DynamicTable + Documents já existem)* — ⏳ **NOTAS FEITAS (Slice 3, 2026-06-17, commit `4f732d7`):** notas timestamped/atribuídas por lead via `leadActivities` type='note' (`LeadNotesPanel` no Lead360); E2E ok. **ANEXOS FEITOS (Slice 4, Option D — file-store de verdade):** novo modelo Prisma `CrmAttachment` (polimórfico entityType/entityId, soft-delete) + storage em disco (`ATTACHMENTS_DIR`, path-traversal-safe, por-tenant) + slice em camadas (`features/attachments/`) + rotas sob `/api/crm/attachments` (upload multipart / list / **download por stream** / delete soft) + `LeadAttachmentsPanel` no Lead360. Migration aplicada na instância viva; **E2E ok (download byte-idêntico)**. Revisão de segurança adversarial corrigiu um **blocker** (path traversal na escrita via `entityId` → guard + regex no DTO), vazamento de `storageKey`/`userId` (DTO de resposta seguro), octet-stream burlando magic-bytes, e i18n de erro 413/415. Ver `specs/PARTB_P0_SLICE4_ATTACHMENTS_SPEC.md`. Gaps: notas/anexos para accounts/contacts (só leads neste P0; o modelo de anexo já é polimórfico); entrega de lembrete de tarefa (job).

### P1 — Diferencial competitivo
7. **Campanhas + ROI/atribuição** — objeto Campaign, associação de leads/opps, custo vs receita influenciada. *(M)*
8. **Produtos, Price Books, Quotes, line items** — oportunidade com itens de produto e geração de cotação/PDF. Luminaris já tem produtos/finance no ERP — dá para conectar. *(L)*
9. **Forecasting** — categorias de previsão (Commit/Best Case/Pipeline), quotas por vendedor, forecast ponderado por probabilidade. (O backend já calcula forecast ponderado nos KPIs — falta a tela de previsão.) *(M)*
10. **Lead/Opportunity scoring** — hoje BANT manual; automatizar score (regras ou IA). O agente de chat + rules engine dão base. *(M)*
11. **Regras de atribuição/roteamento + filas (queues)** — distribuir leads automaticamente entre vendedores. *(M)*
12. **Gestão de duplicados** — matching rules + merge ao criar/importar. *(M)*
13. **Email integrado** — enviar/registrar email no timeline, templates, tracking. *(L — integração externa)*
14. **Relatórios & Dashboards customizáveis** pelo usuário (builder). Luminaris tem analytics fixos + widgets de dashboard; falta o builder self-service no estilo Salesforce. *(L)*
15. **Activity timeline unificada** (Chatter-like) — feed cronológico de tudo do registro (emails, tarefas, mudanças de etapa, notas). Hoje atividades são uma aba separada. *(M)*

### P2 — Enterprise / avançado
16. **Automação declarativa** — Flows/Process Builder, **validation rules**, approval processes. Luminaris tem rules engine (plugins) + ActionProposal — base parcial; falta UI declarativa. *(L)*
17. **Modelo de permissões granular** — profiles, permission sets, **sharing rules**, field-level security, role hierarchy. Hoje policy por dono/ADMIN. *(L)*
18. **Territory management + team selling** (opportunity teams, splits de comissão). *(L)*
19. **Histórico de campos / audit trail** (field history tracking). Soft-delete existe; falta trilha de auditoria por campo. *(M)*
20. **Web-to-Lead / API pública / formulários de captura** + import wizard com dedupe. *(M)*
21. **Multi-moeda avançada** (taxas datadas, conversão corporativa). Hoje moeda por proposta. *(M)*
22. **Path / guidance** (guia de etapas com critérios e dicas por estágio) e **Kanban** (este já existe no pipeline). *(S–M)*
23. **App mobile / PWA**. *(L)*

### O que a arquitetura Luminaris já dá "de graça" (vantagens)
- **Custom objects/fields** → DynamicTable presets (equivalente a custom objects + field-level config sem código).
- **Automação parcial** → rules engine (plugins por tabela) + agente de chat com ActionProposal (escrita proposta/aprovada — parecido com approval-before-commit).
- **Analytics extensível** → contrato `AnalyticsProcessor` + KPIs registráveis.
- **Soft-delete + tenancy** já universais.

### Resumo de priorização
- **Para o CRM ficar "completo e usável"**: Parte A (remediação) + P0 (conversão de lead, ownership, tarefas reais, list views/bulk, opportunity de 1ª classe).
- **Para competir**: P1 (campanhas, produtos/quotes, forecasting, scoring, roteamento, relatórios self-service).
- **Enterprise**: P2 (automação declarativa, permissões granulares, territórios, auditoria).

---

## Próximos passos sugeridos
1. Aprovar a **Opção A** (CrmLayout) e a separação **Lead vs Opportunity** (decisão de modelagem que impacta P0).
2. Decidir o pipeline (Fase 2a): **generalizar** o `InternalKanbanView` (1 componente para CRM + dashboard, L) vs. **`CrmPipelineBoard` pragmático** que reusa os primitivos (M). Recomendação: pragmático agora, generalizar depois se surgir um 3º board.
3. Executar Parte A (remediação) — entrega um CRM no padrão do app, com pipeline drag-drop.
4. Priorizar a fila P0 conforme objetivo de produto.
