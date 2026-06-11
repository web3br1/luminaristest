# Auditoria Técnica Consolidada — Luminaris

> **Documento único** — fusão das duas passadas de auditoria (primeira: 2026-06-10; complementar: 2026-06-11).
> **Não houve alteração de código** — apenas leitura e análise.
> Metodologia: reconhecimento geral + 15 varreduras profundas (subagentes read-only por domínio) + verificação manual pessoal nos achados de maior severidade (listados no §20).
> Toda afirmação técnica importante aponta para `arquivo:linha`. Onde há dúvida: **[INCERTO]**. Onde é dedução: **[INFERÊNCIA]**.
> Data de fechamento: 2026-06-11.

---

## Sumário de navegação

| Seção | Tema |
|---|---|
| §1 | Sumário executivo |
| §2 | Visão geral da arquitetura |
| §3 | Stack técnica |
| §4 | Higiene de dependências |
| §5 | Mapa de diretórios |
| §6 | Módulos e funcionalidades |
| §7 | Funções e métodos importantes |
| §8 | APIs e contratos |
| §9 | Modelo de dados |
| §10 | Fluxos ponta a ponta |
| §11 | Frontend / interface |
| §12 | Bundle, tema e acessibilidade |
| §13 | i18n |
| §14 | Integrações externas |
| §15 | Testes |
| §16 | Configuração e operação |
| §17 | Privacidade, LGPD e órfãos de dados |
| §18 | Artefatos commitados e higiene de repositório |
| §19 | Métricas de qualidade de código |
| §20 | Diagnóstico arquitetural (riscos consolidados) |
| §21 | Recomendações priorizadas (P0–P3 unificado) |
| §22 | Apêndice — verificações pessoais |

---

## §1. Sumário executivo

**Luminaris** é uma plataforma SaaS B2B do tipo **"ERP dinâmico dirigido por schema" + Document Intelligence (RAG) + Analytics financeiro + Agente de IA conversacional**. Cada usuário monta seu próprio "sistema" (tabelas, campos, regras) a partir de *presets* de negócio, opera CRUD por views especializadas, conversa com um agente que propõe mutações no ERP, e visualiza KPIs calculados sobre seus próprios dados.

São **dois aplicativos independentes** (não é monorepo, não é repositório git):
- **`server/`** — API REST Express + TypeScript, arquitetura *feature-based* em camadas limpas (Controller → Service → Repository → Policy) com DI por *factory* singleton, Prisma + **SQLite**, JWT, OpenAI + Qdrant.
- **`my-app/`** — Frontend Next.js 15 (Pages Router) + React 19 + TypeScript, renderização **dirigida por schema** (formulários/tabelas montados do JSON da tabela), dashboard de widgets, i18n en/pt.

**Maturidade geral: média.** A arquitetura documental é excelente (40 READMEs, 2 `ARCHITECTURE.md` detalhados) e a disciplina de camadas é real no backend. As partes mais maduras — o **motor de Analytics** e a **view de finance** — são tecnicamente sólidas. Porém há **lacunas estruturais graves**: ausência total de transações de banco no "cérebro" transacional do ERP (rules engine), múltiplos **vazamentos cross-tenant**, **bypass de governança controlável pelo cliente**, biblioteca JWT vulnerável sem allowlist, e ~95% do sistema sem testes.

### Top 8 riscos (verificados na fonte)

| # | Severidade | Risco | Onde |
|---|---|---|---|
| R1 | 🔴 Crítico | Sem transações no rules engine — falha parcial corrompe estoque/comissões | [DynamicTableService.ts:393-398](../server/src/features/dynamicTables/services/DynamicTableService.ts) |
| R2 | 🔴 Crítico | Bypass de governança via `__isSystem` no corpo JSON do cliente | [DynamicTableService.ts:389,467](../server/src/features/dynamicTables/services/DynamicTableService.ts) |
| R3 | 🔴 Crítico | Vazamento cross-tenant no RAG (busca sem filtro userId) | [VectorRepository.ts:156-163](../server/src/features/documents/repositories/VectorRepository.ts) |
| R4 | 🔴 Crítico | JWT: `jsonwebtoken` 8.5.1 vulnerável + fallback de segredo + sem allowlist de algoritmo | [jwt.ts:4,19](../server/src/lib/jwt.ts) |
| R5 | 🟠 Alto | Deleção de usuário não apaga vetores Qdrant (LGPD art. 18 VI) | [UserRepository.ts:194-198](../server/src/features/users/repositories/UserRepository.ts) |
| R6 | 🟠 Alto | Chat-instances vaza todos os tenants em `GET /api/chat-instances` sem `?type` | [ChatInstanceService.ts:102](../server/src/features/chatInstances/services/ChatInstanceService.ts) |
| R7 | 🟠 Alto | Upload sem limite de tamanho/tipo — DoS de memória | [documentsController.ts:11](../server/src/controllers/documentsController.ts) |
| R8 | 🟠 Alto | PII em logs sem redação (registro completo, queries de chat, texto de chunk) | [DynamicTableService.ts:673](../server/src/features/dynamicTables/services/DynamicTableService.ts) et al. |

**Funcionalidades reais vs prometidas:** o ERP dinâmico, CRUD por schema, finance (sales/expenses/analytics), agente de chat com *action proposals* e RAG de documentos **estão implementados e funcionais**. O **onboarding por IA ("entrevista")** está **quebrado na ponta** (serviços sem rota + front chama endpoints inexistentes). A **assinatura/billing** é mock. O cache de KPIs, snapshots e descoberta automática de KPIs estão planejados/quebrados.

---

## §2. Visão geral da arquitetura

### Diagrama textual (real)

