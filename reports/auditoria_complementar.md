# Relatório Complementar — Luminaris (Segunda Passada)

> Complemento de [auditoria_tecnica_completa.md](auditoria_tecnica_completa.md). **Não houve alteração de código.**
> Foco: lacunas da primeira passada — higiene de dependências (versões resolvidas no lockfile), ciclo de vida operacional (shutdown, health, logging), órfãos de dados e direito ao esquecimento, paginação/payload, concorrência SQLite, i18n, tema/bundle/acessibilidade, privacidade/LGPD, artefatos commitados e métricas de qualidade.
> Metodologia: 3 varreduras dedicadas (subagentes read-only) + verificação manual na fonte dos achados de maior impacto. Convenções iguais às do 1º relatório: `arquivo:linha` para toda alegação; **[INFERÊNCIA]** marcada.
> Data: 2026-06-11.

---

## 1. Correções e refinamentos ao primeiro relatório

A segunda passada revisou alegações do 1º relatório contra os **lockfiles** e leituras adicionais. Correções (a maioria a favor do projeto):

1. **Express é 4.21.2, não 4.18.** O `package.json` declara `^4.18.2`, mas o lock resolve **express 4.21.2**, que já inclui os patches de 2024 (CVE-2024-29041, CVE-2024-43796). Junto: **body-parser 1.20.3** (já corrigido para o DoS CVE-2024-45590) e **path-to-regexp 0.1.12** (já corrigido para os ReDoS de 2024). O 1º relatório citava as versões do `package.json`; as resolvidas são mais novas e mais seguras.
2. **`multer` resolvido em 2.0.2** — versão que já corrige a série de DoS de 2025 (CVE-2025-47935/-47944/-48997/-7338). O risco real de upload continua sendo **a configuração** (sem `limits`/`fileFilter`), não a versão.
3. **Deleção de documento limpa o Qdrant corretamente** (achado positivo, verificado por mim): [DocumentService.deleteDocument:139-155](../server/src/features/documents/services/DocumentService.ts) deleta pontos no Qdrant (`vectorRepository.deletePoints`), depois chunks, depois o registro SQL. Ressalva: os 4 passos não são transacionais — falha no Qdrant deixa o documento em estado intermediário.
4. **Existem 4 usos de `$transaction`** ([UserRepository.ts:39](../server/src/features/users/repositories/UserRepository.ts), `ChatInstanceRepository.ts:41`, `ChatMessageRepository.ts:87`, `DashboardLayoutRepository.ts:50`) — porém **todos são lotes read-only `[findMany, count]`**. A conclusão do 1º relatório permanece: **zero transações de escrita** no servidor inteiro.
5. **Confirmei pessoalmente** o bug `payload.text` vs `textContent` em `searchDocuments` ([DocumentService.ts:174](../server/src/features/documents/services/DocumentService.ts)) — o endpoint de busca retorna `chunkText: undefined` em todo hit.

---

## 2. Higiene de dependências (versões resolvidas nos lockfiles)

### 🔴 jsonwebtoken 8.5.1 — vulnerável (alta confiança)
O lock resolve **`jsonwebtoken@8.5.1`**, anterior ao conjunto de advisories de dez/2022 corrigido em **9.0.0** (CVE-2022-23539/-23540 "algoritmos irrestritos no verify"/-23541). É **diretamente relevante** aqui: `jwt.verify(token, JWT_SECRET)` é chamado **sem allowlist de `algorithms`** ([jwt.ts:19](../server/src/lib/jwt.ts)) e com **fallback de segredo hardcoded** ([jwt.ts:4](../server/src/lib/jwt.ts)). Os três fatores combinados elevam o risco JWT do 1º relatório. Detalhe adicional: `@types/jsonwebtoken ^9.0.10` (tipos um major à frente do runtime). **Ação:** subir para ≥9.0.0, pinar `{algorithms:['HS256']}`, remover fallback — ou consolidar tudo no `jose` (já instalado, hoje código morto).

