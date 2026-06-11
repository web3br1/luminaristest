# Auditoria Profunda por Área — Luminaris

> **Data**: 2026-06-11 · **Escopo**: aprofundamento minucioso das 6 áreas funcionais, complementando `auditoria_consolidada.md` (R1–R38).
> Cada área tem um relatório completo em `reports/partials/`. Este documento consolida os achados, riscos novos e correlações entre áreas.

| Área | Relatório detalhado | Riscos novos |
|---|---|---|
| 1. Rules Engine (10 plugins) | [partials/01_rules_engine.md](partials/01_rules_engine.md) | RE-1 a RE-16 |
| 2. Analytics/KPI (9+ processors) | [partials/02_kpi_analytics.md](partials/02_kpi_analytics.md) | KPI-1 a KPI-10 |
| 3. Presets (26 módulos, 2 sistemas) | [partials/03_presets.md](partials/03_presets.md) | PR-1 a PR-8 |
| 4. AI Agent & Chat/RAG | [partials/04_ai_agent.md](partials/04_ai_agent.md) | AG-1 a AG-8 |
| 5. Frontend (my-app) | [partials/05_frontend.md](partials/05_frontend.md) | FE-1 a FE-13 |
| 6. Documentos/RAG & structuredData | [partials/06_documentos_rag.md](partials/06_documentos_rag.md) | DOC-1 a DOC-8 |

---

## 1. Síntese por área

### Área 1 — Rules Engine
10 plugins registrados em ordem fixa no `globalRuleRegistry` (`RuleRegistry.ts:39-53`), despachados sequencialmente com await por `DynamicTableService.runRules()` (l.681-689) em 6 fases de lifecycle. O **SalesPlugin** é de longe o mais complexo (~350 linhas + 6 módulos auxiliares): valida XOR produto/serviço, auto-cria agendamentos, gerencia reservas de estoque, e na finalização dispara 3 escritas encadeadas (estoque + movimentos + comissões) **sem transação** — o achado R1 do relatório consolidado agora tem o mapa exato de onde o estado parcial pode nascer (`SalesPlugin.ts:331-337`). Novidades relevantes: **ProductAutoStockPlugin não é idempotente** (rerun duplica linhas de estoque — RE-8), e o `findRowsByFieldValue` tem **LIMIT 100 implícito** que corrompe lógica em 3 plugins diferentes (RE-6, RE-12, RE-13).

### Área 2 — Analytics/KPI
A área mais madura do sistema. 9+ processors (Revenue com 17 KPIs, Cost 14, Profit 18, Cashflow 11, ProductCost, ProfitByDimension, SalesProfitByProduct, AggregatePipeline declarativo, MultiTableCalculation + 4 dinâmicos). `addMoney()` cents-safe usado consistentemente (`CurrencyUtils.ts:6-8`, validado por teste); timezone correto via `date-fns-tz` com teste de relatividade Brasil/Londres. Filtro por userId acontece no resolver (`AnalyticsResolver.ts:323,336`), não nos processors — design consistente. Gap principal: **falhas silenciosas em fetch multi-tabela** (`catch { headerById = null }` — KPI-4) que produzem métricas incorretas sem aviso, e ausência de testes nos processors dinâmicos.

### Área 3 — Presets
Arquitetura em 3 camadas (fields → modules → systems) com biblioteca de ~60 field presets. CoreSystemPreset (10 tabelas obrigatórias) + BeautySalonPreset (16 tabelas) documentados módulo a módulo, incluindo o formato completo do `ITableSchema` (11 tipos de regra de governança: deleteConstraints, compositeUnique, immutableAfter, compare, lifecycle, noOverlap...). O fluxo `installPresetAsSystem` (3 passagens, `DynamicTableService.ts:187-315`) tem pré-validação robusta mas **zero proteção transacional**: falha no meio deixa tabelas órfãs E a reinstalação fica bloqueada pelo 403 do controller (PR-1) — pior dos dois mundos. Há também **race condition no install** (PR-5): dois POSTs simultâneos passam no check `existingTables.length > 0`.

