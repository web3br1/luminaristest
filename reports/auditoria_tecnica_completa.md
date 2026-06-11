# Relatório Técnico Completo do Projeto — Luminaris

> Auditoria de arquitetura, funcionalidades e riscos. **Não houve alteração de código** — apenas leitura.
> Metodologia: reconhecimento + 12 varreduras profundas (subagentes de leitura, um por domínio) + verificação manual na fonte das alegações de maior severidade.
> Toda afirmação técnica importante aponta para `arquivo:linha`. Onde há dúvida, está marcado como **[INCERTO]**. Onde é dedução, está marcado como **[INFERÊNCIA]**.
> Data: 2026-06-10.

---

## 1. Sumário executivo

**Luminaris** é uma plataforma SaaS B2B do tipo **"ERP dinâmico dirigido por schema" + Document Intelligence (RAG) + Analytics financeiro + Agente de IA conversacional**. Cada usuário monta seu próprio "sistema" (tabelas, campos, regras) a partir de *presets* de negócio, opera CRUD por views especializadas, conversa com um agente que propõe mutações no ERP, e visualiza KPIs calculados sobre seus próprios dados.

São **dois aplicativos independentes** (não é monorepo, não é repositório git):
- **`server/`** — API REST Express + TypeScript, arquitetura *feature-based* em camadas limpas (Controller → Service → Repository → Policy) com DI por *factory* singleton, Prisma + **SQLite**, JWT, OpenAI + Qdrant.
- **`my-app/`** — Frontend Next.js 15 (Pages Router) + React 19 + TypeScript, renderização **dirigida por schema** (formulários/tabelas montados do JSON da tabela), dashboard de widgets, i18n en/pt.

**Maturidade geral: média.** A arquitetura documental é excelente (40 READMEs, 2 `ARCHITECTURE.md` detalhados) e a disciplina de camadas é real no backend. As partes mais maduras — o **motor de Analytics** e a **view de finance** — são tecnicamente sólidas e (no caso de analytics) **as únicas com testes**. Porém há **lacunas estruturais graves**: ausência total de transações de banco no "cérebro" transacional do ERP (rules engine), múltiplos **vazamentos cross-tenant**, **bypass de governança controlável pelo cliente**, segredo JWT com fallback inseguro, e ~95% do sistema sem testes.

**Top 5 riscos (todos verificados na fonte):**
1. **🔴 Crítico — Sem transações no rules engine.** Vendas finalizam estoque/comissões/métricas em escritas separadas e não-atômicas; falha parcial corrompe inventário e dados financeiros sem rollback. [DynamicTableService.ts:393-398](../server/src/features/dynamicTables/services/DynamicTableService.ts), [IDynamicTableRepository.ts](../server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts).
2. **🔴 Crítico — Bypass de governança via `__isSystem`.** O flag que pula validações readOnly/immutable/lifecycle/overlap vem do corpo JSON do cliente (`dataDto.data.__isSystem`). [DynamicTableService.ts:389,467](../server/src/features/dynamicTables/services/DynamicTableService.ts).
3. **🔴 Crítico — Vazamento cross-tenant no RAG.** `VectorRepository.search()` filtra só por `documentId`, sem `userId`; o chat passa `documentIds` do cliente sem checar posse. [ChatService.ts:193](../server/src/features/chat/services/ChatService.ts), [VectorRepository.ts:156-163](../server/src/features/documents/repositories/VectorRepository.ts).
4. **🔴 Crítico — Segredo JWT inseguro.** `JWT_SECRET || 'your-jwt-secret-key'`, sem allowlist de algoritmo. [jwt.ts:4](../server/src/lib/jwt.ts).
5. **🟠 Alto — Vazamento de chat-instances entre tenants.** `GET /api/chat-instances` (sem `?type`) retorna instâncias de todos os usuários. [ChatInstanceService.ts:102](../server/src/features/chatInstances/services/ChatInstanceService.ts).

**Funcionalidades reais vs prometidas:** o ERP dinâmico, o CRUD por schema, finance (sales/expenses/analytics), o agente de chat com *action proposals*, e o RAG de documentos **estão implementados e funcionais**. O **onboarding por IA ("entrevista")** está **quebrado na ponta**: os serviços de entrevista no backend são *library-only* (sem rota), e o frontend chama endpoints inexistentes (`/dashboard/ai/ChatInterview`). A **assinatura/billing** é mock. O **cache de KPIs**, **snapshots** e **descoberta automática de KPIs** estão planejados/quebrados.

---

## 2. Visão geral da arquitetura

### Diagrama textual (real)