### Demais versões (server, resolvidas)
| Pacote | Versão | Avaliação |
|---|---|---|
| express / body-parser / path-to-regexp / qs | 4.21.2 / 1.20.3 / 0.1.12 / 6.13.0 | ✅ patcheados |
| multer / busboy | 2.0.2 / 1.6.0 | ✅ versão ok; config insegura (sem limits) |
| pdf-parse | 1.1.1 | ⚠️ **abandonado (~2019)** — risco de manutenção/supply-chain; verificar `npm audit` |
| openai | 4.104.0 | fim da linha 4.x (5.x é a atual) — débito de manutenção |
| prisma/@prisma/client | 6.16.2 | ✅ |
| helmet / cors / compression / express-rate-limit / jose | 7.2.0 / 2.8.5 / 1.8.1 / 8.1.0 / 6.1.0 | ✅ |
| zod | **4.1.8 (server)** vs **3.25.76 (front)** | ⚠️ split de major — schemas não compartilháveis entre as pontas |
| uuid | 13.0.0 (+8.3.2 aninhado no exceljs) | ✅ |

### Frontend (resolvidas)
**next 15.3.1** (pinado exato; acima do fix do bypass de middleware CVE-2025-29927 — não afetado; linha 15.x recebeu patches posteriores em 2025 — **verificar com `npm audit`**), react/react-dom 19.1.1, handsontable 15.3.0, next-i18next 15.4.2, cookies-next 5.1.0.

### ⚠️ Handsontable: dependência morta + questão de licença
**Verificado por mim:** `handsontable`, `@handsontable/react` e `exceljs` têm **zero imports** em todo o código-fonte do front — são dependências mortas no `package.json` (remoção é grátis). Nota adicional: Handsontable é software **comercial** (exige licença paga para uso comercial) e não há tratamento de license key nem arquivo LICENSE no repo. Se a intenção é reintroduzi-lo, isso precisa ser resolvido; se não, remover.

### `.npmrc`
[server/.npmrc](../server/.npmrc) contém apenas `legacy-peer-deps=true` — **sem tokens/segredos** (bom), mas suprime erros de peer-dependency (débito leve).

---

## 3. Operação e ciclo de vida do processo

- **Sem graceful shutdown nem crash handlers** (verificado por mim — grep zero): nenhum `SIGTERM/SIGINT`, `server.close()`, `prisma.$disconnect()`, `process.on('unhandledRejection'|'uncaughtException')` em `src/`. [server.ts:78-81](../server/src/server.ts) não captura o handle do servidor. Uma promise rejeitada fora de request mata/zumbifica o processo silenciosamente. **Médio-Alto.**
- **`/health` é "de fachada"** ([server.ts:51-58](../server/src/server.ts)): retorna uptime; não pinga DB, Qdrant nem OpenAI — dependência morta ainda reporta `ok`. **Médio.**
- **Sem middleware de request logging** (sem morgan/pino). Logging dividido: **222** chamadas a `logger.*` vs **~103** `console.log/error/warn` cruas em `src/` — incluindo o error handler global ([server.ts:70](../server/src/server.ts)) e o `handleApiError` ([apiUtils.ts:20](../server/src/lib/apiUtils.ts)), que fogem do logger estruturado. [monitoring.ts](../server/src/lib/monitoring.ts) (verificado) é só um timer que loga via logger — não há métricas reais/exportáveis. **Médio.**
- **`x-user-timezone` é client-controlled e não validado:** [AnalyticsResolver.ts:28](../server/src/features/analytics/engine/AnalyticsResolver.ts) lê o header cru e o passa ao `date-fns-tz`; `getZonedParts` ([DateUtils.ts:26-44](../server/src/features/analytics/utils/DateUtils.ts)) captura o `RangeError` e **relança Error genérico → 500**. Um header `x-user-timezone: lol/nope` derruba todos os endpoints de analytics com 500. **Médio** (validar com `Intl.supportedValuesOf('timeZone')` ou fallback p/ UTC).

### Concorrência SQLite **[INFERÊNCIA fundamentada]**
SQLite admite **um escritor por vez**. O rules engine executa **muitas escritas sequenciais não-transacionadas por request** (cascata de delete: um `update` por linha em [DynamicTableService.ts:625-640](../server/src/features/dynamicTables/services/DynamicTableService.ts); read-modify-write de estoque em `stockSync.ts:50-57`). Sem WAL/`busy_timeout` configurados (nenhum `PRAGMA` no código; `PrismaClient` sem opções — e **dois clients duplicados**, `database/prisma.ts` + `lib/prisma.ts`, que em produção criam **duas conexões de engine** pois o cache `global` só vale fora de produção). Sob concorrência: erros `database is locked`/timeouts e — pior — **cadeias de regras meio-aplicadas** (sem rollback). Reforça o risco nº 1 do 1º relatório e o P3 de migrar para PostgreSQL.

