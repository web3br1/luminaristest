# Learnings — Buildout Contábil (INCR-1..4)

Ledger de aprendizados do esforço de fundação contábil. Formato e regras: skill `learning-log`.
Entradas mais novas no topo.

---

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