```
┌──────────────────────── my-app (Next.js :3000) ────────────────────────┐
│ pages/ (Pages Router)                                                    │
│   _app.tsx: ToastProvider → ErrorBoundary → AuthProvider                 │
│             → CurrencyProvider → DashboardDataProvider                   │
│             (+ Navbar fora de /users/*; FloatingChat em /dashboard/*)    │
│ features/dashboard/category-views/                                       │
│   (finance, inventory, people, products, services,                       │
│    planning, leads, kanban)                                              │
│   └─ render dirigido por schema: DynamicForm + GenericTabbedView         │
│ components/widgets/ (dashboard-grid, chat, analytics, erp-view)          │
│ lib/services/*.service.ts ──► lib/api/api-client.ts                      │
│         (ApiClient singleton: Bearer cookie + x-user-timezone)           │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │  HTTP  NEXT_PUBLIC_API_BASE_URL
                               │        (default: http://localhost:3001/api)
                               ▼
┌──────────────────────── server (Express :3001) ────────────────────────┐
│ helmet → cors() → compression → json → rateLimit(5000/15min)            │
│ → authMiddleware (JWT → injeta x-user-*)                                 │
│ routes/index.ts → routes/<feature>.ts                                   │
│ controllers/<feature>Controller.ts                                      │
│   (valida DTO Zod, getUserContextFromRequest, handleApiError)           │
│ getFactory() → features/<feature>/services                              │
│   ├─ repositories (Prisma)                                              │
│   ├─ policies (autorização)                                             │
│   └─ rules engine (plugins — efeitos cross-table SEM transação)         │
│ PrismaClient singleton → SQLite (prisma/dev.db)                         │
│ Integrações: OpenAI · Qdrant                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Camadas (backend)

| Camada | Responsabilidade | Separação |
|---|---|---|
| HTTP | parse/validação, tradução de erro | ✅ clara (alguns controllers acessam Prisma direto: `getUsers`, `updateMyPreferences`) |
| Roteamento | agrega sub-routers | ✅ |
| Aplicação | regra de negócio | ✅ (com vazamentos para `rules/plugins`) |
| Autorização | quem-pode-o-quê | ✅ |
| Persistência | Prisma | ⚠️ sem unidade de trabalho / transação de escrita |
| Regras transacionais | efeitos cross-table | ⚠️ acoplados, sem atomicidade |
| Transversal | DI, erros, jwt, logger, openai, vector | ✅ (com duplicações) |

### Camadas (frontend)

Apresentação (pages/components) → estado global (Context API: Auth/Currency/DashboardData/Toast) → serviços (`lib/services`) → `ApiClient`. Proteção de rota é **client-side** via HOC `withAuth`, exceto `/dashboard` que valida no `getServerSideProps`.

### Principais arquivos
- **Backend:** [server.ts](../server/src/server.ts), [factory.ts](../server/src/lib/factory.ts), [DynamicTableService.ts](../server/src/features/dynamicTables/services/DynamicTableService.ts) (988 linhas), [RuleRegistry.ts](../server/src/features/dynamicTables/rules/RuleRegistry.ts), [AnalyticsResolver.ts](../server/src/features/analytics/engine/AnalyticsResolver.ts) (857 linhas), [ChatService.ts](../server/src/features/chat/services/ChatService.ts), [LuminarisAgentService.ts](../server/src/features/chat/services/LuminarisAgentService.ts), [schema.prisma](../server/prisma/schema.prisma).
- **Frontend:** [_app.tsx](../my-app/pages/_app.tsx), [api-client.ts](../my-app/lib/api/api-client.ts), [AuthContext.tsx](../my-app/lib/context/AuthContext.tsx), [DynamicForm.tsx](../my-app/features/dashboard/components/forms/DynamicForm.tsx), [GenericTabbedView.tsx](../my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx), [dashboard-grid.tsx](../my-app/components/widgets/dashboard-grid/dashboard-grid.tsx).

---

## §3. Stack técnica

### Frontend (`my-app/package.json`)
- **Linguagem/framework:** TypeScript 5, Next.js **15.3.1 (Pages Router)**, React **19.1.1**.
- **UI/estilo:** Tailwind CSS 3.4 + PostCSS, tema "Galaxy" custom, `@heroicons/react`, `react-icons`.
- **Dashboard/widgets:** `react-grid-layout` 1.5, `@dnd-kit/core`+`sortable`, `re-resizable`.
- **Tabelas/planilhas/agenda:** `handsontable`/`@handsontable/react` 15.3 **(zero imports — dependência morta; licença comercial)**, `@fullcalendar/*` 6.1, `exceljs` **(zero imports — morta)**.
- **Gráficos:** `recharts` 2.15. **Markdown:** `react-markdown`. **Selects:** `react-select`.
- **i18n:** `next-i18next` 15.4.2 / `i18next` 25 / `react-i18next` (en default, pt).
- **Validação:** `zod` **3.25.76** (diverge do server — ver §4). **Auth token:** `cookies-next` 5.1.0. **IDs:** `cuid`, `uuid`. **Export:** `exceljs` (morto).
- **Build/lint:** ESLint 9 + `eslint-config-next` com `eslint.ignoreDuringBuilds: true`. **Sem testes.**

### Backend (`server/package.json` → versões resolvidas no lock)
- **Linguagem/runtime:** TypeScript 5.3, Node ≥18, Express **4.21.2** (lock; `^4.18.2` no manifest). Dev via `ts-node-dev` + `tsconfig-paths` (alias `@/`).
- **ORM/DB:** Prisma **6.16.2** + **SQLite** (cliente gerado em `../generated/prisma`).
- **Auth:** `jsonwebtoken` **8.5.1** **(🔴 vulnerável — ver §4)** + `jose` 6.1.0 **(código morto)**; `bcryptjs` 3.
- **IA/RAG:** `openai` 4.104.0 (fim da linha 4.x), `@qdrant/js-client-rest` 1.15.
- **Upload/extração:** `multer` **2.0.2** (lock; já corrige CVEs de 2025), `pdf-parse` 1.1.1 **(abandonado ~2019)**, `mammoth` 1.11, `exceljs` 4.4.
- **Segurança/HTTP:** `helmet` 7.2.0, `cors` 2.8.5, `compression` 1.8.1, `express-rate-limit` 8.1.0.
- **Validação:** `zod` **4.1.8** (divergência de major vs frontend — schemas não compartilháveis). **Datas:** `date-fns` + `date-fns-tz`.
- **Testes:** `jest` 30 + `ts-jest`. **Scripts:** `dev/build(tsc)/start`, `prisma:*`, `db:seed`, `docs:generate`, `test`.

### Infraestrutura/serviços externos
SQLite (arquivo local), **OpenAI** (chat `gpt-4o`/`gpt-3.5-turbo`, embeddings `text-embedding-3-small`, extração), **Qdrant** (coleção única `documents`). **Redis citado na doc, mas removido** (substituído pelo model `ActionProposal` — [schema.prisma:221](../server/prisma/schema.prisma)). **Sem Docker, sem CI/CD, sem `.env`** versionado.

---

## §4. Higiene de dependências

### 🔴 `jsonwebtoken` 8.5.1 — vulnerável (alta confiança)
O lock resolve **`jsonwebtoken@8.5.1`**, anterior ao conjunto de advisories de dezembro/2022 corrigido em **9.0.0**:
- CVE-2022-23539 — algoritmos irrestritos no verify
- CVE-2022-23540 — tokens aceitos com chave `none`
- CVE-2022-23541 — bypass de validação

É **diretamente relevante** aqui: `jwt.verify(token, JWT_SECRET)` é chamado **sem allowlist de `algorithms`** ([jwt.ts:19](../server/src/lib/jwt.ts)) e com **fallback de segredo hardcoded** ([jwt.ts:4](../server/src/lib/jwt.ts)): `const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key'`. Os três fatores combinados representam risco de forja de tokens admin. Adicionalmente: `@types/jsonwebtoken ^9.0.10` (tipos um major à frente do runtime).

**Ação imediata:** subir para ≥9.0.0, pinar `{algorithms:['HS256']}` no verify, exigir `JWT_SECRET` no boot — ou consolidar no `jose` (já instalado, código morto).

### Pacotes server (versões resolvidas)

| Pacote | Versão no lock | Avaliação |
|---|---|---|
| express / body-parser / path-to-regexp / qs | 4.21.2 / 1.20.3 / 0.1.12 / 6.13.0 | ✅ já patcheados (CVEs 2024) |
| multer / busboy | 2.0.2 / 1.6.0 | ✅ versão ok; a configuração é insegura (sem `limits`/`fileFilter`) |
| **jsonwebtoken** | **8.5.1** | 🔴 vulnerável (CVEs 2022) |
| pdf-parse | 1.1.1 | ⚠️ abandonado ~2019 — risco de manutenção/supply-chain |
| openai | 4.104.0 | ⚠️ linha 4.x (5.x é a atual) — débito de manutenção |
| prisma / @prisma/client | 6.16.2 | ✅ |
| helmet / cors / compression / express-rate-limit / jose | 7.2.0 / 2.8.5 / 1.8.1 / 8.1.0 / 6.1.0 | ✅ |
| zod (server) | 4.1.8 | ⚠️ major diferente do front (3.25.76) — schemas não compartilháveis |

### Pacotes frontend (resolvidos)

**next 15.3.1** (pinado exato; acima do fix CVE-2025-29927 — não afetado; verificar `npm audit` para patches posteriores na linha 15.x). React/react-dom 19.1.1 ✅. `handsontable` 15.3.0 **+ `@handsontable/react` + `exceljs`: zero imports** — dependências mortas. Nota de licença: Handsontable é software **comercial** (exige licença paga); não há tratamento de license key nem arquivo LICENSE no repo.

### `.npmrc`
[server/.npmrc](../server/.npmrc) contém apenas `legacy-peer-deps=true` — sem tokens/segredos (bom), mas suprime avisos de peer-dependency que podem mascarar conflitos reais.

---

## §5. Mapa de diretórios

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
│   │   └── dev/seed/            # seeder client-side (__isSystem:true)
│   ├── components/
│   │   ├── widgets/             # dashboard-grid, chat, analytics, erp-view
│   │   ├── ui/                  # Galaxy theme, Modal, feedback/, wizard/
│   │   ├── layout/, floating-chat/, error-boundaries/
│   ├── lib/                     # api/ (ApiClient), services/, context/, hoc/, hooks/
│   └── public/locales/{en,pt}/  # i18n (pt/ sem chatMessages.json — bug vivo)
│
├── server/                      # BACKEND (Express)
│   ├── generated/prisma/        # ⚠️ 166 MB no tree (7 DLLs .tmp órfãs de 21 MB cada)
│   ├── dist/                    # ⚠️ build compilado no tree
│   ├── prisma/                  # schema.prisma, 6 migrations, dev.db (⚠️ no tree!)
│   │   └── prisma/dev.db        # ⚠️ segundo dev.db (188 KB — ver §9)
│   └── src/
│       ├── server.ts            # bootstrap
│       ├── config/env.ts        # carregamento de env (sem .env no repo)
│       ├── controllers/         # 15 controllers
│       ├── routes/              # 14 routers + docs (OpenAPI)
│       ├── middleware/auth.ts   # JWT + paths protegidos + authz grossa
│       ├── lib/                 # factory(DI), errors, jwt, openai/, vector/, ...
│       └── features/
│           ├── dynamicTables/   # MAIOR: service, presets/, rules/plugins/
│           ├── analytics/       # motor de KPIs — único com testes
│           ├── documents/       # RAG: upload→extração→chunks→embeddings→Qdrant
│           ├── chat/            # ChatService (RAG) + LuminarisAgentService (agente)
│           ├── interview/       # onboarding IA (LIBRARY-ONLY — sem rota)
│           ├── users/, chatInstances/, chatMessages/, dashboardLayout/,
│           │   structuredData/ (feature órfã), reports/
│
└── reports/                     # relatórios técnicos
```

Escala: **~314 arquivos `.ts/.tsx` no front**, **~272 `.ts` no back**, 40 READMEs, **6 arquivos de teste (todos em analytics)**.

---

## §6. Módulos e funcionalidades

### Autenticação e Usuários
**Status:** ✅ implementada.
**Arquivos:** [authController.ts](../server/src/controllers/authController.ts), [middleware/auth.ts](../server/src/middleware/auth.ts), [jwt.ts](../server/src/lib/jwt.ts), `features/users/*`.
**Fluxo:** `POST /auth/register|login` (público) → bcrypt (cost 12 no register, 10 no service) → emite JWT `{id,username,role}` (7d). `authMiddleware` protege paths por prefixo e injeta `x-user-*`.
**Observações:** `logout` é no-op (não invalida token nem limpa cookie); `register` **não valida** o body ([authController.ts:9](../server/src/controllers/authController.ts)); validações inline dos controllers são mais fracas que os DTOs Zod fortes em `UserDto.ts`; token em cookie não-httpOnly (exposto a XSS); `jose` instalado é código morto e incompatível (`userId` vs `id`).

### Dynamic Tables (núcleo do ERP)
**Status:** ✅ implementada e central.
**Arquivo:** [DynamicTableService.ts](../server/src/features/dynamicTables/services/DynamicTableService.ts) (988 linhas).
**Funções centrais:** `createTableData`, `updateTableData`, `deleteTableData`, `buildZodSchema`, `validateAdvancedRules`, `installPresetAsSystem`.
**Fluxo (create):** `canManageData` → valida contra schema (Zod runtime) → regras avançadas (unique/compositeUnique/requiredIf/compare/noOverlap) → `runRules(beforeCreate)` → `createData` → `runRules(afterCreate)`.
**Observações:** governança declarativa real (deleteConstraints, immutableAfter, lifecycle, compositeUnique, noOverlap); porém `isSystem` vem do cliente (🔴 §20-R2); `compositeUnique` faz full-scan O(n) ([:900](../server/src/features/dynamicTables/services/DynamicTableService.ts)); `findRowsReferencingId` trunca em LIMIT 100 (delete-constraint pode furar); campos `json` são `z.any()` (sem validação de conteúdo).

### Rules Engine (efeitos transacionais)
**Status:** ✅ implementada, ⚠️ frágil.
**Arquivos:** [RuleRegistry.ts](../server/src/features/dynamicTables/rules/RuleRegistry.ts), `rules/plugins/*` (10 plugins) + `rules/plugins/sales/*`.
**Plugins:** `SalesPlugin`, `StockMovementsApplyPlugin`, `ProductAutoStockPlugin`, `UnitAutoStockPlugin`, `CommissionsPlugin`, `AppointmentsPlugin`, `EmployeesPlugin`, `GoalsPlugin`, `LeadsPlugin`, `LeadsSeedOnUnitPlugin`.
**Observações (🔴 Crítico):** **sem transação** — falha parcial corrompe dados; `processSaleStockUpdate` sem guarda de idempotência (double-apply em retry); `RuleRegistry.getApplicable` engole erros de `supports()` (regra some silenciosamente); `validateServiceDuration` é no-op ([AppointmentsPlugin.ts:65-70](../server/src/features/dynamicTables/rules/plugins/AppointmentsPlugin.ts)).

### Presets de negócio (montagem do ERP)
**Status:** ✅ implementada.
**Arquivos:** `features/dynamicTables/presets/`, [PresetService.ts](../server/src/features/dynamicTables/services/PresetService.ts), [PresetManager.ts](../server/src/features/dynamicTables/presets/PresetManager.ts).
**Fluxo:** `POST /dashboard/create` → merge Core + suite → `installPresetAsSystem` (3 passes: cria tabelas sem relações → resolve `@@PRESET_TABLE_KEY::` → troca variante de saleItems por capacidade).
**Observações:** install **não transacional** (falha deixa ERP meio-instalado); dois mecanismos paralelos de lookup (`PresetService` vs `PresetManager`) que podem divergir; `CoreSystemPreset` não está em `tablePresetSuites`.

### Analytics / KPIs
**Status:** ✅ parte mais madura do projeto.
**Arquivos:** [AnalyticsResolver.ts](../server/src/features/analytics/engine/AnalyticsResolver.ts), [AnalyticsService.ts](../server/src/features/analytics/services/AnalyticsService.ts), `kpis/*/Processor.ts`, `core/`, `utils/`.
**Fluxo:** `GET /analytics/data?key` → resolver acha processor via registry → carrega tabela → processa → `ChartDataPoint[]` → enriquece com `fullRecords` → JSON.
**Testes:** ✅ 6 arquivos (revenue, profit, cost, cashflow, sales, KpiEngine) — única cobertura real do projeto.
**Observações:** sem cache (re-processa tudo a cada request); `DataSanitizer` tem **bug de locale US** — vírgula isolada sempre vira decimal, `"1,500"` (US) → `1.5`; `discoverKPIsAsync` **quebrado** (shape de measure sem `type` → throw no Compiler); só `RevenueKpiProcessor` usa streaming; vários processors ignoram timezone do usuário.

### Documentos + RAG
**Status:** ✅ implementada.
**Arquivos:** [DocumentProcessingPipeline.ts](../server/src/features/documents/services/DocumentProcessingPipeline.ts), [DocumentService.ts](../server/src/features/documents/services/DocumentService.ts), [VectorRepository.ts](../server/src/features/documents/repositories/VectorRepository.ts).
**Fluxo:** `POST /documents/upload` (multer em memória, **sem limite**) → `extractText` **síncrono** → cria Document PENDING → `processDocumentAsync` (fire-and-forget) → chunks (500 palavras, overlap 50) → embedding por chunk → upsert Qdrant em lotes de 10 → COMPLETED/ERROR.
**Deleção (positivo):** [DocumentService.deleteDocument:139-155](../server/src/features/documents/services/DocumentService.ts) deleta pontos Qdrant → chunks → documento SQL, em sequência. Ressalva: não é transacional.
**Observações:** `searchDocuments` retorna `chunkText: undefined` — lê `payload.text` onde deveria ser `payload.textContent` ([DocumentService.ts:174](../server/src/features/documents/services/DocumentService.ts)); **vazamento cross-tenant na busca** (🔴 R3); documentos podem ficar presos em PROCESSING (sem watchdog); summary `KNOWLEDGE_BASE` nunca gerado (stub).

### Chat (RAG + Agente ERP)
**Status:** ✅ implementada com gate de confirmação.
**Arquivos:** [ChatService.ts](../server/src/features/chat/services/ChatService.ts), [LuminarisAgentService.ts](../server/src/features/chat/services/LuminarisAgentService.ts), [KnowledgeGraphService.ts](../server/src/features/chat/services/KnowledgeGraphService.ts).
**Tools do agente (read):** `list_my_tables`, `get_table_schema`, `query_table_data`. **Write (gera ActionProposal):** `request_record_creation`, `request_record_update`. Sem tool de DELETE (apesar de o tipo permitir).
**Gate de confirmação:** cliente reenvia `confirmedProposalId` → `executeProposal` checa `proposal.userId === user.userId` → executa via `DynamicTableService` (valida + policy + rules).
**Observações:** modo selecionado pela **presença de `documentIds`** (não pelo `ChatInstance.type`); `__isSystem` pode passar pela `data` da proposal; propostas **nunca expiram** (`deleteOldProposals` nunca chamado; status EXECUTED/EXPIRED são código morto); custo OpenAI ilimitado; KnowledgeGraph fica stale após mutação/deleção de tabelas.

### Onboarding por IA (Interview) — ⚠️ QUEBRADO
**Status:** ⚠️ **library-only no backend (sem controller/rota)** — confirmado no próprio README. O frontend ([useAiInterview.ts](../my-app/features/interview/hooks)) chama `POST /dashboard/ai/ChatInterview` que **não existe**. Bugs adicionais: regex JSON quebrada (`/\\{[^\\}]*\\}/` — barras literais, nunca casa); uso errado de `getChatCompletion(prompt, 'gpt-4-turbo')` (o "modelo" vira system prompt); `StateManager` em memória (perde estado em restart); `updateTables` substitui array inteiro. **O onboarding real funcional é o determinístico** `TotalControlSetup` → `POST /dashboard/create`.

### Outras funcionalidades
- **Dashboard layout:** upsert por usuário (POST que atualiza — retorna 201 enganoso). ✅
- **Structured data** (`structuredData`): XLSX → headers+rows JSON. ✅ backend completo — mas **zero referências no frontend** (feature órfã ponta a ponta — ver §12).
- **Reports** (`/reports/generate-chart-data`): SSE, RAG sobre documentos gerando gráficos via function-calling. ✅ (compression desligada p/ SSE).
- **Chat instances/messages:** CRUD. ✅ (com vazamento de listagem — R6).

---

## §7. Funções e métodos importantes

### `authMiddleware`
**Arquivo:** [middleware/auth.ts](../server/src/middleware/auth.ts) — Porteiro global da API: valida JWT, injeta `x-user-id/role/email/name`, aplica authz grossa (ADMIN-only em certas rotas). **Risco:** lista de paths protegidos é manual; `jose` (em `authUtils`) é caminho alternativo morto e incompatível (`userId` vs `id`).

### `DynamicTableService.createTableData` / `updateTableData`
**Arquivo:** [DynamicTableService.ts:384,462](../server/src/features/dynamicTables/services/DynamicTableService.ts) — O coração do CRUD do ERP. **Fluxo interno:** policy → `isSystem = data.__isSystem` (⚠️ R2) → valida Zod → regras avançadas → noOverlap → beforeCreate/Update → persiste → afterCreate/Update. **Escritas sem transação** (R1).

### `runRules` + `RuleRegistry.getApplicable`
**Arquivo:** [DynamicTableService.ts:681-689](../server/src/features/dynamicTables/services/DynamicTableService.ts), [RuleRegistry.ts:21-37](../server/src/features/dynamicTables/rules/RuleRegistry.ts) — O "barramento de eventos" do ERP. `getApplicable` engole erros de `supports()` → regra crítica pode ser silenciosamente pulada.

### `SalesPlugin.afterUpdate` + `stockSync.processSaleStockUpdate`
**Arquivo:** [SalesPlugin.ts:298-348](../server/src/features/dynamicTables/rules/plugins/SalesPlugin.ts), `rules/plugins/sales/stockSync.ts:213-251` — Transforma "venda finalizada" em consequências no inventário e financeiro. **Sem atomicidade + sem guarda de idempotência → double-apply de estoque em retry.**

### `AnalyticsResolver.resolveChartData`
**Arquivo:** [AnalyticsResolver.ts:304](../server/src/features/analytics/engine/AnalyticsResolver.ts) — Orquestra o cálculo de um KPI. Sempre carrega a tabela inteira na memória (`:336`); sem cache; streaming é parcial (só Revenue).

### `DataSanitizer.extractCurrency`
**Arquivo:** [DataSanitizer.ts:6-40](../server/src/features/analytics/utils/DataSanitizer.ts) — Bug: `str.replace(',', '.')` ([linha 35](../server/src/features/analytics/utils/DataSanitizer.ts)) para vírgula isolada → `"1,500"` (US: 1500) vira `1.5`; `"1,234,567"` vira `0`. Correto só para PT-BR.

### `ChatService.generateResponse` (modo RAG)
**Arquivo:** [ChatService.ts:84,187-216](../server/src/features/chat/services/ChatService.ts) — **Crítico (R3):** passa `documentIds` do cliente para `vectorRepository.search` sem checar posse; `search` não filtra `userId`.

### `LuminarisAgentService.executeProposal`
**Arquivo:** [LuminarisAgentService.ts:178-200](../server/src/features/chat/services/LuminarisAgentService.ts) — Efetiva a proposta do agente pós-confirmação. **Ponto forte:** checa `proposal.userId === user.userId`. **Risco:** `data` da proposal pode conter `__isSystem`.

### `DynamicForm.renderField` (frontend)
**Arquivo:** [DynamicForm.tsx:237-256](../my-app/features/dashboard/components/forms/DynamicForm.tsx) — Motor que transforma schema JSON em formulário. Validação client-side fraca (só required + NaN); `readOnly` é só visual (valores ainda vão no payload ao submeter).

### `useTableRelationLookups` (frontend)
**Arquivo:** [useTableRelationLookups.ts](../my-app/features/dashboard/shared/hooks/useTableRelationLookups.ts) — Resolve IDs de FK em texto. Busca **todas** as linhas das tabelas relacionadas sem paginação → pesado em escala.

---

## §8. APIs e contratos

### Tabela mestre de endpoints (~55 operações)

| Método | Path | Função | Auth | Riscos |
|---|---|---|---|---|
| GET | /health | inline | público | Não checa DB/Qdrant |
| POST | /api/auth/register | authController.register | público | Sem validação de body |
| POST | /api/auth/login | authController.login | público | Rate limit desativado efetivamente |
| GET | /api/auth/me | authUtilityController.me | authed | |
| POST | /api/auth/logout | authUtilityController.logout | authed | **No-op** |
| GET | /api/users | userController.getUsers | **admin** | Acessa Prisma direto (bypassa service/policy) |
| GET | /api/users/:id | getUserById | authed | Qualquer logado acessa (não só admin) |
| POST | /api/users | createUser | público | |
| PUT | /api/users/:id | updateUser | authed + self/admin | |
| DELETE | /api/users/:id | deleteUser | **admin** | Não apaga vetores Qdrant (R5) |
| PATCH | /api/users/me/preferences | updateMyPreferences | authed | |
| GET | /api/documents | listDocuments | authed | `limit` sem teto |
| POST | /api/documents/upload | uploadDocument | authed | **Sem limite de tamanho/tipo** (R7) |
| DELETE | /api/documents/:id | deleteDocument | authed | |
| POST | /api/documents/search | searchDocuments | authed | Retorna `chunkText: undefined` (bug) |
| GET | /api/dynamic-tables | listTables | authed | |
| GET | /api/dynamic-tables/:id/data | getTableData | authed | **Tabela inteira por request** (sem paginação) |
| POST | /api/dynamic-tables/:id/data | createTableData | authed | `__isSystem` bypass (R2) |
| PUT | /api/dynamic-tables/:id/data/:dataId | updateTableData | authed | `__isSystem` bypass (R2); sem transação (R1) |
| DELETE | /api/dynamic-tables/:id/data/:dataId | deleteTableData | authed | |
| POST | /api/chat | postChat | authed | RAG: cross-tenant (R3); custo ilimitado |
| GET | /api/chat-instances | listChatInstances | authed | **Sem `?type` → lista todos os tenants** (R6) |
| POST | /api/chat-instances | createChatInstance | authed | |
| GET | /api/chat-messages | listMessages | authed | `page/limit` ignorados + N+1 por mensagem |
| POST | /api/chat-messages | createMessage | authed | Aceita `role: ASSISTANT` (forja de mensagens) |
| POST | /api/dashboard/create | createDashboard | authed | One-shot; install não transacional |
| DELETE | /api/dashboard/system | deleteUserSystem | authed | Não limpa KnowledgeGraph/proposals/Qdrant |
| GET | /api/analytics/data | getAnalyticsData | authed | `x-user-timezone` inválido → 500 |
| GET | /api/analytics/discover/:tableId | discoverTableKPIs | authed | **Quebrado** (shape incompatível) |
| GET | /api/analytics/presets/:key/data | getPresetAnalyticsData | authed | **Ignora `:presetKey`** (bug) |
| POST | /api/reports/generate-chart-data | generateChartData | authed | SSE |
| GET | /api/docs | swagger | **público** | |
| ... | (outros 20+ endpoints) | | authed | |

### OpenAPI vs realidade
[docs.paths.ts](../server/src/routes/docs.paths.ts) documenta **~21 de ~55 operações**. Faltam: Dashboard, Analytics, register, update/delete de users. **Errado:** documenta `PATCH/DELETE /api/dynamic-tables/data/{dataId}` (sem `:tableId`) que **não existe** (real: `PUT /:tableId/data/:dataId`).

### Inconsistência de contratos
Três envelopes coexistem: `{success, data}`, `{code, message}`, `{error, message}` + eventos SSE. Sem padronização.

---

## §9. Modelo de dados

**Banco:** SQLite via Prisma. **11 models + 5 enums.** Multi-tenant por `userId`. ([schema.prisma](../server/prisma/schema.prisma))

```
User (role USER|ADMIN, locale, currency, username/email únicos, password bcrypt)
 ├─1:1─ DashboardLayout (layoutData JSON)
 ├─1:N─ ChatInstance (type DOCUMENT|GENERIC)
 │        └─1:N─ ChatMessage (role USER|ASSISTANT)
 ├─1:N─ Document (fileType PDF|DOCX|XLSX, status PENDING|PROCESSING|COMPLETED|ERROR,
 │                documentPurpose DATA_ANALYSIS|KNOWLEDGE_BASE)
 │        ├─1:N─ Chunk (texto p/ embeddings Qdrant)
 │        └─1:1─ StructuredData (headers JSON + data JSON — feature órfã no front)
 ├─1:N─ DynamicTable (name, internalName, category, schema JSON)
 │        └─1:N─ DynamicTableData (data JSON, deletedAt — soft delete)
 ├─1:1─ KnowledgeGraph (data JSON: nós=tabelas, arestas=relações)
 └─1:N─ ActionProposal (action CREATE|UPDATE|DELETE, status PENDING|EXECUTED|EXPIRED†)