---

## 4. Órfãos de dados e direito ao esquecimento

- **🔴 Deleção de usuário deixa vetores órfãos no Qdrant.** `DELETE /users/:id` → `prisma.user.delete` ([UserRepository.ts:194-198](../server/src/features/users/repositories/UserRepository.ts)). O cascade do Prisma limpa **tudo no SQLite** (todas as relações têm `onDelete: Cascade`), mas **nenhum código deleta os pontos do usuário no Qdrant** — os payloads (com `textContent` integral dos documentos, `fileName`, `userId`) ficam para sempre. Violação de direito ao esquecimento (LGPD art. 18 VI) e, combinado com o vazamento cross-tenant do 1º relatório, os dados do usuário deletado **continuam pesquisáveis** por quem souber os `documentId`s. **Alto.** (A capacidade técnica já existe: `VectorRepository` filtra por `userId` em `searchVectors` — basta um delete-by-filter.)
- **`deleteUserSystem` deixa estado pesado para trás** ([dashboardController.ts:337-348](../server/src/controllers/dashboardController.ts) → `deleteAllTablesForUser`): **não** limpa `KnowledgeGraph` (o grafo com IDs de tabelas mortas continua sendo **injetado no prompt do agente** via `getGraphPrompt` — o agente "vê" tabelas inexistentes), nem `ActionProposal` (ficam com `tableId` pendurado), nem layout/chats/documentos. Como `POST /dashboard/create` é one-shot... o reset deixa lixo semântico para o novo sistema. **Médio.**
- **Soft-delete nunca purgado** (verificado: zero `purge`/cron/scheduler em `src/`): linhas com `deletedAt` acumulam para sempre — retenção indefinida de dados pessoais (LGPD arts. 15-16) e custo crescente de scan nas queries raw com `json_extract`. **Médio.**

---

## 5. Paginação e payload (auditoria endpoint a endpoint)

| Endpoint | Paginado? | Evidência |
|---|---|---|
| **GET /dynamic-tables/:id/data** | ❌ **pior caso** — tabela inteira (todos os JSONs) por request | `findDataByTableId` sem take/skip ([DynamicTableRepository.ts:102-107](../server/src/features/dynamicTables/repositories/DynamicTableRepository.ts)); a variante streaming existe mas o HTTP não a usa |
| **GET /chat-messages** | ❌ — controller **parseia `page/limit` e os ignora** ([chatMessagesController.ts:8-22](../server/src/controllers/chatMessagesController.ts)); histórico inteiro + **N+1** (`enrichMessageWithUserId` re-busca a instância por mensagem, [ChatMessageService.ts:180-182](../server/src/features/chatMessages/services/ChatMessageService.ts)) |
| GET /documents | ✅ skip/take, mas `limit` **sem teto** (`?limit=1000000` aceito) |
| GET /chat-instances | ✅ skip/take, sem teto (+ o vazamento cross-tenant já reportado) |
| GET /users | ✅ skip/take, sem teto |
| GET /analytics/drill-down | pseudo — busca todos os IDs e **fatia em memória** ([analyticsController.ts:149-156](../server/src/controllers/analyticsController.ts)); `recordIds` e `limit` sem teto |

**Sem guardas de tamanho de resposta** em lugar nenhum. Impacto direto no front: as views e o `useTableRelationLookups` puxam tabelas inteiras — o custo cresce linearmente com os dados do cliente. **Alto (escalabilidade).**

---

## 6. Integridade do histórico de chat

**Forja de mensagens do assistente — confirmado:** `CreateChatMessageSchema` aceita `role: ASSISTANT` ([ChatMessageDto.ts:53-55](../server/src/features/chatMessages/dtos/ChatMessageDto.ts)) e o service persiste o role verbatim ([ChatMessageService.ts:101-105](../server/src/features/chatMessages/services/ChatMessageService.ts)); `updateMessage` permite até reescrever o role de mensagens existentes (`:221`). Qualquer usuário fabrica "respostas da IA" no próprio histórico via `POST /api/chat-messages`. **Severidade Média** (mitigada porque o `history` enviado ao `/api/chat` já é client-supplied de toda forma — a forja não dá poder novo ao atacante, mas polui auditoria/UX e qualquer replay futuro do histórico).

