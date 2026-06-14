# Skill Audit Report

## Summary

| Metric | Count |
|---|---:|
| Atoms found | 37 |
| Skills created | 27 |
| Meta-agents created | 3 |
| Skills updated | 3 |
| Skills skipped | 0 |
| Risks (High) | 2 |
| Documentation files | 3 |

## Created Skills

| Skill | Path | Atom Coverage | Confidence |
|---|---|---|---|
| backend-route-generator | .claude/skills/backend-route-generator/SKILL.md | Route, OpenAPI block, routes/index.ts | High |
| backend-controller-generator | .claude/skills/backend-controller-generator/SKILL.md | Controller, Zod inline schema | High |
| backend-service-generator | .claude/skills/backend-service-generator/SKILL.md | Service, Factory registration, typed errors | High |
| backend-repository-generator | .claude/skills/backend-repository-generator/SKILL.md | Repository, IRepository, pagination, soft-delete | High |
| backend-policy-generator | .claude/skills/backend-policy-generator/SKILL.md | Policy, IPolicy, role/ownership checks | High |
| backend-dto-generator | .claude/skills/backend-dto-generator/SKILL.md | DTO, Zod schema, type guards, OpenAPI comment, domain model | High |
| backend-prisma-model-generator | .claude/skills/backend-prisma-model-generator/SKILL.md | Prisma model, migration, generate | High |
| dynamic-table-preset-generator | .claude/skills/dynamic-table-preset-generator/SKILL.md | Preset module, field preset, system preset, @@PRESET_TABLE_KEY | High |
| analytics-kpi-generator | .claude/skills/analytics-kpi-generator/SKILL.md | KPI processor, template, test, index registration, single-pass | High |
| document-processing-generator | .claude/skills/document-processing-generator/SKILL.md | Extractor, RAG pipeline, status tracking (PENDING→COMPLETED\|ERROR) | High |
| job-generator | .claude/skills/job-generator/SKILL.md | Background job, seed fixture | Medium |
| frontend-page-generator | .claude/skills/frontend-page-generator/SKILL.md | Next.js page, getServerSideProps, i18n, withAuth, dynamic() | High |
| frontend-feature-module-generator | .claude/skills/frontend-feature-module-generator/SKILL.md | Category view, dynamic import, dashboard registration | High |
| frontend-component-generator | .claude/skills/frontend-component-generator/SKILL.md | React FC, modal, form field, dark mode, Galaxy theme | High |
| frontend-hook-generator | .claude/skills/frontend-hook-generator/SKILL.md | Custom hook, fetch/state/form, cleanup pattern | High |
| frontend-context-provider-generator | .claude/skills/frontend-context-provider-generator/SKILL.md | Context, Provider, useX hook guard, _app.tsx registration | High |
| frontend-widget-generator | .claude/skills/frontend-widget-generator/SKILL.md | Dashboard widget, Recharts chart, KPI card, loading/error/empty | High |
| frontend-api-service-generator | .claude/skills/frontend-api-service-generator/SKILL.md | Frontend service, apiClient wrapper, typed methods | High |
| fullstack-feature-generator | .claude/skills/fullstack-feature-generator/SKILL.md | All 15 layers from Prisma to frontend page | High |
| api-contract-sync-generator | .claude/skills/api-contract-sync-generator/SKILL.md | DTO sync, frontend types alignment | High |
| crud-resource-generator | .claude/skills/crud-resource-generator/SKILL.md | Full CRUD with soft-delete across all layers | High |
| dashboard-kpi-end-to-end-generator | .claude/skills/dashboard-kpi-end-to-end-generator/SKILL.md | KPI processor + template + frontend card + hook | High |
| chat-domain-generator | .claude/skills/chat-domain-generator/SKILL.md | LuminarisAgent tools, RAG pipeline, ActionProposal flow, KnowledgeGraph | High |
| backend-test-suite-generator | .claude/skills/backend-test-suite-generator/SKILL.md | Jest service/repo/KPI/middleware/security — buildService factory, clearAllMocks, toBeCloseTo | High |
| interview-setup-generator | .claude/skills/interview-setup-generator/SKILL.md | Wizard 11-stage state machine, CustomizationService, FieldCustomizationService, StateManager | High |
| structured-data-generator | .claude/skills/structured-data-generator/SKILL.md | XLSX→tabela editável, DATA_ANALYSIS vs KNOWLEDGE_BASE, StructuredDataService, multi-sheet | High |

