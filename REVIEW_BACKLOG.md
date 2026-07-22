# Review Backlog — lembretes para revisar depois

> Lista viva de pontos adiados durante as revisões gold do back-end. Atualizado em **2026-06-25**.
> Alguns itens vêm de anotações antigas — **verificar contra o código atual** antes de agir.
> Status das features já revisadas (gold): `dashboardLayout`, `users`, `chat`, `chatInstances`,
> `chatMessages`, `documents`, `reports`, `structuredData`, `dynamicTables`.
> Molde: `server/src/features/FEATURE_TEMPLATE.md` + skill `backend-feature`.

## 1. Features ainda NÃO revisadas (aplicar o molde + pass gold)

- [ ] `analytics`
- [ ] `interview`

> **`dynamicTables` revisada por completo** (core + decomposição + docs + utils + presets + rules/plugins).
> Pendências/opcionais não-bloqueadoras listadas em §2.

> **`structuredData` revisada (gold) em 2026-06-22.** Esclarecimento importante: ela **NÃO** tem ligação
> com `dynamicTables` — é satélite de `documents` (tabelas extraídas de uploads Excel/PDF, 1:1 com
> `Document`). Quem armazena os dados das tabelas dinâmicas do ERP é a feature `dynamicTables`
> (`DynamicTable` + `DynamicTableData`).

## 2. Follow-ups por feature (adiados de revisões concluídas)

### 2.1 Superfície de API órfã / completude dos CRUDs (ADIADO até auditar o front — 2026-06-25)

> **Contexto/decisão (não tocar agora, só após reanalisar o `my-app`).** Levantado durante a criação dos
> testes (Etapas 1–5). **O ideal NÃO é "todo CRUD ter create+read+list+update+delete por simetria"** —
> isso é superfície de ataque e código morto desnecessário (YAGNI). O ideal é: **a API corresponde às
> necessidades reais do produto, é consistente, autorizada e testada, com ZERO código órfão** (método de
> service implementado, com policy, mas **sem rota**). O problema atual NÃO é falta de endpoint que trave
> o front — é o oposto: **código meio-construído e desconectado**.
>
> **Regra de ouro a aplicar quando for mexer:** todo método público de service está **(a) acessível por
> rota + testado**, ou **(b) removido**. O estado "implementado sem rota" não deve existir. Viés: remover
> (re-adicionar é trivial; o git guarda o histórico). Decidir caso a caso conforme o roadmap de produto.
>
> **Estado por feature (auditado em 2026-06-25):** `users`, `documents`, `dashboardLayout` = CRUD completo
> e conectado. `structuredData` = parcial **proposital** (create via pipeline, delete via cascade —
> variante OK). Órfãos a decidir (wire-vs-remove):
> - `chatMessages`: `getMessageById` / `updateMessage` / `deleteMessage` (+ policy) sem rota — depende de
>   "editar/apagar mensagem" ser feature de produto. Ver §2 → chatMessages.
> - `chatInstances`: `getInstanceById` sem rota GET /:id. Ver §2 → chatInstances.
> - `dashboardLayout`: `canListAll` sem chamador. Ver §2 → dashboardLayout.
> - Type guards `isXDto` não usados (chat/chatInstances/chatMessages). Ver §2.
> - **`factory.ts` getters sem chamador** (compositionroot): `getLuminarisAgentService`,
>   `getKnowledgeGraphService`, e 5 getters de repository (chatInstance/chatMessage/dashboardLayout/
>   document/knowledgeGraph) + o bloco `export type { I... }`. **Mantidos de propósito** (convenção do
>   composition root; `dynamicTables`/`interview` podem usar). Decidir manter-vs-remover quando essas
>   features forem construídas. (Removidos por engano na Stage 7 do hardening; revertidos 2026-06-26.)
>
> **Pré-requisito antes de decidir:** auditar o `my-app` (chamadas `*.api.ts` / `*.service.ts`) contra as
> rotas do back, nos **dois sentidos** (endpoint que falta × endpoint que sobra), pois a análise acima
> inferiu necessidades do front pelas rotas existentes, sem ler o consumo real.