---

## 7. Privacidade / LGPD

- **PII em logs (além do já reportado):** consulta de chat inteira logada em info ([ChatService.ts:86](../server/src/features/chat/services/ChatService.ts)); queries de relatório ([ReportService.ts:69,77,80,94,97,134](../server/src/features/reports/services/ReportService.ts)); texto integral em warn de chunking ([chunking.ts:37](../server/src/lib/vector/chunking.ts)); layout completo em falha de validação ([DashboardLayoutRepository.ts:193,232](../server/src/features/dashboardLayout/repositories/DashboardLayoutRepository.ts)); e o dump de registro completo já conhecido ([DynamicTableService.ts:673](../server/src/features/dynamicTables/services/DynamicTableService.ts)). Sem camada de redação. **Achado positivo:** `VectorRepository` loga só IDs/contagens, nunca `textContent`. **Alto (LGPD).**
- **Conteúdo de documentos do cliente sai do banco primário sem documentação/consentimento:** texto integral vai para **OpenAI** (extração [OpenAIService.ts:327](../server/src/lib/openai/OpenAIService.ts), amostra de 4k chars `:188,194`, embeddings por chunk [embedding.ts:69](../server/src/lib/vector/embedding.ts)) e fica **armazenado em claro no payload do Qdrant** ([DocumentProcessingPipeline.ts:168](../server/src/features/documents/services/DocumentProcessingPipeline.ts)). Grep repo-wide: **zero** política de privacidade, fluxo de consentimento ou documentação de operadores — ironicamente, os *presets* modelam consentimento LGPD para os clientes finais do usuário (`CustomerModule.ts:23`, `DatePresets.ts:53-55`), mas a plataforma não trata o próprio. **Alto (compliance).**
- **CPF/CNPJ em texto puro:** campos de preset (`TextPresets.ts:50-71`; obrigatório em `SuppliersModule.ts:19`) gravados como JSON plaintext no SQLite — e o **`dev.db` (1,5 MB, com hash bcrypt do admin seedado) está no tree, não-ignorado**. **Médio-Alto.**

---

## 8. i18n — funcional, não só cosmético

- **🐛 `chatMessages.json` não existe em PT** (verificado por mim — `ls` dos dois diretórios), mas o namespace é requisitado por [pages/index.tsx:19](../my-app/pages/index.tsx) e [pages/dashboard/index.tsx:241](../my-app/pages/dashboard/index.tsx) — usuários PT veem chaves cruas/fallback EN em todas as strings de chat. **Médio (bug vivo).**
- **Drift bidirecional:** 17 chaves **só em PT** no `common.json` (telas de setup/lista de usuários sem EN — `userList*`, `setupSystem`, `quickMode`, `aiInterviewMode`...); `finance_view.json` PT sem o `title`. Demais namespaces têm paridade (analytics 125/125, database 192/192 incl. `fields.*`).
- **~60 arquivos** com strings PT hardcoded fora do i18n (amostras: `ConfirmModal.tsx:59,69,79` com defaults PT, `Modal.tsx:38` com `window.confirm` PT, `FloatingChatWindow.tsx:175-197` inclusive em `aria-label`).

---

## 9. Frontend — bundle, tema, acessibilidade

### Bundle / code splitting (Médio)
- Apenas **2** usos de `next/dynamic` no app inteiro (`PlanningCalendar.tsx:3`, `FloatingActionButton.tsx:3`).
- [pages/dashboard/index.tsx:8-19](../my-app/pages/dashboard/index.tsx) importa **as 9 category views eagerly** — sem split por view. Consequências: **FullCalendar entra estático** (via `MeetingsCalendar.tsx:5` → `LeadsView` — o `dynamic()` do Planning é anulado pelo caminho do Leads); **recharts** entra na home e no dashboard; **dnd-kit** idem (kanban + CustomizeColumnsPanel); `react-grid-layout` na home.
- `next.config.js` sem qualquer otimização (`optimizePackageImports`/analyzer ausentes) e com `eslint.ignoreDuringBuilds: true`.
- Dependências mortas: `handsontable`, `@handsontable/react`, `exceljs` (zero imports — verificado).