### Área 4 — AI Agent & Chat
5 tools expostas ao `gpt-4o` (3 read, 2 write diferidas via ActionProposal). O desenho de segurança do write é **correto**: proposta → modal → execução com revalidação completa de userId + policy + schema (`LuminarisAgentService.ts:181`, `DynamicTableService.ts:385-398`). Os problemas estão em volta: **prompt injection não mitigado** — nomes de tabelas/campos/opções do usuário e conteúdo de documentos são interpolados crus nos prompts (AG-1, AG-2); **sem rate limiting** de OpenAI (AG-4); **histórico sem truncamento** (AG-6); `deleteOldProposals()` existe mas nunca é chamado (AG-5). Temperatura e max_tokens não são definidos nas chamadas principais (defaults do provider).

### Área 5 — Frontend
Mapeadas todas as páginas, os ~12 tipos de campo do DynamicForm (com máscaras BR: phone/CPF/CNPJ/CEP), o GenericTabbedView completo (filtros persistidos, sort por label de relação, colunas customizáveis com drag/resize), a camada ApiClient (singleton com toast global e header `x-user-timezone`) e os 5 contexts. Achados novos: **sparkline dos KPIs é mock com Math.random** (FE-11 — visual sem dado real); **sem interceptor de 401/refresh** (FE-2); **erros 400 da API não são mapeados por campo** no DynamicForm (FE-5); `?devSeed=1` persiste em localStorage indefinidamente (FE-9). A UI de aprovação de ActionProposal não foi localizada como componente explícito — merece verificação manual.

### Área 6 — Documentos/RAG & structuredData
Pipeline confirmado: upload (multer **memoryStorage sem limite** — DOC-1) → extração (pdf-parse/mammoth/ExcelJS, **sem retry**) → chunking (500 palavras, overlap 50) → embeddings (text-embedding-3-small, batches de 10, sem retry) → Qdrant (collection `documents`, payload inclui userId). O gap das duas rotas de busca foi re-confirmado com detalhe: `searchVectors()` filtra por userId (`must`), `search()` não filtra (`should` só por documentId) **e é exatamente a rota usada pelo ChatService no modo RAG** (`ChatService.ts:193`). structuredData: backend 100% implementado (endpoint, service com extração Excel direta + LLM, Prisma model), **0% consumido no front** (grep confirmado).

---

## 2. Correlações entre áreas (achados que só aparecem cruzando relatórios)

1. **A falta de transação é sistêmica, não pontual.** Aparece no Rules Engine (RE-5, RE-11), no install de presets (PR-1) e na finalização de vendas. A causa raiz é a mesma: `IDynamicTableRepository` não expõe primitiva de transação. Uma única correção arquitetural (unit-of-work no repositório) resolve as três famílias de risco.

2. **O LIMIT 100 do `findRowsByFieldValue` é um bug latente compartilhado.** Afeta SalesPlugin/UnitAutoStock (estoque não provisionado), StockMovements (match de unitId errado) e LeadsPlugin (validação de transição de stage). Qualquer tenant que ultrapasse 100 registros nessas relações ativa o bug silenciosamente.

3. **O bypass `isSystem` conecta R2 (consolidado) ao Rules Engine e aos presets.** Plugins usam `ctx.isSystem` para pular validações (appointments no passado, mix de tipos de item); o schema usa para pular readOnly/immutableAfter/lifecycle (PR-7). Como o R2 mostrou que `__isSystem` é controlável pelo cliente, **todas essas validações são contornáveis por um usuário malicioso** — a superfície do R2 é maior do que parecia.

4. **Prompt injection (AG-1) compõe com o schema-driven design.** O usuário controla nomes de tabelas/campos/opções (é a proposta do produto), e esses mesmos valores entram crus no system prompt do agente que tem tools de escrita. O caminho usuário → schema → prompt → tool de escrita existe de ponta a ponta; a mitigação única (modal de confirmação) é a última linha de defesa.

5. **Streaming parcial dos KPIs vs sparkline mock.** O backend já calcula série histórica de 24 meses (`fullRecords` no RevenueKpiProcessor) e tem mecanismo de entrega (`resolveChartDetails`), mas o front ignora e renderiza Math.random (FE-11). A funcionalidade existe nas duas pontas e não está conectada — análogo ao structuredData (DOC-4).

---

## 3. Riscos novos consolidados (delta sobre R1–R38)

### Críticos / Altos

