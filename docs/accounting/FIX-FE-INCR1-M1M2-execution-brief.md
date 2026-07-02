# FIX-FE-INCR1-M1M2 — Remediação M1 (DRE INVALID) + M2 (datas off-by-one) — Execution Brief

**Incremento:** FIX-FE-INCR1-M1M2 — bugfix, sem feature nova
**Status:** PLANEJADO (este brief) — nenhuma linha de código escrita
**Data do brief:** 2026-07-02
**Predecessor:** FE-INCR-1 (`f809bad`, PR #13) — validação funcional **FAIL** por M1+M2 (`docs/accounting/FE-INCR1-functional-validation.md`)
**Branch:** `fix/accounting-dre-diagnostics-and-date-rendering` (a criar a partir de `main` @ `16d1efa`)
**PR alvo:** 1 PR único cobrindo M1+M2 (mesma causa-raiz de validação; escopos pequenos e acoplados pela re-validação H/I)

---

## 1. Contexto e evidência (auditoria 2026-07-02)

| Fato | Evidência |
|---|---|
| M1 aberto | `server/src/features/accounting/services/AccountingReportService.ts:261` tem só o guard `statement === 'BP'`; não existe o simétrico para DRE. Nenhum commit em nenhuma branch toca o fix. |
| M2 aberto | `formatDate` local com `new Date(iso).toLocaleDateString('pt-BR')` (parse UTC → shift −1 dia em UTC-3) replicado em 4 componentes: `BalanceSheetPanel.tsx:11`, `IncomeStatementPanel.tsx:11`, `JournalEntriesPanel.tsx:13`, `LedgerPanel.tsx:6` |
| Canônico existe para M2 | `my-app/features/dashboard/shared/utils/formatters.ts:94` — `formatDate(value, locale, { dateOnly: true })` já resolve a classe (slice `YYYY-MM-DD` + parse local `T00:00:00`), vivo e em uso pelo dashboard (`formatCellValue` case `'date'`) |
| Gap de cobertura que deixou M1 passar | Todos os testes de `incomeStatement` em `AccountingReportService.bp-dre.test.ts` alimentam só contas Revenue/Expense; nenhum mistura ativo+receita (o caso normal) |
| Base verde | tsc limpo (ambos), jest **652/652**, `next build` limpo, `prisma migrate status` sem drift, OpenAPI sem drift, `main` == `origin/main`, 0 PRs abertos |

## 2. Escopo

### Entra
- **M1 (backend):** guard simétrico em `buildDiagnostics` para não classificar contas de BP com saldo como "unmapped" na DRE; + testes de regressão.
- **M2 (frontend):** substituir as 4 implementações locais de `formatDate` pelo canônico date-only; varredura de classe em toda a feature accounting.
- **Re-validação:** seções H (BP) e I (DRE) do checklist FE-INCR-1 + spot-check de datas em Lançamentos/Razão/BP/DRE, contra **build de produção** (regra withAuth do CLAUDE.md); atualização do relatório de validação.

### NÃO entra (explícito)
- m1 (mensagem de erro genérica no modal), m2 (descrição de estorno com id cru), m3 (`/api/auth/me` 404) — minors documentados, ficam para follow-up.
- W1 (backend compilado sem `tsc-alias`) — gap de deploy-config, PR separado.
- J2 badge amber (FE-INCR-6) — minor cosmético, follow-up próprio.
- Bloco F/G/H/J do FE-INCR-6 — só depois deste fix (G renderiza datas; rodar antes seria validar sobre código bugado).
- Nenhuma migration, nenhuma rota nova, nenhum DTO novo, nenhuma mudança de OpenAPI.
- Nada de ECD, conciliação, ou módulo novo.

---

## 3. Fases e atribuição por skill

### Fase 0 — Orquestração e gates de domínio

| Skill | Tarefa | Output |
|---|---|---|
| **`luminaris-orchestrator`** | Consumir este brief como plano-fonte; sequenciar Fases 1→4; delegar ao implementer com o plano estruturado. Não implementa. | Plano estruturado de delegação |
| **`luminaris-accounting-architect`** | Enriquecer o plano com os invariantes de domínio do M1 antes da implementação: (a) o guard NÃO pode silenciar conta genuinamente órfã — conta sem mapping em **nenhum** dos dois statements continua `INVALID`; (b) mudança é read-only de relatório, zero escrita em ledger; (c) `mappingVersion` não muda (não é mudança de mapping, é mudança de *diagnóstico*); (d) confirmar que o BP não regride (guard BP→DRE existente intocado). | Lista de gates de domínio anexada ao plano |
| **`codebase-memory`** (cbm) | Blast radius pré-implementação: `trace_path` em `buildDiagnostics` (quem consome `reportStatus`/`diagnostics`? — FE panels, export 6A?); `detect_changes` ao final do diff. **Regra CBM-001:** o grafo localiza; a confirmação é sempre por leitura do código. | Mapa de consumidores de `reportStatus` |

### Fase 1 — M1 backend

| Skill | Tarefa | Detalhe |
|---|---|---|
| **`luminaris-implementer`** | Edição pontual (não é scaffolding — nenhum generator de camada se aplica; a cadeia Route→Controller→Service→Repo já existe e não muda): adicionar em `AccountingReportService.buildDiagnostics`, logo após a linha 261: | `if (statement === 'DRE' && findMappingRule(row.nature, row.code, 'BP')) continue;` — com comentário espelhando o do guard BP existente (linhas 259-260): contas Asset/Liability/Equity são contas de BP representadas via posição patrimonial; não são "unmapped", só vivem no outro statement. |
| **`backend-test-suite-generator`** | Testes de regressão em `AccountingReportService.bp-dre.test.ts` (suíte existente, adicionar casos): | **T1 (o caso do bug):** lançamento Caixa(D)/Receita(C) → `incomeStatement` retorna `reportStatus: 'OK'`, `unmappedAccounts: []`, figuras corretas. **T2 (anti-over-silence):** conta com `nature` sem mapping em BP **nem** DRE, com saldo → DRE continua `INVALID` e a conta aparece em `unmappedAccounts` (prova que o guard não engole órfã real). **T3 (simetria preservada):** mesmo cenário do T1 → `balanceSheet` continua `OK` (guard BP intocado). |

**Gates da Fase 1:** `cd server && npx tsc --noEmit` (exit 0) · `npx jest --testPathPatterns=accounting` verde incluindo T1–T3 · suíte completa `npm test -- --runInBand` verde.
**Critério de PASS:** T1 falha ANTES do fix (vermelho comprovado) e passa DEPOIS — o teste tem de ser escrito primeiro ou verificado contra o código pré-fix, senão não prova nada.

### Fase 2 — M2 frontend

| Skill | Tarefa | Detalhe |
|---|---|---|
| **`codebase-memory`** (cbm) + critério de reuso | **Etapa 1 (detector):** canônico já localizado — `formatDate(..., { dateOnly: true })` em `features/dashboard/shared/utils/formatters.ts:94`. **Etapa 2 (decider):** o outro lado está vivo (usado por `formatCellValue`). Shape idêntico ao necessário. → **Decisão default: REUSE.** Única ressalva: verificar se o lint-gate de confinamento de camadas (spec em `docs/architecture/lint-layer-gate.md`) permite import cross-feature `features/accounting` → `features/dashboard/shared`. Se PERMITIR → import direto. Se PROIBIR → criar `my-app/features/accounting/lib/formatDate.ts` como **thin re-export/wrapper de 3 linhas** do canônico (posse local, zero lógica duplicada), ao lado de `formatCents.ts` (golden ref de posicionamento). | Decisão registrada no PR (reuse sancionado pelo critério; divergência só se o lint mandar) |
| **`luminaris-implementer`** | Varredura de **classe** (disciplina `idempotency-class-fix-discipline`: bug de classe = sweep de todos os sites, não patch de um caminho): grep confirmou 6 arquivos com `formatDate`/`toLocaleDateString` na feature accounting. Substituir os 4 bugados (`BalanceSheetPanel`, `IncomeStatementPanel`, `JournalEntriesPanel`, `LedgerPanel`) pelo canônico. Verificar os 2 restantes e **declarar** no PR: `formatCents.ts` (não é data — só homônimo de arquivo) e `JournalEntryModal.tsx:28` (`new Date().toISOString().slice(0,10)` = default de input date, hoje-local vs hoje-UTC; corrigir junto se for o mesmo shift, declarar se não for). Deletar as 4 funções `formatDate` locais — **deleção sobre adição**. | Diff mínimo: 1 import + N substituições por painel; zero helper novo se o reuse direto passar no lint |
| **`frontend-design-system`** | Consulta passiva apenas: garantir que a exibição `dd/mm/aaaa` não muda de formato visual (o canônico com `dateOnly` produz o mesmo `toLocaleDateString('pt-BR')` sobre data local — sem regressão visual). Nenhum componente novo é gerado; **`frontend-component-generator` NÃO se aplica** (nenhum componente novo). | — |

**Gates da Fase 2:** `cd my-app && npx tsc --noEmit` (exit 0) · `npx next build` limpo · zero `zinc-*` no diff (regra de CLAUDE.md, deve ser trivialmente vazio) · lint-gate de camadas verde.
**Critério de PASS:** entry com data `2026-07-01` renderiza `01/07/2026` (não `30/06/2026`) em todas as 4 telas; DRE range renderiza `01/01/2026 a 31/07/2026` (não `31/12/2025 a 30/07/2026`).

### Fase 3 — Re-validação funcional (build de produção)

| Skill | Tarefa | Detalhe |
|---|---|---|
| **`verify`** (+ preview tools) | Re-executar contra `next build` + `next start` (regra withAuth de CLAUDE.md — nunca `next dev`): seções **H** (BP asOf, `reportStatus OK`) e **I** (DRE year_to_date, **`reportStatus OK`** — o critério que falhou) do checklist FE-INCR-1; + spot-check de data em Lançamentos (C), Razão (F), BP (H), DRE (I). Cenário mínimo: 1 lançamento Caixa/Receita num período aberto → DRE deve exibir badge OK com diagnostics vazio. | Evidência por screenshot/snapshot + valores exatos |
| **`luminaris-implementer`** (docs) | Atualizar `docs/accounting/FE-INCR1-functional-validation.md`: **append** de seção "Update 2026-07-XX — M1/M2 remediados" com o re-run de H/I e Final Decision → **PASS** (não reescrever o histórico FAIL — o registro do FAIL é trilha de auditoria). Registrar hash do commit do fix. | Doc atualizado no mesmo PR |

**Gate da Fase 3:** H e I = PASS no checklist re-executado; datas corretas em 4 telas.
**Critério de PASS:** `FE-INCR1-functional-validation.md` com Final Decision PASS + evidência; ressalva explícita de que sign-off humano continua pendente (como nos passes anteriores).

### Fase 4 — Review independente e governança

| Skill | Tarefa | Detalhe |
|---|---|---|
| **`luminaris-reviewer`** | **Agente separado, worktree isolado** (regra `reviewer-independence-separate-agent`: PASS da mesma sequência que implementou é rejeitado). Re-checar o commit do zero: gates G0–G9, os 3 testes de regressão (T2 anti-over-silence em especial), a varredura de classe do M2 (nenhum site de data esquecido), confinamento de import do canônico, e que o diff não toca rota/DTO/migration/OpenAPI. | VERDICT PASS/FAIL |
| **`skill-audit`** | `governance-check` + `wiring`: esperado trivialmente verde (nenhum membro novo de registry central, nenhuma rota/KPI/preset novo, nenhum i18n novo). Rodar mesmo assim como gate — é barato e fecha o REV-005. | Gate fechado |
| **`learning-log`** | Capturar as duas lições de classe: (1) **testes de relatório que nunca misturam naturezas de statement são um gap estrutural** — todo teste de DRE/BP novo deve incluir pelo menos uma conta do "outro lado" com saldo; (2) **formatação de data-only sobre ISO UTC é bug de classe no frontend** — o canônico é `formatDate(..., {dateOnly:true})` de `dashboard/shared/utils/formatters.ts`; qualquer `new Date(iso).toLocaleDateString` novo sobre campo date-only é o mesmo bug renascendo. Avaliar patch nas skills geradoras (`backend-test-suite-generator`: regra "mistura de naturezas em teste de relatório"; `frontend-*-generator`: apontar o canônico de data). | Entrada no log + proposta de patch de skill (não aplica — skill-audit decide) |

**Gates finais (todos, antes do merge):**
`tsc` server + my-app (exit 0) · jest completo `--runInBand` verde (652+3 novos) · `next build` limpo · `prisma migrate status` sem drift (nenhuma migration esperada) · `npm run docs:generate` sem diff real (nenhuma rota mudou) · reviewer independente PASS · re-validação H/I PASS.

---

## 4. Matriz-resumo skill → responsabilidade

| Skill | Fase | Faz | NÃO faz |
|---|---|---|---|
| `luminaris-orchestrator` | 0 | Sequencia e delega | Não implementa, não aprova |
| `luminaris-accounting-architect` | 0 | Gates de invariante contábil (T2!) | Não roteia skills |
| `codebase-memory` | 0, 2 | Localiza consumidores de `reportStatus`; blast radius | Não é fonte de verdade — confirmar lendo código (CBM-001) |
| `luminaris-implementer` | 1, 2, 3 | Edições M1/M2 + update de docs | Não se auto-revisa |
| `backend-test-suite-generator` | 1 | T1/T2/T3 na suíte bp-dre existente | Não cria suíte nova |
| `frontend-design-system` | 2 | Verificação passiva de formato visual | Não gera componente |
| `verify` | 3 | Re-validação H/I em build de produção | Não valida em `next dev` |
| `luminaris-reviewer` | 4 | Review do zero em worktree isolado | Nunca o mesmo agente que implementou |
| `skill-audit` | 4 | governance-check + wiring | Não aplica patches de skill |
| `learning-log` | 4 | 2 lições de classe + proposta de patch de skill | Não edita skills diretamente |

**Skills deliberadamente NÃO invocadas** (e por quê): `backend-service/route/controller/dto/policy/repository-generator` (nenhuma camada nova — é edição de 1 linha em service existente); `frontend-component/page/modal/hook-generator` (nenhum artefato novo de frontend); `backend-prisma-model-generator` (zero migration); `dynamic-table-preset-generator` (contabilidade é Prisma first-class — fronteira dura §2.1).

## 5. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Guard do M1 silenciar conta genuinamente órfã | T2 obrigatório (conta sem mapping em nenhum statement → INVALID) — gate do accounting-architect |
| Export 6A consumir `reportStatus` e mudar comportamento | cbm `trace_path` na Fase 0 + confirmação por leitura; export de DRE passa a sair OK — é o comportamento **correto**, registrar no PR |
| Reuse cross-feature barrar no lint-gate | Fallback já decidido: thin wrapper em `features/accounting/lib/formatDate.ts` (3 linhas, re-export) |
| `JournalEntryModal` default-date ter semântica diferente (hoje-local vs date do backend) | Site declarado na varredura; corrigir só se for o mesmo shift, senão documentar como não-pertencente à classe |
| Re-validação em dev server por engano | Fase 3 trava em `next build`+`next start` (regra CLAUDE.md); reviewer checa a evidência de ambiente |
| dev.db compartilhado com outra sessão (aconteceu 2× em 2026-07-01) | Antes de qualquer reset/seed para a Fase 3, verificar se há outra sessão ativa (regra do próprio relatório FE-INCR-6) |

## 6. Pós-merge

1. Atualizar memória `fe-incr1-merged` (FAIL → PASS, com hash).
2. Somente então destravar: Bloco F/G/H/J do FE-INCR-6 (G agora valida datas corretas), e na sequência os follow-ups minors (m1/m2/m3, J2 amber, W1 tsc-alias) como PRs pequenos independentes.
3. Higiene opcional (fora deste PR, com aprovação humana): branches locais já mergeadas (`git branch -d`), worktrees `agent-*` órfãs (`git worktree prune`), inspeção do `stash@{3}` (1.437 inserções, pré-INCR-5/6, provavelmente superado).