```
† Status `EXECUTED`/`EXPIRED` são código morto — propostas são deletadas, não transicionadas.

**Observações:**
- `DynamicTableData` **não tem coluna `userId`** (isolamento indireto via tabela-pai — JOIN obrigatório para checar posse).
- FKs são representadas **dentro do JSON** (`field.type='relation'`), não no banco — integridade referencial não garantida pelo banco.
- `deleteOldProposals` nunca chamado — proposals acumulam indefinidamente.
- Soft-delete (`deletedAt`) **nunca purgado** — dados pessoais de retenção indefinida (LGPD arts. 15-16).

### ⚠️ Dois `dev.db`
`server/prisma/dev.db` (1,58 MB, populado) **e** `server/prisma/prisma/dev.db` (188 KB). Causa provável: `file:./dev.db` relativo resolvido contra cwd diferentes; o `seed.ts` hardcoda `file:./dev.db` ignorando `DATABASE_URL`. **[INFERÊNCIA — binário não aberto.]**

### Migrations (6, 2025-09 → 2026-04)
Inicial → `ChatInstance.type` → `KnowledgeGraph` → `ActionProposal` → `internalName` → `deletedAt` + `User.locale/currency`. Consistentes com `schema.prisma`.

---

## §10. Fluxos ponta a ponta

### Criar uma venda (sales) — o mais crítico

1. Usuário preenche `SalesCreateModal` → `useSalesWizard` valida (unidade, cliente, ≥1 item, preço>0).
2. `FinanceService.createSaleWithItems` → `POST /dynamic-tables/:salesTableId/data` (cria sale) → `Promise.all` criando cada item via `POST /dynamic-tables/:saleItemsTableId/data`.
3. Backend: cada `createTableData` → valida schema → `runRules`.
4. `SalesPlugin.beforeCreate` (item): valida produto×serviço, checa estoque/reserva, auto-cria appointment p/ serviço.
5. Ao finalizar (status→Finalized via `updateTableData`): `SalesPlugin.afterUpdate` → baixa estoque, gera `stockMovements`, materializa `commissions`, atualiza métricas do `customer`.
6. Estado alterado: sales, saleItems, productUnits, stockMovements, commissions, customers, appointments.

**Risco 🔴:** falha no item N **não faz rollback** dos anteriores nem da sale — front exibe N+1 toasts de sucesso; back fica em estado inconsistente. Não atômico ponta a ponta (front E back).

### Chat com agente ERP → ação no banco

1. `POST /api/chat` (sem `documentIds`) → modo Agente → injeta AGENT_SYSTEM_PROMPT + dump do KnowledgeGraph.
2. Loop de até 5 tool-calls (`gpt-4o`): agente pode `query_table_data` (lê) ou `request_record_creation/update` (cria ActionProposal PENDING).
3. Resposta `type:'ACTION_PROPOSAL'` → front abre `CommandConfirmationModal`.
4. Usuário confirma → `POST /api/chat` com `confirmedProposalId` → `executeProposal` (checa tenant) → `DynamicTableService` (valida+policy+rules) → deleta proposal.

**Risco:** `__isSystem` pode passar pela `data`; KnowledgeGraph stale (vê tabelas deletadas); custo OpenAI ilimitado.

### Upload e RAG de documento

1. `POST /documents/upload` (multer memória, **sem limite**) → `extractText` síncrono → cria Document PENDING → processa em background.
2. `POST /api/chat` com `documentIds` → embed da pergunta → `vectorRepository.search(emb, 10, documentIds)` → contexto → `gpt-3.5-turbo`.

**Risco 🔴:** `search` não filtra `userId` → passar `documentId` de outro usuário vaza o conteúdo.

### Setup inicial (onboarding determinístico)

1. `/dashboard/setup` (TotalControlSetup) → `GET /dashboard/presets` → escolhe preset → `POST /dashboard/create`.
2. `installPresetAsSystem` cria ~16 tabelas em 3 passes. **403 se já há tabelas** (one-shot).

**Risco:** install não transacional; caminho por IA (`/dashboard/ai/ChatInterview`) está **quebrado**.

---

## §11. Frontend / interface

### Bootstrap e estado
[_app.tsx](../my-app/pages/_app.tsx): `ToastProvider → ErrorBoundary → AuthProvider → CurrencyProvider → DashboardDataProvider`. `appWithTranslation` (i18n). `_document.tsx` injeta script de tema (anti-FOUC).

**Supressão global de erros em produção** ([_app.tsx:37-76](../my-app/pages/_app.tsx)): sobrescreve `console.error` e silencia todos os `error`/`unhandledrejection` → observabilidade zero.

**ErrorBoundary problemático** ([ErrorBoundary.tsx:31-57](../my-app/components/error-boundaries/ErrorBoundary.tsx)): registra `window.unhandledrejection` com `preventDefault` → qualquer promise rejeitada em **qualquer widget** derruba a app inteira (sem isolamento por componente).

### Camada de dados
[ApiClient](../my-app/lib/api/api-client.ts) (singleton): `Authorization: Bearer <cookie auth_token>` + `x-user-timezone`; em erro dispara toast. **Sem timeout/retry.** `document.service.ts` faz `fetch` cru **bypassando o ApiClient** com parse manual de cookie (`document.cookie.split('auth_token=')[1]?.split(';')[0]`).

### Auth (front)
Token em cookie **não-httpOnly** (exposto a XSS). `checkAuthState` chama `/auth/me` no mount e a cada navegação. `withAuth` HOC protege rotas **client-side** (exceto `/dashboard` que valida em SSR).

### Render dirigido por schema (o coração do front)
[DynamicForm](../my-app/features/dashboard/components/forms/DynamicForm.tsx) mapeia `field.type` → componente (Input, Currency, Percentage, Select, Relation, CepAddress, Textarea, Checkbox, Slider, WorkSchedule), com heurísticas por nome. [GenericTabbedView](../my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx) + `useGenericData` montam tabela+CRUD a partir do schema.

### Principais telas/componentes

| Tela/Componente | Arquivo | Riscos |
|---|---|---|
| Dashboard (hub) | `pages/dashboard/index.tsx` | Bug de base URL no SSR (`'http://localhost:3001'` sem `/api`) |
| DashboardGrid | `components/widgets/dashboard-grid.tsx` | Save com debounce 1500ms sobrescreve tudo; corrida de edição rápida |
| Finance | `features/dashboard/category-views/finance/*` | Sale não atômica; N+1 toasts; analytics hardcoda BRL |
| Chat widgets | `components/widgets/chat\|generic-chat` | Dois stacks de hooks duplicados; erros viram "mensagens" do assistente |
| Profile | `pages/users/profile.tsx` | Botão "Make Admin" ([linha 225](../my-app/pages/users/profile.tsx)) — UI deceptiva (marcado dev-only); **bloqueado pelo backend** (`canChangeRole`) |
| Onboarding | `features/interview/*` | Chama endpoints inexistentes → 100% não funcional |
| Subscription | `pages/users/subscription.tsx` | 100% mock |

### Observações gerais
- **Casing de imports** (`UseChatInstance` vs `useChatInstance`) quebra em FS case-sensitive (Linux/CI).
- Código morto: `ChatWidget.tsx`, `useGenericChat.ts` (stub), `analytics/kpi/*` e `ChartRenderer` (não usados pelos dashboards ativos).
- Muitas strings PT-BR hardcoded fora do i18n; `console.log`/DEBUG em produção (62 ocorrências).
- Views bespoke duplicam o padrão genérico (Expenses ~90% replicável pelo GenericTable).

---

## §12. Bundle, tema e acessibilidade

### Bundle / code splitting (Médio)
- Apenas **2** usos de `next/dynamic` no app inteiro (`PlanningCalendar.tsx:3`, `FloatingActionButton.tsx:3`).
- [pages/dashboard/index.tsx:8-19](../my-app/pages/dashboard/index.tsx) importa **as 9 category views eagerly**: FullCalendar entra estático (via `MeetingsCalendar.tsx:5` → `LeadsView` — o `dynamic()` do Planning é anulado pelo caminho do Leads); recharts, dnd-kit e react-grid-layout entram na home e no dashboard.
- `next.config.js` sem qualquer otimização (`optimizePackageImports`/analyzer ausentes) e com `eslint.ignoreDuringBuilds: true`.
- Dependências mortas: `handsontable`, `@handsontable/react`, `exceljs` (zero imports — remoção grátis).

### Feature órfã ponta a ponta: `structuredData`
**Verificado:** zero referências a `structured-data`/`StructuredData` em todo o frontend. O backend mantém pipeline completo (extração Excel → `headers`+`data` → `GET /api/structured-data/:documentId` → policy/repo/service) que nenhuma tela consome — e a lib de renderização alvo (Handsontable) nem é importada. O caminho `DATA_ANALYSIS` produz dados que ninguém exibe. Decisão necessária: reconectar a UI ou aposentar a feature (e o custo de extração/LLM associado).

### Tema (Baixo)
- Dark mode por classe ok (script anti-FOUC em `_document.tsx:22-33`).
- Tokens `lumi-*` usados em **1 arquivo/2 ocorrências**; `var(--lumi-*)` **0 usos** em TSX; **119 cores hex hardcoded em 14 arquivos** (PlanningCalendar: 37).
- `useTheme` é estado por instância (sem contexto — múltiplos consumidores não sincronizam).
- `GalaxyBackground` + animações CSS: **código morto** (exportado, importado por ninguém).

### Acessibilidade (Médio)
- **Nenhum focus trap** no app; `Modal.tsx` sem `role="dialog"`/`aria-modal`; `ConfirmModal.tsx` tem dialog/aria-modal mas **sem handler de ESC**.
- **`aria-invalid`: 0 ocorrências** — erros de validação são só visuais.
- ~11 `<div onClick>` clicáveis (kanban, pessoas, células de relação) com **1** `role="button"` total — inativáveis por teclado.
- Sem páginas de erro custom (`_error.tsx`/`404.tsx`/`500.tsx` ausentes).
- Labels `htmlFor` corretos no `DynamicForm` (positivo).

---

## §13. i18n

- **🐛 `chatMessages.json` não existe em PT** (verificado — ausente em `public/locales/pt/`), mas o namespace é requisitado por [pages/index.tsx:19](../my-app/pages/index.tsx) e [pages/dashboard/index.tsx:241](../my-app/pages/dashboard/index.tsx) → usuários PT veem chaves cruas/fallback EN em todas as strings de chat. **Bug vivo.**
- **Drift bidirecional:** 17 chaves **só em PT** no `common.json` (telas de setup/lista de usuários sem equivalente EN: `userList*`, `setupSystem`, `quickMode`, `aiInterviewMode`); `finance_view.json` PT sem o campo `title`. Demais namespaces têm paridade (analytics 125/125, database 192/192).
- **~60 arquivos** com strings PT hardcoded fora do i18n (amostras: `ConfirmModal.tsx:59,69,79`, `Modal.tsx:38` com `window.confirm` PT, `FloatingChatWindow.tsx:175-197` inclusive em `aria-label`).

---

## §14. Integrações externas

### OpenAI
**Objetivo:** chat (RAG `gpt-3.5-turbo` / agente `gpt-4o`), embeddings (`text-embedding-3-small`, 1536d), extração, entrevista.
**Arquivos:** [lib/openai/OpenAIService.ts](../server/src/lib/openai/OpenAIService.ts), [lib/vector/embedding.ts](../server/src/lib/vector/embedding.ts).
**Config:** `OPENAI_API_KEY` (throw se ausente).
**Riscos:**
- 🟠 **Custo ilimitado** — sem `max_tokens`, sem cap por usuário, embedding por chunk sem batch, loop de 5 chamadas no agente.
- `JSON.parse` dos tool args sem try/catch → 500 em resposta malformada.
- Prompt injection via conteúdo de documento/registro (leitura do agente é controlada pelo usuário).
- `RequestLock` deduplica por hash fraco (colisão → resposta trocada).

### Qdrant (vetores)
**Objetivo:** armazenar/buscar embeddings de chunks (RAG).
**Arquivos:** [VectorRepository.ts](../server/src/features/documents/repositories/VectorRepository.ts), `lib/vector/qdrant*.ts`.
**Config:** `QDRANT_URL`/`QDRANT_API_KEY`. Coleção única `documents` (não por tenant).
**Riscos:**
- 🔴 `search()` filtra só por `documentId`, **sem `userId`** → vazamento cross-tenant.
- Vetores de usuários deletados **nunca são limpos** (LGPD R5).
- Sem índice em `userId` na coleção Qdrant — scans por documento são lineares na coleção total.
- Inicializador não derruba app se Qdrant estiver ausente.

### ViaCEP (frontend)
`location.service.ts` chama `https://viacep.com.br/ws/{cep}/json/` para autopreencher endereço. Risco baixo (público, sem segredo). Hardcoded.

### Redis
**Removido.** Substituído por `ActionProposal` no banco. Nenhum cliente Redis no código — mas `REDIS_URL` ainda está em `env.ts:89` como variável fantasma.

---

## §15. Testes

### Cobertura atual
- **Bem coberto:** apenas o **motor de Analytics** — 6 arquivos (revenue, profit, cost, cashflow, sales, KpiEngine), com casos de borda (moeda PT-BR, timezone, leap-month, NaN, float drift). Jest + ts-jest.
- **Sem testes:** todo o resto — auth, users, dynamicTables, **rules engine** (o caminho não-transacional crítico), documents/RAG, chat/agente, interview, controllers, rotas, integração Express/Prisma, e **100% do frontend**.

### Bugs nos próprios testes
- Ternário sempre-verdadeiro ([SalesProfitByProductProcessor.test.ts:114](../server/src/features/analytics/kpis/sales/__tests__/SalesProfitByProductProcessor.test.ts)).
- Assert de performance flaky (`<500ms`).
- `console.log` esquecido em arquivos de teste.

### Scripts que não são testes
`scripts/audit-*-kpi.ts` e `test-all-kpis.ts` não têm asserts e não fazem parte do `npm test`.

### Testes recomendados (prioridade)
1. Integração do `createTableData`/rules (venda completa) com asserts de consistência + rollback.
2. Isolamento de tenant: RAG search, chat-instances, dynamic-tables.
3. Auth: middleware (paths, authz), JWT, register/login.
4. Unit: `DataSanitizer` (locale US), `DateUtils` (timezone inválida).
5. Smoke E2E do onboarding determinístico.

---

## §16. Configuração e operação

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

| Variável | Uso | Observação |
|---|---|---|
| `DATABASE_URL` | conexão Prisma (`file:./dev.db`) | Sem `.env`; `seed.ts` hardcoda o valor |
| `JWT_SECRET` | assina tokens | **⚠️ Fallback inseguro** `'your-jwt-secret-key'` |
| `JWT_EXPIRES_IN` | expiração (default 7d) | Não documentado em nenhum `.env.example` |
| `OPENAI_API_KEY` | IA (throw se ausente) | |
| `QDRANT_URL` / `QDRANT_API_KEY` | vetores RAG | |
| `PORT` | porta (default 3001) | |
| `REDIS_URL` | **fantasma** — checado em `env.ts:89` mas zero cliente | Removido; variável residual |
| `NEXT_PUBLIC_API_BASE_URL` | base da API (default `http://localhost:3001/api`) | |
| `NEXT_PUBLIC_ENABLE_DEV_SEED` / `..._AUTORUN` | seeder client-side | Não documentados |

### Operação e ciclo de vida do processo

- **Sem graceful shutdown** (zero `SIGTERM/SIGINT/server.close/prisma.$disconnect` em `src/` — confirmado por grep): uma promise rejeitada fora de request mata/zumbifica o processo silenciosamente. **Médio-Alto.**
- **`/health` é de fachada** ([server.ts:51-58](../server/src/server.ts)): retorna só uptime — não pinga DB, Qdrant nem OpenAI. **Médio.**
- **Sem middleware de request logging** (sem morgan/pino): 222 chamadas `logger.*` + ~103 `console.log/error/warn` cruas em `src/` (incluindo o error handler global [server.ts:70](../server/src/server.ts)).
- **`x-user-timezone` inválido → 500 em todo o analytics:** [DateUtils.ts:26-44](../server/src/features/analytics/utils/DateUtils.ts) captura `RangeError` e relança como Error genérico. Header é client-controlled, não validado. Correção de 3 linhas. **Médio.**
- **Credenciais hardcoded no seed** ([seed.ts:13-14](../server/prisma/seed.ts)): `admin@admin.com`/`Admin@123` — backdoor se executado em produção. **Alto.**

### Concorrência SQLite **[INFERÊNCIA fundamentada]**
SQLite admite **um escritor por vez**. O rules engine executa muitas escritas sequenciais por request (cascata de delete: um `update` por linha em [DynamicTableService.ts:625-640](../server/src/features/dynamicTables/services/DynamicTableService.ts); read-modify-write de estoque em `stockSync.ts:50-57`). Sem WAL/`busy_timeout` configurados. Adicionalmente: **dois PrismaClients** (`database/prisma.ts` + `lib/prisma.ts`) — em produção criam **duas conexões de engine** (o cache `global` só vale fora de produção). Sob concorrência: erros `database is locked` e cadeias de regras meio-aplicadas. Reforça R1 e o P3 de migrar a PostgreSQL.

### Scripts utilitários
`scripts/backfill-internal-names.ts` (migração de dados, idempotente), `backfill.sql` (**morto** — nomes de tabela errados), `diagnose-sales.ts` (diagnóstico), `test-all-kpis.ts` (harness manual sem asserts).

---

## §17. Privacidade, LGPD e órfãos de dados

### Deleção de usuário não apaga vetores Qdrant — 🔴 LGPD art. 18 VI
`DELETE /users/:id` → `prisma.user.delete` ([UserRepository.ts:194-198](../server/src/features/users/repositories/UserRepository.ts)). O cascade do Prisma limpa **tudo no SQLite**, mas **nenhum código deleta os pontos do usuário no Qdrant** — payloads com `textContent` integral dos documentos, `fileName` e `userId` ficam para sempre. Combinado com o vazamento cross-tenant (R3), os dados do usuário deletado **continuam pesquisáveis** por quem souber os `documentId`s. A capacidade técnica já existe: `VectorRepository` tem `searchVectors` que filtra por `userId` — basta um delete-by-filter.

### `deleteUserSystem` deixa estado semântico pesado
[dashboardController.ts:337-348](../server/src/controllers/dashboardController.ts) → `deleteAllTablesForUser`: **não** limpa `KnowledgeGraph` (grafo com IDs de tabelas mortas continua injetado no prompt do agente — o agente "vê" tabelas inexistentes), nem `ActionProposal` (ficam com `tableId` pendurado), nem layout/chats/documentos/vetores Qdrant. Reset deixa lixo semântico para o novo sistema.

### PII em logs sem redação — 🟠 Alto (LGPD)
Consulta de chat inteira logada em info ([ChatService.ts:86](../server/src/features/chat/services/ChatService.ts)); queries de relatório ([ReportService.ts:69,77,80,94,97,134](../server/src/features/reports/services/ReportService.ts)); texto integral em warn de chunking ([chunking.ts:37](../server/src/lib/vector/chunking.ts)); layout completo em falha de validação ([DashboardLayoutRepository.ts:193,232](../server/src/features/dashboardLayout/repositories/DashboardLayoutRepository.ts)); dump de registro completo ([DynamicTableService.ts:673](../server/src/features/dynamicTables/services/DynamicTableService.ts)). Sem camada de redação. **Positivo:** `VectorRepository` loga só IDs/contagens.

### Conteúdo de documentos para OpenAI/Qdrant sem documentação/consentimento — 🟠 Alto (compliance)
Texto integral vai para **OpenAI** (extração [OpenAIService.ts:327](../server/src/lib/openai/OpenAIService.ts), amostra de 4k chars, embeddings por chunk) e fica **armazenado em claro no payload do Qdrant** ([DocumentProcessingPipeline.ts:168](../server/src/features/documents/services/DocumentProcessingPipeline.ts)). Grep repo-wide: **zero** política de privacidade, fluxo de consentimento ou documentação de operadores — ironicamente, os presets modelam consentimento LGPD para os clientes finais do usuário (`CustomerModule.ts:23`, `DatePresets.ts:53-55`), mas a plataforma não trata o próprio compliance.

### CPF/CNPJ em texto puro
Campos de preset (`TextPresets.ts:50-71`; obrigatório em `SuppliersModule.ts:19`) gravados como JSON plaintext no SQLite. O `dev.db` (1,5 MB com hash bcrypt do admin seedado) **está no tree, não-ignorado**.

### Soft-delete nunca purgado
Zero `purge`/cron/scheduler em `src/`: linhas com `deletedAt` acumulam para sempre — retenção indefinida de dados pessoais (LGPD arts. 15-16) e custo crescente de scan nas queries raw com `json_extract`.

### Forja de mensagens do assistente
`CreateChatMessageSchema` aceita `role: ASSISTANT` ([ChatMessageDto.ts:53-55](../server/src/features/chatMessages/dtos/ChatMessageDto.ts)) e o service persiste o role verbatim ([ChatMessageService.ts:101-105](../server/src/features/chatMessages/services/ChatMessageService.ts)); `updateMessage` permite reescrever o role de mensagens existentes (`:221`). Severidade média (o `/chat` já recebe history client-supplied — a forja não concede poder novo, mas polui auditoria/UX e qualquer replay futuro do histórico).

### Paginação e payloads sem limite

| Endpoint | Paginado? | Evidência |
|---|---|---|
| `GET /dynamic-tables/:id/data` | ❌ tabela inteira | `findDataByTableId` sem take/skip ([DynamicTableRepository.ts:102-107](../server/src/features/dynamicTables/repositories/DynamicTableRepository.ts)) |
| `GET /chat-messages` | ❌ histórico inteiro + N+1 | Controller parseia `page/limit` e os ignora ([chatMessagesController.ts:8-22](../server/src/controllers/chatMessagesController.ts)); `enrichMessageWithUserId` re-busca instância por mensagem ([ChatMessageService.ts:180-182](../server/src/features/chatMessages/services/ChatMessageService.ts)) |
| `GET /documents` | ✅ skip/take, mas sem teto (`?limit=1000000` aceito) | |
| `GET /analytics/drill-down` | pseudo — fatia em memória | Busca todos os IDs, `recordIds` e `limit` sem teto |

---

## §18. Artefatos commitados e higiene de repositório

| Item | Estado | Severidade |
|---|---|---|
| `server/generated/prisma/` | **166 MB** no tree — 7 arquivos `.dll.node.tmpNNNNN` órfãos de 21 MB cada + engine real + wasm; `tsconfig.include` puxa `generated/**` (re-typecheck de 732 KB de d.ts a cada build) | Médio |
| `server/dist/` | 262 arquivos compilados no tree; `.gitignore` cobre `/build` (template Next.js) mas **não `dist/`** | Baixo-Médio |
| `server/prisma/dev.db` | 1,5 MB com dados reais + hash do admin; **sem `.gitignore` cobrindo `*.db`** | Médio |
| `.gitignore` (ambos os apps) | Templates Next.js **idênticos e errados** para o server Express (ignoram `.next/` que não existe; não ignoram `dist/`, `generated/`, `dev.db`) | Baixo |
| LICENSE / root README / `.env.example` / CI / Docker / `.git` | **Todos ausentes** — fresh clone exige engenharia reversa; sem versionamento | Médio |

### Drift de configuração
- `REDIS_URL` é variável fantasma (checada em `env.ts:89`; zero cliente Redis).
- `env.ts` tem parser de `.env` regex hand-rolled com `override: true` e imprime telemetria de presença de segredos no stdout (`env.ts:96-100`) — valores não vazam, mas revela o que está configurado.
- `backfill.sql` tem nomes de tabela errados — script morto que pode confundir.

---

## §19. Métricas de qualidade de código

| Padrão | server/src | my-app |
|---|---|---|
| `console.log(` | 28 (+48 `console.error`, +27 `console.warn`) | 62 |
| `as any` | **424** | 50 |
| `: any` | 220 | 140 |
| `TODO` / `FIXME` | 2 / 0 | 0 / 0 |
| `@ts-ignore` | 2 | 1 |

`strict: true` está ligado nos dois lados, mas no server a tipagem é rotineiramente anulada — notavelmente o `ctx as any` em **toda** fronteira controller→service (ex.: `dynamicTablesController.ts:35,51,75`), exatamente onde tipos fortes mais protegeriam. `UserContext` tem dois formatos divergentes (via JWT inject vs chamada direta) — raiz do `as any` sistêmico.

---

## §20. Diagnóstico arquitetural (riscos consolidados)

### Pontos fortes
- **Disciplina de camadas real** no backend (Controller→Service→Repository→Policy) com DI por factory — fácil de navegar e testar.
- **Render dirigido por schema** elegante: adicionar uma tabela não exige código de UI.
- **Erros tipados** (`AppError` + `handleApiError`) e **DTOs Zod** na borda.
- **Motor de Analytics** maduro, testado, com aritmética cents-safe nas somas, streaming parcial e timezone-aware.
- **Documentação interna excelente** (40 READMEs, ARCHITECTURE.md) — raro e valioso.
- **Gate de confirmação** no agente ERP (human-in-the-loop) + re-validação na execução.
- **Soft-delete** e governança declarativa bem pensadas.
- **Deleção de documento** limpa Qdrant corretamente antes do SQL.

### Tabela de riscos consolidada

| ID | Severidade | Risco | Onde |
|---|---|---|---|
| R1 | 🔴 Crítico | **Sem transações no rules engine** — falha parcial corrompe estoque/comissões/métricas sem rollback | [DynamicTableService.ts:393-398](../server/src/features/dynamicTables/services/DynamicTableService.ts) |
| R2 | 🔴 Crítico | **Bypass de governança via `__isSystem`** no corpo JSON do cliente | [DynamicTableService.ts:389,467](../server/src/features/dynamicTables/services/DynamicTableService.ts) |
| R3 | 🔴 Crítico | **Vazamento cross-tenant no RAG** — `search()` sem filtro `userId` | [VectorRepository.ts:156-163](../server/src/features/documents/repositories/VectorRepository.ts) |
| R4 | 🔴 Crítico | **JWT: `jsonwebtoken` 8.5.1 vulnerável + fallback de segredo + sem allowlist** | [jwt.ts:4,19](../server/src/lib/jwt.ts) |
| R5 | 🟠 Alto | **Deleção de usuário não apaga vetores Qdrant** (LGPD art. 18 VI) | [UserRepository.ts:194-198](../server/src/features/users/repositories/UserRepository.ts) |
| R6 | 🟠 Alto | **Chat-instances vaza todos os tenants** em `GET /api/chat-instances` sem `?type` | [ChatInstanceService.ts:102](../server/src/features/chatInstances/services/ChatInstanceService.ts) |
| R7 | 🟠 Alto | **Upload sem limite de tamanho/tipo** — DoS de memória; multer `memoryStorage` sem `limits` | [documentsController.ts:11](../server/src/controllers/documentsController.ts) |
| R8 | 🟠 Alto | **PII em logs sem redação** (registro completo, queries de chat/relatório, texto de chunk) | [DynamicTableService.ts:673](../server/src/features/dynamicTables/services/DynamicTableService.ts) et al. |
| R9 | 🟠 Alto | **Conteúdo de documentos para OpenAI/Qdrant sem consentimento/documentação** (compliance) | §17 |
| R10 | 🟠 Alto | **Endpoints sem paginação**: tabela inteira e histórico completo por request; `limit` sem teto | §17 |
| R11 | 🟠 Alto | **Custo OpenAI ilimitado** (sem `max_tokens`, sem cap, sem batch de embeddings) | [OpenAIService.ts](../server/src/lib/openai/OpenAIService.ts) |
| R12 | 🟠 Alto | **`discoverKPIsAsync` quebrado** — shape de measure sem `type` → throw no Compiler | [AnalyticsService.ts:442](../server/src/features/analytics/services/AnalyticsService.ts) |
| R13 | 🟠 Alto | **Bug de locale em `DataSanitizer`** — vírgula isolada vira decimal: `"1,500"` → `1.5` | [DataSanitizer.ts:35](../server/src/features/analytics/utils/DataSanitizer.ts) |
| R14 | 🟠 Alto | **Supressão global de erros no front** + ErrorBoundary global (uma rejection derruba a app) | [_app.tsx:37-76](../my-app/pages/_app.tsx) |
| R15 | 🟠 Alto | **Zero testes** em caminhos críticos (rules engine, auth, RAG, chat) | §15 |
| R16 | 🟠 Alto | **Credenciais hardcoded no seed** — backdoor em produção | [seed.ts:13-14](../server/prisma/seed.ts) |
| R17 | 🟡 Médio | **`x-user-timezone` inválido → 500** em todo o analytics | [DateUtils.ts:26-44](../server/src/features/analytics/utils/DateUtils.ts) |
| R18 | 🟡 Médio | **Extração síncrona bloqueia event loop** | [DocumentProcessingPipeline.ts](../server/src/features/documents/services/DocumentProcessingPipeline.ts) |
| R19 | 🟡 Médio | **Sem graceful shutdown/crash handlers**; `/health` não checa dependências | [server.ts](../server/src/server.ts) |
| R20 | 🟡 Médio | **Concorrência SQLite** — `database is locked` + cadeias meio-aplicadas; 2 PrismaClients em prod | §16 **[INFERÊNCIA]** |
| R21 | 🟡 Médio | **CORS totalmente aberto** | [server.ts:19](../server/src/server.ts) |
| R22 | 🟡 Médio | **Rate limit efetivamente desativado** (5000/15min) — sem proteção a brute-force no login | [server.ts](../server/src/server.ts) |
| R23 | 🟡 Médio | **Logout no-op** + token em cookie não-httpOnly — sem revogação; exposto a XSS | [authUtilityController.ts](../server/src/controllers/authUtilityController.ts) |
| R24 | 🟡 Médio | **Forja de mensagens `ASSISTANT`** via `POST /chat-messages` (role aceito verbatim) | [ChatMessageService.ts:101-105](../server/src/features/chatMessages/services/ChatMessageService.ts) |
| R25 | 🟡 Médio | **`chatMessages.json` ausente em PT** — namespace requisitado por 2 páginas (bug vivo) | `public/locales/pt/` |
| R26 | 🟡 Médio | **Feature `structuredData` órfã** ponta a ponta + `handsontable`/`exceljs` mortos (licença comercial) | §12 |
| R27 | 🟡 Médio | **`deleteUserSystem` deixa KnowledgeGraph stale** + proposals penduradas | [dashboardController.ts:337-348](../server/src/controllers/dashboardController.ts) |
| R28 | 🟡 Médio | **Onboarding por IA quebrado** (endpoints inexistentes + bugs de regex/modelo) | `features/interview/*` |
| R29 | 🟡 Médio | **`searchDocuments` retorna `chunkText: undefined`** — lê campo errado | [DocumentService.ts:174](../server/src/features/documents/services/DocumentService.ts) |
| R30 | 🟡 Médio | **Bundle sem code splitting** (9 views eager; FullCalendar/recharts/dnd-kit no bundle inicial) | [pages/dashboard/index.tsx:8-19](../my-app/pages/dashboard/index.tsx) |
| R31 | 🟡 Médio | **A11y básica ausente** (sem focus traps, aria-invalid=0, divs clicáveis inativáveis por teclado) | §12 |
| R32 | 🟡 Médio | **CPF/CNPJ plaintext** + `dev.db` no tree com dados reais | §17, §18 |
| R33 | 🟡 Médio | **`generated/`** (166 MB, 7 DLLs .tmp), `dist/`, `dev.db` no tree; sem `.gitignore` correto | §18 |
| R34 | 🟡 Médio | **OpenAPI defasado** (21/55, paths errados); `installPresetAsSystem` não transacional | §8, §6 |
| R35 | 🟢 Baixo | **424 `as any`** no server; duplo PrismaClient; dois stacks de hooks no front | §19 |
| R36 | 🟢 Baixo | **i18n drift** (17 chaves PT-only; ~60 arquivos hardcoded); tokens de tema decorativos | §13, §12 |
| R37 | 🟢 Baixo | **Código morto** (interview backend, `ChatWidget`, `analytics/kpi/*`, `backfill.sql`, debug em ProfitKpiProcessor) | §6, §11 |
| R38 | 🟢 Baixo | **`REDIS_URL` fantasma**; envs não documentadas; soft-delete sem purga | §16, §17 |

---

## §21. Recomendações priorizadas (P0–P3)

### P0 — Urgente (pode corromper dados, expor tenants ou forjar tokens)

1. **Transações no rules engine.** Envolver `createTableData`/`updateTableData`/`deleteTableData` + plugins em `prisma.$transaction`; tornar `processSaleStockUpdate` idempotente (guarda de transição de status). *(R1)*
2. **Remover `__isSystem` do payload.** Derivar `isSystem` do call site (sistema/seed), nunca do JSON do cliente; sanitizar dados de usuário e agente. *(R2)*
3. **Filtrar `userId` no `VectorRepository.search`** e validar posse dos `documentIds` antes de passar ao RAG. *(R3)*
4. **Upgrade `jsonwebtoken` ≥9.0.0** + `{algorithms:['HS256']}` no verify + exigir `JWT_SECRET` (falhar no boot se ausente). *(R4)*
5. **Apagar vetores do Qdrant na deleção de usuário** (delete-by-filter `userId` — capacidade já existe no `VectorRepository`). *(R5)*
6. **Escopar `getAllInstances` por `userId`** (e auditar todos os `getAll*` do projeto). *(R6)*
7. **Limites de upload** (`limits.fileSize`, `fileFilter` com magic bytes no multer). *(R7)*

### P1 — Importante (estrutural, segurança e compliance)

8. **Suíte de testes** para rules engine (venda completa + rollback), isolamento de tenant (RAG/chat-instances/dynamic-tables), auth/middleware, `DataSanitizer` (locale US), `DateUtils` (timezone inválida). *(R15)*
9. **Paginação obrigatória + teto de `limit`** em `GET /dynamic-tables/:id/data` e `GET /chat-messages` (já aceita page/limit, basta aplicar); corrigir o N+1 do `enrichMessageWithUserId`. *(R10)*
10. **Camada de redação de logs** — remover dumps de registro/query/texto integral dos arquivos listados em §17. *(R8)*
11. **Caps de custo OpenAI** (max_tokens por chamada, batch de embeddings, rate-limit por usuário) + try/catch no `JSON.parse` dos tool args. *(R11)*
12. **Corrigir `discoverKPIsAsync`** (shape de measure incompatível com o Compiler) e o bug de locale do `DataSanitizer`. *(R12, R13)*
13. **Reativar observabilidade no front** — remover supressão global em `_app.tsx`; isolar `ErrorBoundary` por widget (não global para `unhandledrejection`). *(R14)*
14. **Validar `x-user-timezone`** antes de passar ao `date-fns-tz` (fallback UTC em TZ inválida) — correção de 3 linhas. *(R17)*
15. **Shutdown gracioso** (`SIGTERM` → `server.close()` + `prisma.$disconnect()`) + handlers de `unhandledRejection`/`uncaughtException`; `/health` com ping de DB/Qdrant. *(R19)*
16. **Forçar `role: USER`** no `POST /chat-messages` (assistente só via fluxo do `/chat`). *(R24)*
17. **Criar `pt/chatMessages.json`** e completar as 17 chaves EN faltantes no `common.json` PT. *(R25)*
18. **CORS restrito** (`origin: process.env.ALLOWED_ORIGIN`) + rate limit real no login (≤10/min) + logout que limpe cookie. *(R21, R22, R23)*
19. **Documentação LGPD dos fluxos OpenAI/Qdrant** (acordos de operador, aviso de privacidade ao usuário final). *(R9)*

### P2 — Desejável (qualidade e manutenção)

20. **Limpar KnowledgeGraph + proposals no `deleteUserSystem`** e sincronizar o grafo em delete/rename de tabela. *(R27)*
21. **Corrigir `searchDocuments`** (`payload.text` → `payload.textContent`). *(R29)*
22. **Decidir o destino do `structuredData`** — reconectar UI ou aposentar feature; remover `handsontable`/`@handsontable/react`/`exceljs` do front (e resolver licença). *(R26)*
23. **Code splitting** por categoria no dashboard (`next/dynamic` nas 9 views) + mover `MeetingsCalendar` para dynamic. *(R30)*
24. **Higiene de repo:** corrigir `.gitignore`, remover `dev.db`/`dist/`/DLLs `.tmp` do tree, `prisma generate` no build, adicionar `.env.example`, LICENSE, root README, iniciar git + CI mínimo. *(R33)*
25. **A11y básico:** focus trap nos modais, `role="dialog"`/ESC consistentes, `aria-invalid` nos campos com erro, `role="button"`+tabIndex nos cards clicáveis. *(R31)*
26. **Sincronizar OpenAPI** com as rotas reais; padronizar envelope de resposta. *(R34)*
27. **Decidir o destino do onboarding por IA** — ligar os serviços (criar rotas + corrigir regex + persistir estado) ou remover a UI. *(R28)*
28. **Unificar PrismaClient** (remover duplicata); atacar o `as any` sistêmico com um `UserContext` único entre middleware e services. *(R35)*
29. **Transação no `installPresetAsSystem`**; idempotência no `ProductAutoStockPlugin`. *(R34)*
30. **Remover duplicações** (jose, `OpenAIService`, hooks de chat, `ChatWidget`/`useGenericChat`, `analytics/kpi/*`, `backfill.sql`) e debug morto em `ProfitKpiProcessor`. *(R37)*

### P3 — Futuro (evolução)

31. **Migrar SQLite → PostgreSQL** (já preparado no roadmap) — habilita concorrência real, transações robustas e índices em JSON. Enquanto isso: habilitar **WAL + busy_timeout**. *(R20)*
32. **Política de retenção/purga** para `deletedAt` (soft-delete) — definir TTL e job de purga. *(R38)*
33. **Integridade referencial real** para relações entre tabelas dinâmicas (hoje em JSON). *(§9)*
34. **Cache/snapshot de KPIs** (já roadmapeado em `reports/kpi_engine_roadmap.md`). *(§6)*
35. **Processamento de documento assíncrono** (fila/worker) + watchdog para PROCESSING preso. *(R18)*
36. **Design tokens de verdade** — adotar `lumi-*` ou removê-los; substituir 119 cores hex hardcoded. *(R36)*
37. **i18n completo** — varredura dos ~60 arquivos com strings PT hardcoded. *(R36)*
38. **Endurecer prompt injection** — delimitadores no contexto do agente, verificação de intenção antes de escrita, nonce na confirmação de proposta. *(§14)*
39. **Autoria validada de "Custom KPIs"** e Pipeline declarativo (já roadmapeado). *(§6)*
40. **CI/CD + Docker** + cobertura mínima como gate de PR. *(§18)*

---

## §22. Apêndice — verificações pessoais

Todas as afirmações de alta severidade foram verificadas diretamente em arquivo de código-fonte. Abaixo o registro das verificações desta auditoria:

| Alegação | Arquivo/Método verificado | Resultado |
|---|---|---|
| `__isSystem` vem do body do cliente? | [DynamicTableService.ts:389,467](../server/src/features/dynamicTables/services/DynamicTableService.ts) | ✅ Confirmado — `!!dataDto.data?.__isSystem` |
| `VectorRepository.search` filtra userId? | [VectorRepository.ts:156-163](../server/src/features/documents/repositories/VectorRepository.ts) | ✅ Confirmado ausente (vs `searchVectors:210` que filtra) |
| `canChangeRole` bloqueia não-admins? | [UserService.ts:182-188](../server/src/features/users/services/UserService.ts) | ✅ Confirmado — lança `ForbiddenError` (botão "Make Admin" bloqueado no back) |
| `.npmrc` com credenciais? | [server/.npmrc](../server/.npmrc) | ❌ Apenas `legacy-peer-deps=true` |
| `deleteDocument` deixa órfãos no Qdrant? | [DocumentService.ts:139-155](../server/src/features/documents/services/DocumentService.ts) | ❌ Limpa corretamente (pontos→chunks→doc), não-transacional |
| Graceful shutdown existe? | Grep `SIGTERM\|SIGINT\|process.on` em src/ | ✅ Zero matches — ausente |
| Transações de escrita existem? | Grep `$transaction` em src/ | ✅ Apenas 4, todos `[findMany, count]` read-only |
| `handsontable`/`exceljs` usados no front? | Grep em todo my-app | ✅ Zero imports — dependências mortas |
| `chatMessages.json` em PT? | `ls public/locales/pt/` | ✅ Arquivo ausente — bug vivo |
| `structuredData` tem consumidor no front? | Grep `structured-data\|StructuredData` em my-app | ✅ Zero referências — feature órfã |
| `monitoring.ts` é observabilidade real? | Leitura direta | ❌ Apenas timer→logger (sem métricas exportáveis) |
| `searchDocuments` retorna chunkText? | [DocumentService.ts:174](../server/src/features/documents/services/DocumentService.ts) | ✅ Confirmado `payload.text` (deveria ser `textContent`) — retorna `undefined` |
| `updateMyPreferences` aceita campos arbitrários? | [userController.ts:124-157](../server/src/controllers/userController.ts) | ❌ `PreferencesSchema` restringe a `locale`/`currency` — seguro |
| Express version real? | `server/package-lock.json` | ✅ 4.21.2 (manifesto `^4.18.2`); body-parser 1.20.3; path-to-regexp 0.1.12 — todos patcheados |
| jsonwebtoken version real? | `server/package-lock.json` | ✅ Confirmado 8.5.1 — anterior aos CVEs 2022 |
| Chat-instances lista todos os tenants? | [chatInstancesController.ts:26-28](../server/src/controllers/chatInstancesController.ts) | ✅ Confirmado — chamada sem filtro userId quando sem `?type` |

---

*Fim da auditoria consolidada. 40 READMEs + ~586 arquivos `.ts/.tsx` varridos. Nenhuma linha de código foi alterada durante esta auditoria.*
