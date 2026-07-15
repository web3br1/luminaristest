# Learnings — Buildout Contábil (INCR-1..4)

Ledger de aprendizados do esforço de fundação contábil. Formato e regras: skill `learning-log`.
Entradas mais novas no topo.

---

### 2026-07-15 · pattern · Review de branch NÃO-mergeado precisa de guarda-de-árvore (worktree isolado reflete main)
- **Contexto:** FE-INCR-AR (aba Contas a Receber, clone invertido do FE-INCR-AP; backend AR já em main #111). Numa sessão anterior deste mesmo dia, um reviewer com `isolation: worktree` sobre um branch cujo trabalho NÃO estava em main acabou lendo `main` (não o branch) e reportou o código de main como se fosse o do branch — um falso "PASS por árvore errada" que quase virou acusação de alucinação.
- **Aprendizado:** ao delegar review de trabalho que ainda não foi mergeado, NÃO confie no worktree isolado default (ele pode partir de main). Aponte o reviewer para o worktree REAL do branch e exija, como PRIMEIRO passo antes de qualquer check, a **guarda-de-árvore**: `git branch --show-current` == branch esperado, `git log origin/main..HEAD` lista os commits esperados, `git diff --stat origin/main..HEAD` não-vazio e restrito aos paths esperados. Se a guarda falhar → "ÁRVORE ERRADA", nunca um review inventado. Reforce com regra anti-alucinação (toda afirmação factual cola a linha literal).
- **Evidência:** review FE-INCR-AR PASS 9/9 com guarda-de-árvore confirmada (branch `claude/fe-incr-ar`, 4 commits, `server/` intocado); `next build` verde; contraste com o review do backend AR que leu main por falta da guarda.
- **Como aplicar:** todo handoff de review de branch não-mergeado carrega a guarda-de-árvore como passo 0; a independência do reviewer é de julgamento, não exige worktree novo — um agente fresco lendo o branch certo basta.
- **Durável?** sim → [[duplicate-ar-on-stale-branch]] (auto-memória)

### 2026-07-14 · decision · INCR-AP Contas a Pagar — subledger first-class que posta DIRETO via postEntry
- **Contexto:** Task 5 (INCR-AP), merged main PR #102 (`4a6eddb`). Primeiro subrazão de despesa operacional.
- **Aprendizado:** F0 rota (a) — `PayableService` chama `PostingService.postEntry` direto (sem port/mapper/bridge; golden ref `ExerciseClosingService`). Duplo fato gerador: recognition `D 4.x / C 2.1.2` (`sourceType=ap.payable`, `sourceId=payableId`) + settlement `D 2.1.2 / C método` (`sourceType=ap.payment`, `sourceId=paymentId`, NUNCA payableId). Conta `2.1.2` nova = zero migração (seed idempotente por code).
- **Evidência:** `server/src/features/accounting/services/PayableService.ts`; ADR `docs/adr/ADR-INCR-AP-accounts-payable.md`; smoke-gate `docs/accounting/SMOKE-MIGRATION-GATE-INCR-AP.md` (PASS cópia dev.db real).
- **Como aplicar:** ao construir o próximo subrazão que posta direto (AR formal, folha), copie ESTE módulo, não os mappers do salon sync.
- **Durável?** sim → [[accounting-incr-ap]]

### 2026-07-14 · pattern · postEntry-direto = modelo de consistência de 2 transações (CAS-antes-do-post + reconcile)
- **Contexto:** INCR-AP. `postEntry` abre a PRÓPRIA tx-raiz (SQLite não aninha), então a escrita da linha do módulo e a escrita do ledger são txs SEPARADAS.
- **Aprendizado:** (a) guard de corrida = CAS atômico de status ANTES do post (`claimForPayment` OPEN→PAYING, count===1 vence), não dentro da tx do post; (b) NUNCA reverter/compensar DEPOIS de um post bem-sucedido (flag `posted` — o ledger já commitou); (c) um reconcile re-drive pela mesma `sourceId` é a rede OBRIGATÓRIA para crash-entre-txs, e TEM de ser testado — módulos rota-(a) não herdam o reconcile genérico do AccountingSync (ADR §6.2, risco nº 1).
- **Evidência:** `PayableService.ts` (registerPayment flag `posted`, `reconcilePayables`); `PayableClaim.integration.test.ts` (10 concorrentes → 1, SQLite real).
- **Como aplicar:** todo módulo posts-direct herda o trio CAS-antes-do-post / não-reverter-pós-post / reconcile-testado; o reviewer valida os três.
- **Durável?** sim → [[accounting-incr-ap]]

### 2026-07-14 · pitfall · Tag jsdoc-openapi literal em PROSA num arquivo do glob polui o openapi.json
- **Contexto:** INCR-AP Fase B — pego por review INDEPENDENTE (a sequência que implementou não pegaria o próprio comentário).
- **Aprendizado:** escrever a tag jsdoc-openapi literal numa PROSA (comentário normal) em arquivo varrido (`routes/**`, `controllers/**`) faz o swagger-jsdoc espalhar a string do comentário char-a-char em `paths` como chaves numéricas `"0".."123"`, corrompendo `public/openapi.json`. O teste-piso `pathCount >= BASELINE` NÃO pega — lixo INFLA a contagem (piso não detecta inflação).
- **Evidência:** commit `947d040` (fix em `routes/payables.ts` + guard novo em `openapi-paths.test.ts` "emits no junk (non-slash) path keys").
- **Como aplicar:** nunca escreva a tag literal em prosa de arquivo do glob (diga "OpenAPI doc blocks"); após `docs:generate`, cheque `Object.keys(paths).filter(k=>!k.startsWith('/'))` vazio.
- **Durável?** sim → [[openapi-wiring-static-artifact]]

### 2026-07-14 · assumption-correction · Gate sintético via SQL cru não valida o formato que o Prisma grava
- **Contexto:** Task 7 (smoke-migration-gate sobre dev.db real). O gate sintético `SMOKE-MIGRATION-GATE-001` (2026-06-27) tinha dado PASS em INCR-1/INCR-2 com dados inseridos via SQL; o replay com **dados reais** reprovou a migration `20260627150000_add_entry_numbering` (P3018).
- **Aprendizado:** SQL manual grava datas TEXT; o Prisma grava `DateTime` como INTEGER ms-epoch no SQLite — `strftime('%Y', <integer>)` interpreta Julian Day → NULL → NOT NULL violation. O backfill também não é re-executável após falha (CREATE TABLE sem guard) e diverge do app em TZ (UTC × America/Sao_Paulo; cross-check 7/15 divergentes). INCR-1/INCR-2 aplicaram limpas — `RISK-INCR1-DB-001` e `SMOKE-MIGRATION-GATE-001` fecharam; nasceu `RISK-INCR3-MIGRATION-001` (latente, não bloqueia o deploy atual).
- **Evidência:** `docs/accounting/SMOKE-MIGRATION-GATE-INCR1-INCR2-DEPLOY.md` (PR #94); `server/prisma/migrations/20260627150000_add_entry_numbering/migration.sql:64` (strftime sobre coluna DateTime).
- **Como aplicar:** todo smoke-migration-gate roda em duas bases — sintética E cópia de banco populado **pelo aplicativo**; todo backfill SQL que derive valor de coluna DateTime do Prisma exige tratamento dual-format (`typeof(col)='integer'` → `datetime(col/1000.0,'unixepoch')`) + decisão explícita de fuso.
- **Durável?** sim → [[sintetico-nao-cobre-formato-de-dado-real]]

### 2026-07-12 · gotcha · Worktree principal com generated/prisma stale reprova tsc do BASE, não da feature
- **Contexto:** Integração serial Fase B dos 3 relatórios (DFC/comparativo/Livro Diário). Após `git merge --ff-only origin/main` na worktree principal (`C:/Users/smurf/Downloads/Luminaris`), `npx tsc --noEmit` acusou ~8 erros TS2305/TS2339 sobre `ReferentialAccount` — que NÃO vinham de nenhuma das branches de feature, mas do cliente Prisma gerado desatualizado (INCR-9B adicionou o model `ReferentialAccount` ao schema, mas `server/generated/prisma` na worktree principal foi gerado antes disso).
- **Aprendizado:** um tsc vermelho logo após sincronizar `main` pode ser dívida do BASE (cliente Prisma stale), não da mudança que você acabou de integrar. Diferente do gotcha de worktree fresca (sem `node_modules`), aqui a worktree principal TEM node_modules, mas o `generated/prisma` ficou para trás de uma migração já mergeada.
- **Evidência:** `server/src/features/accounting/repositories/ReferentialAccountRepository.ts:2` (`Module '"generated/prisma"' has no exported member 'ReferentialAccount'`); `npx prisma generate` regenerou os tipos e o tsc ficou limpo (o erro ENOENT em `runtime/index-browser.js` no fim do generate não afeta os tipos que o tsc consome).
- **Como aplicar:** antes de culpar uma branch por um tsc vermelho pós-merge, rode `npx prisma generate` se o erro for sobre um model/campo que já está no `schema.prisma`. Só depois de client fresco o tsc vira gate confiável da feature.
- **Durável?** não (relacionado a [[worktree-deps-stale-prisma-client]], que cobre a worktree fresca)

### 2026-07-12 · gotcha · DTO `.strict()` sem unitId obriga o handler a ler unitId à parte
- **Contexto:** Registro do relatório comparativo (`report-period-comparison`) no controller. `PeriodComparisonSchema` é `.strict()` e só declara `asOfCurrent`/`asOfPrevious` — não inclui `unitId`.
- **Aprendizado:** passar `req.query` inteiro (que traz `unitId`) para um schema `.strict()` que não declara `unitId` faz o parse FALHAR com 400 por "unrecognized key". Quando o escopo (unitId) mora fora do DTO de datas, o handler tem de extrair `unitId` separadamente e montar `{ asOfCurrent, asOfPrevious }` para o schema.
- **Evidência:** `server/src/features/accounting/dtos/periodComparison.dto.ts:36` (`.strict()` só com as duas datas); handler `getPeriodComparison` em `server/src/controllers/accountingController.ts` lê `req.query.unitId` à parte (mesmo padrão de `getAccountLedger` com `accountCode`).
- **Como aplicar:** ao registrar um handler para um DTO `.strict()` que omite `unitId`, ler `unitId` de `req.query` separadamente e só então `safeParse` o subconjunto declarado — nunca jogar `req.query` cru no schema strict.
- **Durável?** não

### 2026-07-02 · pitfall · Git checkout verificado ainda perde para sessão concorrente
- **Contexto:** FIX-FE-INCR1-M1M2 — checkout de `fix/accounting-dre-diagnostics-and-date-rendering` a partir de `main`, confirmado ativo via `git branch --show-current`. Durante a edição, outra sessão no MESMO working directory compartilhado fez seu próprio checkout (`docs/fix-fe-incr1-m1m2-execution-brief`) e commitou — HEAD mudou por baixo, sem qualquer erro.
- **Aprendizado:** um `git branch --show-current` logo após o checkout prova o estado NAQUELE instante, não durante toda a janela de edição seguinte. Numa working directory compartilhada entre sessões, isso não fecha a race — só um `git worktree` isolado fecha, porque nenhuma outra sessão consegue trocar o HEAD dele.
- **Evidência:** `git reflog` mostrou `checkout: moving from fix/accounting-dre-diagnostics-and-date-rendering to docs/fix-fe-incr1-m1m2-execution-brief` no meio da sessão, sem nenhuma ação minha; recuperado via `git stash` do diff (nada tinha sido commitado ainda) + `git worktree add .claude/worktrees/fix-fe-incr1-m1m2 fix/accounting-dre-diagnostics-and-date-rendering`.
- **Como aplicar:** para qualquer tarefa que vai gerar múltiplas edições/commits neste repo, abrir um worktree isolado ANTES de editar, não confiar em checkout+verify na working directory principal compartilhada.
- **Durável?** sim → [[verify-write-context-before-writing]] (memória atualizada com este caso)

### 2026-07-02 · pitfall · Teste de diagnóstico bidirecional sem fixture cruzada esconde guard faltante
- **Contexto:** FIX-FE-INCR1-M1M2 — M1, `AccountingReportService.buildDiagnostics`.
- **Aprendizado:** o guard recíproco BP→DRE existia; o simétrico DRE→BP não. 632/632 testes verdes o tempo todo, porque nenhum teste de `incomeStatement` misturava um saldo de Asset com Revenue — só natures do próprio statement. `reportStatus` ficava `INVALID` em qualquer ledger real (todo lançamento de receita debita caixa/a receber).
- **Evidência:** `server/src/features/accounting/services/__tests__/AccountingReportService.bp-dre.test.ts` — testes pré-existentes de `incomeStatement` só usavam Revenue/Expense; T1 (novo, Asset+Revenue) provou vermelho-antes/verde-depois.
- **Como aplicar:** todo teste de diagnóstico bidirecional (BP/DRE ou futuro terceiro statement) precisa de pelo menos uma fixture do "outro lado" com saldo não-zero — não só variações dentro do mesmo statement.
- **Durável?** sim → [[bp-dre-diagnostics-test-must-mix-natures]]

### 2026-07-02 · gotcha · Canônico de data corrige o bug mas muda o formato visual — verificar antes de reusar
- **Contexto:** FIX-FE-INCR1-M1M2 — M2, 4 componentes accounting com `new Date(iso).toLocaleDateString('pt-BR')` local (off-by-one em UTC-3).
- **Aprendizado:** o canônico `dashboard/shared/utils/formatters.ts` `formatDate(..., {dateOnly:true})` resolve o parsing (evita o shift), mas formata em `Intl.DateTimeFormat` com `month:'short'` → "01 de jul. de 2026", não o `dd/mm/aaaa` numérico que as 4 telas usam. Reuso direto teria corrigido a data e quebrado o formato visual silenciosamente — só foi pego rodando o canônico contra dado real ANTES de trocar os imports, não assumindo pela leitura do plano.
- **Evidência:** `my-app/features/dashboard/shared/utils/formatters.ts:118-133` (`dateOptions.month = 'short'`); resolvido com wrapper local `my-app/features/accounting/lib/formatDate.ts` (reusa só a técnica de parse date-only-safe, formata numérico).
- **Como aplicar:** antes de plugar um formatter compartilhado numa tela nova, rodar contra dado real e comparar o SHAPE de saída com o que a tela já mostra — "mesma classe de bug, mesma técnica de fix" não garante "mesmo formato visual". Divergência de shape sancionada quando o formato é parte do contrato visual da tela.
- **Durável?** sim → [[date-only-rendering-utc-shift-class-bug]]

### 2026-06-27 · pitfall · `tx` não propagado ao repo = atomicidade aparente, falha real
- **Contexto:** INCR-2 — G6 defect detectado pelo reviewer independente antes do commit (306f790).
- **Aprendizado:** Abrir `runTransaction` mas chamar `accountRepo.create({...})` sem passar `tx` significa que a escrita vai ao `prisma` global, FORA da tx. A auditoria roda dentro; a mutação, fora. Se o audit ou `bumpHead` falhar depois, a conta fica persistida sem evento de auditoria — atomicidade quebrada em produção, invisível nos testes de alto nível.
- **Evidência:** `server/src/features/accounting/services/PostingService.ts` — `createAccount:445` (antes: `this.accountRepo.create({...})` sem `tx`; depois: `this.accountRepo.create({...}, tx)`) e `deleteAccount:512` (`softDelete` idem). Reviewer report G6 FAIL → PASS após patch.
- **Como aplicar:** Ao abrir `runTransaction(async (tx) => { ... })`, verificar que **toda escrita** dentro do bloco passa `tx` ao repo. Abrir a tx e não propagar o handle é equivalente a não ter tx. Cheklist: um `grep -n "this\.\w*Repo\." Service.ts` dentro do bloco → todas as calls devem incluir `tx` ou serem explicitamente leitura fora-de-tx por design (ex.: preflight, idempotência read-side).
- **Durável?** sim → [[tx-nao-propagado-ao-repo]]

### 2026-06-27 · pattern · Reviewer independente não é cerimônia — encontrou bug real antes do commit
- **Contexto:** INCR-2 — independent review em worktree isolado (após implementação completa com 571 testes passando e tsc limpo).
- **Aprendizado:** Com 571 testes verdes e tsc limpo, o reviewer independente ainda encontrou o defeito de atomicidade em `createAccount/deleteAccount` (G6). Isso confirma que o review de worktree isolado não é processo de conformidade — é defesa real contra bugs que os testes de unidade não cobrem (os mocks não verificam que `tx` é passado; só cobrem que a mutação não ocorre em guards).
- **Evidência:** commit 306f790; reviewer report G6 FAIL → G6 PASS após fix (AccountRepository.ts:59, IAccountRepository.ts:52, PostingService.ts:512).
- **Como aplicar:** Nunca substituir o reviewer por um "tsc + jest verdes = ok". A lacuna que o reviewer fecha: **integração entre camadas** (tx handle propagation, wiring de DI, call sites que os mocks nunca alcançam). Ver [[reviewer-independence-separate-agent]].
- **Durável?** não — o princípio já está em `[[reviewer-independence-separate-agent]]`; esta entrada reforça com evidência concreta.

### 2026-06-27 · pitfall · Doc com emenda em banner + corpo stale é armadilha para agente executor
- **Contexto:** PLANEJAMENTO v1 — emendas ratificadas ficaram em nota amarela, corpo antigo contradizia.
- **Aprendizado:** "ADR prevalece" num banner não basta: um agente coder pode implementar o corpo antigo abaixo. Decisão ratificada e histórico descartado têm de ser **blocos separados** — só o ratificado é implementável; o resto vira tabela de "decisões descartadas" sem plano de skills executável.
- **Evidência:** `docs/accounting/PLANEJAMENTO-buildout-contabil.md` (v1, superseded) vs `...-v2.md` (§4 decisões descartadas).
- **Como aplicar:** ao incorporar emendas, reescrever o corpo operacional, não só anexar aviso. Marcar o doc antigo como SUPERSEDED no topo. Um doc de execução não pode ter duas camadas que se contradizem.
- **Durável?** não (processo deste esforço; o padrão "decisão ratificada × descartada" fica no v2).

### 2026-06-27 · pitfall · Gate de invariante precisa ser autoritativo DENTRO da transação
- **Contexto:** Revisão de ratificação ADR-INCR1 (consultor sênior).
- **Aprendizado:** Validar "período OPEN" **antes** da transação é só preflight — abre TOCTOU (admin fecha entre o check e o commit). O `@@unique([userId,unitId,year,month])` fecha duplicidade de período, **não** esse race. O gate definitivo tem de rodar na MESMA tx que marca `Posted`.
- **Evidência:** `ADR-INCR1-accounting-periods.md` Emenda 1; ponto de inserção `PostingService.ts:116` (preflight) + dentro do `runTransaction` (autoritativo).
- **Como aplicar:** Para qualquer gate de invariante mutável (período, saldo, status), preflight fora da tx (erro rápido) + re-check autoritativo dentro da tx antes da escrita. `@@unique` não substitui o re-check quando a condição é mutável por terceiro.
- **Durável?** sim → [[authoritative-gate-inside-tx]] (na memória)

### 2026-06-27 · pitfall · Bridge/job não pode capturar erro genérico para skip+log
- **Contexto:** ADR-INCR1 Q4 (reconcile skip+log).
- **Aprendizado:** `skip+log` em cima de `ValidationError` genérico esconde bug real (conta inexistente, desbalanceado, conta sintética, dimensão ausente). O skip só pode disparar num **erro específico** (`code === 'ACCOUNTING_PERIOD_NOT_OPEN'`); o resto continua falha.
- **Evidência:** `ADR-INCR1-accounting-periods.md` Emenda 2-3.
- **Como aplicar:** Erro que autoriza comportamento tolerante (skip/retry) precisa de `code`/subclasse própria. Catch por tipo-base largo em borda de job é anti-padrão.
- **Durável?** sim → [[erro-especifico-para-skip-em-job]] (na memória)

### 2026-06-27 · pitfall · Log append-only não pode ter FK cascade destrutivo
- **Contexto:** ADR-INCR2 Emenda 1.
- **Aprendizado:** `userId @relation(onDelete: Cascade)` num `AuditEvent` significa "deletar usuário = deletar a trilha contábil". Auditoria que some com o ator não é auditoria. Use ID escalar imutável (`scopeUserId`/`actorUserId`), sem cascade (ou `SetNull`/`Restrict`).
- **Evidência:** `ADR-INCR2-audit-trail.md` Q6/Emenda 1.
- **Como aplicar:** Tabelas de auditoria/histórico não seguem o idioma de tenancy `userId(FK Cascade)` do resto do projeto — preservam IDs e têm retenção própria.
- **Durável?** sim → [[audit-log-no-fk-cascade]] (na memória)

### 2026-06-27 · pitfall · API que aceita parâmetro e ignora é bug silencioso
- **Contexto:** ADR-INCR4 Q3 (period semantics).
- **Aprendizado:** Aceitar `from/to` na DRE e carimbar `cumulative` ignorando-os faz o usuário pedir "junho" e receber acumulado. Param aceito-e-ignorado é fonte de erro operacional silencioso. Melhor: contratos semânticos distintos (BP `?asOf=`, DRE `year_to_date`), e `400` explícito para `from` ainda não suportado.
- **Evidência:** `ADR-INCR4-bp-dre.md` Q3/Emenda 1.
- **Como aplicar:** Nunca aceitar um parâmetro que o handler ignora. Ou implementa, ou rejeita com erro claro.
- **Durável?** sim → [[param-aceito-e-ignorado-e-bug]] (na memória)

### 2026-06-27 · gotcha · Mapeamento contábil por `nature` puro não separa contra-receita/deduções
- **Contexto:** ADR-INCR4 Q4 (StatementMapping).
- **Aprendizado:** `Record<AccountNature,...>` não distingue Receita Bruta × Deduções (3.2 é nature `Revenue` mas redutora) nem Custo × Despesa × Financeiro. Precisa de regras declarativas com `codePrefix`+`nature` e ordem de matching (accountId → codePrefix → nature → fallback).
- **Evidência:** `ADR-INCR4-bp-dre.md` Q4/Emenda 6.
- **Como aplicar:** Classificação de demonstração é por regra (prefixo de código), não só por natureza da conta. Conta sem mapping com saldo → relatório `WARNING/INVALID`, nunca ignorada.
- **Durável?** não (específico de BP/DRE; vive no ADR-INCR4).

### 2026-06-27 · decision · Numeração nasce na postagem definitiva, não num `create` genérico
- **Contexto:** ADR-INCR3 Emenda 2-3.
- **Aprendizado:** Alocar `entryNumber` em `JournalEntryRepository.create` só é seguro se `create` = "criar lançamento já postado". Se Draft/staging/preview persistir um dia, número seria consumido por rascunho. Atribuir via método explícito (`createPostedEntry`) na tx de postagem. E `NOT NULL` só vale enquanto Draft persistido não existir — declarar como invariante.
- **Evidência:** `ADR-INCR3-entry-numbering.md` Emenda 2-3; Q8.
- **Como aplicar:** Identidade sequencial legal pertence ao fato efetivado, não a qualquer create. Idempotência resolve ANTES de consumir número (senão buraco).
- **Durável?** não (específico da numeração; vive no ADR-INCR3).

### 2026-06-27 · pattern · PostingService é o ponto de convergência — a ordem dos incrementos importa
- **Contexto:** Planejamento INCR-1..4 (recon multi-agente).
- **Aprendizado:** 3 dos 4 incrementos miram o construtor de `PostingService` (INCR-1 leva 4→5 args com period repo; INCR-2 leva 5→6 com audit repo). INCR-3 e INCR-4 **não** tocam o motor de postagem (numeração vive no repo; BP/DRE são read-only).
- **Evidência:** `server/src/features/accounting/services/PostingService.ts:103,213`; planos INCR-1/2 vs INCR-3/4 em `docs/accounting/PLANEJAMENTO-buildout-contabil.md`.
- **Como aplicar:** Fazer INCR-1 → INCR-2 nesta ordem (auditoria passa a cobrir close/reopen). Cada mudança de aridade do construtor rippla em todo test builder — enumerar callers via cbm `trace_path` antes de commitar.
- **Durável?** não (específico deste buildout).

### 2026-06-27 · gotcha · Gate de período tem risco de receita silenciosa pelos bridges
- **Contexto:** INCR-1, decisão de onde colocar o gate de período fechado.
- **Aprendizado:** Os bridges pós-commit engolem erros (best-effort, não-fatal). Um gate de período fechado que lança dentro deles pode **dropar receita sem rastro** OU loopar o reconcile num período HARD_CLOSED.
- **Evidência:** `server/src/features/accounting/sync/bridges/*Bridge.ts` (catch não-fatal); `server/src/jobs/accountingSyncReconcile.job.ts`.
- **Como aplicar:** O skip+log dos bridges DEVE registrar o evento pulado no relatório de reconcile; teste obriga skip-não-loop. Ratificado em `docs/adr/ADR-INCR1-accounting-periods.md` Q4.
- **Durável?** não (específico do gate de período).

### 2026-06-27 · gotcha · Registro de rota é 3 toques, não 2 — e tsc só pega o 1º
- **Contexto:** Contratos das skills (recon), aplicável a todo endpoint novo do buildout.
- **Aprendizado:** Rota nova exige: (1) `routes/index.ts`, (2) `'/api/<rec>'` em `protectedApiPaths` de `middleware/auth.ts` — **pular = 401 silencioso com token válido**, (3) bloco `@openapi paths:` em `docs.paths.ts` — **pular = endpoint ausente do doc**. tsc fica verde nos dois últimos.
- **Evidência:** `server/src/routes/docs.paths.ts`; `server/src/middleware/auth.ts` (`protectedApiPaths`); golden ref `users` (4 arquivos).
- **Como aplicar:** Após gerar rota, validar `grep -c "/api/<rec>" server/src/routes/docs.paths.ts > 0` e conferir o entry em `auth.ts`. Confiar no skill-audit `wiring`, não no tsc.
- **Durável?** não — o repo já registra isto na skill `backend-route-generator` e no wiring gate; manter aqui só como lembrete do esforço.

### 2026-06-27 · pitfall · `@openapi` em `dtos/` é código morto
- **Contexto:** OpenAPI de qualquer endpoint contábil novo (INCR-1, INCR-4).
- **Aprendizado:** O glob do swagger varre só `controllers/**` e `routes/**`. Blocos `@openapi` em `features/*/dtos/*.ts` nunca são emitidos. E `public/openapi.json` (committed) é preferido em runtime → editar JSDoc sem rodar `npm run docs:generate` deixa o spec stale.
- **Evidência:** `server/src/routes/docs.ts:28`, `server/scripts/generate-openapi.js:25`.
- **Como aplicar:** `@openapi` vai no controller/route; sempre rodar `npm run docs:generate`. Saldar pendência: `/package-balances` ainda fora do `openapi.json`.
- **Durável?** sim → [[openapi-wiring-static-artifact]] (já na memória).

### 2026-07-03 · decision · Conciliação usa models próprios, não novo ImportKind (fronteira Prisma↔Prisma)
- **Contexto:** BE-INCR-7 D1 — onde vive a ingestão de extrato bancário.
- **Aprendizado:** O motor de import (DataExchange) sempre POSTA no ledger no commit; extrato bancário não posta nada — LIGA linhas a postings existentes. Forçar um `IMPORT_BANK_STATEMENT` ramificaria validators/mappers ledger-específicos para um alvo que não é escrita de ledger. É a mesma fronteira do §2.1, aplicada entre dois módulos Prisma.
- **Evidência:** `docs/adr/ADR-INCR7-bank-reconciliation.md` D1; `DataExchangeImportService.ts` (commit resolve em ACCOUNT|JOURNAL_ENTRY via PostingService). Reusado só o parser puro `lib/spreadsheet.parseTable`.
- **Como aplicar:** "Passa pelo mesmo arquivo" não implica "mesmo pipeline" — a pergunta é o que o commit ESCREVE.
- **Durável?** avaliar (candidato: fronteira-por-efeito-de-escrita).

### 2026-07-03 · decision · Flip D5 derivado+reversível+auditado; auto-match abstém no empate (D6)
- **Contexto:** BE-INCR-7 D5/D6 (opção B escolhida pelo usuário).
- **Aprendizado:** `Reconciled` nunca é setado à mão: deriva de "todo posting de conta-banco tem match ativo", recomputado bidirecional em match/unmatch na MESMA tx (0-row no update condicional = TOCTOU → rollback). Auto-match comita SÓ no candidato único — abster no empate torna o re-run idempotente por construção (nunca há escolha, logo nunca há corrida de escolha).
- **Evidência:** `ReconciliationService.recomputeEntryFlip` + `updateEntryStatus` tipado `'Posted'|'Reconciled'`; testes match-flip (flip, flip-back, 0-row).
- **Como aplicar:** Estado derivado com update condicional por from-status é o padrão para marcadores reversíveis sobre entidades imutáveis.
- **Durável?** não (vive no ADR-INCR7).

### 2026-07-03 · pattern · Emenda de status é class-fix: landar no-op-primeiro + varrer todo filtro
- **Contexto:** Emenda INCR4-A (`Reconciled` conta como status de ledger).
- **Aprendizado:** A constante (`LEDGER_STATUSES`) era só metade da classe — a varredura (`grep` de filtros de status fora de testes) achou um segundo ponto: `getLiabilityCents` no job de sync-reconcile (o saldo do passivo 2.1.1 encolheria silenciosamente pós-conciliação). Landar ANTES do writer do novo status torna a emenda no-op nos dados atuais e fecha a janela "flip sem relatório reconhecer".
- **Evidência:** PR #35 (varredura documentada no corpo); reviewer independente refez a varredura e confirmou zero resíduo.
- **Como aplicar:** Emenda de semântica de status = enumerar TODO `status ===/in/includes` do server e julgar hit a hit (classe relatório vs elegibilidade vs candidato); o reviewer refaz a varredura por conta própria.
- **Durável?** sim → reforça [[idempotency-class-fix-discipline]].

### 2026-07-03 · gotcha · Regex YYYY-MM-DD não valida calendário — JS Date rola overflow em silêncio
- **Contexto:** MAJOR-1 do review do PR5 (provado em runtime: `new Date('2026-02-30')` → 2026-03-02).
- **Aprendizado:** Regex + NaN-check deixam passar datas inexistentes que MUTAM silenciosamente (+até 3 dias) — distorce janela de match, fiscal year e relatórios datados. O fix é round-trip: parse UTC midnight → format → comparar com a string original. Era uma CLASSE (7 sites em 5 arquivos: DTOs de posting/data-exchange/reconciliation + validators + parseLines), não um ponto.
- **Evidência:** `server/src/features/accounting/models/dates.ts::isValidDateOnly` (casa canônica, como MAX_CENTS em money.ts); testes pinando 2026-02-30/2026-06-31.
- **Como aplicar:** Toda fronteira date-only usa `isValidDateOnly`, nunca regex crua; validação nova de formato = procurar a classe inteira antes de fechar o PR.
- **Durável?** sim (candidato a memória: date-only-regex-nao-valida-calendario).

### 2026-07-03 · gotcha · @@unique sobre coluna de idempotência conflita com soft-delete
- **Contexto:** MAJOR-2 do review do PR5 — delete→re-import do mesmo arquivo dava P2002 cru para sempre.
- **Aprendizado:** `@@unique([userId,unitId,sha256])` inclui linhas soft-deletadas (SQLite/Prisma sem partial index); o pre-check do service filtra `deletedAt: null` → o fluxo natural "importei errado → excluí → re-importo" morre na constraint. Fix: o soft-delete reescreve a coluna de idempotência para `deleted:<id>` (colisão-livre; valor original preservado no audit payload). Idempotência é propriedade de linhas ATIVAS.
- **Evidência:** `ReconciliationRepository.softDeleteStatement`; emenda no ADR-INCR7 §3.
- **Como aplicar:** Ao combinar @@unique de idempotência + soft-delete, decidir NA MODELAGEM quem libera a chave (rename-on-delete) — senão o unique "protege" contra o próprio fluxo de correção.
- **Durável?** sim (candidato a memória: unique-de-idempotencia-x-soft-delete).

### 2026-07-03 · pattern · Generators fazem scaffold de camada; núcleo bespoke é preenchido por ADR
- **Contexto:** Roteamento do plano BE-INCR-7 (nota do orquestrador confirmada na execução).
- **Aprendizado:** Nenhum generator produz auto-match/flip/unmatch — as skills deram os contratos de camada (model/repo/policy/DTO/rota) e o implementer preencheu o núcleo lendo ADR §3/§4. O que manteve a qualidade foi o par contrato-de-camada + review independente por PR (2 FAILs reais pegos: coerce.boolean e a dupla data/sha256).
- **Evidência:** PRs #32–#37; relatórios dos reviewers (worktrees isolados, gates re-executados com exit codes).
- **Como aplicar:** Módulo Prisma com lógica de domínio: usar skills para a forma, ADR para o comportamento, reviewer independente para a verdade.
- **Durável?** não (já vive em reviewer-independence-separate-agent + este ledger).

### 2026-07-06 · decision · Proveniência = descritor EXPLÍCITO no DTO, não inferência de sourceId
- **Contexto:** BE-INCR-8 (ADR-INCR8 D5), seam na tx do `postEntry`.
- **Aprendizado:** Popular `SourceDocument` inferindo origem de "todo `sourceId` não-nulo" criaria origem espúria para `reversal` (que TEM `sourceId=originalId` e é interno). A escolha certa é um campo opcional `sourceDocument?` no `PostEntryInput` (`.strict()`): presente ⇒ origem criada na mesma tx; ausente ⇒ nenhuma (manual e reversal não passam descritor). O seam nasce num único ponto por onde toda origem externa já passa, sem allowlist hardcoded de `sourceType`.
- **Evidência:** `PostingService.ts` (bloco `if (input.sourceDocument)` dentro do `runTransaction`); `ReverseEntrySchema` sem campo `sourceDocument` (reversal não pode carregar descritor); testes manual/reversal-sem-origem.
- **Como aplicar:** Camada descritiva populada por quem escreve = descritor explícito no input, não adivinhação a partir de uma chave que outro caminho reusa com semântica diferente.
- **Durável?** sim → [[accounting-incr8-source-document-provenance]].

### 2026-07-06 · pattern · Smoke-migration-gate prova T7 com fingerprint de idempotência antes/depois
- **Contexto:** BE-INCR-8 — migração additiva (2 tabelas novas) sobre `dev.db` real.
- **Aprendizado:** "A migração não toca a idempotência viva" vira prova concreta com um script que, ANTES e DEPOIS do `migrate deploy`, lê todas as tuplas `(userId,unitId,sourceType,sourceId,fiscalYear,entryNumber,status)` de `journal_entries`, ordena e faz sha256. Fingerprint byte-idêntico + contagem inalterada + tabelas novas vazias = prova de zero-toque no ledger. Muito mais forte que "a migração é additiva, confie".
- **Evidência:** `scratchpad/smoke-snapshot.js`; gate rodou BEFORE=AFTER=`2e0a748f…bb70`, 15→15 entries, `source_documents`/`journal_entry_sources` = 0.
- **Como aplicar:** Migração que jura não mexer numa invariante existente = snapshot canônico + hash da invariante antes/depois do deploy sobre dados reais, não só inspeção do SQL.
- **Durável?** sim → reforça [[accounting-incr1-db-risk]].

### 2026-07-06 · gotcha · dev.db real vive no caminho-chamariz `server/prisma/prisma/dev.db`
- **Contexto:** BE-INCR-8, montagem do smoke-migration-gate.
- **Aprendizado:** `server/prisma/dev.db` (o path do datasource `file:./prisma/dev.db`) está com **0 bytes**; o banco POPULADO (667 KB, 15 lançamentos, migrações até data-exchange) é `server/prisma/prisma/dev.db` — o caminho-chamariz que o runtime realmente usou (mesma classe do bug de decoy-path do seed, memória INCR-6). Fazer backup do path "correto" copia um arquivo vazio e o gate valida nada.
- **Evidência:** `ls -la` dos dois paths; o backup do 0-byte tinha `_prisma_migrations` vazio e aplicou TODA a cadeia; o backup do 667 KB tinha só a INCR-8 pendente.
- **Como aplicar:** Antes de qualquer smoke-gate, `find . -name dev.db` e escolher o de MAIOR tamanho / com dados — nunca assumir que o path do datasource é o povoado.
- **Durável?** sim (candidato reforça o decoy-path já anotado em [[accounting-incr6-data-exchange-plan]]).

### 2026-07-09 · decision · Cobertura referencial é CHART-driven, nunca balance-driven (INCR-9)
- **Contexto:** BE-INCR-9 (ADR-INCR9 D3), diagnóstico de prontidão ECD do `ReferentialMapping`.
- **Aprendizado:** O padrão do INCR-4 (`mappingVersion`+`unmappedAccounts`) tenta o reuso óbvio de `groupByAccount` para achar contas não-mapeadas. Errado aqui: ECD (I050/I051) mapeia TODA conta-folha ativa do plano, tenha ou não movimento. Gatear a membership em "só contas com posting" faz conta-folha de saldo zero SUMIR e o gate de prontidão passar FALSO. Membership vem de `accountRepo.findManyByUnit` (o plano), filtrando `acceptsEntries`; `groupByAccount` só pode ENRIQUECER saldo, nunca decidir quem entra. ACC-021 ("só POSTED em relatório") vale p/ relatório de dinheiro (BP/DRE), não p/ completude-de-plano.
- **Evidência:** `ReferentialMappingService.coverage`; teste unit "zero-movement active leaf IS reported unmapped; grouping NOT" (chart-driven pinado).
- **Como aplicar:** Reusar a SHAPE de um diagnóstico ≠ reusar sua fonte de dados. Diagnóstico de completude-de-cadastro é chart-driven; diagnóstico de dinheiro é posting-driven. Nunca deixe o segundo esconder o primeiro.
- **Durável?** sim → candidato a memória (reforça [[bp-dre-diagnostics-test-must-mix-natures]] como classe "reuse da forma ≠ reuse da fonte").

### 2026-07-09 · decision · ReferentialMapping SEM deletedAt — hard-delete + trilha no AuditEvent (INCR-9)
- **Contexto:** BE-INCR-9 (ADR-INCR9 D5), modelagem do mapeamento versionado.
- **Aprendizado:** Um mapeamento é projeção de estado corrente, não documento com ciclo de vida. Dar-lhe `deletedAt` faria a `@@unique([userId,unitId,accountId,mappingVersion])` cobrir tombstones (SQLite sem índice parcial) → remapear-após-desmapear na mesma versão morre em P2002 (o class-bug [[unique-de-idempotencia-x-soft-delete]]). Decisão: sem soft-delete — mudança = update-in-place, desmapear = hard-delete, e a trilha (ACC-020) vive no `AuditEvent` (hash-chain), não na tabela. Elimina a armadilha na raiz e mantém o model mínimo.
- **Evidência:** model `ReferentialMapping` sem `deletedAt`; teste integração "hard-delete then re-set: no tombstone → no P2002".
- **Como aplicar:** Antes de pôr `deletedAt` num model com `@@unique` de negócio, pergunte se a linha é EVIDÊNCIA (precisa sobreviver) ou ESTADO regenerável. Estado regenerável + trilha no audit → hard-delete foge do soft-delete×@@unique.
- **Durável?** sim → candidato a memória.

### 2026-07-09 · gotcha · Worktree isolado não herda node_modules — junction do main + prisma generate local (INCR-9)
- **Contexto:** BE-INCR-9 executado em git worktree separado (`.claude/worktrees/...`); `tsc`/`jest` falharam com "Cannot find module 'dotenv'/'express'/'jest'".
- **Aprendizado:** Um worktree novo não tem `node_modules` (não é compartilhado). Reinstalar é lento; o atalho é uma junction Windows (`New-Item -ItemType Junction`) de `server/node_modules` e `my-app/node_modules` para o main. A migração foi gerada por `prisma migrate diff --from-migrations --to-schema-datamodel --script` (NÃO toca DB nenhum) + `prisma generate` local; o smoke-gate sobre `dev.db` real fica para depois do review (T12).
- **Evidência:** junctions criadas; `tsc` server exit 0 e 441/441 jest verdes só após o link; migração aditiva validada de fato quando o teste de integração rodou `migrate deploy` num db temporário.
- **Como aplicar:** Ao abrir worktree p/ tarefa que roda tsc/jest, primeiro junction do `node_modules` (server + my-app) e `prisma generate` local; gere migração por `migrate diff` p/ não tocar o dev.db real; smoke-gate real só após review.
- **Durável?** sim → candidato a memória (reforça [[verify-write-context-before-writing]]: worktree isolation é a defesa, mas tem custo de setup).

### 2026-07-14 · decision · Fila de prioridade ratificada — resíduos antes de frente nova; AP fecha, FE-INCR-AP é o próximo código
- **Contexto:** Fold pós-INCR-AP do master map; humano entregou fila única priorizada (Bloco A resíduos 1–6, Bloco B frentes novas 7–16) com critério declarado.
- **Aprendizado:** O mapa não pré-elege ordem — a fila agora vive nele (§5.1) com o critério explícito: 1) fechar resíduos de trabalho já pago, 2) proximidade da fundação (ordem do §5), 3) valor visível por unidade de risco. Próximo código = FE-INCR-AP; próxima frente nova natural = aprovação (7) ou AR (8, espelho do AP). Itens 3–6 do Bloco A dependem do humano/dado externo, não de código.
- **Evidência:** `docs/accounting/ACCOUNTING-MASTER-MAP.md §5.1` (este fold); mensagem do humano 2026-07-14.
- **Como aplicar:** Orquestrador roteia pelo topo da fila §5.1; Bloco B só entra via ADR + ratificação (ORCH-006). Correção embutida no fold: `RISK-INCR3-MIGRATION-001` que a fila listava como latente já estava FECHADO (PR #98 fix + PR #99 smoke-gate DEPLOY-CLEARED) — fila recebida do humano também se reconcilia contra o git antes de virar doc.
- **Durável?** sim → a fila é roadmap vivo no mapa; a lição "reconciliar input humano contra git antes do fold" reforça [[accounting-master-map-source-of-truth]].
- **Correção no mesmo dia:** FE-INCR-AP (item 1) fechou minutos depois via PR #106 `bdd78c0` (outra sessão em paralelo) — o Bloco A ficou sem código pendente; próximo código = Bloco B via ADR (aprovação ou AR). Segunda lição da mesma classe: **um fold de roadmap re-fetcha `origin/main` imediatamente antes do commit** — main pode avançar durante o próprio fold (o push inicial deste fold quase abriu PR que deletaria a tela recém-mergeada; pego pelo gate `git diff --stat origin/main..HEAD`).

### 2026-07-14 · pitfall+decision · Duas sessões construíram a MESMA torre de aprovação em paralelo — reconciliada por relax do gate, não por revert
- **Contexto:** Enquanto eu preparava um PRE-ADR fork-a-fork da torre de aprovação (item 7), OUTRA sessão implementou e mergeou a torre inteira em `main` (PR #108, `1f4ff78`, `ADR-INCR-APPROVAL-maker-checker.md`) — com um design que DIVERGIA do que o dono ratificou comigo em 2 dos 4 forks (SoD hard vs off; storage JournalEntry-nullable vs PendingEntry separado).
- **Aprendizado (pitfall):** O gate `git diff --stat origin/main..HEAD` (mesma disciplina do near-miss #106) pegou que meu branch DELETARIA 30 arquivos do #108 se mergeado. `main` avança durante o próprio trabalho de design — re-fetch antes de QUALQUER commit/PR, e trate divergência entre "o que foi ratificado" e "o que já foi mergeado" como decisão do humano, não escolha do agente. **Não carimbei nem revert nem a minha ratificação por cima** — apresentei o conflito e o dono escolheu.
- **Aprendizado (decision):** Reconciliação ratificada = **manter #108 e só afrouxar o gate SoD** (não refazer o storage). O #108 já provou (smoke-gate/CAS integration) o fluxo inteiro reusando `JournalEntry.status` + `entryNumber` nullable — a parte cara (tocar o invariante de numeração) já passou; refazer por `PendingEntry` seria retrabalho sem ganho. O relax mínimo: `IAccountingPolicy.enforcesSegregationOfDuties(scope) = ownerUserId !== actorUserId` (hoje sempre false → SoD off, staging usável single-user; endurece sozinho quando membership fizer owner≠actor). SoD-hard-sempre tornava a torre **inutilizável single-user** (o único operador nunca aprovaria o próprio rascunho).
- **Evidência:** `docs/adr/ADR-INCR-APPROVAL-maker-checker.md §9` (emenda); `AccountingPolicy.enforcesSegregationOfDuties`; `EntryApprovalService.approveEntry` (gate condicional); testes SoD ON/OFF + policy (595/595 accounting jest, tsc limpo).
- **Como aplicar:** (1) governança-de-gente (maker-checker/SoD/aprovação) exige fundação multi-user — sem 2 logins distintos é teatro; a decisão de enforcement mora na POLICY (camada de autorização), keyed em owner≠actor, não hardcoded no service. (2) Quando duas sessões colidem no mesmo nó, a reconciliação mais barata costuma ser **emendar o mergeado**, não competir com um segundo PR que o reverte.
- **Durável?** sim → reforça [[accounting-scope-foundation-no-multicompany]], [[verify-write-context-before-writing]] (re-fetch antes de commit; sessões paralelas racem `main`) e [[reviewer-independence-separate-agent]].

### 2026-07-14 · decision · ADR AR (Contas a Receber) ratificado — espelho do AP, com conta de controle DEDICADA (a única decisão nova)
- **Contexto:** Item 8 da fila §5.1, aberto após a torre de aprovação. AR é o par simétrico do AP (a receber × a pagar). PRE-ADR `ADR-INCR-AR-accounts-receivable.md`, evidência CBM-001.
- **Aprendizado:** O AR é espelho quase mecânico do AP (troca supplier→customer, expense→revenue, PAID→RECEIVED, credit↔debit), então NÃO re-litiguei os 6 forks byte-idênticos que o dono já ratificou no AP — trouxe à decisão só (F0) a arquitetura definidora (postEntry direto, confirmado) e (F7) a ÚNICA decisão genuinamente nova. **F7 = a conta de controle:** o bridge do salão JÁ usa `1.1.2 A Receber` para recebíveis (reconhece D 1.1.2/C receita, liquida D caixa/C 1.1.2). Reusar `1.1.2` misturaria salão + avulsos e o subledger `Receivable` não bateria com o razão. Ratificado (a) **conta nova dedicada `1.1.5 Clientes a Receber`** (subledger-exclusiva, tie-out limpo, espelha o `2.1.2` dedicado do AP). Fronteira nomeada: AR-formal = faturas avulsas, NUNCA vendas do salão (senão receita em dobro — risco de uso, não de código).
- **Evidência:** `ADR-INCR-AR §2` (tabela) + §5 (forks ratificados); `SalonSaleFinalizedMapper.ts:21` / `SalonSaleSettledMapper.ts:27` (salão usa 1.1.2); `ChartOfAccountsFixture.ts` (1.1.5 livre).
- **Como aplicar:** Quando um novo subrazão é espelho de um já ratificado, ratifique só o DELTA (o que difere do espelho) + a decisão arquitetural definidora — não force o humano a re-decidir forks idênticos. Para AR/AP a decisão-delta é sempre a **conta de controle vs contas já usadas por outra origem** (tie-out do subledger). Implementação = copiar o módulo AP (`accounting-incr-ap`), não os mappers do salão.
- **Durável?** sim → reforça [[accounting-incr-ap]] (o padrão 2-tx CAS + reconcile é o golden ref literal do AR) e [[accounting-master-map-source-of-truth]].

### 2026-07-15 · pattern · AR implementado como espelho invertido do AP — mirror-by-hand, não generators
- **Contexto:** Task de implementação do INCR-AR (item 8), após o ADR ratificado. Merged PR #111 `87ab95b`.
- **Aprendizado:** Um subrazão que é espelho de um já-provado se implementa copiando o módulo à mão (Read AP file → Write AR file com as transformações), NÃO pelos generators (que são p/ greenfield). As transformações: Payable→Receivable, supplier→customer, expense→revenue, 2.1.2→1.1.5, ap.*→ar.*, PAID→RECEIVED/PAYING→RECEIVING, paidAt→receivedAt. A parte que NÃO é rename mecânico e exige atenção: a **inversão das pernas** — reconhecimento AP era D expense/C 2.1.2; AR é D 1.1.5/C revenue. Recebimento AP era D 2.1.2/C caixa; AR é D caixa/C 1.1.5. Um débito/crédito trocado é o bug mais provável (o review adversarial focou nisso — item A — e passou).
- **Evidência:** `ReceivableService.ts` buildRecognitionInput/buildReceiptInput; 633/633 jest (+38 AR: 20 unit + 4 CAS real-SQLite + 8 DTO); review independente PASS A–H; smoke-migration-gate DEPLOY-CLEARED sobre cópia do dev.db real (15 lançamentos preservados, md5 idêntico).
- **Como aplicar:** Para o próximo subrazão-espelho, copiar o módulo AP/AR à mão; o checklist de review é: (A) pernas invertidas certas, (B) conta de controle dedicada sem vazamento p/ a conta de outra origem, (C) sourceId=id-do-evento-filho no settlement (nunca o pai), (D) 2-tx CAS+reconcile 1:1, (E) tx propagado + compensação só antes do post. O smoke-migration-gate roda mesmo em migração aditiva (achou 3 migrações pendentes na cópia; todas limpo).
- **Durável?** sim → reforça [[accounting-incr-ap]] (o golden ref literal) como o padrão canônico de subrazão-posta-direto.
