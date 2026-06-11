# Área 3 — Sistema de Presets (Auditoria Profunda)

> Parte do relatório `auditoria_profunda_areas.md`. Gerado em 2026-06-11.

## 1. Arquitetura (3 camadas)

```
SYSTEMS (ERP completo) → compõe via createTableFromModule()
MODULES (uma tabela cada) → compõe via spread/inline
FIELDS (campos reutilizáveis)
```

- Documentação: `server/src/features/dynamicTables/presets/README.md:36-55`
- Tipos e `tablePresetSuites`: `presets/index.ts:1-72`
- FIELDS em `presets/fields/<tipo>/`, MODULES em `presets/modules/<categoria>/`, SYSTEMS em `presets/systems/`

## 2. Biblioteca de Field Presets (`presets/fields/`, reexport em `fields/index.ts:1-12`)

- **text/TextPresets.ts**: name, description, notes, email, phone, cpf, taxId, stateRegistration, street, addressNumber, addressComplement, neighborhood, city, stateUF, zipCode, country, brand, sku, leadSource
- **number/NumberPresets.ts**: amount, price, salePrice, costPrice, subtotal, discountAmount, taxAmount, totalAmount, quantity, stock, reserved, commission, monthlyCost
- **date/DatePresets.ts**: date, dueDate, paymentDate, startAtDateTime, endAtDateTime, startDate, endDate (+ dateRange que expande em 2 campos)
- **boolean/BooleanPresets.ts**: isActive, isPlanned, simpleCustomerFlag
- **select/SelectPresets.ts**: saleStatus (Draft|Finalized|Cancelled|Returned), paymentStatus (Paid|Pending), paymentMethod, usageType, itemType, appointmentStatus, lifecycleStageSelect, channelSelect, revenueTypeSelect, periodSelect, goalResultSelect
- **relation/RelationPresets.ts**: unitId, mainUnitId, employeeId, responsibleEmployeeId, qualifiedEmployees, customerId, productId, associatedProducts, supplierId, serviceId, saleId, saleItemId, campaignId, appointmentId — todos com marcador `@@PRESET_TABLE_KEY::<chave>`

## 3. CoreSystemPreset (obrigatório, 10 tabelas)

**Arquivo**: `presets/systems/CoreSystemPreset.ts:23-73`

| Tabela | Módulo | Categoria | Campos-chave |
|---|---|---|---|
| units | `modules/core/UnitsModule.ts` | business | name (req), cnpj (unique), address, managerId (FK→employees), type (Own/Franchise/Department), isActive |
| employees | `modules/core/EmployeesModule.ts` | people | name, email, phone, monthlyCost, role, unitId |
| tasks | `modules/core/TasksModule.ts` | operations | title, status (TODO/In Progress/Done), priority, assignedTo, dueDate |
| stakeholders | `modules/core/StakeholdersModule.ts` | people | name, type, email, phone, role |
| leadPipelines | `modules/core/LeadPipelinesModule.ts` | sales | name, isActive |
| leadStages | `modules/core/LeadStagesModule.ts` | sales | name, position, color, pipelineId |
| leads | `modules/core/LeadsModule.ts` | sales | name, email, stageId, value, expectedCloseDateAt |
| leadProposals | `modules/core/LeadProposalsModule.ts` | sales | leadId, value, status |
| leadActivities | `modules/core/LeadActivitiesModule.ts` | sales | leadId, type (Call/Email/Meeting/Note), date |
| analyticsDefinitions | *inline no preset* | operations | key (unique), title, chartType, scope (global/preset/table), pipeline (JSON), published — `ui.presentation: 'system'` bloqueia escrita via `canManageData` |

## 4. BeautySalonPreset (opcional, 16 tabelas)

**Arquivo**: `presets/systems/BeautySalonPreset.ts:29-54` — key `beautySalon`, "Advanced Beauty Salon ERP".

| Tabela | Módulo | Destaques |
|---|---|---|
| customers | `modules/people/CustomerModule.ts` | email/taxId unique; campos CRM readonly: lifecycleStage, firstSaleAt, lastSaleAt, totalSalesCount, totalSalesAmount |
| suppliers | `modules/people/SuppliersModule.ts` | cnpj unique, paymentTermDays |
| services | `modules/service/ServiceModule.ts` | duration (min), price, commissionType (Fixed/Percentage), qualifiedEmployees (M:N) |
| products | `modules/product/ProductModule.ts` | sku unique, costPrice, salePrice, usageType; deleteConstraints RESTRICT_IF_AGGREGATE stock>0 |
| productUnits | `modules/product/ProductModule.ts` | stock/reserved readonly; compositeUnique (productId+unitId) |
| appointments | `modules/planning/AppointmentsModule.ts` | lifecycle (FSM), noOverlap (escopo unitId+responsibleEmployeeId), compare (endAt > startAt) |
| sales | `modules/finance/SalesModule.ts` | immutableAfter (Paid → bloqueia campos financeiros; Finalized/Cancelled/Returned → bloqueia tudo); 8 analytics pré-configurados |
| saleItems | `modules/finance/SalesItemsMixed.ts` | ui.presentation 'embedded'; 8 analytics; variantes dinâmicas |
| stockMovements | `modules/inventory/StockMovementsModule.ts` | type In/Out/Adjustment, cost, reason |
| goals | `modules/business/GoalsModule.ts` | result readonly |
| reports | `modules/business/ReportsModule.ts` | kpiValues (JSON) |
| campaigns | `modules/business/CampaignsModule.ts` | budget, roi readonly |
| expenses | `modules/finance/ExpensesModule.ts` | immutableAfter Paid |
| otherRevenues | `modules/finance/OtherRevenuesModule.ts` | source conditionally required (requiredIf) |
| financialBaselines | `modules/finance/FinancialBaselinesModule.ts` | fixedCosts, variableCosts, taxRate |
| commissions | `modules/finance/CommissionsModule.ts` | saleId, employeeId, status, paidAt |