### ⚠️ Feature órfã ponta a ponta: structuredData (Médio — produto)
**Verificado por mim:** zero referências a `structured-data`/`StructuredData` em todo o front. O backend mantém uma feature completa (extração determinística de Excel → `headers`+`data` "prontos para Handsontable" → `GET /api/structured-data/:documentId` → policy/repo/service) **que nenhuma tela consome** — e a lib de renderização alvo (Handsontable) nem é mais importada. O caminho `DATA_ANALYSIS` do pipeline de documentos produz dados que ninguém exibe. Decidir: reconectar a UI ou aposentar a feature (e o custo de extração/LLM associado).

### Tema (Baixo)
Dark mode por classe ok (script anti-FOUC em `_document.tsx:22-33`), mas o design system é decorativo: tokens `lumi-*` usados em **1 arquivo/2 ocorrências**; `var(--lumi-*)` **0 usos** em TSX; **119 cores hex hardcoded em 14 arquivos** (PlanningCalendar 37). `useTheme` é estado por instância (sem contexto — múltiplos consumidores não sincronizam até reload). `GalaxyBackground` + suas animações CSS são **código morto** (exportado, importado por ninguém).

### Acessibilidade (Médio)
- **Nenhum focus trap no app**; `Modal.tsx` sem `role="dialog"`/`aria-modal` (tem ESC e aria-label no botão); `ConfirmModal.tsx` tem dialog/aria-modal **mas não tem handler de ESC**.
- **`aria-invalid`: 0 ocorrências** — erros de validação são só visuais. Labels `htmlFor` corretos no `DynamicForm` (positivo).
- ~11 `<div onClick>` clicáveis (cards de kanban/pessoas, células de relação) com **1** `role="button"` no app — inativáveis por teclado.
- Sem páginas de erro custom (`_error.tsx`/`404.tsx`/`500.tsx` ausentes).

---

## 10. Artefatos commitados e higiene de repositório

| Item | Estado | Severidade |
|---|---|---|
| `server/generated/prisma/` | **166 MB** no tree — inclui **7 arquivos `query_engine-windows.dll.node.tmpNNNNN` órfãos de 21 MB cada** + engine real + wasm; `tsconfig.include` puxa `generated/**` (re-typecheck de 732 KB de d.ts a cada build) | Médio |
| `server/dist/` | 262 arquivos compilados no tree; `.gitignore` cobre `/build` (template Next.js!) mas **não `dist/`** | Baixo-Médio |
| `server/prisma/dev.db` | 1,5 MB de dados reais + hash do admin no tree; **nenhum `.gitignore` cobre `*.db`** | Médio |
| `.gitignore` (ambos) | templates Next.js **idênticos e errados para um server Express** (ignoram `.next/` que não existe; não ignoram `dist/`, `generated/`, `dev.db`) | Baixo |
| LICENSE / root README / `.env.example` / CI / Docker / `.git` | **todos ausentes** — fresh clone exige engenharia reversa da config; sem versionamento | Médio |

### Drift de configuração
- `REDIS_URL` é **variável fantasma** (só README + checagem de presença em `env.ts:89`; zero cliente Redis — a remoção é confirmada em `CustomizationService/README.md:39-40`).
- Não documentados: `JWT_EXPIRES_IN` (server), `NEXT_PUBLIC_ENABLE_DEV_SEED` e `NEXT_PUBLIC_ENABLE_DEV_SEED_AUTORUN` (front).
- `env.ts` tem parser de `.env` regex hand-rolled com `override: true` e imprime telemetria de presença de segredos no stdout (`env.ts:96-100`) — valores não vazam (bom), mas revela o que está configurado.

---

## 11. Métricas de qualidade de código

| Padrão | server/src | my-app (src) |
|---|---|---|
| `console.log(` | 28 (+48 `console.error`, +27 `console.warn`) | 62 |
| `as any` | **424** | 50 |
| `: any` | 220 | 140 |
| `TODO` / `FIXME` | 2 / 0 | 0 / 0 |
| `@ts-ignore` | 2 | 1 |

Leitura: `strict: true` está ligado nos dois lados, mas no server a tipagem é rotineiramente anulada — notavelmente o `ctx as any` em **toda** fronteira controller→service (ex.: `dynamicTablesController.ts:35,51,75`), exatamente onde tipos fortes mais protegeriam (o `UserContext` tem dois formatos divergentes, como o 1º relatório apontou).

---