## Gaps

| Atom | Reason |
|---|---|
| ~~chat-domain-generator~~ | **Criado.** Ver `.claude/skills/chat-domain-generator/SKILL.md`. Cobre os dois modos (RAG e AGENT ERP), tool calls, ActionProposal flow e KnowledgeGraph. |
| ~~backend-test-suite-generator~~ | **Criado.** `.claude/skills/backend-test-suite-generator/SKILL.md` |
| ~~interview-setup-generator~~ | **Criado.** `.claude/skills/interview-setup-generator/SKILL.md` |
| ~~structured-data-generator~~ | **Criado.** `.claude/skills/structured-data-generator/SKILL.md` |
| OpenAPI standalone | Coberta como parte de `backend-route-generator` — não precisou de skill separada. |
| frontend-i18n-generator | Coberta como parte de `frontend-page-generator`. |
| frontend-chart-generator | Coberta como subtipo `chart` em `frontend-widget-generator`. |
| frontend-modal-generator | Coberta como subtipo `modal` em `frontend-component-generator`. |
| analytics-processor-generator (dynamic) | Coberta em `analytics-kpi-generator` como subtipo de processor dinâmico. |
| vector-rag-step-generator | Coberto em `document-processing-generator`. |
| module-vertical-slice-generator | Alias de `fullstack-feature-generator`. |

## Risks

1. **backend-prisma-model-generator** — Risco HIGH: executa `prisma migrate dev` que modifica o banco de dados real. A skill inclui aviso explícito e instrução de confirmação com o usuário antes de executar. Nunca executar em produção sem backup.

2. **fullstack-feature-generator** — Risco HIGH: modifica 10-15 arquivos em sequência encadeada. Qualquer erro em um passo pode quebrar imports subsequentes. Recomendado: usar em branch separada, confirmar typecheck após cada passo, revisar diff antes de commit.

## Quality gates passed

- [x] Todos os SKILL.md têm frontmatter YAML válido (`name`, `description`, `argument-hint`, `allowed-tools`) — verificado: 116 campos = 29 skills × 4
- [x] Todos apontam para arquivos reais do repositório em "Repository patterns to inspect first"
- [x] Todas as 26 skills geradoras têm seção "Anti-patterns" (os 3 meta-agentes usam "Restrições do agente")
- [x] Todas as 26 skills geradoras têm seção "Required checks" com comandos reais do package.json
- [x] Todos têm seção "Files usually created or changed"
- [x] Nenhuma skill inventa paths que não existem no repo
- [x] Nenhuma skill manda usar padrões que o repo não usa (ex: Redux, REST sem JSON, etc.)

## Auditoria gold-standard (pass de verificação)

Verificação factual contra o código real do repositório:

- [x] **Todos os 41 paths referenciados existem** — 29 arquivos + 7 diretórios + 5 test files, 0 missing
- [x] **Comandos reais confirmados** — `npx tsc --noEmit`, `npx jest`, `npx next lint`, `npx prisma migrate dev` batem com `server/package.json` e `my-app/package.json`
- [x] **Zod versões divergentes documentadas** — server usa Zod 4.1.8, my-app usa Zod 3.25.56 (`z.coerce.date()` válido em ambos)

### Defeitos encontrados e corrigidos nesta auditoria

