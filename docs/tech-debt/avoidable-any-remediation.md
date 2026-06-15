# Divida tecnica: `any` evitaveis -- catalogo e plano de remediacao

> Gerado por auditoria multi-agente do codebase (4 regioes; cada ocorrencia de `as any`/`: any` classificada evitavel x arquitetural lendo o contexto). Este documento e o **registro vivo** da remediacao.

## Sumario

- **396 `any` evitaveis** catalogados (tipo existente ou tipavel).
- **58 arquiteturais** e **31 em testes** EXCLUIDOS (ver Exclusoes).

| Categoria | Qtd | Esforco | Risco |
|---|---:|---|---|
| `catch-any` | 32 | Baixo | Nenhum |
| `untyped-prop` | 45 | Medio | Baixo |
| `event-cast` | 5 | Baixo | Nenhum |
| `property-escape` | 100 | Medio | Medio (toca tipos compartilhados) |
| `untyped-param` | 168 | Alto | Baixo-Medio |
| `untyped-return` | 33 | Medio | Baixo |
| `other` | 13 | Variavel | Variavel |
| **Total** | **396** | | |

## Exclusoes (NAO sao divida -- `any` legitimo/arquitetural)

Nestes o tipo nao existe em compile-time; mitiga-se com **validacao em runtime** (Zod/engine), nao com tipos:

- **`Record<string, any>` de dados dinamicos** da DynamicTable -- colunas definidas pelo usuario em runtime. (Melhoria futura: `Record<string, unknown>` para forcar narrowing.)
- **Casts de JSON do Prisma** (`schema as any`, `data as any`, `as unknown as ITableSchema`, `InputJsonValue`).
- **`$queryRaw` / `(tx as any).$queryRaw`** -- SQL cru fracamente tipado.
- **Mocks em arquivos de teste** -- `as any` e idiomatico.

> Recomendacao: marcar cada arquitetural com `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic data` para ficarem **documentados como intencionais** quando o lint for ligado.

## Plano de remediacao (faseado)

Ordem por valor/risco. Cada fase: PR proprio + `tsc`/testes verdes.

- **Fase 0 -- Guard-rail:** ligar `@typescript-eslint/no-explicit-any` como **`warn`** (nao `error`) + baseline. Impede crescimento sem quebrar build. Skills ja endurecidas para nao gerar `any` evitavel novo.
- **Fase 1 -- `catch-any` (32):** mecanico, risco zero. `catch (e)` + narrowing.
- **Fase 2 -- `untyped-prop` (45) + `event-cast` (5):** interfaces de prop e tipos de evento; localizado, baixo risco.
- **Fase 3 -- `property-escape` (100):** grande parte e `(table as any).internalName` etc. -> **estender `IDynamicTable`** com `internalName?`/`presetKey?` resolve dezenas de uma vez. Toca tipo compartilhado -> regressao.
- **Fase 4 -- `untyped-param`/`untyped-return` (168+33):** maior balde; **por modulo**, usando `TableDataRow` para linhas e os tipos dos SDKs (OpenAI/Qdrant) para payloads externos. Genuinamente dinamico -> `unknown` + narrowing.
- **Arquiteturais:** marcar com `eslint-disable` + comentario; nao remover.

## Prevencao de recorrencia

- **Skills ja endurecidas** (nao geram mais `any` evitavel): `frontend-hook-generator`, `frontend-api-service-generator`, `backend-dto-generator` (`discriminatedUnion`/`superRefine` mata `(payload as any).mode`), `analytics-kpi-generator`, `backend-service-generator`.
- **Lint** como guarda permanente (Fase 0).
- **Este documento** como tracker -- marcar itens conforme resolvidos.

---

## Catalogo completo (por categoria)

### `catch-any` -- `catch (e: any)` (32)