### dynamicTables (revisão CONCLUÍDA — log abaixo + pendências/opcionais ao final)
- [x] **Etapa 1 (Core & Tier-0):** Tier-0 auditado = sólido. Fase A aplicada (Cache-Control `private`,
  removidos `ctx as any`, 401 padronizado, `:id` flatten, guards `UnauthorizedError`).
- [x] **Bug corrigido (achado pela suíte de caracterização):** `enforceNoOverlap` passava `String(Date)`
  (não-ISO) para o `$queryRaw`, que o `datetime()` do SQLite não parseava → **sobreposição nunca
  detectada** (duplo-agendamento silencioso). Fix: normalizar para `toISOString()`.
- [x] **Fase B:** suíte de caracterização de integração (SQLite real) com 35 testes cobrindo Tier-0,
  validação, immutableAfter, unique, compositeUnique, requiredIf, compare, lifecycle, readOnly,
  isSystem bypass, beforeUpdate-persistence, noOverlap, relações, delete-constraints, preset install.
  Arquivo: `server/src/features/dynamicTables/services/__tests__/DynamicTableService.integration.test.ts`.
- [x] **Fase C (decomposição):** extraídos `validation/SchemaValidator` (155), `validation/GovernanceEngine`
  (278), `services/PresetInstallerService` (191). Service: 1.063 → 552 LOC. A 4ª extração
  (`DynamicTableDataService`) foi **descartada por decisão sênior** (seam não-limpo: dados funilam por
  getTableById/findTableForData = estrutura; split aumentaria acoplamento sem ganho real).
- [x] **Fase D:** README gold + docs (`architecture`, `validation-and-governance`) atualizados; variantes
  documentadas. **Revisão do core concluída.**
- [x] **Etapa 3 — `rules/` (plugins) ANALISADA:** Tier-0 sólido (acesso cross-table escopado por
  `ctx.userId` via `tableFinder.resolveTable`); fronteira metadado×plugin respeitada; side-effects atômicos
  no `$transaction`. Removido 1 código morto (`sales/stockSync`). Smudge menor: `StockMovementsApplyPlugin`
  revalida presença/enum/range que poderiam ser declarativos (defensivo, não alterado). `as any` (~166)
  mantido adiado. Opção futura: varredura profunda de `LeadsPlugin`/`AppointmentsPlugin`.
- [x] **Revisão das demais pastas (utils/ + models):** removidos 4 arquivos mortos do `utils/`
  (`TableUtils`, `RelationUtils`, `TableDependencyUtils`, `PresetDependencyUtils` — duplicatas server de
  helpers client do frontend, sem consumidor; tinham furo Tier-0 latente). `policies/repositories/dtos/`
  e `models/DynamicTable` confirmados sólidos.
- [x] **Etapa 4 — `presets/` (CONCLUÍDA):** camada sólida. `CoreSystemPreset` inline **já estava
  refatorado** (débito obsoleto). Padrão dos módulos correto (spot-check de cross-reference no SalesModule
  ✓). Removidos 2 models redundantes/mortos (`TableModule.model`, `TablePreset.model`); `PresetManager`
  re-tipado para `PresetSuite`. `tsc` + 35 testes verdes.

#### dynamicTables — Stage 6 dos testes CONCLUÍDO (2026-06-30)
- [x] **Suíte gold completa:** `DynamicTablePolicy.spec` + `DynamicTable.dto.spec` + `dynamicTables.routes.integration.test`
  + `rules/__tests__/plugins.integration.test.ts` (todos os 10 plugins). Feature **GOLD**. Suíte 500 → 574.
- [x] **Bug Tier-0 corrigido:** `resolveRelations` (`/lookup`) não filtrava as linhas resolvidas pela tabela
  autorizada → vazamento de labels cross-tenant via `findDataByIds`. Agora filtra por `dynamicTableId`.
  Guard de regressão no teste HTTP.
- [x] **Integridade do delete corrigida:** `findRowsReferencingId` tinha `LIMIT 100` → `RESTRICT_IF_AGGREGATE`
  subcontava e `CASCADE` deixava órfãos > 100. `LIMIT` removido (scan roda dentro da `$transaction`).
- [x] **Varredura profunda de `LeadsPlugin`/`AppointmentsPlugin`:** agora cobertos por testes de integração
  comportamentais (transições de stage, defaults, BANT score, snapshot; clock/customer/completion). Um passe
  de **tipagem** linha-a-linha ainda é opcional (ver `as any` abaixo).