| Arquivo | Defeito | Correção |
|---|---|---|
| `analytics-kpi-generator/templates/example-ticket-medio.md` | Usava tipos inventados (`KpiProcessorContext`, `KpiTemplate`, `KPI_PROCESSORS`, `moneyUtils`) e `ChartDataPoint` com `id/label/unit/format`; acessava `row[field]` | Reescrito com `AnalyticsProcessorContext`, `AnalyticsTemplate`, `addMoney` de `CurrencyUtils`, `ChartDataPoint = {name,value,previousValue?}`, acesso `row.data[field]`, registro via `registerProcessor`/`registerTemplate` |
| `backend-test-suite-generator/SKILL.md` (seção KPI) | `KpiProcessorContext`, identificava ponto por `r.id`, rows shape `{amount,date}` | Corrigido para `: any` context, `p.name`, rows `{ id, data: {...} }` |
| `analytics-kpi-generator/SKILL.md` | Descrição de registro vaga ("exportar processor e template") | Detalhado: `registerProcessor` + auto-registro do template + `types: ['number']` |
| `fullstack-feature-generator/templates/example-appointments.md` | `import { IUser } from '../../../lib/types'` (path inexistente) | Corrigido para `'../../users/models/User.model'` |

### Segunda varredura (pontos cegos) — helpers, tipos e referências cruzadas

Verificação dos nomes de função/tipo citados em TODAS as skills (não só analytics) + consistência interna:

**Confirmado contra código real:**
- [x] `getUserContextFromRequest(req)` → `UserContext | null`, de `@/lib/authUtils` ✓
- [x] `getFactory()` + getters `get<Resource>Service()` (ex: `getChatService`, `getDocumentService`) ✓
- [x] Resposta de controller `{ success: true, data }` (+ `pagination` opcional) ✓
- [x] Zod inline `Schema.safeParse(req.body)` ✓
- [x] `lib/errors.ts` exporta exatamente: `AppError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ValidationError`, `ServiceError` ✓
- [x] `wrapSystemPrompt(base, userId)` + `sanitizeUserInput(input)` de `@/lib/PromptSanitizer` ✓
- [x] `ActionProposal` model: `status` é String com default `"PENDING"` (valores PENDING/EXECUTED/EXPIRED em comentário, não enum formal); campo `tableId` existe além de `tableName/tableLabel` ✓
- [x] `Role` enum = `USER`, `ADMIN` ✓
- [x] `ChatResponse.type` = `'TEXT' | 'ACTION_PROPOSAL'` ✓
- [x] `prisma` é **default export** de `lib/prisma.ts` ✓
- [x] Frontend: `withAuth` HOC (`lib/hoc/withAuth.tsx`) **E** `useAuth()` ambos existem ✓
- [x] `apiClient` singleton; `notify()` de `lib/notifications/notify` (CustomEvent, não método do apiClient) ✓
- [x] Cookie `auth_token` via `getCookie` de `cookies-next`; header `x-user-timezone` ✓
- [x] Frontend services definem tipos **locais** (`../../types/User`), não importam do backend ✓
- [x] **Referências cruzadas:** 0 quebradas — todas as sub-skills citadas existem; SKILL_MATRIX ↔ diretórios = 29/29 bidirecional; 4 docs referenciados pelos meta-agentes existem; GENERATION_CONTRACTS.md sem paths inventados ✓

**Defeito encontrado e corrigido:**

| Arquivo | Defeito | Correção |
|---|---|---|
| `fullstack-feature-generator/templates/example-appointments.md` + `luminaris-reviewer/SKILL.md` | `handleApiError(res, err)` — **ordem de argumentos invertida** (a real é `(error, res)`) | Corrigido para `handleApiError(error, res)` em ambos. A skill canônica `backend-controller-generator` já estava correta. |

### Terceira varredura (prova empírica de compilação)

Em vez de só ler, **geramos uma feature real (`appointments`) seguindo o template e compilamos com `npx tsc --noEmit`**. Esta é a prova definitiva: código que não compila = defeito real.