**Variantes de saleItems** (trocadas dinamicamente na instalação): `SalesItemsProductsOnlyModule` (capability `inventory.stock`), `SalesItemsServicesOnlyModule` (`services.catalog`), `SalesItemsMixedModule` (ambos, default).

## 5. Formato completo do schema (ITableSchema)

**Definição**: `server/src/features/dynamicTables/models/DynamicTable.model.ts:181-222`

### ISchemaField
- Identificação: `name` (camelCase, imutável em prod), `label`, `type` ('string'|'number'|'boolean'|'date'|'datetime'|'relation'|'select'|'textarea'|'json'), `description`
- Formatação: `format` ('email'|'phone'|'cpf'|'cnpj'|'url'|'custom'), `regex`, `numberFormat` ('currency'|'percentage'|'integer'|'decimal'), `options[]`
- Comportamento: `required`, `unique`, `defaultValue`, `hidden`, `readOnly` (backend rejeita update exceto sistema), `searchable` (default true)
- Validação: `validation {minLength,maxLength,minValue,maxValue}`, `requiredIf {field, op: eq|neq|in, value}`
- Relação: `relation {targetTable: '@@PRESET_TABLE_KEY::<chave>'|id, allowMultiple}`

### ITableSchema (metadados/governança)
| Propriedade | Onde executa |
|---|---|
| `defaultDisplayField` | resolveRelations() — display de FK |
| `deleteConstraints[]` (RESTRICT/CASCADE/RESTRICT_IF_AGGREGATE/IGNORE + aggregate {field,operator,value}) | deleteTableData() |
| `compositeUnique[]` | validateAdvancedRules() |
| `immutableAfter[]` ({condition {field,op,value}, scope: 'all'\|string[]}) | updateTableData Guard 2 |
| `compare[]` ({left, op, right}) | validateAdvancedRules() |
| `lifecycle[]` ({field, transitions: Record<string,string[]>}; estado ausente = terminal) | updateTableData Guard 3 (só user) |
| `noOverlap[]` ({startField, endField, scopeFields}) | enforceNoOverlap() (bypass system) |
| `ui.presentation` ('standalone'\|'embedded'\|'system') | canManageData() + roteamento de UI |
| `analytics[]` (AnalyticsConfiguration) | onboarding/AnalyticsService |

## 6. Fluxo installPresetAsSystem

**Arquivo**: `DynamicTableService.ts:187-315`

**Pré-validação (l.188-252)**: capabilities (`providesCapabilities`/`requiresCapabilities`), `requiresTables`, `excludesTables`; relações devem começar com `@@PRESET_TABLE_KEY::` (l.240-250).

**3 passagens (l.253-313)**:
1. Cria tabelas SEM campos relation (l.268-280, via `_createTable` l.31-63); guarda map presetKey→tableId
2. Resolve relações: `resolvePresetRelations()` (l.88-105) substitui marcadores por IDs reais; `updateTableSchemaAsSystem` (l.284-287); chave inexistente → ValidationError
3. Troca variante de saleItems conforme capabilities (l.289-312); import dinâmico com try-catch **silencioso** (l.300-306)

**Endpoint**: `POST /api/dashboard/create` (`dashboardController.ts:29-74`) — bloqueia se `existingTables.length > 0` (l.48, retorna 403).

**Garantias**:
- ❌ Sem `prisma.$transaction()` — falha entre passagens deixa tabelas órfãs E bloqueia reinstalação (403)
- ✅ Idempotência parcial (check no controller)
- ❌ Sem rollback
- ✅ Pré-validação robusta de dependências

## 7. Consumo no frontend

`my-app/pages/dashboard/setup.tsx:13-127` — 3 modos: QuickSetup (`mode: 'quick', suiteKey`), TotalControlSetup (`mode: 'custom', removedTables, addedFields`), AiInterviewSetup. Guard l.28-41: se já tem tabelas → redirect `/dashboard`. Presets listados via `GET /api/dashboard/presets` → `PresetService.getAllPresetSummaries()` (`PresetService.ts:12-23`).

## 8. Riscos (PR-1 a PR-8)

| # | Sev. | Risco | Evidência |
|---|---|---|---|
| PR-1 | **Alta** | Instalação sem transação — estado sujo + reinstalação bloqueada por 403 | DynamicTableService.ts:187-315 |
| PR-2 | Média | Validação de campo relation malformado pode passar | l.240-250 |
| PR-3 | Média | Import dinâmico da variante saleItems falha silenciosamente | l.299-310 |
| PR-4 | **Alta** | Marcador `@@PRESET_TABLE_KEY::` inválido só detectado na 2ª passagem, após tabelas criadas | l.94-98 |
| PR-5 | **Alta** | Race condition: 2 requests simultâneos passam no check `existingTables.length > 0` (sem lock) | dashboardController.ts:46-54 |
| PR-6 | Média | `analytics.fieldMapping` apontando para campo inexistente não detectado até runtime | dashboardController.ts:198-216 |
| PR-7 | Média | Bypass `isSystem` pula readOnly/immutableAfter/lifecycle — plugins mal escritos podem corromper | DynamicTableService.ts:393-398 |
| PR-8 | Baixa | Deep-clone via JSON.parse(JSON.stringify()) em createTableFromModule | TableFactory.ts:32 |

**Recomendações**: envolver as 3 passagens em transação; pré-validar todos os marcadores antes de qualquer write; constraint `UNIQUE (userId, internalName)` ou lock no install.