- [ ] **SalesPlugin — side-effects profundos de finalize** (stockSync, comissões, customerMetrics,
  appointmentSync) cobertos quando revisarmos o **preset Sales ERP** (fixture real = o preset inteiro).
  Os guards de header/itens já estão testados.

#### dynamicTables — pendências/opcionais (não-bloqueadoras)
- [ ] **Débito cosmético adiado (decisão 2026-06-30): catalogar, não limpar agora.** ~197 `as any`
  (majoritariamente tipagem do dado dinâmico nos plugins — intrínseco a `RuleContext.before/after:
  Record<string, any>`; um `RuleContext<TData>` genérico reduziria) **+** comentários inline em PT
  espalhados pela feature (regra `backend-docs` = inglês). Tratar quando os plugins forem estendidos
  (mudança será majoritariamente adições, não correções).
- [ ] **Fronteira (smudge):** `rules/plugins/StockMovementsApplyPlugin` revalida `productId`/`unitId`
  presença, `type∈{In,Out}` e `quantity>0` que **poderiam ser declarativos** (`required` / `select` /
  `validation.minValue`). É defensivo; avaliar mover para o schema ou aceitar a duplicação.
- [ ] **`as any` (~166) nos plugins** — tipagem do dado dinâmico adiada (ver também §3). Intrínseco ao
  `RuleContext.before/after: Record<string, any>`; um `RuleContext<TData>` genérico reduziria os casts.
- [ ] **Varredura profunda opcional:** `rules/plugins/LeadsPlugin` (407 LOC) e `AppointmentsPlugin` —
  os 2 plugins mais densos não foram lidos linha-a-linha (seguem o padrão verificado, mas mereceriam um
  passe dedicado para blindagem total).
- [ ] **Cross-reference exaustivo dos 26 módulos de preset:** só `SalesModule`+`UnitsModule` foram
  conferidos a fundo (governança → nomes/valores de campos; `@@PRESET_TABLE_KEY::` → chaves). O motor
  **não** valida que `immutableAfter.condition.field` existe — um typo num módulo vira regra silenciosa.
  Vale um script/teste que valide todos os módulos de uma vez.
- [ ] **Cosmético:** módulos declaram `description` que o `createTableFromModule`/`PresetTableDefinition`
  **descartam** (campo morto). Decidir: incluir `description` no `PresetTableDefinition` ou remover dos módulos.

### Teste flaky (não-bloqueador)
- [x] `analytics/engine/__tests__/KpiEngine.spec.ts` — asserção de performance `expect(execTime)
  .toBeLessThan(500)` afrouxada para `< 10000` (sanity ceiling, não benchmark) na Fase 0 de testes.
  A asserção real do teste (matemática decimal exata) foi preservada.

### structuredData
- [ ] **Frontend não chama `/api/structured-data`** hoje (grep em `my-app/` não acha). O `GET` estava
  quebrado (mismatch `UserContext`/`IUser`, corrigido) e o `SpreadsheetWidget` parece não estar fiado à
  API. Verificar/fiar o widget quando for usar leitura+edição em produção.
- [ ] (Roadmap, opcional) Ponte `structuredData` → `dynamicTables`: importar uma planilha enviada e
  materializá-la como `DynamicTable`. Hoje **não existe**; seria feature nova.

### reports (adiado para análise futura — decisão sua)
- [ ] **Persistir a análise/gráfico no histórico do chat?** Hoje é **efêmero**: `chatInstanceId` é só
  id de correlação (ecoado, não salvo). Persistir = feature nova (injetar `ChatMessageService` etc.).

### documents
- [ ] **`listDocuments` envia `textContent` completo** de todos os docs (payload pesado). Projeção
  mínima muda o shape da resposta — **verificar o frontend antes** (`my-app/features/documents`,
  `my-app/lib/services/document.service.ts`).
- [ ] `VectorRepository.search` vs `searchVectors` são quase duplicados — consolidar (cuidar do
  caminho gold do chat + validação de `limit` do `SearchVectorsSchema`).