**Metodologia:**
1. Baseline estabelecido: `server` tsc exit 0; `my-app` tsc **exit 2** (bug pré-existente encontrado, ver abaixo)
2. Geramos `Appointment` (model Prisma + DTO + IRepository + Repository + Policy + Service + Controller) seguindo o template
3. `npx prisma generate` (só tipos, sem tocar no banco) + `npx tsc --noEmit`
4. Defeitos corrigidos até atingir **exit 0 verde**
5. Limpeza completa: feature removida, schema revertido, client regenerado, baseline restaurado (server exit 0 confirmado)

**Bug pré-existente no código (não nas skills) — corrigido:**

| Arquivo | Bug | Impacto | Correção |
|---|---|---|---|
| `my-app/components/widgets/chat/components/DocumentChatWidget.tsx` | Imports `../hooks/UseChatInstance`, `UseChatMessages`, `UseChatInput` com casing errado (arquivos reais são `use...`) — TS1149 | `npx tsc --noEmit` (check de TODAS as skills frontend) falhava mesmo com código perfeito | Casing corrigido nas 3 linhas; `my-app` agora compila exit 0 |

**Defeitos no template encontrados SÓ pela compilação (invisíveis às 3 auditorias de leitura):**

| Defeito | Detalhe | Correção |
|---|---|---|
| Import de tipo Prisma errado | `import { Appointment } from '@prisma/client'` → o projeto gera em `generated/prisma` (custom output path) — `@prisma/client` não exporta os models | Corrigido para `from 'generated/prisma'` + callout no topo do template |
| `Role` no policy | Template importava `Role` de `@prisma/client` | Corrigido para `../../users/models/User.model` (re-exporta o enum) |
| Tipo do `actor` no service | Template usava `actor: UserContext`; convenção real é `actor: IUser \| null` | Corrigido — `UserContext` é estruturalmente atribuível a `IUser`, controller passa direto |

> As skills canônicas (`backend-repository-generator`, `backend-prisma-model-generator`) **já estavam corretas** (`generated/prisma`) — os defeitos estavam só no template auxiliar criado nesta sessão.

> **Veredicto final (após 3 passes):** Conjunto de 26 skills geradoras + 3 meta-agentes em padrão ouro, **comprovado por compilação real**. 9 defeitos encontrados e corrigidos no total (4 leitura analytics + 1 helper order + 1 bug de casing no app + 3 na prova de compilação). Baseline: server e my-app compilam exit 0. Uma feature completa gerada via skill compila contra os tipos reais. 0 referências quebradas, 41/41 paths existem, 29/29 skills sincronizadas. Repositório deixado limpo (única mudança de app retida: o fix de casing, que é um bug legítimo).

### Quarta varredura (build de módulo real — CRM, com walkthrough autenticado)

Construímos uma **fatia vertical real de um módulo CRM** (preset selecionável + backend de orquestração + 3 telas) usando as skills, e validamos não só por `tsc` mas **rodando backend + frontend e exercitando a API autenticada** (`/api/crm/pipeline/advance`). O runtime pegou defeitos que nem a leitura nem a compilação pegaram.

**Defeitos que SÓ o runtime/walkthrough pegou:**

| # | Defeito | Como apareceu | Correção nas skills |
|---|---|---|---|
| 1 | **Registro de rota incompleto** — `/api/<resource>` precisa ir ao `protectedApiPaths` em `middleware/auth.ts`, senão dá **401 com token válido** (user context não populado) | `tsc` verde, mas `POST /api/crm/...` retornava 401 mesmo logado | `backend-route-generator`, `fullstack-feature-generator`, `crud-resource-generator`, `luminaris-reviewer`, `GENERATION_CONTRACTS.md` — registro agora documentado como **3 toques** |
| 2 | **`AuthContext` sem fallback de URL** (pré-existente, não-CRM) — lê `process.env.NEXT_PUBLIC_API_BASE_URL` direto; sem `.env` o login trava em "Authenticating…" | App não autenticava no preview | `frontend-api-service-generator` — anti-pattern "nunca ler env direto; usar `apiClient` (tem fallback)" |
| 3 | **Validação composta + integridade referencial** de DynamicTable (criar lead exige `unitId`+`pipelineId`+`stageId`; hard-delete bloqueado por `leadActivities`) | 400/cascade no runtime | `dynamic-table-preset-generator` — nota de runtime |