| ID | Área | Risco | Evidência |
|---|---|---|---|
| DOC-1 | Docs | Multer memoryStorage sem limite de tamanho — OOM | documentsController.ts:11 |
| RE-5/RE-11 | Rules | Escritas multi-tabela sem transação (vendas, estoque) — estado parcial | SalesPlugin.ts:337; StockMovementsApplyPlugin.ts:85 |
| RE-2/RE-3 | Rules | loadSaleItems/deleteSaleIfFirstItem com fallback heurístico frágil — venda finaliza sem itens ou venda válida deletada | SalesPlugin.ts:211-213, 256-269 |
| RE-8 | Rules | ProductAutoStockPlugin sem idempotência — duplicatas de estoque em rerun | ProductAutoStockPlugin.ts:23-49 |
| PR-1/PR-4 | Presets | Install sem transação + marcador inválido detectado tarde — tabelas órfãs + reinstalação bloqueada | DynamicTableService.ts:187-315 |
| PR-5 | Presets | Race condition no install (dois POSTs simultâneos) | dashboardController.ts:46-54 |
| AG-1/AG-2 | Agent | Prompt injection via schema do usuário e via documentos | KnowledgeGraphService.ts:124-130; ChatService.ts:194,204 |
| KPI-4 | KPI | Falha silenciosa em fetch multi-tabela → métrica incorreta sem aviso | ProductCostKpiProcessor.ts:104-110 |
| FE-2 | Front | Sem refresh/interceptor de 401 | api-client.ts |
| FE-5 | Front | Erros de validação da API não mapeados por campo | DynamicForm.tsx |

### Médios (seleção)

- RE-6/RE-12/RE-13 — LIMIT 100 implícito em 3 plugins
- RE-10 — cost normalizado para 0 silenciosamente em movimentos de estoque
- AG-4/AG-5/AG-6 — sem rate limiting OpenAI; propostas nunca expiram; histórico sem truncamento
- KPI-1 — heurística new/loyal customer baseada só no período atual
- KPI-9 — "smart fallback" resolve campos `*Id` como relação indevidamente
- PR-7 — bypass isSystem pula governança declarativa (amplifica R2)
- DOC-3/DOC-5 — sem retry de extração; limite de 100K tokens sem comunicação
- FE-9/FE-11 — devSeed persistente; sparkline mock

(Tabelas completas com todos os itens e linhas exatas nos parciais.)

---

## 4. Recomendações priorizadas (delta)

**P0 — antes de qualquer produção**
1. Limite de tamanho no Multer (`limits: { fileSize }`) — DOC-1
2. Filtro de userId em `VectorRepository.search()` — reconfirma R3 com rota de exploração mapeada
3. Unit-of-work/transação no `IDynamicTableRepository` e aplicação em: finalização de venda, StockMovements, installPresetAsSystem — RE-5/RE-11/PR-1
4. Remover `__isSystem` do payload do cliente (R2) — agora sabendo que ele bypassa também os plugins e a governança de schema

**P1 — curto prazo**
5. Idempotência no ProductAutoStockPlugin (check antes do create) — RE-8
6. Corrigir/paginar `findRowsByFieldValue` (LIMIT 100) — RE-6/12/13
7. Delimitar dados de usuário nos prompts (escape/tags) — AG-1/AG-2
8. Rate limiting de chamadas OpenAI por usuário — AG-4
9. Lock/constraint única no install de preset — PR-5
10. Logar (em vez de engolir) falhas de fetch multi-tabela nos KPIs — KPI-4

**P2 — melhoria contínua**
11. Interceptor 401 + refresh no ApiClient — FE-2
12. Mapear erros 400 por campo no DynamicForm — FE-5
13. Conectar sparkline aos dados reais já calculados pelo backend — FE-11
14. Decidir destino do structuredData (construir UI ou remover pipeline) — DOC-4
15. Cron para `deleteOldProposals()` — AG-5
16. Truncamento de histórico de chat — AG-6
17. Testes para processors dinâmicos (AggregatePipeline, Cashflow, MultiTable) e para `loadSaleItems()` com tabelas custom

---

## 5. Nota metodológica

Cada área foi investigada por leitura direta do código-fonte com citação de arquivo:linha. Divergência identificada e corrigida durante consolidação: o relatório da Área 6 classificou `VectorRepository.search()` como "órfã"; a verificação cruzada com a Área 4 e com a auditoria consolidada anterior confirma que ela **é chamada por `ChatService.ts:193`** no modo RAG — a nota de correção está registrada no próprio parcial. Itens marcados como inferência (páginas do front não lidas integralmente, UI de ActionProposal, AiInterviewSetup) estão explicitamente sinalizados nos parciais.
