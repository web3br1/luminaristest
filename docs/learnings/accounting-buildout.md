# Learnings — Buildout Contábil (INCR-1..4)

Ledger de aprendizados do esforço de fundação contábil. Formato e regras: skill `learning-log`.
Entradas mais novas no topo.

---

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