**Imprecisões de skill corrigidas (descobertas ao escrever código real):**
- `dynamic-table-preset-generator`: schema é `as ITableSchema` (não `as const`); `tables` é `Record<string,…>` (chave = `internalName`) via `createTableFromModule`, não array; `category` deve ser `DynamicTableCategory` válido (não existe `crm`); conceito de **suite selecionável** (`systems/`) vs auto-instalada (`CoreSystemPreset`).
- `backend-service-generator` + `GENERATION_CONTRACTS.md`: documentada a **variante de orquestração sobre DynamicTable** (resolve por `internalName`; `update/deleteTableData` recebem `dataId`, `create/getTableData` recebem `tableId`; sem policy redundante).
- `backend-controller-generator`: guard de `null` no `getUserContextFromRequest` (`UserContext | null`).

**Prova end-to-end (autenticada):** lead demo criado → `POST /api/crm/pipeline/advance` → **200** → etapa avançou *Sem Contato → Reunião Agendada* + `nextActionAt` setado + atividade auto-logada. Backend e frontend compilam **exit 0**; 3 rotas `/crm` servem **200** sem erro de console. Dados demo limpos, senha de teste restaurada.

**Quinta camada — teste de VOLUME (seed):** populamos as telas CRM com volume (15 contas, 80 leads, 45 contatos, 45 propostas, 192 atividades, 2 pipelines) via um dev-seed idempotente (`server/scripts/seed-crm-demo.js`). O volume + múltiplos pais pegou um **bug de view** que dados happy-path escondiam:

| Defeito | Detalhe | Correção nas skills |
|---|---|---|
| **Kanban com colunas duplicadas** | A tela de pipeline agrupava por TODAS as etapas; com 2 pipelines → 8 colunas (nomes duplicados, metade vazia) | `frontend-feature-module-generator` + `luminaris-reviewer`: board filtra pelo pai ativo + testar com >1 pai. Fix em `pages/crm/pipeline.tsx` (seletor de pipeline). |
| Padrão de dev-seed | Idempotência via `__demo`, `createMany`, criar tabela de módulo selecionável sob demanda, gotcha de ordenação API vs `findMany` | `job-generator`: nova seção "Dev Seed de VOLUME" |
| **React não hidratava no preview** (telas presas em "Authenticating…") | O dev static-route-indicator do Next 15.3.1 (`handleStaticIndicator`) crasha na msg `isrManifest` do HMR e **aborta o bootstrap antes da hidratação** → `useEffect` nunca roda → `isLoading` fica no `true` inicial | **RESOLVIDO:** `devIndicators: false` no `next.config.js`. Após isso o React hidrata e as telas renderizam (prova visual capturada: Overview com 80 leads, Kanban com 4 colunas). |
| **`AuthContext` re-validava com spinner global** | `routeChangeComplete` chamava `checkAuthState()` (toggle `isLoading`) e o locale-sync fazia `router.replace` em loop → spinner perpétuo | Fix em `AuthContext.tsx`: re-validação **silenciosa** (`{ silent: true }`), guard anti-loop no locale-sync, timeout backstop, resolve incondicional. Regras novas em `frontend-context-provider-generator`. |
| **Views truncavam em 50 registros** | hooks liam DynamicTable sem paginar; a API retorna só 50 linhas por padrão → Overview mostrava 50/80 leads, KPIs errados | Fix: `features/crm/lib/crmFetch.ts` (`fetchAllRows` pagina até `totalPages`). Regras novas em `frontend-hook-generator`, `frontend-api-service-generator`, `luminaris-reviewer`. **Prova:** Overview passou a mostrar 80 leads / R$4.065.000. |