**Como evitar:** Trocar por `catch (e)` (e e `unknown`) + narrowing: `const msg = e instanceof Error ? e.message : String(e)`. Mecanico e 100% seguro.

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `components/widgets/chat/components/DocumentSelector.tsx:47` | `catch (err: any) {` | catch (err) { const message = err instanceof Error ? err.message : String(err) } |
| `features/dashboard/category-views/finance/hooks/analytics/useAnalyticsData.ts:15` | `catch (error: any)` | catch (error: unknown) { const errorMsg = error instanceof Error ? error.message : String(error) } |
| `features/dashboard/category-views/leads/LeadCreateModal.tsx:91` | `catch (e: any)` | catch (e: unknown) { const message = e instanceof Error ? e.message : String(e) } |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:43` | `catch (e: any)` | catch (e: unknown) { const message = e instanceof Error ? e.message : String(e) } |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:45` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:67` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:70` | `catch (error: any)` | catch (error: unknown) { const message = error instanceof Error ? error.message : String(error) } |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:73` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:79` | `catch (e: any)` | catch (e: unknown) { const message = e instanceof Error ? e.message : String(e) } |
| `features/dev/seed.ts:131` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/dev/seed/modules/SeedAppointments.ts:115` | `catch (error: any)` | catch (error: unknown) { const message = error instanceof Error ? error.message : String(error) } |
| `features/interview/hooks/useAiInterview.ts:135` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/interview/setup/QuickSetup.tsx:137` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/interview/setup/QuickSetup.tsx:138` | `catch (err: any)` | Same as line 137 |
| `features/interview/setup/TotalControlSetup.tsx:140` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/interview/setup/TotalControlSetup.tsx:143` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/interview/setup/TotalControlSetup.tsx:144` | `await apiClient.post('/dashboard/create', payload).catch((err: any) => {` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `features/interview/setup/TotalControlSetup.tsx:145` | `catch (err: any)` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err) } |
| `lib/utils/error-handler.ts:14` | `const anyErr: any = err;` | Use type guard: if (typeof err === 'object' && err !== null) { const anyErr = err as Record<string, unknown> } |
| `pages/dashboard/setup.tsx:34` | `catch (err: any) {` | catch (err) { if (err instanceof Error) { err.message } else { String(err) }} |
| `pages/documents/index.tsx:52` | `catch (e: any) {` | catch (e) { resolveErrorMessage handles Error & unknown already } |
| `server/src/controllers/reportsController.ts:50` | `} catch (error: any) {` | catch (error: unknown) { const msg = error instanceof Error ? error.message : String(error); } |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:450` | `} catch (error: any) {` | Use 'catch (error: unknown)' |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:621` | `} catch (error: any) {` | Use 'catch (error: unknown)' |
| `server/src/features/chat/services/ChatService.ts:102` | `} catch (error: any) {` | Use 'catch (error: unknown)' + instanceof check |
| `server/src/features/chat/services/ChatService.ts:102` | `} catch (error: any) {` | catch (error: unknown) |
| `server/src/features/chat/services/KnowledgeGraphService.ts:85` | `} catch (error: any) {` | Use 'catch (error: unknown)' + proper type guard |
| `server/src/features/chat/services/KnowledgeGraphService.ts:104` | `} catch (error: any) {` | Use 'catch (error: unknown)' |
| `server/src/features/chat/services/LuminarisAgentService.ts:196` | `} catch (error: any) {` | Use 'catch (error: unknown)' then 'error instanceof Error ? error.message : String(error)' |
| `server/src/features/documents/repositories/VectorRepository.ts:613` | `} catch (error: any) {` | Use 'catch (error: unknown)' |
| `server/src/middleware/auth.ts:92` | `} catch (err: any) {` | catch (err: unknown) { const message = err instanceof Error ? err.message : String(err); } |
| `server/src/server.ts:100` | `app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {` | error: unknown (then check instanceof Error or use narrowing) |

### `untyped-prop` -- Prop/campo de objeto `: any` (45)

**Como evitar:** Definir a interface da prop/objeto. Blobs de config -> interface tipada ou `unknown`. Dados dinamicos da DynamicTable -> `Record<string, unknown>` (nao `any`).

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `components/widgets/analytics/AnalyticsWidget.tsx:15` | `initialConfig?: any;` | Create AnalyticsConfig type: `type AnalyticsConfig = { chartKey?: string; kpiName?: null \| string }` |
| `components/widgets/analytics/AnalyticsWidget.tsx:16` | `onConfigChange?: (config: any) => void;` | Change to: `onConfigChange?: (config: AnalyticsConfig) => void;` |
| `components/widgets/dashboard-grid/types/dashboard-grid.types.ts:21` | `widgetConfig?: any;` | Define: `widgetConfig?: Record<string, unknown>` |
| `components/widgets/dashboard-grid/types/dashboard-grid.types.ts:82` | `config?: any;` | Define: `config?: Record<string, unknown>` |
| `components/widgets/generic-chat/components/CommandConfirmationModal.tsx:13` | `data: any;` | Define ProposalData type: `data: Record<string, unknown>` |
| `components/widgets/shared/hooks/useChatInstance.ts:19` | `metadata?: any;` | Define: `metadata?: Record<string, unknown> \| ProposalMetadata` |
| `components/widgets/shared/hooks/useChatInstance.ts:33` | `data: any;` | Define: `data: Record<string, unknown>` |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:43` | `fullRecords?: { records: any[] };` | Define RecordWithValue interface: { records: { value?: number; [key: string]: unknown }[] } |
| `features/dashboard/category-views/kanban/InternalKanbanView.tsx:26` | `tables: any[];` | Define Table interface; use: tables: Table[] |
| `features/dashboard/category-views/kanban/InternalKanbanView.tsx:27` | `error: any;` | Use Error or ApiError type; use: error: Error \| null |
| `features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx:18` | `function SidebarButton({ icon: Icon, label, onClick, className = '' }: any)` | Define SidebarButtonProps interface with Icon, label, onClick, className |
| `features/dashboard/category-views/leads/LeadCreateModal.tsx:89` | `tableSchema: any;` | Define ITableSchema type; use: tableSchema: ITableSchema |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:31` | `cols: any[];` | Define Column interface; use: cols: Column[] |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:32` | `filteredLeads: any[];` | Define Lead interface; use: filteredLeads: Lead[] |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:33` | `showFilters: boolean; setShowFilters: (v: any) => void;` | Use: setShowFilters: (v: boolean) => void; |
| `features/dashboard/category-views/leads/components/LeadInfoSidebar.tsx:38` | `data: any;` | Define LeadData interface; use: data: LeadData |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:10` | `activities: any[];` | Define Activity interface; use: activities: Activity[] |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:12` | `setActivityFilter: (k: any) => void;` | Use: setActivityFilter: (k: 'all' \| 'note' \| 'meeting' \| 'proposal' \| 'stage_change' \| 'call' \| 'email') => void |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:14` | `stages: any[];` | Define Stage interface; use: stages: Stage[] |
| `features/dashboard/category-views/leads/components/ManageHeader.tsx:50` | `leadData: any;` | Define Lead interface; use: leadData: Lead |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:51` | `activitiesTable: any \| null;` | Define Table interface; use: activitiesTable: Table \| null |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:52` | `filteredLeads: any[];` | Define Lead interface; use: filteredLeads: Lead[] |
| `features/dashboard/category-views/leads/components/PipelineProgress.tsx:63` | `pipelineStages: any[];` | Define Stage interface; use: pipelineStages: Stage[] |
| `features/dashboard/category-views/leads/components/PipelineProgress.tsx:64` | `nextStage: any \| null;` | Define Stage interface; use: nextStage: Stage \| null |
| `features/documents/dtos/DocumentDto.ts:132` | `contextJson: any;` | Define context type: contextJson: Record<string, unknown> \| object |
| `features/interview/types/RightSidebarTypes.ts:146` | `conversationHistory: any[];` | Define Message interface; use: conversationHistory: Message[] |
| `lib/context/DashboardDataContext.tsx:4` | `[key: string]: any; in context state` | Define specific context shape or use Record<string, unknown> with strict property access |
| `pages/users/edit/[id].tsx:42` | `details?: any[];` | Define ApiErrorResponse['details'] type: `details?: { field?: string; message?: string }[]` |
| `pages/users/profile.tsx:48` | `details?: any[];` | Define error details type: `details?: { field?: string; message?: string }[]` |
| `server/src/features/analytics/core/models/ChartPreset.ts:51` | `[key: string]: any;` | Type as [key: string]: unknown |
| `server/src/features/analytics/core/pipeline/Pipeline.ts:36` | `value: any;` | Type as unknown or JSONValue |
| `server/src/features/chat/services/LuminarisAgentService.ts:13` | `data: any;` | Define ActionProposalData.data type as Record<string, unknown> or create a RowData interface |
| `server/src/features/chat/services/LuminarisAgentService.ts:27` | `const tools: any[] = [` | Type as OpenAI.Tool[] or Array<{type: 'function'; function: {...}}> |
| `server/src/features/documents/models/Document.model.ts:35` | `contextJson: any;` | Type as Record<string, unknown> or JSONValue |
| `server/src/features/documents/models/Document.model.ts:68` | `contextJson?: any;` | Type as Record<string, unknown> or JSONValue |
| `server/src/features/documents/services/DocumentProcessingPipeline.ts:197` | `const vectorPoints: Array<{ id: string; payload: any; vector: number[] }> = [];` | Type payload as VectorPayload interface or Record<string, unknown> |
| `server/src/features/dynamicTables/models/DynamicTable.model.ts:33` | `defaultValue?: any;` | Type as unknown or JSONValue |
| `server/src/features/dynamicTables/models/DynamicTable.model.ts:52` | `defaultValue?: any;` | Type as unknown or JSONValue |
| `server/src/features/dynamicTables/repositories/DynamicTableRepository.ts:133` | `const batch: any[] = await prisma.dynamicTableData.findMany({` | Type as IDynamicTableData[] |
| `server/src/features/dynamicTables/repositories/TransactionalDynamicTableRepository.ts:155` | `const batch: any[] = await this.tx.dynamicTableData.findMany({` | Type as IDynamicTableData[] |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:744` | `let referencingRows: any[] = [];` | Type as IDynamicTableData[] |
| `server/src/features/interview/FieldCustomizationService/Types.ts:54` | `conversationHistory: any[];` | Type as ConversationMessage[] |
| `server/src/features/interview/models/InterviewTypes.ts:50` | `conversationHistory: any[];` | Type as Array<{role: string; content: string}> or ConversationMessage[] |
| `server/src/features/interview/models/InterviewTypes.ts:56` | `fields?: any[];` | Type as ISchemaField[] |
| `server/src/features/reports/services/ReportService.ts:20` | `chartData?: any[];` | Type as ChartDataPoint[] or Array<{[key: string]: unknown}> |

### `event-cast` -- Cast de evento `e.target.value as any` (5)

**Como evitar:** Tipar o evento (`React.ChangeEvent<HTMLSelectElement>`) e validar o valor contra a uniao esperada (ex.: `value as CrmDatePreset` so se for membro).

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `features/dashboard/category-views/finance/components/analytics/dashboard/AnalyticsDashboard.tsx:158` | `onChange={(e) => setDatePreset(e.target.value as any)}` | Use: onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDatePreset(e.target.value as TimePeriod) |
| `features/dashboard/category-views/leads/components/LeadInfoSidebar.tsx:39` | `{renderBantIcon(String(d[item.key] \|\| ''), item.type as any)}` | Define item.type as specific string literal type; use: item.type as 'text' \| 'number' \| 'select' \| ... |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:45` | `onClick={() => setActivityFilter(it.k as any)}` | Use union type: onClick={() => setActivityFilter(it.k as ActivityFilterType)} |
| `pages/dashboard/setup.tsx:96` | `onClick={() => setMode(tab.id as any)}` | Define tab.id type precisely: `tab.id as 'quick' \| 'totalControl' \| 'aiInterview'` or use discriminated union |
| `server/src/lib/jwt.ts:12` | `const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN as any) \|\| '7d';` | const JWT_EXPIRES_IN: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN as string \| undefined) \|\| '7d' |

### `property-escape` -- `(x as any).prop` (100)

**Como evitar:** O objeto tem (ou deveria ter) tipo. Estender a interface compartilhada (ex.: `internalName?`/`presetKey?` em `IDynamicTable`) ou, p/ campo opcional pontual, castar para shape estreito `(x as { prop?: T }).prop` -- nunca `as any`.

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:90` | `((opts as any).metricDisplay \|\| {})[metricName]` | Define ChartOptions interface with metricDisplay: Record<string, string> |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:91` | `((opts as any).metricChartTypes \|\| {})[metricName]` | Same as metricDisplay; define ChartOptions.metricChartTypes |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:92` | `((opts as any).metricAnalysis \|\| {})[metricName]` | Same; define ChartOptions.metricAnalysis |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:93` | `((opts as any).metricFormats \|\| {})[metricName]` | Same; define ChartOptions.metricFormats |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:94` | `((opts as any).metricDescriptions \|\| {})[metricName]` | Same; define ChartOptions.metricDescriptions |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:95` | `((opts as any).metricIdealTargets \|\| {})[metricName]` | Same; define ChartOptions.metricIdealTargets |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:96` | `((opts as any).metricHigherIsBetter \|\| {})[metricName]` | Same; define ChartOptions.metricHigherIsBetter |
| `features/dashboard/category-views/finance/components/analytics/dashboard/TableView.tsx:13` | `(record.data as any)[field.name]` | Ensure record.data is typed as Record<string, unknown> or define schema-based types |
| `features/dashboard/category-views/kanban/KanbanTaskCard.tsx:28` | `data: task as any,` | Ensure task is typed; use: data: task |
| `features/dashboard/category-views/kanban/KanbanTaskCard.tsx:29` | `} as any}` | Define proper object type instead of as any |
| `features/dashboard/category-views/kanban/KanbanTaskCard.tsx:30` | `const value = (task as any)[fieldName];` | Use type guard: const value = task[fieldName as keyof Task] |
| `features/dashboard/category-views/kanban/hooks/useKanbanData.tsx:20` | `const statusField = schema.fields.find((f: any) => f.name === 'status');` | Define schema.fields type as ISchemaField[]; use: const statusField = schema.fields.find(f => f.name === 'status') |
| `features/dashboard/category-views/kanban/hooks/useKanbanLogic.tsx:23` | `const statusField = schema?.fields?.find((f: any) => f.name === 'status');` | Use type guard: if (isTableSchema(schema)) { const statusField = schema.fields.find(f => f.name === 'status') } |
| `features/dashboard/category-views/leads/LeadCreateModal.tsx:90` | `if (selectedUnitId) (formData as any).unitId = selectedUnitId;` | Define FormData type properly; use: if (selectedUnitId) formData = { ...formData, unitId: selectedUnitId } |
| `features/dashboard/category-views/leads/LeadsView.tsx:92` | `activitiesTable={activitiesTable as any}` | Ensure activitiesTable is Table type; remove cast or ensure proper typing |
| `features/dashboard/category-views/leads/LeadsView.tsx:93` | `filteredLeads={filteredLeads as any}` | Ensure filteredLeads is Lead[] type; remove cast |
| `features/dashboard/category-views/leads/LeadsView.tsx:96` | `cols={cols as any}` | Ensure cols is Column[] type; remove cast |
| `features/dashboard/category-views/leads/LeadsView.tsx:97` | `filteredLeads={filteredLeads as any}` | Same as line 93 |
| `features/dashboard/category-views/leads/LeadsView.tsx:102` | `pipelineStages={pipelineStages as any}` | Ensure pipelineStages is Stage[] type; remove cast |
| `features/dashboard/category-views/leads/LeadsView.tsx:104` | `const ld = (lead?.data \|\| {}) as any;` | Define LeadData interface; use: const ld = (lead?.data \|\| {}) as LeadData |
| `features/dashboard/category-views/leads/LeadsView.tsx:107` | `leadName={String(((filteredLeads.find((L: any) => String(L.id) === String(selectedLeadId))?.data \|\| {}).leadName) \|\| '')}` | Use Lead interface; use: filteredLeads.find((L: Lead) => |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:48` | `(stages.find((s: any) => String(s.id) === String(ad?.payload?.prevStage \|\| ad?.prevStageId \|\| ''))?.data \|\| {}).name \|\| 'Início'` | Use Stage type; use: (stages.find((s: Stage) => String(s.id) === String(...))?.data \|\| {}).name \|\| 'Início' |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:49` | `(stages.find((s: any) => String(s.id) === String(ad?.payload?.nextStage \|\| ad?.nextStageId \|\| ''))?.data \|\| {}).name \|\| 'Final'` | Same as line 48 |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:62` | `const leadId = String((info.event.extendedProps as any)?.leadId \|\| '');` | Define extendedProps structure; use: as { leadId: string } |
| `features/dashboard/category-views/products/components/ProductRow.tsx:109` | `inventorySchema={inventorySchema?.schema as any}` | Ensure schema is ITableSchema type; use: inventorySchema={inventorySchema?.schema as ITableSchema} |
| `features/dashboard/category-views/products/components/ProductsTable.tsx:110` | `inventorySchema={inventorySchema?.schema as any}` | Same as line 109 |
| `features/dashboard/category-views/shared/GenericTabbedView.tsx:111` | `tableSchema={schema as any}` | Ensure schema is ITableSchema type; use: tableSchema={schema as ITableSchema} |
| `features/dashboard/category-views/shared/utils/presentationUtils.ts:112` | `const p = (table.schema as any)?.ui?.presentation;` | Define schema UI type; use: const p = (table.schema as ITableSchema)?.ui?.presentation |
| `features/interview/components/AiInterviewSetup/index.tsx:133` | `onSelectTable={handleSelectTable as any}` | Type handleSelectTable properly; ensure return type matches expected callback type |
| `features/interview/setup/QuickSetup.tsx:136` | `const body = (await apiClient.get('/dashboard/presets')) as any;` | Define PresetsResponse interface; use: as PresetsResponse |
| `features/interview/setup/TotalControlSetup.tsx:139` | `const body = (await apiClient.get('/dashboard/presets')) as any;` | Define PresetsResponse interface; use: as PresetsResponse |
| `features/interview/setup/TotalControlSetup.tsx:141` | `const body = (await apiClient.get(`/dashboard/presets/${selectedPreset.key}`).catch((err: any) => {` | catch (err: unknown) and define PresetsResponse interface |
| `features/interview/setup/TotalControlSetup.tsx:142` | `})) as any;` | Define PresetsResponse interface; use: as PresetsResponse |
| `lib/api/api-client.ts:29` | `...((customHeaders as any) \|\| {})` | customHeaders should be typed as Record<string, string> or use type guard: if (customHeaders) { ...customHeaders } instead of cast |
| `lib/services/user.service.ts:18` | `(response as any).data \|\| response` | Check response structure or define return type: interface UserResponse { data: IUser[] } \| IUser[] |
| `lib/services/user.service.ts:20` | `(response as any).data \|\| response` | Same fix as line 18 |
| `lib/services/user.service.ts:21` | `{ role } as any` | Define UpdateRolePayload interface: { role: string } |
| `pages/_document.tsx:12` | `(this.props as any).__NEXT_DATA__.locale` | Define Document props interface: `interface MyDocProps { __NEXT_DATA__?: { locale?: string } }` |
| `pages/users/edit/[id].tsx:201` | `updatePayload as any` | Type updatePayload strictly: already UserUpdatePayload, remove cast |
| `pages/users/profile.tsx:262` | `(actor as any).createdAt` | Extend IUser type: `interface IUser { createdAt?: Date \| string }` or create mapped type |
| `pages/users/profile.tsx:263` | `(actor as any).createdAt` | Same as above: IUser should include createdAt |
| `server/src/controllers/analyticsController.ts:136-137` | `if (row.data && (row.data as Record<string, any>)[field] !== undefined) { slicedData[field] = (row.data as Record<string, any>)[field];` | Type row.data from row: IDynamicTableData, which already defines data shape |
| `server/src/controllers/analyticsController.ts:145` | `} as any;` | Return type should match the output interface (IDynamicTableData or drilldown result DTO) |
| `server/src/controllers/analyticsDefinitionsController.ts:9` | `const core = tables.find((t: any) => t.internalName === 'analyticsDefinitions' \|\| t.name === 'Analytics Definitions');` | Type tables from service return (should be IDynamicTable[]); use (t: IDynamicTable) => |
| `server/src/controllers/analyticsDefinitionsController.ts:22` | `const rows = await service.getAllTableData(ctx as any, tableId);` | ctx is UserContext — pass directly |
| `server/src/controllers/analyticsDefinitionsController.ts:38` | `const created = await service.createTableData(ctx as any, tableId, { data: req.body });` | ctx is UserContext — pass directly |
| `server/src/controllers/analyticsDefinitionsController.ts:55` | `const updated = await service.updateTableData(ctx as any, id, { data: req.body });` | ctx is UserContext — pass directly |
| `server/src/controllers/analyticsDefinitionsController.ts:72` | `await service.deleteTableData(ctx as any, id);` | ctx is UserContext — pass directly |
| `server/src/controllers/chatMessagesController.ts:21` | `const result = await svc.getMessagesByInstance(parsed.instanceId, ctx as any, parsed.page, parsed.limit);` | ctx is UserContext from getUserContextFromRequest() — pass directly without cast |
| `server/src/controllers/chatMessagesController.ts:37` | `const newMessage = await svc.createMessage(body.data, ctx as any);` | ctx is UserContext — pass directly without cast |
| `server/src/controllers/dashboardController.ts:58` | `if ((payload as any).mode === 'custom') {` | payload is z.infer<typeof UnifiedCreationSchema> — discriminated union already types mode |
| `server/src/controllers/dashboardController.ts:61-63` | `(payload as any).presetKey, (payload as any).removedTables \|\| [], (payload as any).addedFields \|\| {},` | Union discriminator pattern — access typed fields without cast |
| `server/src/controllers/dashboardController.ts:69` | `(payload as any).suiteKey,` | Access from union type directly |
| `server/src/controllers/dashboardController.ts:200` | `const analyticsConfigs = (selectedPreset as any).analytics;` | selectedPreset should be typed from preset service — remove cast |
| `server/src/controllers/dashboardController.ts:313` | `} as any;` | Object should match table config shape |
| `server/src/controllers/dashboardController.ts:330` | `} as any;` | Object should match response DTO type |
| `server/src/controllers/dashboardLayoutController.ts:77` | `const updated = await getFactory().getDashboardLayoutService().updateLayout(id, updateData as any, ctx);` | updateData is already z.infer<typeof UpdateDashboardLayoutSchema> from safeParse — remove as any |
| `server/src/controllers/documentsController.ts:183` | `const file = (req as any).file as Express.Multer.File \| undefined;` | Extend Express.Request interface with file property or use (req: Request & { file?: Express.Multer.File }) |
| `server/src/controllers/documentsController.ts:255` | `const count = (countResponse.data as any)?.result?.count \|\| 0;` | Qdrant API returns typed response — type countResponse.data as Qdrant's response type |
| `server/src/controllers/documentsController.ts:262` | `} as any);` | Provide correct Qdrant request type signature |
| `server/src/controllers/documentsController.ts:263` | `const sample = (sampleResponse.data as any)?.result \|\| [];` | Type sampleResponse.data properly from Qdrant SDK types |
| `server/src/controllers/documentsController.ts:298` | `const file = (req as any).file as Express.Multer.File \| undefined;` | Same as line 183 — extend Express.Request interface |
| `server/src/controllers/reportsController.ts:20` | `(res as any).flushHeaders?.();` | Extend Response interface: declare module 'express' { interface Response { flushHeaders?(): void } } |
| `server/src/controllers/reportsController.ts:41` | `{ ...(validation.data as any), userId: ctx.id },` | validation.data is already typed from Zod safeParse — type as z.infer<typeof GenerateReportSchema> |
| `server/src/controllers/reportsController.ts:46` | `sendEvent({ type: 'final', ...result, documentId: (validation.data as any).documentIds?.[0] });` | Use validation.data without cast (already typed) |
| `server/src/controllers/reportsController.ts:48` | `sendEvent({ type: 'message', message: result.response, chatInstanceId: (validation.data as any).chatInstanceId });` | Use validation.data without cast |
| `server/src/controllers/structuredDataController.ts:20` | `const structuredData = await service.getByDocumentId(ctx as any, documentId);` | ctx is UserContext — pass directly |
| `server/src/controllers/userController.ts:77` | `const created = await service.createUser(parse.data as any, actor);` | parse.data is already Zod-validated (type is z.infer<typeof CreateUserSchema>) — remove as any |
| `server/src/controllers/userController.ts:101` | `const updated = await service.updateUser(id, parse.data as any, actor);` | parse.data is z.infer<typeof UpdateUserSchema> — remove as any |
| `server/src/features/analytics/core/pipeline/Compiler.ts:36` | `throw new Error(`Unsupported dimension: ${(d as any).type}`);` | Type d as {type: unknown} or discriminate union properly |
| `server/src/features/analytics/core/pipeline/Compiler.ts:64` | `throw new Error(`Unsupported measure type: ${(m as any).type}`);` | Type m as {type: unknown} properly |
| `server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts:390` | `const mainTableSource = sourcePresetKey \|\| (sourceTable as any).presetKey \|\| (sourceTable as any).internalName \|\| params.tableId \|\| 'sales';` | Extend IDynamicTable with presetKey and internalName properties |
| `server/src/features/analytics/kpis/revenue/RevenueKpiProcessor.ts:515` | `const mainTableSource = (table as any).presetKey \|\| params.tableId \|\| 'sales';` | Extend IDynamicTable with presetKey property |
| `server/src/features/analytics/kpis/sales/SalesProfitByProductProcessor.ts:213` | `const mainTableSource = (table as any).presetKey \|\| params.tableId \|\| 'saleItems';` | Extend IDynamicTable with presetKey property |
| `server/src/features/analytics/services/AnalyticsDefinitionValidator.ts:69` | `const tableId = (compiled.source as any).id;` | Type compiled.source with proper interface that includes id |
| `server/src/features/analytics/services/AnalyticsDefinitionValidator.ts:70` | `const schemaExists = Array.from(tableSchemas.values()).some(s => (s as any).id === tableId \|\| (s as any).key === tableId);` | Type s as {id?: string; key?: string} or create proper interface |
| `server/src/features/analytics/services/AnalyticsService.ts:83` | `const internalName = (t as any).internalName \|\| (t as any).presetKey \|\| t.name;` | Extend IDynamicTable interface with internalName and presetKey properties |
| `server/src/features/analytics/services/AnalyticsService.ts:95` | `(t: IDynamicTable) => (t as any).internalName === 'analyticsDefinitions' \|\| t.name === 'Analytics Definitions'` | Add internalName to IDynamicTable type or use type guard |
| `server/src/features/chat/services/ChatService.ts:124` | `...(history \|\| []).map(h => ({ role: h.role, content: h.content } as any)),` | Type as OpenAI.Chat.Completions.ChatCompletionMessageParam directly (already correct type) |
| `server/src/features/chat/services/ChatService.ts:140` | `messages.push(response as any);` | response should be typed from OpenAI SDK; push correct message type |
| `server/src/features/chat/services/ChatService.ts:158` | `const proposal = await (this.agentService as any).getProposal(result.proposalId);` | Add public getProposal() to LuminarisAgentService interface or type as LuminarisAgentService |
| `server/src/features/chat/services/ChatService.ts:158` | `const proposal = await (this.agentService as any).getProposal(result.proposalId);` | Add getProposal to LuminarisAgentService interface (remove cast) |
| `server/src/features/chat/services/ChatService.ts:177` | `} as any);` | Type as ChatCompletionToolMessageParam |
| `server/src/features/chat/services/ChatService.ts:243` | `payload: result.payload as any` | Type result.payload with proper interface instead of as any |
| `server/src/features/chat/services/KnowledgeGraphService.ts:52` | `fields: (t.schema as any).fields.map((f: any) => ({` | Type t.schema as ITableSchema; type f as ISchemaField |
| `server/src/features/chat/services/KnowledgeGraphService.ts:69` | `for (const field of (table.schema as any).fields) {` | Type table.schema as ITableSchema instead of as any |
| `server/src/features/documents/repositories/VectorRepository.ts:120` | `const errorBody = (error instanceof Error && 'cause' in error) ? (error as any).cause : error;` | Type error.cause with (error as {cause?: unknown}).cause instead |
| `server/src/features/documents/repositories/VectorRepository.ts:176` | `(qdrantFilter as any).must = [` | Extend QdrantFilter interface to support nested must structure or build safe object |
| `server/src/features/documents/repositories/VectorRepository.ts:213` | `const errorBody = (error instanceof Error && 'cause' in error) ? (error as any).cause : error;` | Type as (error as {cause?: unknown}).cause |
| `server/src/features/documents/repositories/VectorRepository.ts:306` | `version: (point as any).version \|\| 0,` | Type point as {version?: number} instead of as any |
| `server/src/features/documents/repositories/VectorRepository.ts:607` | `version: (point as any).version \|\| 0,` | Type point properly instead of as any |
| `server/src/features/documents/services/DocumentService.ts:211` | `const payload = hit.payload as any;` | Type hit.payload properly with VectorPayload interface |
| `server/src/features/dynamicTables/policies/DynamicTablePolicy.ts:31` | `const presentation = (table.schema as any)?.ui?.presentation;` | Type table.schema as ITableSchema instead of as any |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:144` | `!(field.relation as any).broken` | Extend ISchemaFieldRelation with broken?: boolean property |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:146` | `(field.relation as any).broken = true;` | Extend relation type to include broken property instead of as any |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:175` | `(field.relation as any).targetTable = targetId as any;` | Type targetId properly and extend relation type |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:492` | `const sanitizedData = { ...(dataDto.data as any) };` | Type dataDto.data as Record<string, unknown> |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:771` | `const val = Number((row.data as any)?.[constraint.aggregate.field]) \|\| 0;` | Type row.data as Record<string, unknown> |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:852` | `const fn = (p as any)[phase];` | Type p as {[key: string]: Function} or define proper plugin interface |
| `server/src/middleware/auth.ts:57` | `const payload = verifyToken(token) as any;` | verifyToken already returns JWTPayload (line 25-26) — remove as any cast |

### `untyped-param` -- Parametro/variavel `: any` / `: any[]` (168)

**Como evitar:** Dar o tipo real. Linhas DynamicTable -> `TableDataRow`/`{ id: string; data: Record<string, unknown> }`. Payloads externos (OpenAI/Qdrant) -> o tipo do SDK. Generico desconhecido -> `unknown` + narrowing.

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `components/widgets/analytics/AnalyticsWidget.tsx:21` | `useState<any>(initialConfig \|\| {})` | Change to: `useState<AnalyticsConfig>(initialConfig \|\| {})` |
| `components/widgets/dashboard-grid/hooks/use-dashboard-grid.ts:97` | `config: any` | Define widget config type: `config: Record<string, unknown> \| WidgetConfig` |
| `components/widgets/dashboard-grid/hooks/use-dashboard-grid.ts:145` | `config: any` | Change to: `config: Record<string, unknown>` |
| `components/widgets/generic-chat/components/GenericChatWidget.tsx:32` | `setProposalToConfirm] = useState<any>(null)` | Define: `useState<{ id: string; action: 'CREATE'\|'UPDATE'\|'DELETE'; tableName: string; tableLabel: string; data: Record<string, unknown> } \| null>(null)` |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:12` | `records.map((d: any) => d.value)` | Define Record interface: interface RecordData { value: number; [key: string]: unknown } |
| `features/dashboard/category-views/finance/components/analytics/dashboard/MasterDetailDashboard.tsx:71` | `chartData: Record<string, { data: any[] }>` | Define ChartDataItem interface; use: chartData: Record<string, { data: ChartDataItem[] }> |
| `features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx:17` | `const value = (task as any)[field.name];` | Ensure task is Task type; use: const value = task[field.name as keyof Task] |
| `features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx:19` | `function renderFieldValue(field: ISchemaField, value: any, relationLookups?: RelationLookups)` | Type value as unknown or Record<string, unknown> |
| `features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx:123` | `const handleExtraFieldChange = (name: string, value: any) => {` | Type value based on field; use: const handleExtraFieldChange = (name: string, value: unknown) => |
| `features/dashboard/category-views/kanban/hooks/useKanbanData.tsx:21` | `records.forEach((record: any) => {` | Define Record interface; use: records.forEach((record: Record) => { |
| `features/dashboard/category-views/kanban/hooks/useKanbanLogic.tsx:13` | `schema: any; // Schema of the active table` | Use ITableSchema or similar; define: schema: ITableSchema \| null |
| `features/dashboard/category-views/kanban/hooks/useKanbanLogic.tsx:24` | `cols = statusField.options.map((option: any) => {` | Define option type; check statusField.type === 'select' for strict typing |
| `features/dashboard/category-views/kanban/hooks/useRelationLookups.ts:25` | `data.forEach((record: any) => {` | Define Record interface; use: data.forEach((record: Record) => { |
| `features/dashboard/category-views/leads/LeadsView.tsx:94` | `.filter((s: any) => String((s.data \|\| {}).pipelineId \|\| '') === String(activePipelineId))` | Use Stage interface; use: .filter((s: Stage) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:95` | `.sort((a: any, b: any) => Number((a.data \|\| {}).order \|\| 0) - Number((b.data \|\| {}).order \|\| 0));` | Use Stage interface; use: .sort((a: Stage, b: Stage) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:98` | `const current = ((selectedLeadId ? filteredLeads.filter((r: any) => String(r.id) === String(selectedLeadId) : filteredLeads) \|\| [])[0];` | Use Record/Lead interface; use: filteredLeads.filter((r: Record) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:99` | `.filter((s: any) => String((s.data \|\| {}).pipelineId \|\| '') === leadPipelineId)` | Use Stage interface; use: .filter((s: Stage) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:100` | `.sort((a: any, b: any) => Number((a.data \|\| {}).order \|\| 0) - Number((b.data \|\| {}).order \|\| 0));` | Use Stage interface; use: .sort((a: Stage, b: Stage) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:101` | `const currentStageIndex = pipelineStages.findIndex((s: any) => String(s.id) === currentStageId);` | Use Stage interface; use: pipelineStages.findIndex((s: Stage) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:103` | `const lead = (filteredLeads \|\| []).find((l: any) => String(l.id) === String(selectedLeadId));` | Use Lead interface; use: (filteredLeads \|\| []).find((l: Lead) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:105` | `const list = (stages \|\| []).filter((s: any) => ...).sort((a: any, b: any) => ...` | Use Stage interface; use: filter((s: Stage) => ...).sort((a: Stage, b: Stage) => |
| `features/dashboard/category-views/leads/LeadsView.tsx:106` | `const idx = list.findIndex((s: any) => String(s.id) === String(ld.stageId \|\| ''));` | Use Stage interface; use: list.findIndex((s: Stage) => |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:34` | `const applyFilters = (arr: any[]) => arr.filter((r: any) => {` | Define Record interface; use: const applyFilters = (arr: Record[]) => arr.filter((r: Record) => { |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:35` | `{cols.map((stage: any) => {` | Use Column type; use: {cols.map((stage: Column) => { |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:36` | `const stageLeads = applyFilters(filteredLeads).filter((r: any) => String((r.data \|\| {}).stageId \|\| '') === sid);` | Use Lead type; use: const stageLeads = applyFilters(filteredLeads).filter((r: Lead) => String((r.data \|\| {}).stageId \|\| '') === sid); |
| `features/dashboard/category-views/leads/components/KanbanView.tsx:37` | `{stageLeads.map((r: any) => {` | Use Lead type; use: {stageLeads.map((r: Lead) => { |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:44` | `].map((it: any) => (` | Define ActivityFilter interface; use: ].map((it: ActivityFilter) => ( |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:46` | `{activities.filter((a: any) => activityFilter === 'all' ? true : String((a.data \|\| {}).type \|\| '') === activityFilter).map((a: any, idx: number, arr: any[]) => {` | Use Activity type; use: activities.filter((a: Activity) => ...).map((a: Activity, idx: number, arr: Activity[]) => { |
| `features/dashboard/category-views/leads/components/LeadTimeline.tsx:47` | `const colors: any = {` | Define ColorMap: Record<string, string>; use: const colors: ColorMap = { |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:53` | `rows.filter((row:any)=> String((row.data\|\|{}).type\|\|'')==='meeting_cancelled')` | Use Record interface; use: rows.filter((row: Record) => String((row.data\|\|{}).type\|\|'')==='meeting_cancelled') |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:54` | `const unitLeadIds = new Set((filteredLeads\|\|[]).map((l:any)=> String(l.id)));` | Use Lead interface; use: const unitLeadIds = new Set((filteredLeads\|\|[]).map((l: Lead)=> String(l.id))); |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:55` | `const onlyMeetings = rows.filter((row:any)=> String((row.data\|\|{}).type\|\|'')==='meeting'` | Use Record interface; use: rows.filter((row: Record) => |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:56` | `const byDate = onlyMeetings.map((row:any) => {` | Use Record interface; use: const byDate = onlyMeetings.map((row: Record) => { |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:57` | `const lead = (filteredLeads\|\|[]).find((l:any)=> String(l.id)===leadId);` | Use Lead interface; use: const lead = (filteredLeads\|\|[]).find((l: Lead)=> String(l.id)===leadId); |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:58` | `}).filter((ev:any)=>{` | Define Event interface; use: }).filter((ev: Event)=>{ |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:59` | `[...JSON.stringify(filteredLeads?.map((l:any)=>l.id))]` | Use Lead interface; use: filteredLeads?.map((l: Lead)=>l.id) |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:60` | `function renderMeetingEventContent(eventInfo: any) {` | Define EventInfo interface (from FullCalendar API); use: eventInfo: EventInfo |
| `features/dashboard/category-views/leads/components/MeetingsCalendar.tsx:61` | `moreLinkContent={(arg: any) => `+${Number(arg?.num)\|\|0} mais`}` | Define MoreLinkArg interface; use: moreLinkContent={(arg: MoreLinkArg) => `+${Number(arg?.num)\|\|0} mais`} |
| `features/dashboard/category-views/leads/components/PipelineProgress.tsx:65` | `{pipelineStages.map((st: any, idx: number) => {` | Use Stage interface; use: {pipelineStages.map((st: Stage, idx: number) => { |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:19` | `stage: any,` | Define Stage interface; use: stage: Stage |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:51` | `const bodyData: any = { stageId: String(stage.id) };` | Define UpdateLeadPayload interface; use: const bodyData: UpdateLeadPayload = { stageId: String(stage.id) }; |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:71` | `const toDelete = rows.filter((r: any) => String(r.data?.leadId) === String(leadId));` | Define Record interface; use: const toDelete = rows.filter((r: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadActions.ts:72` | `const toDelete = rows.filter((r: any) => String(r.data?.leadId) === String(leadId));` | Same as line 71 |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:75` | `(leadsTableData!.schema.fields as any[]).find(f => f.name === 'unitId')` | Ensure fields are typed; use: (leadsTableData!.schema.fields).find(f => f.name === 'unitId') |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:76` | `const filtered = rows.filter((row: any) => String((row.data \|\| {}).leadId \|\| '') === String(leadId))` | Define Record interface; use: const filtered = rows.filter((row: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:77` | `.sort((a: any, b: any) => new Date(b.updatedAt \|\| b.createdAt).getTime() - new Date(a.updatedAt \|\| a.createdAt).getTime());` | Define Record interface; use: .sort((a: Record, b: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:78` | `const advanceToNextStage = useCallback(async (leadId: string, stage: any, payload?: any) => {` | Define Stage and Payload types; use: stage: Stage, payload?: ProposalPayload |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:80` | `setUnitOptions(rows.map((r: any) => ({ id: String(r.id), name: String((r.data \|\| {}).name \|\| r.id) })));` | Define Record interface; use: rows.map((r: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:81` | `if (last && rows.some((r: any) => String(r.id) === last))` | Use Record interface; use: rows.some((r: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:83` | `return (leads \|\| []).filter((r: any) => String((r.data \|\| {}).unitId \|\| '') === String(selectedUnitId));` | Use Record/Lead interface; use: return (leads \|\| []).filter((r: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:84` | `const unitPipes = allPipes.filter((r: any) => String((r.data \|\| {}).unitId \|\| '') === String(selectedUnitId));` | Use Record interface; use: allPipes.filter((r: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:85` | `const def = unitPipes.find((r: any) => (r.data \|\| {}).isDefault) \|\| unitPipes[0] \|\| null;` | Use Record interface; use: unitPipes.find((r: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:86` | `const fields = (leadsTableData.schema.fields \|\| []) as any[];` | Ensure fields are typed; use: const fields = leadsTableData.schema.fields \|\| [] |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:87` | `rows.forEach((row: any) => {` | Use Record interface; use: rows.forEach((row: Record) => |
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:88` | `rows.forEach((row: any) => { const d = row?.data \|\| {}; m[String(row.id)] = String(d.name \|\| row.id); });` | Use Record interface; use: rows.forEach((row: Record) => |
| `features/dashboard/category-views/people/components/PeopleWizardModal.tsx:108` | `let FieldComponent: any = InputField;` | Define FieldComponentType as React.ComponentType<any>; use: let FieldComponent: FieldComponentType = InputField |
| `features/dev/seed/modules/SeedInventory.ts:116` | `async seedProductUnits(productUnitsId: string, products: any[], units: string[])` | Define Product interface; use: products: Product[] |
| `features/dev/seed/modules/SeedInventory.ts:117` | `let entry = existing.find((e: any) =>` | Define entry type; use: existing.find((e: Record) => |
| `features/dev/seed/modules/SeedInventory.ts:118` | `const entry = unitsData.find((u: any) => u.data?.productId === prod.id && u.data?.unitId === uId);` | Use Record interface; use: unitsData.find((u: Record) => |
| `features/dev/seed/modules/SeedInventory.ts:119` | `const entry = allUnits.find((u: any) => u.data?.productId === prod.id && u.data?.unitId === uId);` | Same as line 118 |
| `features/dev/seed/modules/SeedInventory.ts:120` | `const entry = rows.find((r: any) => r.data?.productId === prodId && r.data?.unitId === uId);` | Use Record interface; use: rows.find((r: Record) => |
| `features/dev/seed/modules/SeedSales.ts:121` | `items: any[]` | Define SalesItem interface; use: items: SalesItem[] |
| `features/dev/seed/utils/ApiClient.ts:122` | `async postRow(tableId: string, data: any, tableNameForLog: string = 'Unknown'): Promise<string>` | Define RowData type; use: data: RowData |
| `features/dev/seed/utils/ApiClient.ts:123` | `let body: any = {};` | Define body type; use: let body: Record<string, unknown> = {} |
| `features/dev/seed/utils/ApiClient.ts:124` | `async putRow(tableId: string, dataId: string, data: any, tableNameForLog: string = 'Unknown'): Promise<void>` | Define RowData type; use: data: RowData |
| `features/dev/seed/utils/ApiClient.ts:125` | `let body: any = {};` | Same as line 123 |
| `features/dev/seed/utils/ApiClient.ts:126` | `return rows.find((r: any) => {` | Define Record interface; use: rows.find((r: Record) => |
| `features/dev/seed/utils/ApiClient.ts:127` | `private getErrorMsg(body: any): string` | Define ErrorResponse type; use: body: ErrorResponse |
| `features/dev/seed/utils/ApiClient.ts:128` | `private logError(table: string, payload: any, responseBody: any, status: number)` | Define Payload and ResponseBody types; use: payload: Record<string, unknown>, responseBody: Record<string, unknown> |
| `features/interview/components/RightSidebar/AIChatMode.tsx:134` | `const processApiResponse = (data: any) => {` | Define ApiResponse interface; use: const processApiResponse = (data: ApiResponse) => { |
| `lib/api/api-client.ts:84` | `public post<T>(path: string, body: any, options?: RequestInit)` | Parameterize body: public post<T, B = Record<string, unknown>>(path: string, body: B, options?: RequestInit) |
| `lib/api/api-client.ts:92` | `public put<T>(path: string, body: any, options?: RequestInit)` | Same as post: public put<T, B = Record<string, unknown>>(path: string, body: B, options?: RequestInit) |
| `lib/api/api-client.ts:104` | `public patch<T>(path: string, body: any, options?: RequestInit)` | Same as post: public patch<T, B = Record<string, unknown>>(path: string, body: B, options?: RequestInit) |
| `lib/services/auth.service.ts:13` | `async login(formData: any): Promise<...>` | Define LoginFormData interface; use: async login(formData: LoginFormData) |
| `lib/services/auth.service.ts:20` | `async signup(formData: any): Promise<...>` | Define SignupFormData interface; use: async signup(formData: SignupFormData) |
| `lib/services/dynamic-table.service.ts:15` | `async createTable(payload: any): Promise<any>` | Define CreateTablePayload interface; use: async createTable(payload: CreateTablePayload) |
| `lib/services/dynamic-table.service.ts:27` | `async createRecord(tableId: string, payload: any, ...): Promise<any>` | Define RecordPayload interface; use: async createRecord(tableId: string, payload: RecordPayload, ...) |
| `lib/services/dynamic-table.service.ts:35` | `async updateRecord(tableId: string, recordId: string, payload: any, ...): Promise<any>` | Define RecordPayload interface; use: async updateRecord(tableId: string, recordId: string, payload: RecordPayload, ...) |
| `server/src/controllers/analyticsController.ts:133` | `filteredData = filteredData.map((row: any) => {` | Type row as IDynamicTableData or with correct schema |
| `server/src/controllers/analyticsController.ts:134` | `const slicedData: Record<string, any> = {};` | const slicedData: Record<string, unknown> = {} (unless values are dynamically typed) |
| `server/src/controllers/analyticsDefinitionsController.ts:6` | `async function getCoreTableId(user: any) {` | user: UserContext or { id: string } (extract from calling context) |
| `server/src/controllers/customKpiController.ts:87` | `let table: any;` | let table: IDynamicTable \| undefined; |
| `server/src/controllers/customKpiController.ts:124` | `const rows = rawRows.map((r: any) => ({` | r: IDynamicTableData from service return |
| `server/src/controllers/dashboardController.ts:18` | `addedFields: z.record(z.string(), z.array(z.any())).optional(),` | z.array(z.any()) should be z.array(z.unknown()) or define a specific schema for field values |
| `server/src/controllers/dashboardController.ts:88` | `const finalTablesConfig: Record<string, any> = {` | Type as Record<string, DynamicTableConfig> or extract config interface |
| `server/src/controllers/dashboardController.ts:130` | `const finalPayload: { tables: Record<string, any> } = { tables: {} };` | Type as { tables: Record<string, DynamicTableConfig> } |
| `server/src/controllers/dashboardController.ts:203` | `const tableSchemas = new Map<string, any>();` | new Map<string, ISchemaField[] \| ITableSchema>() |
| `server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts:20` | `function getField(obj: any, path: string, opts?: { deriveItemType?: boolean }): any {` | Type obj as Record<string, unknown>, return as unknown |
| `server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts:62` | `function formatPeriod(dateStr: any, period: 'day' \| 'week' \| 'month' \| 'quarter' \| 'year'): string {` | Type dateStr as string \| Date \| null |
| `server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts:107` | `if (!Array.isArray(f.value) \|\| !f.value.some((x: any) => x === v)) return false;` | Type x as unknown |
| `server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts:110` | `if (Array.isArray(f.value) && f.value.some((x: any) => x === v)) return false;` | Type x as unknown |
| `server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts:232` | `const field = sourceSchema.fields.find((f: any) => f.name === dim.field);` | Type f as ISchemaField |
| `server/src/features/analytics/dynamic/processors/MultiTableCalculationProcessor.ts:82` | `let rows: any[] = [];` | Type as TableDataRow[] |
| `server/src/features/analytics/dynamic/processors/StatusDistributionProcessor.ts:12` | `schema: any,` | Type as ITableSchema |
| `server/src/features/analytics/dynamic/processors/StatusDistributionProcessor.ts:17` | `(f: any) => f.type === 'select' && Array.isArray(f.options) && f.options.length > 0` | Type f as ISchemaField |
| `server/src/features/analytics/dynamic/processors/StatusDistributionProcessor.ts:22` | `(f: any) => prefer.includes(f.name.toLowerCase()) \|\| /status$/i.test(f.name)` | Type f as ISchemaField |
| `server/src/features/analytics/dynamic/processors/StatusDistributionProcessor.ts:28` | `return candidates.find((f: any) => f.options && f.options.length <= maxOpts) \|\| null;` | Type f as ISchemaField |
| `server/src/features/analytics/dynamic/processors/StatusDistributionProcessor.ts:41` | `field = (schema?.fields \|\| []).find((f: any) => String(f.name) === name) \|\| null;` | Type f as ISchemaField |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:36` | `user: any,` | Type as UserContext |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:38` | `allTables: any[]` | Type as IDynamicTable[] |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:50` | `const table = allTables.find((t: any) => {` | Type t as IDynamicTable |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:66` | `schema: any,` | Type as ITableSchema |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:67` | `service: any,` | Type as DynamicTableService or IDynamicTableService |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:68` | `user: any,` | Type as UserContext |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:69` | `allTables: any[]` | Type as IDynamicTable[] |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:74` | `const isCuidOrUuid = (val: any) =>` | Type val as unknown |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:78` | `const relationFields = schema.fields.filter((f: any) => f.type === 'relation');` | Type f as ISchemaField |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:85` | `if (k.endsWith('Id') && isCuidOrUuid(v) && !relationFields.find((rf: any) => rf.name === k)) {` | Type rf as ISchemaField |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:188` | `mainTable: any,` | Type as IDynamicTable |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:189` | `service: any,` | Type as DynamicTableService |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:190` | `user: any,` | Type as UserContext |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:191` | `allTables: any[]` | Type as IDynamicTable[] |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:348` | `const fieldExists = table.schema.fields.some((f: any) => f.name === fieldName);` | Type f as ISchemaField |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:371` | `yield batch.map((r: any) => ({` | Type r as TableDataRow or IDynamicTableData |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:381` | `rows: rows.map((r: any) => ({` | Type r as TableDataRow |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:403` | `rows: otherRowsRaw.map((r: any) => ({ id: r.id, data: r.data \|\| {} })) as TableDataRow[],` | Type r as IDynamicTableData |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:412` | `rows: otherRowsRaw.map((r: any) => ({ id: r.id, data: r.data \|\| {} })) as TableDataRow[],` | Type r as IDynamicTableData |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:560` | `let dataPoint: any = null;` | Type as ChartDataPoint \| null |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:566` | `rows: allRows.map((r: any) => ({` | Type r as TableDataRow |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:587` | `rows: otherRowsRaw.map((r: any) => ({ id: r.id, data: r.data \|\| {} })) as TableDataRow[],` | Type r as IDynamicTableData |
| `server/src/features/analytics/engine/AnalyticsResolver.ts:596` | `rows: otherRowsRaw.map((r: any) => ({ id: r.id, data: r.data \|\| {} })) as TableDataRow[],` | Type r as IDynamicTableData |
| `server/src/features/analytics/kpis/profit/ProfitByDimensionProcessor.ts:41` | `const dimensionFieldSchema = schema.fields.find((f: any) => f.name === dimensionField);` | Type f as ISchemaField |
| `server/src/features/analytics/kpis/sales/SalesProfitByProductProcessor.ts:150` | `let dateVal: any;` | Type as string \| number \| Date \| null |
| `server/src/features/analytics/utils/DataSanitizer.ts:6` | `static extractCurrency(value: any): number {` | Type value as unknown or string \| number |
| `server/src/features/chat/repositories/ActionProposalRepository.ts:6` | `async create(data: any): Promise<ActionProposal> {` | Type data consistently with interface |
| `server/src/features/chat/repositories/IActionProposalRepository.ts:4` | `create(data: any): Promise<ActionProposal>;` | Type data as Omit<ActionProposal, 'id' \| 'createdAt'> or ActionProposalCreateInput |
| `server/src/features/chat/services/ChatService.ts:143` | `let toolArgs: any;` | Type as Record<string, unknown> |
| `server/src/features/chat/services/ChatService.ts:143` | `let toolArgs: any;` | let toolArgs: Record<string, unknown>; |
| `server/src/features/chat/services/LuminarisAgentService.ts:104` | `async handleToolCall(user: UserContext, functionName: string, args: any): Promise<any> {` | Type args as Record<string, unknown> and return type as unknown \| {status?: string; error?: string} |
| `server/src/features/chat/services/LuminarisAgentService.ts:127` | `filtered = data.filter((row: any) => {` | Type row as TableDataRow or {id: string; data: Record<string, unknown>} |
| `server/src/features/documents/repositories/DocumentRepository.ts:120` | `private toDomain(prismaDocument: any): IDocument {` | Type prismaDocument as Prisma.DocumentGetPayload<...> or Document |
| `server/src/features/documents/repositories/VectorRepository.ts:375` | `sampleIds: pointsInfo.slice(0, 3).map((p: any) => p.id)` | Type p as {id: string \| number} |
| `server/src/features/documents/repositories/VectorRepository.ts:378` | `const existingBatchPoints = pointsInfo.map((p: any) => p.id);` | Type p as {id: string \| number} |
| `server/src/features/dynamicTables/repositories/DynamicTableRepository.ts:207` | `async countByFieldValue(tableId: string, fieldName: string, value: any, excludeId?: string): Promise<number> {` | Type value as unknown |
| `server/src/features/dynamicTables/repositories/DynamicTableRepository.ts:311` | `const fields = (table.schema?.fields \|\| []) as any[];` | Type as ISchemaField[] |
| `server/src/features/dynamicTables/repositories/DynamicTableRepository.ts:312` | `const hasReference = fields.some((f: any) => f?.type === 'relation' && f?.relation?.targetTable === targetTableId);` | Type f as ISchemaField |
| `server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts:32` | `countByFieldValue(tableId: string, fieldName: string, value: any, excludeId?: string): Promise<number>;` | Type value as unknown |
| `server/src/features/dynamicTables/repositories/TransactionalDynamicTableRepository.ts:210` | `async countByFieldValue(tableId: string, fieldName: string, value: any, excludeId?: string): Promise<number> {` | Type value as unknown |
| `server/src/features/dynamicTables/repositories/TransactionalDynamicTableRepository.ts:281` | `const fields = (table.schema?.fields \|\| []) as any[];` | Type as ISchemaField[] |
| `server/src/features/dynamicTables/repositories/TransactionalDynamicTableRepository.ts:283` | `(f: any) => f?.type === 'relation' && f?.relation?.targetTable === targetTableId` | Type f as ISchemaField |
| `server/src/features/dynamicTables/rules/plugins/AppointmentsPlugin.ts:33` | `async function validateAppointment(ctx: RuleContext, after: any, before?: any) {` | Type after and before as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/AppointmentsPlugin.ts:125` | `async function validateCompletionTiming(ctx: RuleContext, after: any, before?: any) {` | Type after and before as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/CommissionsPlugin.ts:17` | `async function autoStampPaidAt(_ctx: RuleContext, after: any, before?: any) {` | Type after and before as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/EmployeesPlugin.ts:14` | `function hasAtLeastOneWorkDay(schedule: any): boolean {` | Type schedule as unknown or {[key: string]: boolean} |
| `server/src/features/dynamicTables/rules/plugins/EmployeesPlugin.ts:31` | `async function validateEmployee(ctx: RuleContext, after: any) {` | Type after as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/LeadsPlugin.ts:43` | `function calcScore(after: any): number {` | Type after as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/LeadsPlugin.ts:146` | `.sort((a: any, b: any) => Number((a.data \|\| {}).order \|\| 0) - Number((b.data \|\| {}).order \|\| 0));` | Type a and b as {data?: {order?: number}} |
| `server/src/features/dynamicTables/rules/plugins/LeadsPlugin.ts:147` | `const idxPrev = list.findIndex((s: any) => String(s.id) === prevStageId);` | Type s as {id: string \| number} |
| `server/src/features/dynamicTables/rules/plugins/LeadsPlugin.ts:148` | `const idxNext = list.findIndex((s: any) => String(s.id) === nextStageId);` | Type s as {id: string \| number} |
| `server/src/features/dynamicTables/rules/plugins/sales/appointmentSync.ts:18` | `export async function assertServiceAppointmentsReady(ctx: RuleContext, items: Array<{ id: string; data: any }>) {` | Type data as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/sales/appointmentSync.ts:41` | `export async function validateServiceAppointmentCoherence(ctx: RuleContext, itemData: any, saleUnitId: string) {` | Type itemData as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/sales/appointmentSync.ts:57` | `export async function cancelLinkedAppointmentsIfScheduled(ctx: RuleContext, items: Array<{ id: string; data: any }>) {` | Type data as Record<string, unknown> |
| `server/src/features/dynamicTables/rules/plugins/sales/commissions.ts:22` | `items: Array<{ id: string; data: any }>,` | Type data as Record<string, unknown> |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:278` | `const def: any = preset.tables[key];` | Type def as PresetTableDefinition |
| `server/src/features/dynamicTables/utils/RelationUtils.ts:62` | `let displayValue: any;` | Type as unknown or string |
| `server/src/features/dynamicTables/utils/TableFactory.ts:28` | `baseModule: any,` | Type as unknown or define ModuleType interface |
| `server/src/features/dynamicTables/utils/TableFactory.ts:30` | `): { name: string; category: DynamicTableCategory; schema: ITableSchema; meta?: any; analytics?: any[] } {` | Type meta as Record<string, unknown>; analytics as AnalyticsConfiguration[] |
| `server/src/features/dynamicTables/utils/TableUtils.ts:8` | `export function isTableSchema(schema: any): schema is ITableSchema {` | Type schema as unknown |
| `server/src/features/interview/CustomizationService/TableExtractor.ts:77` | `fields = tableSchema.schema.fields.map((field: any) => ({` | Type field as ISchemaField |
| `server/src/features/interview/FieldCustomizationService/index.ts:201` | `private async processFieldModifications(modifications: any[], existingFields: ISchemaField[]) {` | Type modifications as FieldModification[] |
| `server/src/features/structuredData/services/StructuredDataService.ts:174` | `? structuredContent.data.map((row: any[]) =>` | Type row as unknown[] or define StructuredRow type |
| `server/src/features/structuredData/services/StructuredDataService.ts:175` | `Array.isArray(row) ? row.map((cell: any) =>` | Type cell as unknown |
| `server/src/lib/apiUtils.ts:1-2` | `type NextApiRequest = any; type NextApiResponse = any;` | Define proper types or import from express: import type { Request, Response } from 'express' |
| `server/src/lib/apiUtils.ts:92` | `export function sendBadRequestError(res: NextApiResponse, message: string = 'Bad Request', details?: any) {` | details?: Record<string, any> (if truly dynamic) or a specific validation error DTO |
| `server/src/lib/apiUtils.ts:111` | `export function sendInternalServerError(res: NextApiResponse, error: any, message: string = 'Internal Server Error') {` | error: Error \| unknown (then narrow in function body) |
| `server/src/lib/monitoring.ts:5` | `[key: string]: any;` | Define MetricOptions properly: { success: boolean; duration?: number; error?: string; [key: string]: string \| number \| boolean \| undefined } |
| `server/src/lib/openai/OpenAIService.ts:42` | `private static locks = new Map<string, Promise<any>>();` | new Map<string, Promise<unknown>>() or new Map<string, Promise<any \| null>>() |
| `server/src/routes/docs.ts:32` | `let specs: any = null;` | specs: SwaggerDocument \| null = null (or import swagger types) |

### `untyped-return` -- Retorno `: any` (33)

**Como evitar:** Declarar o tipo de retorno real. Se genuinamente dinamico, `unknown` e o caller narrowa.

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `features/dashboard/category-views/leads/hooks/useLeadsView.ts:82` | `if (!selectedUnitId) return [] as any[];` | Return typed array; use: return [] as Record[] |
| `features/dev/seed/utils/DataGenerator.ts:129` | `generateProducts(count: number): any[]` | Define Product interface; use: generateProducts(count: number): Product[] |
| `features/dev/seed/utils/DataGenerator.ts:130` | `generateServices(count: number): any[]` | Define Service interface; use: generateServices(count: number): Service[] |
| `lib/api/api-client.ts:52` | `let result: any;` | Define interface for response: interface ApiResponse { message?: string; error?: string; [key: string]: any } or use generic JSON type |
| `lib/services/analytics.service.ts:3` | `async getDiscoverData(tableId: string, queryParams: string = ''): Promise<any>` | Define DiscoverDataResponse interface; return Promise<DiscoverDataResponse> |
| `lib/services/analytics.service.ts:6` | `async getDrillDownData(queryParams: string): Promise<any>` | Define DrillDownDataResponse interface; return Promise<DrillDownDataResponse> |
| `lib/services/analytics.service.ts:9` | `async getDashboardSidebar(): Promise<any>` | Define DashboardSidebarResponse interface; return Promise<DashboardSidebarResponse> |
| `lib/services/analytics.service.ts:12` | `async getSystemStatus(): Promise<any>` | Define SystemStatusResponse interface; return Promise<SystemStatusResponse> |
| `lib/services/document.service.ts:4` | `async getDocuments(): Promise<any>` | Define DocumentListResponse interface; return Promise<DocumentListResponse[]> |
| `lib/services/document.service.ts:7` | `async getDocumentById(docId: string): Promise<any>` | Define Document interface; return Promise<Document> |
| `lib/services/document.service.ts:10` | `async uploadDocument(formData: FormData): Promise<any>` | Define UploadResponse interface; return Promise<UploadResponse> |
| `lib/services/document.service.ts:13` | `async getTokenCost(formData: FormData): Promise<any>` | Define TokenCostResponse interface; return Promise<TokenCostResponse> |
| `lib/services/document.service.ts:16` | `async getQdrantStatus(): Promise<any>` | Define QdrantStatusResponse interface; return Promise<QdrantStatusResponse> |
| `lib/services/document.service.ts:19` | `async getQdrantPoints(docId: string): Promise<any>` | Define QdrantPointsResponse interface; return Promise<QdrantPointsResponse> |
| `lib/services/document.service.ts:22` | `async triggerQdrantInjection(docId: string): Promise<any>` | Define QdrantInjectionResponse interface; return Promise<QdrantInjectionResponse> |
| `lib/services/document.service.ts:25` | `async deleteDocument(docId: string): Promise<any>` | Define DeleteResponse interface; return Promise<DeleteResponse> |
| `lib/services/dynamic-table.service.ts:6` | `async getTables(): Promise<any>` | Define: interface TableListResponse { id: string; name: string; [key: string]: any }; return Promise<TableListResponse[]> |
| `lib/services/dynamic-table.service.ts:9` | `async getTableById(tableId: string): Promise<any>` | Define DynamicTable interface; return Promise<DynamicTable> |
| `lib/services/dynamic-table.service.ts:12` | `async getSubTables(parentId: string): Promise<any>` | Same as getTables; return Promise<TableListResponse[]> |
| `lib/services/dynamic-table.service.ts:20` | `async getTableData(tableId: string, queryParams: string = ''): Promise<any>` | Define TableDataResponse interface; return Promise<TableDataResponse> |
| `lib/services/dynamic-table.service.ts:24` | `async getRecordById(tableId: string, recordId: string): Promise<any>` | Define Record interface; return Promise<Record> |
| `lib/services/dynamic-table.service.ts:43` | `async deleteRecord(tableId: string, recordId: string, ...): Promise<any>` | Define DeleteResponse interface; return Promise<DeleteResponse> |
| `lib/services/dynamic-table.service.ts:51` | `async performLookup(payload: {...}): Promise<any>` | Define LookupResponse interface; return Promise<LookupResponse> |
| `lib/services/dynamic-table.service.ts:56` | `async getSidebar(): Promise<any>` | Define SidebarResponse interface; return Promise<SidebarResponse> |
| `lib/services/dynamic-table.service.ts:59` | `async getSystem(): Promise<any>` | Define SystemResponse interface; return Promise<SystemResponse> |
| `lib/services/dynamic-table.service.ts:62` | `async deleteSystem(): Promise<any>` | Define DeleteSystemResponse interface; return Promise<DeleteSystemResponse> |
| `lib/services/dynamic-table.service.ts:66` | `async getCustomData(url: string): Promise<any>` | Define CustomDataResponse interface; return Promise<CustomDataResponse> |
| `lib/services/location.service.ts:4` | `async fetchCepData(cep: string): Promise<any>` | Define CepDataResponse interface; return Promise<CepDataResponse> |
| `lib/services/user.service.ts:12` | `pagination: any in { data: IUser[], pagination: any }` | Define PaginationMetadata interface: { page: number; limit: number; total: number; hasMore: boolean } |
| `pages/users/create.tsx:13` | `Promise<GetServerSidePropsResult<Record<string, any>>>` | Define interface for SSProps: `interface CreateUserSSProps { _nextI18Next?: object }` or use InferGetServerSidePropsType |
| `pages/users/index.tsx:16` | `Promise<GetServerSidePropsResult<Record<string, any>>>` | Define SSProps interface: `interface UserListSSProps { _nextI18Next?: object }` |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:859` | `private buildZodSchema(tableSchema: ITableSchema): z.ZodObject<any> {` | Return type as z.ZodObject<z.ZodRawShape> |
| `server/src/lib/openai/OpenAIService.ts:280` | `Promise<any \| null>` | Return a specific type or Promise<string \| null> |

### `other` -- Outros casts evitaveis (13)

**Como evitar:** Caso a caso -- normalmente tipo explicito ou `satisfies <Tipo>` em vez de `as any`.

| Arquivo:linha | Trecho | Correcao |
|---|---|---|
| `server/src/features/analytics/engine/AnalyticsResolver.ts:29` | `} as any;` | Type as UserContext or proper interface with required fields |
| `server/src/features/analytics/services/AnalyticsService.ts:106` | `const userContext = { id: userId, userId } as any;` | Create UserContext type/interface and use proper typing |
| `server/src/features/chat/services/ChatService.ts:124` | `...(history \|\| []).map(h => ({ role: h.role, content: h.content } as any)),` | Type as OpenAI.Chat.Completions.ChatCompletionMessageParam or {...} as const satisfies |
| `server/src/features/chat/services/ChatService.ts:140` | `messages.push(response as any);` | Type response explicitly; should be ChatCompletionAssistantMessageParam |
| `server/src/features/chat/services/ChatService.ts:177` | `} as any);` | Type as {role: 'tool'; tool_call_id: string; content: string} satisfies ChatCompletionToolMessageParam |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:233` | `this.validateDataAgainstSchema(row.data as any, data.schema as unknown as ITableSchema);` | Type row.data as Record<string, unknown> instead of as any |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:506` | `const afterWithId = { ...validatedData, id: record.id } as any;` | Type as TableDataRow or {id: string; ...validatedData} instead |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:614` | `const sanitizedDataDto = { ...(dataDto.data as any) };` | Type dataDto.data as Record<string, unknown> |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:701` | `const beforeWithId = { ...(existingData.data as any), id: dataId } as any;` | Type explicitly as {id: string; [key: string]: unknown} |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:702` | `const afterWithId = { ...mergedData as any, id: dataId } as any;` | Type properly without as any |
| `server/src/features/dynamicTables/services/DynamicTableService.ts:1096` | `conditionMet = arr.includes(actualCondValue as any);` | Type actualCondValue properly based on arr element type |
| `server/src/lib/errors.ts:56` | `public readonly details: { [key: string]: string[] \| undefined } \| Record<string, any> \| null;` | Define a ValidationErrorDetails type or keep Record<string, unknown> for dynamic validation errors |
| `server/src/lib/errors.ts:60` | `details: { [key: string]: string[] \| undefined } \| Record<string, any> \| null = null` | Same as line 56 — consolidate into a named type |