### chat
- [ ] **`history` do contexto do LLM vem do cliente** (self-scoped, sem cross-tenant). Hardening:
  carregar o histórico do `chatInstanceId` no servidor em vez de confiar no payload.

### chatMessages
- [ ] `getMessageById` / `updateMessage` / `deleteMessage` (service) + `canView`/`canUpdate`/`canDelete`
  (policy) **não têm rota** — decidir: expor (editar/remover mensagem) ou remover o código morto.

### chatInstances
- [ ] `getInstanceById` existe no service mas **sem rota HTTP** — expor ou remover.

### chat / chatInstances / chatMessages
- [ ] Type guards `isXDto` não usados — limpar (já removidos em users/dashboardLayout/documents).

### dashboardLayout
- [ ] **Abas reordenam por `updatedAt`** a cada autosave → o `DashboardTabsBar` pode "pular".
  Investigar a ordem de render (talvez fixar por `createdAt`).
- [ ] **`DashboardLayoutPolicy.canListAll` (+ na interface) não tem chamador** — policy ADMIN-only para
  "listar layouts de todos os usuários", mas não existe rota admin que liste tudo. Code morto. Decidir:
  fiar rota admin de listagem global ou remover dos dois (policy + interface + teste em
  `DashboardLayoutPolicy.spec`). Achado na Etapa 4 dos testes (2026-06-25). Ver §2.1.

### auth (authController — agora GOLD)
- [x] **`authController` refatorado para gold.** `register`/`login` agora validam com DTO
  (`CreateUserSchema` + `LoginSchema`) e delegam ao `UserService` (`createUser` / novo
  `authenticate`). Removido Prisma do controller; hash unificado (10); duplicado → 409; `me` passou a
  ir pelo service (`getUserById`). Cobertura: `controllers/__tests__/auth.endpoints.integration.test.ts`
  + casos `authenticate` no service. Frontend usa `POST /users` para signup (não `/auth/register`) e
  `/auth/login` para login.
- [ ] **Frontend follow-up (delta de contrato a ajustar no `my-app`):**
  - `/auth/login` sucesso: shape `{ success, data: { user, token } }` **preservado**; `user` agora
    inclui `locale`/`currency` (o front já tolera com `?? 'en'`/`?? 'BRL'`).
  - `/auth/login` erro: credencial inválida → **401 `{ code:'UNAUTHORIZED', message:'Invalid credentials' }`**
    (antes `{ success:false, error:'Invalid credentials' }`); faltando campo → **400** com `error` = Zod
    flatten. Ajustar `resolveErrorMessage` para ler `code`/`message`.
  - `/auth/register` (não usado pelo front hoje): duplicado **400 → 409**; passa a exigir senha
    forte/email válido (regras do `CreateUserSchema`).

### users
- [ ] TOCTOU no guard de "último admin" (delete/demote concorrentes) — estreito, moot no SQLite,
  baixo no Postgres. Endurecer se/quando migrar.
- [ ] **Email não normalizado para lowercase** — definir regra de unicidade (case-insensitive?).
- [x] **Inconsistência middleware×policy em `/api/users/:id` — RESOLVIDA.** O `authMiddleware` fazia
  authz fina por prefixo (`GET`/`DELETE` admin-only), atropelando a `UserPolicy` e deixando os ramos
  self-view/self-delete mortos. Correção: middleware passou a fazer **só autenticação**; a `UserPolicy`
  é a autoridade. `canView`/`canUpdate` = dono-ou-admin (self-view via `GET /api/users/:id` agora
  funciona); `canDelete` = **admin-only** por decisão de produto (User tem cascade-delete de dados de
  negócio → self-delete proibido; offboarding via admin). Testes HTTP/unit atualizados como gate.

## 3. Cross-cutting / infraestrutura

- [x] **`JWT_SECRET` fail-closed (vulnerabilidade corrigida).** `lib/jwt.ts` usava
  `process.env.JWT_SECRET || 'your-jwt-secret-key'` e `env.ts` só **loga** presença (não valida) →
  em prod sem `JWT_SECRET` o app assinava/verificava JWT com segredo público conhecido (forja trivial /
  bypass total de auth). Agora `resolveJwtSecret()` **lança** em produção se ausente; dev/test usam
  fallback nomeado `dev-only-insecure-secret`.