## 12. Novos riscos consolidados (delta sobre o 1º relatório)

| # | Risco | Onde | Sev. |
|---|---|---|---|
| C1 | `jsonwebtoken` 8.5.1 vulnerável + verify sem allowlist + fallback de segredo (**eleva** o risco JWT do 1º relatório) | lock + [jwt.ts:4,19](../server/src/lib/jwt.ts) | 🔴 Alto→Crítico em conjunto |
| C2 | Deleção de usuário não apaga vetores Qdrant (direito ao esquecimento; conteúdo continua pesquisável) | [UserRepository.ts:194-198](../server/src/features/users/repositories/UserRepository.ts) | 🟠 Alto |
| C3 | Endpoints sem paginação: tabela inteira e histórico de chat inteiro por request; `limit` sem teto em todos os paginados | [DynamicTableRepository.ts:102-107](../server/src/features/dynamicTables/repositories/DynamicTableRepository.ts), [chatMessagesController.ts:8-22](../server/src/controllers/chatMessagesController.ts) | 🟠 Alto (escala) |
| C4 | PII em logs (registro completo, queries de chat/relatório, texto de chunk) sem redação | §7 | 🟠 Alto (LGPD) |
| C5 | Conteúdo de documentos para OpenAI/Qdrant sem documentação/consentimento; CPF/CNPJ plaintext; `dev.db` no tree | §7, §10 | 🟠 Alto (compliance) |
| C6 | SQLite single-writer + escritas em rajada não-transacionadas → `database is locked` + cadeias meio-aplicadas sob concorrência | §3 [INFERÊNCIA] | 🟡 Médio-Alto |
| C7 | Sem graceful shutdown / crash handlers; `/health` não checa dependências; sem request logging | [server.ts](../server/src/server.ts) | 🟡 Médio |
| C8 | `x-user-timezone` inválido → 500 em todo o analytics | [DateUtils.ts:26-44](../server/src/features/analytics/utils/DateUtils.ts) | 🟡 Médio |
| C9 | Forja de mensagens `ASSISTANT` via `POST /chat-messages` (e update de role) | [ChatMessageService.ts:101-105,221](../server/src/features/chatMessages/services/ChatMessageService.ts) | 🟡 Médio |
| C10 | `chatMessages.json` ausente em PT (namespace requisitado por 2 páginas) | `public/locales/pt/` | 🟡 Médio |
| C11 | Feature `structuredData` órfã ponta a ponta; Handsontable/exceljs dependências mortas | §9 | 🟡 Médio (produto) |
| C12 | `deleteUserSystem` deixa KnowledgeGraph stale (alimenta o prompt do agente) + proposals penduradas | [dashboardController.ts:337-348](../server/src/controllers/dashboardController.ts) | 🟡 Médio |
| C13 | Sem code splitting (9 views eager; FullCalendar/recharts/dnd-kit no bundle inicial) | [pages/dashboard/index.tsx:8-19](../my-app/pages/dashboard/index.tsx) | 🟡 Médio (perf) |
| C14 | A11y: sem focus trap; `aria-invalid` 0; divs clicáveis sem teclado | §9 | 🟡 Médio |
| C15 | `generated/` 166 MB (com 7 DLLs .tmp órfãs), `dist/` e `dev.db` no tree; sem LICENSE/.env.example/CI/git | §10 | 🟡 Médio |
| C16 | 424 `as any` no server (tipagem anulada nas fronteiras críticas); duplo PrismaClient = 2 conexões em prod | §11, §3 | 🟢 Baixo-Médio |
| C17 | i18n drift (17 chaves PT-only; ~60 arquivos hardcoded), tokens de tema decorativos, GalaxyBackground morto, `useTheme` sem sync | §8, §9 | 🟢 Baixo |
| C18 | `REDIS_URL` fantasma; envs não documentadas; soft-delete sem purga | §10, §4 | 🟢 Baixo |

---

## 13. Recomendações complementares (delta sobre P0–P3 do 1º relatório)

### Acrescentar ao P0
- **Upgrade `jsonwebtoken` ≥9.0.0** + `{algorithms:['HS256']}` no verify (junto com o item 4 do P0 original — remover fallback). *(C1)*
- **Apagar vetores do Qdrant na deleção de usuário** (delete-by-filter `userId`; capacidade já existe no `VectorRepository`). *(C2)*