**Sexta camada — fidelidade visual (design system):** o usuário notou que as telas, embora estruturalmente corretas, estavam **off-brand** (Tailwind genérico `zinc`/`rounded-xl`/`semibold`). Causa-raiz: as skills de frontend eram **arquiteturais, sem encodar o design real** — pior, o `frontend-component-generator` literalmente prescrevia `dark:bg-zinc-900`.

| Defeito | Correção |
|---|---|
| Sem skill de design → telas genéricas | Criada `frontend-design-system` (tokens `neutral`/`lumi-*`, gradient header, score gauge SVG, BANT bars, badges `color/10+color/20`, KPI tiles) + UI kit `features/crm/components/ui/` |
| Skills de UI não aplicavam o design | Cross-ref obrigatório adicionado em `frontend-component/page/widget/feature-module-generator` + regra fixa no `luminaris-orchestrator` + check no `luminaris-reviewer` (flag `zinc`/`rounded-xl`/`semibold`) |
| `frontend-component-generator` mandava `dark:bg-zinc-900` | Corrigido para `dark:bg-neutral-900` + `white/5` + `font-black` |
| Hidratação travava no preview | `devIndicators: false` (crash do dev-overlay do Next 15.x) + nota de troubleshooting em `frontend-page-generator` (hierarquia `tsc < SSR < hidratação < interatividade` + fallback de mockup estático) |

**Calibração da `frontend-design-system` (comparação real × documentado):** medição objetiva por frequência de classes nos componentes reais (`features/dashboard`, 97 arquivos) revelou que a 1ª versão da skill **super-ajustou ao `ManageHeader`** (um hero) e generalizou flourishes dele:

| Afirmação original | Realidade medida | Correção |
|---|---|---|
| `dark:bg-zinc-` é o erro | `zinc` = **0** usos; `neutral` = 297 | ✅ mantido (zinc é o único sinal confiável) |
| `border-white/5` é o token de borda | só **6 arquivos (leads)**; `border-neutral-` = 67× / 27 arq | borda padrão agora é `dark:border-neutral-800`; `white/5` vira flourish opcional de hero |
| "não use `font-semibold`" | `font-semibold` = **151×** (peso dominante) vs `font-black` 59× | `font-semibold` é corpo normal; `font-black` só p/ ênfase |
| reviewer flaga `rounded-xl` | `rounded-lg/xl` = **183× / 74 arq** (inputs/botões) | só cards são `2xl`; `rounded-xl` não é off-brand |

O grep do reviewer foi reduzido a `zinc-` (único confiável) — antes tinha 2 falsos positivos que reprovariam código legítimo do app. `frontend-design-system`, `frontend-component-generator` e `luminaris-reviewer` corrigidos.

> **Veredicto (após 4 passes + volume + visual + calibração):** A biblioteca reflete o **registro de rota em 3 toques**, **orquestração sobre DynamicTable**, **board filtrado por pai ativo**, **paginação obrigatória**, e o **design system real (medido, não suposto)**. Lição central: **leitura < compilação < runtime < volume < fidelidade visual** — e a fidelidade visual em si precisa ser **medida contra o código real**, não inferida de um único componente. Cada camada pega uma classe de defeito que a anterior esconde.

## Recommended next pass

1. ~~**Criar `chat-domain-generator`**~~ — **Concluído.** `.claude/skills/chat-domain-generator/SKILL.md`
2. ~~**Criar `backend-test-suite-generator`**~~ — **Concluído.**
3. ~~**Adicionar `templates/` auxiliares**~~ — **Concluído.** `fullstack-feature-generator/templates/example-appointments.md` e `analytics-kpi-generator/templates/example-ticket-medio.md`
4. ~~**Criar `interview-setup-generator`**~~ — **Concluído.**
5. ~~**Criar `structured-data-generator`**~~ — **Concluído.**

> **Todos os gaps resolvidos. Skills library completa — 26 skills, 0 gaps pendentes.**