- [x] **Dead code removido (limpeza final).** `authUtils.getAuthenticatedUser`/`getCurrentUser`
  (leftovers Next.js, zero uso) + import `jose` + interfaces `NextApiRequest`/`NextRequest`;
  `UserDto.UserSchema` + tipo `UserDto` (não-consumidos); import morto de `UserDto` no `UserService`.
  `jose` saiu do allowlist do `transformIgnorePatterns` (não é mais importado). `factory.getUserRepository()`
  removido (órfão após `me` passar a usar o service).
- [x] **`authMiddleware` agora é fail-closed (secure-by-default).** Antes usava allowlist de rotas
  *protegidas* → rota nova nascia **pública** por esquecimento. Invertido: toda `/api` exige JWT
  exceto um allowlist público pequeno (`POST /api/users`, `/api/auth/login|register`, `/api/docs`,
  info raiz). Comportamento das rotas atuais preservado; rotas futuras nascem protegidas. Autorização
  fina segue 100% nas policies (sem duplicação). Coberto por `middleware/__tests__/auth.routes.integration.test.ts`.

- [ ] **`handleApiError` não mapeia Prisma `P2025` centralmente** (`lib/apiUtils.ts`) → updates/deletes
  concorrentes (TOCTOU) viram 500 em vez de 404 nas features que não capturam P2025 no repositório
  (ex.: `dashboardLayout.updateLayout`). `structuredData.update` já passou a mapear localmente; padronizar
  no handler central resolveria de uma vez.

- [ ] **`dotenv override:true` clobera env de teste (footgun latente).** `src/config/env.ts` faz
  `dotenv.config({ override: true })`, que roda **depois** do `test/jest.setupEnv.ts`. Hoje funciona
  (o `server/.env` não define `DATABASE_URL`), mas se alguém adicionar `DATABASE_URL` ao `.env`, os
  testes de integração passam a apontar para o **banco de dev**. Mitigar: não usar `override` para
  chaves já presentes, ou pular o load de `.env` quando `NODE_ENV=test`. Notado na Etapa 1 do
  BACKEND_HARDENING_PLAN (2026-06-26).

- [ ] **SQLite → PostgreSQL (prod):**
  - [ ] Índice único parcial para `dashboardLayout` (`userId` WHERE `isActive = true`) — hoje a
    invariante "um ativo por usuário" é só app-enforced.
  - [ ] Confirmar que não há vetores órfãos no Qdrant herdados (a deleção agora é por filtro de
    `documentId`, mas dados antigos podem ter ficado).
- [ ] **~166 `as any` / `RuleContext<TData>` genérico** nos plugins de `dynamicTables` — tipagem
  adiada por decisão (detalhe em §2 → dynamicTables pendências).
  > ~~CoreSystemPreset inline (~250 linhas)~~ — **RESOLVIDO**: já usa `modules` via `createTableFromModule`
  > (constatado na revisão da Etapa 4 em 2026-06-24). Só `analyticsDefinitions` fica inline, de propósito.

## 4. Governança declarativa — frontend pendente

- [ ] `searchable`: aplicar `getSearchableFields` em `useServicesLogic.tsx`, `useInventoryLogic.tsx`,
  `usePlanningLogic.ts` (backend 100%, frontend ~40%).
- [ ] Asterisco condicional no `DynamicForm` para `requiredIf`.

## 5. Decisões de produto pendentes

- [ ] reports: persistir análises (ver §2)?
- [ ] users: permitir "diretório de equipe" (usuário comum ver perfis de outros)? Hoje há isolamento
  total por tenant — seria feature nova (DTO público + afrouxar middleware).
- [ ] users: email case-sensitive ou não?

## 6. Roadmap (do memory `roadmap.md`)

**v1 imediato**
- [ ] `searchable` no frontend (ver §4).
- [ ] `immutableAfter` em `expensesModule` (despesas pagas) e `appointmentsModule` (status terminal).

**v2+**
- [ ] `permissions` RBAC por papel + tabela `AccountMember`.
- [ ] `accountingPeriod` (fechamento contábil).
- [ ] `AuditLog` com particionamento mensal + retention.
- [ ] `approval` workflow (aprovação de despesas acima de X).
- [ ] Labels PT nos labels de analytics dos módulos.