### Acrescentar ao P1
- **Paginação obrigatória + teto de `limit`** em `GET /dynamic-tables/:id/data` (server-side paging — o front já pagina client-side, a mudança é compatível) e `GET /chat-messages` (que já recebe page/limit e os ignora); corrigir o N+1 do enrich. *(C3)*
- **Camada de redação de logs** (remover dumps de registro/query/texto: `DynamicTableService.ts:673`, `ChatService.ts:86`, `ReportService.ts`, `chunking.ts:37`, `DashboardLayoutRepository.ts`). *(C4)*
- **Validar `x-user-timezone`** (fallback UTC em TZ inválida) — correção de 3 linhas que elimina uma classe de 500s. *(C8)*
- **Shutdown gracioso** (`SIGTERM` → `server.close()` + `prisma.$disconnect()`) + handlers de `unhandledRejection`; `/health` com ping de DB/Qdrant. *(C7)*
- **Forçar `role: USER`** no `POST /chat-messages` (assistente só via fluxo do `/chat`). *(C9)*
- **Criar `pt/chatMessages.json`** e completar as 17 chaves EN faltantes. *(C10)*

### Acrescentar ao P2
- Decidir o destino do **structuredData** (reconectar UI ou aposentar feature + custo de extração); remover `handsontable`/`@handsontable/react`/`exceljs` do front (e resolver a questão de licença do Handsontable se for mantê-lo). *(C11)*
- **Limpar KnowledgeGraph + proposals no `deleteUserSystem`** e sincronizar o grafo em delete de tabela. *(C12)*
- **Code splitting** por categoria no dashboard (`next/dynamic` nas 9 views) + mover `MeetingsCalendar` para dynamic. *(C13)*
- **Higiene de repo:** corrigir `.gitignore` (dist/, generated/, *.db), remover `dev.db`/`dist/`/`.tmp` DLLs do tree, `prisma generate` no build, adicionar `.env.example`, LICENSE, root README, iniciar git + CI mínimo. *(C15)*
- **A11y básico:** focus trap nos modais, `role="dialog"`/ESC consistentes, `aria-invalid` nos campos com erro, `role="button"`+tabIndex nos cards clicáveis. *(C14)*
- Unificar o PrismaClient (remover duplicata) e atacar os `as any` das fronteiras controller→service com um `UserContext` único. *(C16)*

### Acrescentar ao P3
- Habilitar **WAL + busy_timeout** enquanto SQLite viver (mitiga C6 até a migração a PostgreSQL já planejada).
- Política de **retenção/purga** para `deletedAt` e documentação LGPD dos fluxos OpenAI/Qdrant (acordos de operador, aviso de privacidade). *(C5)*
- Design tokens de verdade (adotar `lumi-*` ou removê-los) e varredura de i18n hardcoded.

---

## 14. Apêndice — verificações pessoais desta passada

| Alegação | Verificação | Resultado |
|---|---|---|
| `.npmrc` com credenciais? | Leitura direta | ❌ só `legacy-peer-deps=true` |
| `deleteDocument` deixa órfãos no Qdrant? | Leitura de [DocumentService.ts:139-155](../server/src/features/documents/services/DocumentService.ts) | ❌ limpa corretamente (pontos→chunks→doc); não-transacional |
| Graceful shutdown existe? | Grep `SIGTERM\|SIGINT\|process.on` em src/ | ✅ confirmado ausente (zero matches) |
| Transações de escrita existem? | Grep `$transaction` em src/ | ✅ só 4, todas read-only `[findMany, count]` |
| `handsontable`/`exceljs` usados no front? | Grep em todo my-app | ✅ confirmado zero imports (deps mortas) |
| `chatMessages.json` em PT? | `ls` dos dois diretórios de locale | ✅ confirmado ausente em pt/ |
| structuredData tem consumidor no front? | Grep `structured-data\|StructuredData` em my-app | ✅ confirmado zero referências (feature órfã) |
| `monitoring.ts` é observabilidade real? | Leitura direta | ❌ só timer→logger (sem métricas exportáveis) |

---

*Fim do relatório complementar. Em conjunto com [auditoria_tecnica_completa.md](auditoria_tecnica_completa.md), cobre arquitetura, funcionalidades, contratos, dados, segurança, operação, dependências, privacidade e qualidade. Nenhuma linha de código foi alterada.*