```
┌─────────────────────────────────────────── my-app (Next.js :3000) ───────────────────────────────────────────┐
│ pages/ (Pages Router)                                                                                          │
│   _app.tsx: ToastProvider → ErrorBoundary → AuthProvider → CurrencyProvider → DashboardDataProvider            │
│            (+ Navbar fora de /users/*; FloatingChat em /dashboard/*)                                            │
│ features/dashboard/category-views/ (finance, inventory, people, products, services, planning, leads, kanban)   │
│   └─ render dirigido por schema: DynamicForm (campo.type → componente) + GenericTabbedView                     │
│ components/widgets/ (dashboard-grid, chat, generic-chat, analytics, erp-view)                                  │
│ lib/services/*.service.ts  ──►  lib/api/api-client.ts (ApiClient singleton: Bearer cookie + x-user-timezone)   │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                                      │  HTTP  NEXT_PUBLIC_API_BASE_URL (http://localhost:3001/api)
                                                      ▼
┌─────────────────────────────────────────── server (Express :3001) ───────────────────────────────────────────┐
│ helmet → cors() → compression → json → rateLimit(5000/15min) → authMiddleware (JWT → injeta x-user-*)          │
│ routes/index.ts → routes/<feature>.ts                                                                          │
│ controllers/<feature>Controller.ts  (valida DTO Zod, getUserContextFromRequest, handleApiError)                │
│ getFactory() → features/<feature>/services  (regra de negócio, consulta policy)                                │
│   ├─ repositories (Prisma)                                                                                     │
│   ├─ policies (autorização)                                                                                    │
│   └─ rules engine (plugins disparam efeitos colaterais cross-table — SEM transação)                            │
│ PrismaClient singleton → SQLite (prisma/dev.db)                                                                │
│ Integrações: OpenAI (chat/embeddings/extração) · Qdrant (vetores RAG)                                          │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Camadas (backend) — confirmadas no código

| Camada | Responsabilidade | Onde | Separação |
|---|---|---|---|
| Apresentação HTTP | parse/validação, tradução de erro | `controllers/*Controller.ts`, `middleware/auth.ts` | ✅ clara (mas alguns controllers acessam Prisma direto — `getUsers`, `updateMyPreferences`) |
| Roteamento | agrega sub-routers | `routes/index.ts` + `routes/<feature>.ts` | ✅ |
| Aplicação/Domínio | regra de negócio | `features/<feature>/services/*` | ✅ (com vazamentos de regra para `rules/plugins`) |
| Autorização | quem-pode-o-quê | `features/<feature>/policies/*` | ✅ |
| Persistência | Prisma | `features/<feature>/repositories/*` | ⚠️ sem unidade de trabalho/transação |
| Regras transacionais | efeitos colaterais cross-table | `features/dynamicTables/rules/plugins/*` | ⚠️ regra de negócio acoplada, sem atomicidade |
| Transversal | DI, erros, jwt, logger, openai, vector | `lib/*` | ✅ (com duplicações) |

### Camadas (frontend)

Apresentação (pages/components) → estado global (Context API: Auth/Currency/DashboardData/Toast) → serviços (`lib/services`) → `ApiClient`. Proteção de rota é **client-side** via HOC `withAuth` (exceto `/dashboard`, que valida no `getServerSideProps`).

### Principais arquivos
- **Backend:** [server.ts](../server/src/server.ts) (bootstrap), [factory.ts](../server/src/lib/factory.ts) (DI), [DynamicTableService.ts](../server/src/features/dynamicTables/services/DynamicTableService.ts) (988 linhas, núcleo do ERP), [RuleRegistry.ts](../server/src/features/dynamicTables/rules/RuleRegistry.ts) + `rules/plugins/*`, [AnalyticsResolver.ts](../server/src/features/analytics/engine/AnalyticsResolver.ts) (857 linhas), [ChatService.ts](../server/src/features/chat/services/ChatService.ts) + [LuminarisAgentService.ts](../server/src/features/chat/services/LuminarisAgentService.ts), [schema.prisma](../server/prisma/schema.prisma).
- **Frontend:** [_app.tsx](../my-app/pages/_app.tsx), [api-client.ts](../my-app/lib/api/api-client.ts), [AuthContext.tsx](../my-app/lib/context/AuthContext.tsx), [DynamicForm.tsx](../my-app/features/dashboard/components/forms/DynamicForm.tsx), [GenericTabbedView.tsx](../my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx), [dashboard-grid.tsx](../my-app/components/widgets/dashboard-grid/dashboard-grid.tsx).

---

## 3. Stack técnica

### Frontend (`my-app/package.json`)
- **Linguagem/framework:** TypeScript 5, Next.js **15.3.1 (Pages Router)**, React **19**.
- **UI/estilo:** Tailwind CSS 3.4 + PostCSS, tema "Galaxy" custom, `@heroicons/react`, `react-icons`.
- **Dashboard/widgets:** `react-grid-layout` 1.5, `@dnd-kit/core`+`sortable`, `re-resizable`.
- **Tabelas/planilhas/agenda:** `handsontable`/`@handsontable/react` 15.3, `@fullcalendar/*` 6.1.
- **Gráficos:** `recharts` 2.15. **Markdown:** `react-markdown`. **Selects:** `react-select`.
- **i18n:** `next-i18next` 15.4 / `i18next` 25 / `react-i18next` (en default, pt).
- **Validação:** `zod` **3.25**. **Auth token:** `cookies-next` 5. **IDs:** `cuid`, `uuid`. **Export:** `exceljs`.
- **Build/lint:** ESLint 9 + `eslint-config-next`. **Scripts:** `dev/build/start/lint`. **Sem teste.**

### Backend (`server/package.json`)
- **Linguagem/runtime:** TypeScript 5.3, Node ≥18, Express **4.18**. Dev via `ts-node-dev` + `tsconfig-paths` (alias `@/`).
- **ORM/DB:** Prisma **6.16** + **SQLite** (cliente gerado em `../generated/prisma`).
- **Auth:** `jsonwebtoken` 8.5 **(usada)** + `jose` 6.1 **(código morto)**; `bcryptjs` 3.
- **IA/RAG:** `openai` 4.104, `@qdrant/js-client-rest` 1.15.
- **Upload/extração:** `multer` 2, `pdf-parse` 1.1, `mammoth` 1.11 (DOCX), `exceljs` 4.4 (XLSX).
- **Segurança/HTTP:** `helmet` 7, `cors` 2.8, `compression` 1.7, `express-rate-limit` 8.
- **Validação:** `zod` **4.1** (divergência de major vs front). **Datas:** `date-fns` + `date-fns-tz`.
- **Docs:** `swagger-jsdoc` + `swagger-ui-express`.
- **Testes:** `jest` 30 + `ts-jest`. **Scripts:** `dev/build(tsc)/start`, `prisma:*`, `db:seed`, `docs:generate`, `test`.

### Infraestrutura/serviços externos
SQLite (banco), **OpenAI** (chat `gpt-4o`/`gpt-3.5-turbo`, embeddings `text-embedding-3-small`, extração), **Qdrant** (coleção única `documents`). **Redis citado na doc, mas removido** (substituído pelo model `ActionProposal` — comentário em [schema.prisma:221](../server/prisma/schema.prisma)). **Sem Docker, sem CI/CD, sem `.env`** versionado.

---

## 4. Mapa de diretórios

```
Luminaris/
├── my-app/                      # FRONTEND (Next.js)
│   ├── pages/                   # 13 rotas (index, dashboard/*, documents/*, users/*)
│   ├── features/
│   │   ├── dashboard/
│   │   │   ├── category-views/  # views por categoria (finance é a + madura)
│   │   │   ├── components/forms/# DynamicForm + dynamic-form-fields/ (render por schema)
│   │   │   └── shared/          # useTableRelationLookups, relation-utils
│   │   ├── interview/           # UI de onboarding (chama endpoints inexistentes)
│   │   └── dev/seed/            # seeder client-side (dormant; __isSystem:true)
│   ├── components/
│   │   ├── widgets/             # dashboard-grid, chat, generic-chat, analytics, erp-view
│   │   ├── ui/                  # Galaxy theme, Modal, feedback/, wizard/
│   │   ├── layout/, floating-chat/, error-boundaries/
│   ├── lib/                     # api/ (ApiClient), services/, context/, hoc/, hooks/
│   └── public/locales/{en,pt}/  # i18n
│
├── server/                      # BACKEND (Express)
│   ├── prisma/                  # schema.prisma, 6 migrations, dev.db (+ dev.db duplicado!)
│   └── src/
│       ├── server.ts            # bootstrap
│       ├── config/env.ts        # carregamento de env (não há .env)
│       ├── controllers/         # 15 controllers (adaptadores HTTP)
│       ├── routes/              # 14 routers + docs (OpenAPI)
│       ├── middleware/auth.ts   # JWT + paths protegidos + authz grossa
│       ├── lib/                 # factory(DI), errors, jwt, openai/, vector/, ...
│       └── features/
│           ├── dynamicTables/   # MAIOR: service, presets/, rules/plugins/, governança
│           ├── analytics/       # motor de KPIs (core/engine/kpis/dynamic) — único com testes
│           ├── documents/       # RAG: upload→extração→chunks→embeddings→Qdrant
│           ├── chat/            # ChatService (RAG) + LuminarisAgentService (agente ERP)
│           ├── interview/       # onboarding por IA (LIBRARY-ONLY, sem rota)
│           ├── users/, chatInstances/, chatMessages/, dashboardLayout/,
│           │   structuredData/, reports/
│
└── reports/                     # relatórios técnicos (este + 2 pré-existentes)
```

Escala: **~314 arquivos `.ts/.tsx` no front**, **~272 `.ts` no back**, 40 READMEs, **6 arquivos de teste (todos em analytics)**.

---

## 5. Módulos e funcionalidades

### Funcionalidade: Autenticação e Usuários
**Objetivo:** registro/login JWT, perfil, roles (USER/ADMIN), preferências (locale/currency).
**Arquivos principais:** [authController.ts](../server/src/controllers/authController.ts), [authUtilityController.ts](../server/src/controllers/authUtilityController.ts), [userController.ts](../server/src/controllers/userController.ts), `features/users/*`, [middleware/auth.ts](../server/src/middleware/auth.ts), [jwt.ts](../server/src/lib/jwt.ts).
**Funções/classes:** `register`, `login`, `me`, `logout`, `UserService.createUser/updateUser/deleteUser/getUserById`, `UserPolicy`, `authMiddleware`.
**Fluxo:** `POST /auth/register|login` (público) → bcrypt (cost 12 no register, 10 no service) → emite JWT `{id,username,role}` (7d). `authMiddleware` protege paths por prefixo e injeta `x-user-*`.
**Entradas:** `{username,email,password,name}` / `{identifier|username|email, password}`.
**Saídas:** `{user (sem senha), token}`.
**Tratamento de erro:** `AppError` + `handleApiError`; credenciais inválidas genéricas (bom).
**Testes:** ❌ nenhum.
**Status:** ✅ implementada. **Observações:** `logout` é no-op (não invalida token nem limpa cookie); `register` **não valida** o body (`authController.ts:9`); validações inline dos controllers são mais fracas que os DTOs Zod fortes (`UserDto.ts`).

### Funcionalidade: Dynamic Tables (núcleo do ERP)
**Objetivo:** tabelas "virtuais" por usuário, dirigidas por `schema` JSON, com CRUD de registros validado, relações (FK), soft-delete e governança declarativa.
**Arquivos principais:** [DynamicTableService.ts](../server/src/features/dynamicTables/services/DynamicTableService.ts) (988 linhas), [DynamicTableRepository.ts](../server/src/features/dynamicTables/repositories/DynamicTableRepository.ts), [DynamicTable.dto.ts](../server/src/features/dynamicTables/dtos/DynamicTable.dto.ts), `models/`, `utils/ValidationUtils.ts`.
**Funções/classes:** `createTableData`, `updateTableData`, `deleteTableData`, `getTableDataStream`, `resolveRelations`, `buildZodSchema`, `validateAdvancedRules`, `enforceNoOverlap`, `installPresetAsSystem`.
**Fluxo (create):** `canManageData` → valida contra schema (Zod runtime) → regras avançadas (unique/compositeUnique/requiredIf/compare) → noOverlap → `runRules(beforeCreate)` → `createData` → `runRules(afterCreate)`.
**Entradas:** `{data: Record<string,any>}` validado contra `schema.fields`.
**Saídas:** registro criado/atualizado; soft-delete via `deletedAt`.
**Dependências:** Prisma, KnowledgeGraphService (sync), rules engine.
**Tratamento de erro:** `ValidationError`/`ForbiddenError`/`NotFoundError`.
**Testes:** ❌ nenhum.
**Status:** ✅ implementada e central. **Observações:** governança declarativa (`deleteConstraints`, `immutableAfter`, `lifecycle`, `compositeUnique`, `noOverlap`) é real; porém `isSystem` vem do cliente (Crítico — §14), `compositeUnique` faz full-scan O(n) ([:900](../server/src/features/dynamicTables/services/DynamicTableService.ts)), `findRowsReferencingId` trunca em LIMIT 100 (risco de delete-constraint furar), campos `json` são `z.any()` (sem validação), e `createTable/updateTable/deleteTable` user-facing são código morto por policy.

### Funcionalidade: Rules Engine (efeitos colaterais transacionais)
**Objetivo:** plugins disparam regras de negócio em create/update/delete de registros (estoque, comissões, métricas de cliente, sync de agenda, pipeline de leads).
**Arquivos:** [RuleRegistry.ts](../server/src/features/dynamicTables/rules/RuleRegistry.ts), [RuleTypes.ts](../server/src/features/dynamicTables/rules/RuleTypes.ts), `rules/plugins/*` (10 plugins) + `rules/plugins/sales/*`.
**Plugins:** `SalesPlugin` (orquestra vendas), `StockMovementsApplyPlugin`, `ProductAutoStockPlugin`, `UnitAutoStockPlugin`, `CommissionsPlugin`, `AppointmentsPlugin`, `EmployeesPlugin`, `GoalsPlugin`, `LeadsPlugin`, `LeadsSeedOnUnitPlugin`.
**Fluxo (venda finalizada):** `afterUpdate` → recomputa subtotal/total → `applyCustomerRevenueSideEffects` → (se Finalized) `processSaleStockUpdate` (estoque -= qty, reserva -= qty) → `createMovementsForItems('Out')` → `materializeCommissions`.
**Dependências:** `repository` (escritas diretas, fora do service).
**Testes:** ❌ nenhum.
**Status:** ✅ implementada, ⚠️ **frágil**. **Observações (Crítico, §14):** **sem transação** — falha parcial corrompe; `processSaleStockUpdate` sem guarda de idempotência (double-apply em retry); `ProductAutoStockPlugin` não idempotente (linhas duplicadas de estoque); `RuleRegistry.getApplicable` engole erros de `supports()` (regra some silenciosamente); `validateServiceDuration` é no-op ([AppointmentsPlugin.ts:65-70](../server/src/features/dynamicTables/rules/plugins/AppointmentsPlugin.ts)).

### Funcionalidade: Presets de negócio (montagem do ERP)
**Objetivo:** sistemas pré-montados (ex.: `BeautySalonPreset`, `CoreSystemPreset`) compostos de módulos (Sales, Leads, Products...) que viram tabelas dinâmicas no setup.
**Arquivos:** `features/dynamicTables/presets/` (systems/, modules/, fields/, ai/), [PresetService.ts](../server/src/features/dynamicTables/services/PresetService.ts), [PresetManager.ts](../server/src/features/dynamicTables/presets/PresetManager.ts).
**Fluxo:** `dashboardController.createDashboard` → merge Core + suite → `installPresetAsSystem` (3 passes: cria tabelas sem relações → resolve `@@PRESET_TABLE_KEY::` → troca variante de saleItems por capacidade).
**Status:** ✅ implementada. **Observações:** install **não transacional** (falha deixa ERP meio-instalado); **dois mecanismos paralelos** de lookup de preset (`PresetService` vs `PresetManager`) que podem divergir; `CoreSystemPreset` não está em `tablePresetSuites`.

### Funcionalidade: Analytics / KPIs
**Objetivo:** calcular KPIs financeiros (receita, custo, lucro, cashflow, vendas) sobre as tabelas dinâmicas, com drill-down.
**Arquivos:** [AnalyticsResolver.ts](../server/src/features/analytics/engine/AnalyticsResolver.ts), [AnalyticsService.ts](../server/src/features/analytics/services/AnalyticsService.ts), `kpis/*/Processor.ts`, `core/` (registries, pipeline), `utils/` (DataSanitizer, DateUtils, CurrencyUtils).
**Fluxo:** `GET /analytics/data?key` → resolver acha processor via registry → carrega tabela → processor itera linhas → `ChartDataPoint[]` → enriquece com `fullRecords` → JSON.
**Testes:** ✅ **6 arquivos (revenue, profit, cost, cashflow, sales, KpiEngine)** — boa cobertura de casos de borda (moeda PT-BR, timezone, leap-month, NaN).
**Status:** ✅ a parte mais madura. **Observações (§14):** sem cache (re-processa tudo a cada request); `DataSanitizer` tem **bug de locale US** (vírgula isolada → decimal: `"1,500"`→1.5); `discoverKPIsAsync` **quebrado** (shape de measure incompatível com o Compiler); só `RevenueKpiProcessor` usa streaming (resto carrega tudo em memória); vários processors ignoram timezone do usuário.

### Funcionalidade: Documentos + RAG
**Objetivo:** upload PDF/DOCX/XLSX → extração de texto → chunks → embeddings → Qdrant → busca semântica e chat sobre documentos.
**Arquivos:** [DocumentProcessingPipeline.ts](../server/src/features/documents/services/DocumentProcessingPipeline.ts), [DocumentService.ts](../server/src/features/documents/services/DocumentService.ts), [VectorRepository.ts](../server/src/features/documents/repositories/VectorRepository.ts), `lib/vector/*`, `lib/openai/OpenAIService.ts`.
**Fluxo:** `POST /documents/upload` (multer em memória) → `extractText` **síncrono** → cria `Document` PENDING → `processDocumentAsync` (fire-and-forget) → chunks (500 palavras, overlap 50) → embedding por chunk → upsert Qdrant em lotes de 10 → COMPLETED/ERROR.
**Testes:** ❌ nenhum.
**Status:** ✅ implementada. **Observações (§14):** **vazamento cross-tenant na busca RAG** (Crítico); **sem limite de tamanho/tipo** de arquivo (DoS de memória); extração síncrona bloqueia o event loop; coleção Qdrant única sem índice em `userId`; documentos podem ficar presos em PROCESSING (sem fila/watchdog); `searchDocuments` retorna texto vazio (lê `payload.text`, deveria `textContent`); `KNOWLEDGE_BASE` summary nunca é gerado (stub).

### Funcionalidade: Chat (RAG + Agente ERP)
**Objetivo:** dois modos — RAG sobre documentos (somente leitura) e Agente ERP (function-calling que **propõe** mutações via `ActionProposal`).
**Arquivos:** [ChatService.ts](../server/src/features/chat/services/ChatService.ts), [LuminarisAgentService.ts](../server/src/features/chat/services/LuminarisAgentService.ts), [KnowledgeGraphService.ts](../server/src/features/chat/services/KnowledgeGraphService.ts), `repositories/ActionProposalRepository.ts`.
**Tools do agente:** `list_my_tables`, `get_table_schema`, `query_table_data` (leitura); `request_record_creation`, `request_record_update` (criam `ActionProposal` PENDING). Sem tool de DELETE (apesar de o tipo permitir).
**Fluxo de execução:** cliente reenvia `confirmedProposalId` → `executeProposal` checa `proposal.userId === user.userId` → executa via `DynamicTableService.createTableData/updateTableData` (✅ valida + policy + rules) → deleta a proposal.
**Testes:** ❌ nenhum.
**Status:** ✅ implementada com gate de confirmação. **Observações (§14):** modo selecionado pela **presença de `documentIds`** (não pelo `ChatInstance.type`); execução re-valida (bom) e checa tenant (bom); mas `__isSystem` pode passar pela `data` da proposal; propostas **nunca expiram** (`deleteOldProposals` nunca chamado; status EXECUTED/EXPIRED são código morto); custo OpenAI ilimitado; KnowledgeGraph não atualiza em mudança de dados nem em delete de tabela (fica stale).

### Funcionalidade: Onboarding por IA (Interview) — ⚠️ QUEBRADO NA PONTA
**Objetivo (prometido):** entrevista conversacional que escolhe um preset e customiza tabelas/campos.
**Arquivos:** `features/interview/*` (InterviewService, CustomizationService, FieldCustomizationService).
**Status:** ⚠️ **library-only no backend (sem controller/rota)** — confirmado e admitido no próprio README. O frontend ([useAiInterview.ts](../my-app/features/interview/hooks)) chama `POST /dashboard/ai/ChatInterview` que **não existe**. Além disso há **bugs funcionais**: regex JSON quebrada (`/\\{...\\}/`) em `AIInteractions`/`CustomizationService`; uso errado de `getChatCompletion(prompt, 'gpt-4-turbo')` (o "modelo" vira system prompt; gpt-4-turbo nunca é usado); `StateManager` em memória (perde em restart); `updateTables` substitui o array inteiro (perda de dados). **O onboarding real funcional é o determinístico** `TotalControlSetup` → `POST /dashboard/create` → `installPresetAsSystem`.

### Outras funcionalidades
- **Dashboard layout** (`dashboardLayout`): upsert por usuário (POST que na verdade atualiza, retorna 201 enganoso). ✅
- **Structured data**: XLSX → headers+rows JSON p/ Handsontable. ✅ (só GET exposto).
- **Reports** (`/reports/generate-chart-data`): SSE, RAG sobre documentos gerando gráficos via function-calling. ✅ (compression desligada p/ SSE).
- **Chat instances/messages**: CRUD de instâncias e persistência de mensagens. ✅ (com vazamento de listagem, §14).

---

## 6. Funções/classes/métodos importantes (análise granular)

### Função: `authMiddleware`
**Arquivo:** [middleware/auth.ts](../server/src/middleware/auth.ts)
**Responsabilidade:** valida JWT em rotas protegidas (lista por prefixo) e injeta headers `x-user-id/role/email/name`; aplica authz grossa (GET/DELETE `/api/users` só ADMIN; PUT/PATCH self-only).
**Chamado por:** `server.ts:42` (global). **Chama:** `getAuthToken`, `verifyToken` (jsonwebtoken).
**Efeitos colaterais:** muta `req.headers`. **Erros:** 401 sem token/inválido.
**Criticidade:** alta. **Risco:** lista de paths protegidos é manual (precisa sincronizar com `routes/index.ts`); `jose` (em `authUtils`) é caminho alternativo morto e incompatível (`userId` vs `id`).
**Resumo:** porteiro de toda a API — confere o crachá JWT e carimba quem você é nos headers.

### Função: `DynamicTableService.createTableData` / `updateTableData`
**Arquivo:** [DynamicTableService.ts:384,462](../server/src/features/dynamicTables/services/DynamicTableService.ts)
**Responsabilidade:** validar e persistir um registro, disparando regras antes/depois.
**Fluxo interno:** policy → `isSystem = data.__isSystem` (⚠️) → valida Zod → regras avançadas → noOverlap → beforeCreate/Update → persiste → afterCreate/Update.
**Efeitos colaterais:** escreve no banco; dispara plugins que escrevem em **outras** tabelas — **sem transação**.
**Erros:** Validation/Forbidden/NotFound.
**Criticidade:** **alta**. **Risco:** §14 itens 1 e 2.
**Resumo:** o coração do CRUD do ERP; valida contra o schema do usuário e aciona as regras de negócio.

### Função: `runRules` + `RuleRegistry.getApplicable`
**Arquivo:** [DynamicTableService.ts:681-689](../server/src/features/dynamicTables/services/DynamicTableService.ts), [RuleRegistry.ts:21-37](../server/src/features/dynamicTables/rules/RuleRegistry.ts)
**Responsabilidade:** despachar plugins aplicáveis sequencialmente por fase.
**Risco:** `getApplicable` engole erros de `supports()` → regra crítica (ex.: estoque) pode ser silenciosamente pulada; ordem é apenas a de registro, sem prioridade declarada.
**Resumo:** o "barramento de eventos" do ERP; decide quais regras rodam e em que ordem.

### Função: `SalesPlugin` (afterUpdate, finalização) + `stockSync.processSaleStockUpdate`
**Arquivo:** [SalesPlugin.ts:298-348](../server/src/features/dynamicTables/rules/plugins/SalesPlugin.ts), `rules/plugins/sales/stockSync.ts:213-251`
**Responsabilidade:** ao finalizar uma venda, baixar estoque, gerar movimentos e materializar comissões.
**Efeitos colaterais:** escreve em `productUnits`, `stockMovements`, `commissions`, `customers`.
**Risco:** **crítico** — sem atomicidade + sem guarda de idempotência → double-apply de estoque em retry; falha no meio deixa estoque baixado sem comissão.
**Resumo:** transforma "venda finalizada" em consequências reais no inventário e no financeiro — mas sem rede de segurança transacional.

### Função: `AnalyticsResolver.resolveChartData`
**Arquivo:** [AnalyticsResolver.ts:304](../server/src/features/analytics/engine/AnalyticsResolver.ts)
**Responsabilidade:** orquestrar o cálculo de um KPI: achar processor, carregar dados, executar, enriquecer.
**Chama:** `getProcessor`, `getAllPresetGroupsAsync`, `getTableData`/`getTableDataStream`.
**Risco:** sempre carrega a tabela inteira (`getTableData:336`) — o streaming é parcial; sem cache.
**Resumo:** o motor que pega o pedido de um gráfico e devolve os números calculados.

### Função: `DataSanitizer.extractCurrency`
**Arquivo:** [DataSanitizer.ts:6-40](../server/src/features/analytics/utils/DataSanitizer.ts)
**Responsabilidade:** normalizar moedas "sujas" (`"R$ 1.500,00"`, `"$1,500.50"`) para `number`.
**Risco:** **bug** — vírgula isolada sempre tratada como decimal (`:35`): `"1,500"` (US, mil e quinhentos) vira `1.5`; `"1,234,567"` vira `0`. Correto só para PT-BR.
**Resumo:** higieniza valores monetários — confiável para formato brasileiro, errado para formato americano.

### Função: `ChatService.generateResponse` (modo RAG)
**Arquivo:** [ChatService.ts:84,187-216](../server/src/features/chat/services/ChatService.ts)
**Risco:** **crítico** — passa `documentIds` do cliente para `vectorRepository.search` sem checar posse; `search` não filtra `userId` → vazamento cross-tenant de conteúdo de documentos.
**Resumo:** responde perguntas sobre documentos via busca vetorial — mas não confere se os documentos pedidos são seus.

### Função: `LuminarisAgentService.executeProposal`
**Arquivo:** [LuminarisAgentService.ts:178-200](../server/src/features/chat/services/LuminarisAgentService.ts)
**Responsabilidade:** executar uma proposta confirmada do agente.
**Pontos fortes:** checa `proposal.userId === user.userId` e executa via `DynamicTableService` (valida + policy + rules).
**Risco:** `data` da proposal pode conter `__isSystem`; sem expiração/uso-único robusto.
**Resumo:** o "braço" que efetiva o que o agente propôs, depois da confirmação do usuário.

### Função (frontend): `DynamicForm.renderField`
**Arquivo:** [DynamicForm.tsx:237-256](../my-app/features/dashboard/components/forms/DynamicForm.tsx)
**Responsabilidade:** mapear `field.type` (+ heurísticas de nome) para o componente de input correto.
**Risco:** validação client-side fraca (só required + NaN); `readOnly` é só visual (valores readOnly ainda vão no payload).
**Resumo:** o motor que transforma um schema JSON em um formulário renderizado, campo a campo.

### Função (frontend): `useTableRelationLookups`
**Arquivo:** [useTableRelationLookups.ts](../my-app/features/dashboard/shared/hooks/useTableRelationLookups.ts)
**Responsabilidade:** resolver IDs de FK em texto legível, buscando tabelas-alvo em paralelo.
**Risco:** busca **todas** as linhas das tabelas relacionadas (sem paginação) → pesado em escala.
**Resumo:** transforma `cuid123` em "João da Silva" para exibição.

---

## 7. APIs e contratos

**Auth:** middleware global por prefixo ([auth.ts:5-19](../server/src/middleware/auth.ts)); injeta `x-user-*`. Legenda: **público** / **authed** (JWT) / **admin**.

### Tabela mestre de endpoints (~55 operações)

| Método | Path | Controller.método | Auth |
|---|---|---|---|
| GET | /health | inline | público |
| GET | /api/ | inline (info) | público |
| POST | /api/auth/register | authController.register | público |
| POST | /api/auth/login | authController.login | público |
| GET | /api/auth/me | authUtilityController.me | authed |
| POST | /api/auth/logout | authUtilityController.logout | authed (no-op) |
| GET | /api/users | userController.getUsers | **admin** |
| GET | /api/users/:id | getUserById | authed (qualquer logado ⚠️) |
| POST | /api/users | createUser | público (signup) |
| PUT | /api/users/:id | updateUser | authed + self/admin |
| DELETE | /api/users/:id | deleteUser | **admin** |
| PATCH | /api/users/me/preferences | updateMyPreferences | authed |
| GET | /api/documents | listDocuments | authed |
| GET | /api/documents/list | listDocumentNames | authed |
| GET | /api/documents/:id | getDocumentById | authed |
| DELETE | /api/documents/:id | deleteDocument | authed |
| POST | /api/documents/search | searchDocuments | authed (retorna texto vazio — bug) |
| POST | /api/documents/upload | uploadDocument | authed (sem limite de tamanho ⚠️) |
| PATCH | /api/documents/:id | updateDocument | authed |
| GET | /api/documents/qdrant-status | qdrantStatus | authed (cross-tenant; sombreada por /:id) |
| GET | /api/documents/:id/qdrant | getDocumentQdrant | authed |
| POST | /api/documents/token-cost | computeTokenCost | authed |
| GET | /api/dynamic-tables | listTables | authed |
| POST | /api/dynamic-tables/lookup | resolveRelations | authed |
| GET | /api/dynamic-tables/:tableId | getTable | authed |
| GET | /api/dynamic-tables/:tableId/data | getTableData | authed |
| POST | /api/dynamic-tables/:tableId/data | createTableData | authed |
| PUT | /api/dynamic-tables/:tableId/data/:dataId | updateTableData | authed |
| DELETE | /api/dynamic-tables/:tableId/data/:dataId | deleteTableData | authed |
| POST | /api/chat | postChat | authed |
| GET | /api/chat-instances | listChatInstances | authed (**vaza todos sem ?type** ⚠️) |
| POST | /api/chat-instances | createChatInstance | authed |
| POST | /api/chat-instances/get-or-create | getOrCreateChatInstance | authed |
| PUT | /api/chat-instances/:id | updateChatInstance | authed |
| DELETE | /api/chat-instances/:id | deleteChatInstance | authed |
| GET | /api/chat-messages | listMessages | authed |
| POST | /api/chat-messages | createMessage | authed |
| POST | /api/dashboard/create | createDashboard | authed (one-shot, 403 se já tem tabelas) |
| GET | /api/dashboard/data | getDashboardData | authed |
| GET | /api/dashboard/presets | getDashboardPresets | authed |
| GET | /api/dashboard/presets/:presetKey | getDashboardPresetByKey | authed |
| GET | /api/dashboard/sidebar | getDashboardSidebar | authed |
| DELETE | /api/dashboard/system | deleteUserSystem | authed (destrutivo, sem confirmação extra) |
| GET/POST/GET/PATCH/DELETE | /api/dashboard-layout[/:id] | dashboardLayoutController.* | authed (owner/admin) |
| GET | /api/structured-data/:documentId | getStructuredDataByDocument | authed |
| POST | /api/reports/generate-chart-data | generateChartData (SSE) | authed |
| GET | /api/analytics/drill-down | getDrillDownData | authed |
| GET | /api/analytics/presets[/:presetKey] | getAnalyticsPresets / getPresetAnalyticsPresets | authed |
| GET | /api/analytics/data | getAnalyticsData | authed |
| GET | /api/analytics/presets/:presetKey/data | getPresetAnalyticsData | authed (**ignora :presetKey** — bug) |
| GET | /api/analytics/chart/:chartKey/details | getChartDetails | authed |
| GET | /api/analytics/discover/:tableId | discoverTableKPIs | authed (**quebrado** — §14) |
| GET/POST/PUT/DELETE | /api/analytics/definitions[/:id] | analyticsDefinitionsController.* | authed (**sem validação** de body) |
| GET | /api/docs, /api/docs/openapi.json | swagger | **público** |

### OpenAPI vs realidade
[docs.paths.ts](../server/src/routes/docs.paths.ts) + `public/openapi.json` documentam **~21 de ~55 operações**. **Faltam:** todo o Dashboard, todo o Analytics, register, update/delete de users, vários dynamic-tables. **Errados:** documenta `PATCH/DELETE /api/dynamic-tables/data/{dataId}` (sem `:tableId`, com PATCH) que **não existe** (real: `PUT /:tableId/data/:dataId`). Nenhum controller tem blocos `@openapi`, então `docs.paths.ts` é a única fonte e está defasada.

### Inconsistência de contratos
Três envelopes de resposta coexistem: `{success, data}` (maioria dos controllers), `{code, message}` (middleware/handleApiError), `{error, message}` (handlers 404/500 globais), + eventos SSE. Padronização inexistente.

---

## 8. Modelo de dados

**Banco:** SQLite via Prisma. **11 models + 5 enums.** Multi-tenant por `userId`. ([schema.prisma](../server/prisma/schema.prisma))

```
User (role USER|ADMIN, locale, currency, username/email únicos, password bcrypt)
 ├─1:1─ DashboardLayout (layoutData JSON)
 ├─1:N─ ChatInstance (type DOCUMENT|GENERIC) ─1:N─ ChatMessage (role USER|ASSISTANT)
 ├─1:N─ Document (fileType PDF|DOCX|XLSX, status PENDING|PROCESSING|COMPLETED|ERROR,
 │                documentPurpose DATA_ANALYSIS|KNOWLEDGE_BASE, contextJson)
 │        ├─1:N─ Chunk (texto p/ embeddings Qdrant)
 │        └─1:1─ StructuredData (headers JSON + data JSON p/ Handsontable)
 ├─1:N─ DynamicTable (name, internalName?, category, schema JSON)
 │        └─1:N─ DynamicTableData (data JSON, deletedAt — soft delete)
 ├─1:1─ KnowledgeGraph (data JSON: nós=tabelas, arestas=relações)
 └─1:N─ ActionProposal (action CREATE|UPDATE|DELETE, status PENDING|EXECUTED|EXPIRED, data JSON)
```

### Entidade: DynamicTable / DynamicTableData
**Responsabilidade:** define e armazena as "tabelas virtuais" e seus registros.
**Campos:** `schema` (JSON com `fields[]`: type, required, searchable, hidden, readOnly, relation, validation), `internalName` (chave estável p/ presets/regras), `data` (registro JSON validado **na aplicação**).
**Relações:** FKs são representadas **dentro do JSON** (`field.type='relation'`, `targetTable`), não no banco.
**Usada por:** todo o ERP, analytics, rules, chat agent.
**Riscos:** integridade referencial **não é garantida pelo banco** (relações em JSON); `DynamicTableData` **não tem coluna `userId`** (isolamento indireto via tabela-pai); validação só na app; `compositeUnique`/`unique` checados por scan/SQL raw com `json_extract` (injeção mitigada só por regex de nome de campo).

### Entidade: ActionProposal
**Responsabilidade:** propostas temporárias do agente (substitui Redis).
**Riscos:** `deleteOldProposals` nunca é chamado (sem TTL); status `EXECUTED`/`EXPIRED` são código morto (propostas são deletadas, não transicionadas).

### Migrations (6, 2025-09 → 2026-04)
Inicial → `ChatInstance.type` → `KnowledgeGraph` → `ActionProposal` → `internalName` → `deletedAt` + `User.locale/currency`. Consistentes com `schema.prisma`; sem perda de dados (rebuilds SQLite preservam via cópia).

### ⚠️ Dois `dev.db`
Existem `server/prisma/dev.db` (1.58 MB, populado) **e** `server/prisma/prisma/dev.db` (188 KB). Não há `.env` no repo. Causa provável: `file:./dev.db` relativo resolvido contra cwd diferentes; o `seed.ts` **hardcoda** `file:./dev.db` ignorando `DATABASE_URL`. O banco real é o de 1.58 MB. [INFERÊNCIA — binário não aberto].

---

## 9. Fluxos ponta a ponta

### Fluxo: Criar uma venda (sales) — o mais crítico
1. Usuário preenche `SalesCreateModal` (front) → `useSalesWizard` valida (unidade, cliente, ≥1 item, preço>0).
2. `FinanceService.createSaleWithItems` → `POST /dynamic-tables/:salesTableId/data` (cria sale) → extrai `id` → `Promise.all` criando cada item via `POST /dynamic-tables/:saleItemsTableId/data`.
3. Backend: cada `createTableData` → valida schema → `runRules`.
4. `SalesPlugin.beforeCreate` (item): valida produto×serviço, checa estoque/reserva, auto-cria appointment p/ serviço.
5. Ao finalizar (status→Finalized via `updateTableData`): `SalesPlugin.afterUpdate` → baixa estoque, gera `stockMovements`, materializa `commissions`, atualiza métricas do `customer`.
6. Resposta 201 por registro.
**Estado alterado:** sales, saleItems, productUnits, stockMovements, commissions, customers, appointments.
**Erros:** falha no item N **não faz rollback** dos anteriores nem da sale (front: N+1 toasts de sucesso; back: estado inconsistente).
**Dependências:** rules engine, Prisma.
**Testes:** ❌.
**Risco:** 🔴 Crítico — não atômico ponta a ponta (front E back).

### Fluxo: Chat com agente ERP → ação no banco
1. `POST /api/chat` (sem `documentIds`) → modo Agente → injeta `AGENT_SYSTEM_PROMPT` + dump do KnowledgeGraph (todas as tabelas/campos/enums do usuário).
2. Loop de até 5 tool-calls (`gpt-4o`): agente pode `query_table_data` (lê) ou `request_record_creation/update` (cria `ActionProposal` PENDING).
3. Resposta `type:'ACTION_PROPOSAL'` → front abre `CommandConfirmationModal`.
4. Usuário confirma → `POST /api/chat` com `confirmedProposalId` → `executeProposal` (checa tenant) → `DynamicTableService` (valida+policy+rules) → deleta proposal.
**Risco:** gate de confirmação só é "humano" se o front mostrar o modal; conteúdo de `query_table_data` (controlável) pode influenciar o agente (prompt injection) — mas escrita exige confirmação. `__isSystem` pode passar pela `data`.

### Fluxo: Upload e RAG de documento
1. `POST /documents/upload` (multer memória, **sem limite**) → `extractText` síncrono → cria Document PENDING → processa em background (chunks → embeddings → Qdrant).
2. `POST /api/chat` com `documentIds` → embed da pergunta → `vectorRepository.search(emb, 10, documentIds)` → contexto → `gpt-3.5-turbo`.
**Risco:** 🔴 `search` não filtra `userId` → passar `documentId` de outro usuário vaza o conteúdo.

### Fluxo: Setup inicial (onboarding determinístico)
1. `/dashboard/setup` (TotalControlSetup) → `GET /dashboard/presets` → escolhe preset → `POST /dashboard/create {mode:'custom', presetKey, removedTables, addedFields}`.
2. `installPresetAsSystem` cria ~16 tabelas em 3 passes. **403 se já há tabelas** (one-shot).
**Risco:** install não transacional; o caminho "IA" (`/dashboard/ai/ChatInterview`) está **quebrado** (endpoint inexistente).

---

## 10. Frontend / interface

### Bootstrap e estado
[_app.tsx](../my-app/pages/_app.tsx): `ToastProvider → ErrorBoundary → AuthProvider → CurrencyProvider → DashboardDataProvider`. Navbar oculta em login/signup; FloatingChat só em `/dashboard/*`. `appWithTranslation` (i18n). `_document.tsx` injeta script de tema (anti-flash).

### Camada de dados
[ApiClient](../my-app/lib/api/api-client.ts) (singleton): injeta `Authorization: Bearer <cookie auth_token>` + `x-user-timezone`; em erro, dispara toast via `notify`. **Sem timeout/retry.** Services por domínio (`auth, user, document, finance, analytics, location, dynamic-table`). ⚠️ `document.service.ts` faz `fetch` cru (bypass do ApiClient) com parse manual de cookie.

### Auth (front)
[AuthContext](../my-app/lib/context/AuthContext.tsx): token em cookie **não-httpOnly** (exposto a XSS); `checkAuthState` chama `/auth/me` no mount **e a cada navegação**; `withAuth` HOC protege rotas **client-side** (exceto `/dashboard` que valida em SSR).

### Render dirigido por schema (o coração do front)
[DynamicForm](../my-app/features/dashboard/components/forms/DynamicForm.tsx) mapeia `field.type` → componente (Input, Currency, Percentage, Select, Relation, CepAddress, Textarea, Checkbox, Slider, WorkSchedule), com heurísticas por nome (price→currency, cep→address). [GenericTabbedView](../my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx) + `useGenericData` montam tabela+CRUD a partir do schema. `useTableRelationLookups` resolve FKs em texto.

### Telas/Componentes principais

| Tela/Componente | Arquivo | Papel | Riscos |
|---|---|---|---|
| Dashboard (CRM/ERP) | `pages/dashboard/index.tsx` | hub; SSR valida token; roteia categorias | bug de base URL no SSR (default sem `/api`) |
| DashboardGrid | `components/widgets/dashboard-grid.tsx` | grid de widgets, persiste layout (debounce 1500ms) | save sobrescreve tudo; corrida de layout |
| Finance (sales/expenses/analytics) | `features/dashboard/category-views/finance/*` | view mais madura | sale não atômica; N+1 toasts; analytics hardcoda BRL |
| Chat widgets | `components/widgets/chat|generic-chat` | RAG + agente; `CommandConfirmationModal` | **dois stacks de hooks duplicados**; erros viram "mensagens" do assistente |
| Profile | `pages/users/profile.tsx` | perfil + botão "Make Admin" | botão de auto-promo (bloqueado pelo back) + billing mock |
| Onboarding (AiInterviewSetup) | `features/interview/*` | entrevista por IA | chama endpoints inexistentes → não funcional |
| Subscription | `pages/users/subscription.tsx` | pricing | 100% mock, sem backend |

### Observações de frontend
- **ErrorBoundary** captura `window.error` E `unhandledrejection` com `preventDefault` → qualquer promise rejeitada derruba a app inteira (sem isolamento por widget).
- **Supressão global de erros em produção** (`_app.tsx:37-76`) — sobrescreve `console.error` e silencia erros → péssima observabilidade.
- **Casing de imports** (`UseChatInstance` vs `useChatInstance`) quebra em build case-sensitive (Linux/CI).
- Muitas strings PT-BR hardcoded fora do i18n; `console.log`/DEBUG em produção; várias views bespoke duplicam o padrão genérico (Expenses ~90% replicável pelo GenericTable).
- Código morto: `ChatWidget.tsx`, `useGenericChat.ts` (stub), `analytics/kpi/*` e `ChartRenderer` (não usados pelos dashboards ativos).

---

## 11. Integrações externas

### Integração: OpenAI
**Objetivo:** chat (RAG `gpt-3.5-turbo` / agente `gpt-4o`), embeddings (`text-embedding-3-small`, 1536d), extração de dados/tabular, entrevista.
**Arquivos:** [lib/openai/OpenAIService.ts](../server/src/lib/openai/OpenAIService.ts), [lib/vector/embedding.ts](../server/src/lib/vector/embedding.ts).
**Config:** `OPENAI_API_KEY` (throw se ausente; não logada).
**Falhas possíveis:** rate limit, timeout, JSON malformado do modelo.
**Tratamento:** re-throw genérico; `extractStructuredData` tenta reparar JSON e cai p/ modelo mais caro; `RequestLock` deduplica por hash fraco (colisão → resposta trocada).
**Risco:** 🟠 Alto — **custo ilimitado** (sem `max_tokens`, sem cap por usuário, embedding por chunk sem batch, loop de 5 chamadas no agente); `JSON.parse` dos tool args sem try/catch (500); prompt injection via conteúdo de documento/registro.

### Integração: Qdrant (vetores)
**Objetivo:** armazenar/buscar embeddings de chunks (RAG).
**Arquivos:** [VectorRepository.ts](../server/src/features/documents/repositories/VectorRepository.ts), `lib/vector/qdrant*.ts`.
**Config:** `QDRANT_URL`/`QDRANT_API_KEY`. Coleção única `documents` (não por tenant).
**Risco:** 🔴 Crítico — `search()` filtra só por `documentId`, **sem `userId`** → vazamento cross-tenant; sem índice em `userId`; inicializador não derruba app se Qdrant ausente.

### Integração: ViaCEP (front)
`location.service.ts` chama `https://viacep.com.br/ws/{cep}/json/` direto p/ autopreencher endereço. Risco baixo (público, sem segredo). Hardcoded.

### Redis
**Removido.** Citado no README do server, mas substituído por `ActionProposal` no banco. Não há cliente Redis no código.

---

## 12. Testes

### Cobertura atual
- **Bem coberto:** apenas o **motor de Analytics** — 6 arquivos de teste (revenue, profit, cost, cashflow, sales, KpiEngine), com bons casos de borda (moeda PT-BR, timezone, leap-month, NaN, float drift). Jest + ts-jest.
- **Mal coberto / sem testes:** **TODO o resto** — auth, users, dynamicTables (CRUD/validação/governança), **rules engine** (o caminho não-transacional crítico), documents/RAG, chat/agente, interview, controllers, rotas, integração Express/Prisma, e **100% do frontend**.

### Testes críticos existentes
`server/src/features/analytics/**/__tests__/*.{test,spec}.ts`.

### Lacunas e riscos de regressão
- O **rules engine** (vendas → estoque/comissões) é a área mais arriscada e tem **zero testes**. Qualquer mudança pode corromper inventário/financeiro silenciosamente.
- **Auth/authz** sem testes — regressão de isolamento de tenant passaria despercebida.
- Scripts de "audit-kpi" e `test-all-kpis.ts` **não são testes** (sem asserts ou redundantes; fora do `npm test`).
- Bugs nos próprios testes: ternário sempre-verdadeiro ([SalesProfitByProductProcessor.test.ts:114](../server/src/features/analytics/kpis/sales/__tests__/SalesProfitByProductProcessor.test.ts)), assert de performance flaky (`<500ms`), `console.log` esquecido.

### Testes recomendados (prioridade)
1. Integração do `createTableData`/rules (venda completa) com asserts de consistência e de rollback.
2. Isolamento de tenant: RAG search, chat-instances, dynamic-tables.
3. Auth: middleware (paths protegidos, authz), JWT, fluxo register/login.
4. Unit: `DataSanitizer` (locale US), `DateUtils` (timezone).
5. Smoke E2E do onboarding determinístico.

---

## 13. Configuração e operação

### Execução
**Backend:**
```bash
cd server && npm install
npm run dev                  # ts-node-dev (hot reload), :3001
npm run build && npm start   # tsc → node dist/server.js
npx prisma generate / migrate dev / studio
npm run db:seed              # cria admin@admin.com / Admin@123 (idempotente)
npm test                     # jest (só analytics)
npm run docs:generate        # gera public/openapi.json
```
**Frontend:**
```bash
cd my-app && npm install
npm run dev                  # next dev, :3000
npm run build && npm start
npm run lint
```

### Variáveis de ambiente
| Variável | Uso | Onde |
|---|---|---|
| `DATABASE_URL` | conexão Prisma (`file:./dev.db`) | server (⚠️ sem `.env`; seed hardcoda) |
| `JWT_SECRET` | assina tokens (⚠️ fallback inseguro) | server `lib/jwt.ts` |
| `JWT_EXPIRES_IN` | expiração (default 7d) | server |
| `OPENAI_API_KEY` | IA (chat/embeddings) | server (throw se ausente) |
| `QDRANT_URL` / `QDRANT_API_KEY` | vetores RAG | server |
| `PORT` | porta (default 3001) | server |
| `NEXT_PUBLIC_API_BASE_URL` | base da API (default `http://localhost:3001/api`) | front |
| `NEXT_PUBLIC_ENABLE_DEV_SEED` | habilita seeder client-side (dormant) | front |

### Dependências operacionais
SQLite (arquivo), OpenAI (chave), Qdrant (instância). **Sem Docker, sem CI/CD, sem migração automatizada em deploy, sem observabilidade real** (`lib/monitoring.ts` existe mas é básico; logs JSON via `logger.ts`). **Não invente comandos além destes** — são os que o projeto declara.

### Scripts utilitários
`scripts/backfill-internal-names.ts` (migração de dados, idempotente), `backfill.sql` (**morto** — nomes de tabela errados), `diagnose-sales.ts` (diagnóstico), `test-all-kpis.ts` (harness manual), `src/scripts/audit-*-kpi.ts` (validadores ground-truth manuais).

---

## 14. Diagnóstico arquitetural

### Pontos fortes
- **Disciplina de camadas real no backend** (Controller→Service→Repository→Policy) com DI por factory — fácil de navegar e testar. ([factory.ts](../server/src/lib/factory.ts))
- **Render dirigido por schema** elegante: backend e frontend compartilham a abstração de "schema da tabela"; adicionar uma tabela não exige código de UI.
- **Erros tipados** (`AppError` + `handleApiError`) e **DTOs Zod** na borda.
- **Motor de Analytics** maduro, testado, com aritmética cents-safe nas somas, streaming parcial e timezone-aware (DateUtils).
- **Documentação interna excelente** (40 READMEs, ARCHITECTURE.md) — raro e valioso.
- **Gate de confirmação** no agente ERP (human-in-the-loop antes de escrever) e re-validação na execução.
- **Soft-delete** e governança declarativa (deleteConstraints/immutable/lifecycle) bem pensadas.

### Pontos fracos
- **Ausência de transações** onde mais importa (rules engine multi-tabela) — falha de design estrutural.
- **Isolamento de tenant inconsistente** — alguns caminhos checam `userId`, outros não (RAG search, chat-instances listing, qdrant-status).
- **Confiança em input do cliente** para decisões de segurança (`__isSystem` no body).
- **Arquivos grandes** (`DynamicTableService` 988, `AnalyticsResolver` 857, `ProfitKpiProcessor` 767 com ~250 linhas de debug morto).
- **Duplicação**: dois prisma singletons, duas libs JWT, duas classes `OpenAIService`, dois stacks de hooks de chat no front, três implementações de tabela (Generic/Expenses/Sales), dois mecanismos de preset lookup.
- **Testes quase ausentes** fora de analytics.
- **Observabilidade ruim** (supressão global de erros no front; logs no console).
- **Doc-vs-código drift**: OpenAPI cobre 21/55 endpoints; READMEs descrevem features (interview) que não estão ligadas.
- **Config frágil**: sem `.env`, dois `dev.db`, CORS aberto, rate limit desativado.

### Riscos técnicos (por severidade)

#### 🔴 Crítico

**Risco: Corrupção de dados por ausência de transações no rules engine**
- **Onde:** [DynamicTableService.ts:393-398,557-558,635-642](../server/src/features/dynamicTables/services/DynamicTableService.ts); [IDynamicTableRepository.ts](../server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts) (sem primitivo de transação); `SalesPlugin`/`stockSync`.
- **Por quê:** escrita primária + efeitos colaterais cross-table são awaits separados, não atômicos.
- **Impacto:** estoque/comissões/métricas inconsistentes em falha parcial ou retry; `processSaleStockUpdate` sem guarda → double-apply.
- **Recomendação:** envolver create/update/delete + regras em `prisma.$transaction`; tornar efeitos idempotentes (guarda de transição de status).

**Risco: Bypass de governança via `__isSystem` controlado pelo cliente**
- **Onde:** [DynamicTableService.ts:389,467](../server/src/features/dynamicTables/services/DynamicTableService.ts).
- **Por quê:** `isSystem = !!dataDto.data?.__isSystem` — qualquer usuário envia `{data:{__isSystem:true}}` e pula readOnly/immutable/lifecycle/overlap.
- **Impacto:** editar campos read-only (estoque, reserva), mutar registros finalizados, furar checagem de agenda.
- **Recomendação:** derivar `isSystem` do call site (sistema/seed), nunca do payload; remover `__isSystem` de todo dado de usuário/agente.

**Risco: Vazamento cross-tenant no RAG**
- **Onde:** [ChatService.ts:193](../server/src/features/chat/services/ChatService.ts), [VectorRepository.ts:156-163](../server/src/features/documents/repositories/VectorRepository.ts).
- **Por quê:** `search()` filtra só `documentId`; sem checagem de posse dos `documentIds` do cliente.
- **Impacto:** usuário lê chunks/conteúdo de documentos de outro tenant.
- **Recomendação:** adicionar filtro `userId` no `search` (como já faz `searchVectors`) e validar posse dos `documentIds`.

**Risco: Segredo JWT inseguro**
- **Onde:** [jwt.ts:4,14-19](../server/src/lib/jwt.ts).
- **Por quê:** fallback `'your-jwt-secret-key'`; sem allowlist de algoritmo.
- **Impacto:** forja de tokens admin se `JWT_SECRET` não for definido.
- **Recomendação:** exigir `JWT_SECRET` (falhar no boot se ausente); pinar `algorithms:['HS256']`.

#### 🟠 Alto
- **Listagem de chat-instances vaza tenants** ([ChatInstanceService.ts:102](../server/src/features/chatInstances/services/ChatInstanceService.ts)) — `getAllInstances` sem filtro `userId`. → escopar por usuário.
- **Upload sem limite de tamanho/tipo** ([documentsController.ts:11](../server/src/controllers/documentsController.ts)) — `memoryStorage` sem `limits`/`fileFilter`. → DoS de memória; validar magic bytes.
- **`discoverKPIsAsync` quebrado** ([AnalyticsService.ts:442](../server/src/features/analytics/services/AnalyticsService.ts) vs [Compiler.ts:49-65](../server/src/features/analytics/core/pipeline/Compiler.ts)) — shape de measure sem `type` → throw/zero.
- **Bug de locale no `DataSanitizer`** ([:35](../server/src/features/analytics/utils/DataSanitizer.ts)) — valores US viram errados.
- **Custo OpenAI ilimitado** (sem max_tokens/cap/batch) — risco financeiro.
- **Supressão global de erros no front** ([_app.tsx:37-76](../my-app/pages/_app.tsx), [ErrorBoundary.tsx:31-57](../my-app/components/error-boundaries/ErrorBoundary.tsx)) — observabilidade nula; uma rejection derruba a app.
- **Zero testes em caminhos críticos** (rules, auth, RAG).
- **Credenciais hardcoded no seed** ([seed.ts:13-14](../server/prisma/seed.ts)) — `admin@admin.com`/`Admin@123` (backdoor se rodar em prod).
- **Extração de documento síncrona** bloqueia event loop.

#### 🟡 Médio
- **CORS totalmente aberto** ([server.ts:19](../server/src/server.ts)).
- **Rate limit efetivamente desativado** (5000/15min) — sem proteção a brute-force no login.
- **Logout no-op** + token em cookie não-httpOnly — sem revogação; exposto a XSS.
- **Botão "Make Admin"** ([profile.tsx:225](../my-app/pages/users/profile.tsx)) — UI enganosa shipada; **bloqueada pelo backend** (`canChangeRole`), mas depende inteiramente desse único check.
- **`GET /api/users/:id`** acessível a qualquer logado (não só admin).
- **Onboarding por IA quebrado** (endpoints inexistentes + bugs de regex/modelo).
- **OpenAPI defasado** (21/55, paths errados).
- **`installPresetAsSystem` não transacional** (ERP meio-instalado em falha).
- **KnowledgeGraph stale** (não sincroniza em mudança de dados/delete de tabela).
- **`compositeUnique` O(n) full-scan** e `findRowsReferencingId` LIMIT 100 (delete-constraint pode furar).
- **Dois `dev.db`** e seed que hardcoda URL.
- **Casing de imports** quebra em FS case-sensitive.

#### 🟢 Baixo
- Duplicações (prisma singleton, jose, OpenAIService, hooks de chat, tabelas no front).
- Código morto (interview backend, `ChatWidget`, `analytics/kpi/*`, `backfill.sql`, debug em ProfitKpiProcessor).
- Strings PT-BR hardcoded fora do i18n; `console.log` em produção; `RequestLock` por hash fraco.
- Status 201 enganoso no upsert de layout; envelopes de resposta inconsistentes.

---

## 15. Recomendações priorizadas

### P0 — Urgente (pode quebrar/corromper ou expor dados)
1. **Transações no rules engine.** Envolver `createTableData`/`updateTableData`/`deleteTableData` + plugins em `prisma.$transaction`; tornar `processSaleStockUpdate` idempotente. *(Crítico — integridade)*
2. **Remover `__isSystem` do payload.** Derivar `isSystem` do call site; sanitizar dados de usuário/agente. *(Crítico — segurança)*
3. **Filtrar `userId` no RAG search** e validar posse dos `documentIds`. *(Crítico — vazamento)*
4. **Exigir `JWT_SECRET`** (falhar no boot) + pinar algoritmo. *(Crítico — auth)*
5. **Escopar `chat-instances` (e revisar todo endpoint que faz `getAll*`) por `userId`.** *(Alto — vazamento)*
6. **Limites de upload** (tamanho + tipo por magic bytes). *(Alto — DoS)*

### P1 — Importante (estrutural)
7. **Suíte de testes** para rules engine (venda completa + rollback), auth/isolamento de tenant, `DataSanitizer`/`DateUtils`.
8. **Caps de custo OpenAI** (max_tokens, batch de embeddings, rate-limit por usuário) + try/catch no `JSON.parse` dos tool args.
9. **Corrigir/remover `discoverKPIsAsync`** (shape do Compiler) e o bug de locale do `DataSanitizer`.
10. **Reativar observabilidade no front** (remover supressão global; isolar ErrorBoundary por widget).
11. **Cache/snapshot de KPIs** (já roadmapeado em `reports/kpi_engine_roadmap.md`).
12. **Processamento de documento assíncrono** (fila/worker) + watchdog para PENDING/PROCESSING preso.
13. **CORS restrito + rate limit real no login + logout que limpe cookie.**

### P2 — Desejável (qualidade/manutenção)
14. **Sincronizar OpenAPI** com as rotas reais (gerar via JSDoc nos controllers) e padronizar envelope de resposta.
15. **Decidir o destino do onboarding por IA**: ligar os serviços (criar rotas + corrigir regex/uso de modelo + persistir estado) ou remover a UI que chama endpoints inexistentes.
16. **Remover duplicações** (prisma singleton, `jose`, hooks de chat, `ChatWidget`/`useGenericChat`, `analytics/kpi/*`, `backfill.sql`) e o debug morto em `ProfitKpiProcessor`.
17. **Consolidar `dev.db`** e adicionar `.env.example`; remover hardcode no `seed.ts`.
18. **Quebrar arquivos grandes** e mover regra de negócio para fora dos plugins onde fizer sentido.
19. **Transação no `installPresetAsSystem`**; idempotência no `ProductAutoStockPlugin`.

### P3 — Futuro (evolução)
20. **Migrar SQLite → PostgreSQL** (já preparado segundo o roadmap) — habilita concorrência, transações robustas e índices em JSON.
21. **Integridade referencial real** para relações (hoje em JSON) ou validação assíncrona consistente.
22. **i18n completo** (eliminar strings PT-BR hardcoded).
23. **Snapshots/deltas real-time de KPIs** e autoria validada de "Custom KPIs" (Pipeline declarativo).
24. **CI/CD + Docker** + cobertura mínima como gate.
25. **Endurecer prompt injection** (delimitadores, verificação de intenção antes de escrita, nonce na confirmação de proposta).

---

## 16. Apêndice: índice de arquivos analisados

> Lidos integralmente por mim (verificação): em **negrito**. Demais: varridos por subagentes de leitura e/ou citados.

### Backend — núcleo e config
- **[server.ts](../server/src/server.ts)** — bootstrap, middlewares, CORS aberto, rate limit, handlers.
- **[routes/index.ts](../server/src/routes/index.ts)** — agrega sub-routers.
- **[schema.prisma](../server/prisma/schema.prisma)** — modelo de dados (11 models).
- **[lib/jwt.ts](../server/src/lib/jwt.ts)** — geração/verificação JWT (fallback inseguro).
- [config/env.ts](../server/src/config/env.ts), [lib/factory.ts](../server/src/lib/factory.ts), [lib/errors.ts](../server/src/lib/errors.ts), [lib/apiUtils.ts](../server/src/lib/apiUtils.ts), [middleware/auth.ts](../server/src/middleware/auth.ts).

### Backend — features
- **[features/dynamicTables/services/DynamicTableService.ts](../server/src/features/dynamicTables/services/DynamicTableService.ts)** — núcleo do ERP (`__isSystem`, runRules).
- **[features/dynamicTables/repositories/IDynamicTableRepository.ts](../server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts)** — sem transação.
- `features/dynamicTables/rules/**` — RuleRegistry + 10 plugins + sales/* (cérebro transacional).
- `features/dynamicTables/presets/**` — systems/modules/fields/ai.
- **[features/analytics/utils/DataSanitizer.ts](../server/src/features/analytics/utils/DataSanitizer.ts)**, **[core/pipeline/Compiler.ts](../server/src/features/analytics/core/pipeline/Compiler.ts)**, **[services/AnalyticsService.ts](../server/src/features/analytics/services/AnalyticsService.ts)** (discover), [engine/AnalyticsResolver.ts](../server/src/features/analytics/engine/AnalyticsResolver.ts), `kpis/**`.
- **[features/chat/services/ChatService.ts](../server/src/features/chat/services/ChatService.ts)**, [LuminarisAgentService.ts](../server/src/features/chat/services/LuminarisAgentService.ts), [KnowledgeGraphService.ts](../server/src/features/chat/services/KnowledgeGraphService.ts).
- **[features/chatInstances/services/ChatInstanceService.ts](../server/src/features/chatInstances/services/ChatInstanceService.ts)** — vazamento de listagem.
- **[features/documents/repositories/VectorRepository.ts](../server/src/features/documents/repositories/VectorRepository.ts)** — search sem userId. [services/DocumentProcessingPipeline.ts](../server/src/features/documents/services/DocumentProcessingPipeline.ts), [lib/openai/OpenAIService.ts](../server/src/lib/openai/OpenAIService.ts), `lib/vector/**`.
- **[features/users/services/UserService.ts](../server/src/features/users/services/UserService.ts)** — gate `canChangeRole`. **[controllers/userController.ts](../server/src/controllers/userController.ts)**, [authController.ts](../server/src/controllers/authController.ts).
- `features/interview/**` — library-only (sem rota). `features/{dashboardLayout,structuredData,reports}/**`.
- `controllers/dashboardController.ts` (bridge de presets), `routes/docs.paths.ts` (OpenAPI defasado).

### Backend — testes/scripts/migrations
- `features/analytics/**/__tests__/*.{test,spec}.ts` (6 — única cobertura). `scripts/*`, `src/scripts/audit-*-kpi.ts`, **[prisma/seed.ts](../server/prisma/seed.ts)** (creds hardcoded), `prisma/migrations/*`.

### Frontend
- **[pages/_app.tsx](../my-app/pages/_app.tsx)** (providers + supressão de erro). [pages/dashboard/index.tsx](../my-app/pages/dashboard/index.tsx), **[pages/users/profile.tsx](../my-app/pages/users/profile.tsx)** (Make Admin), `pages/users/subscription.tsx` (mock).
- [lib/api/api-client.ts](../my-app/lib/api/api-client.ts), [lib/context/AuthContext.tsx](../my-app/lib/context/AuthContext.tsx), [lib/services/*.service.ts](../my-app/lib/services), [lib/hoc/withAuth.tsx](../my-app/lib/hoc/withAuth.tsx).
- [features/dashboard/components/forms/DynamicForm.tsx](../my-app/features/dashboard/components/forms/DynamicForm.tsx) + `dynamic-form-fields/*`, [category-views/shared/GenericTabbedView.tsx](../my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx), `shared/hooks/useTableRelationLookups.ts`.
- `features/dashboard/category-views/finance/**` (sales/expenses/analytics), inventory/people/products/services/planning/leads/kanban.
- `components/widgets/{dashboard-grid,chat,generic-chat,analytics,erp-view}/**`, `components/ui/**`, `components/error-boundaries/ErrorBoundary.tsx`.
- `features/interview/**` (UI que chama endpoints inexistentes), `features/dev/seed/**`.

### Relatórios pré-existentes (verificados)
- [reports/analytics_architecture_report.md](analytics_architecture_report.md) — bom panorama, mas com imprecisões corrigidas neste relatório (streaming superestimado; cents-safe parcial; DataSanitizer não é à prova de US; testes existem).
- [reports/kpi_engine_roadmap.md](kpi_engine_roadmap.md) — roadmap de cache/snapshots ainda pendente (válido).

---

*Fim do relatório. Nenhuma linha de código foi alterada durante esta auditoria.*
