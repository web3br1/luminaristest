# BRIEF — Apuração/encerramento do resultado (I350/I355) · BE-INCR-SPED-APURACAO

> Handoff resumível. **ADR normativo:** `docs/adr/ADR-INCR-SPED-APURACAO-encerramento.md` (leia inteiro — D1..D8, gates §4).
> Este brief só carrega a **ordem de implementação** e os **gates de envio** — não re-decide nada.

## 0. Estado (VERIFICADO)
- BE-INCR-SPED-ECD mergeado (`main`, PR #62, merge `9deb928`). Worktree sincronizado; `npm ci` + `prisma generate` feitos; `tsc` server = exit 0.
- Parecer `luminaris-accounting-architect` fechado; 2 decisões de superfície ratificadas por humano: **D3** (DRE closing-aware no report compartilhado) e **D5** (reversão libera a chave).
- **Zero migração** (D2). Mudança de **dado seed** (conta de PL) → provar seed-backfill aditivo.

## 1. Ordem de implementação (`tsc` verde é gate entre passos)
1. **Fixture** `ChartOfAccountsFixture.ts`: `2.3` PL (Equity, sintética) + `2.3.1` Lucros ou Prejuízos Acumulados (Equity, analítica). Constante `RETAINED_EARNINGS_CODE='2.3.1'`.
2. **Read closing-exclusion** no `IPostingRepository.groupByAccount` (opção `excludeSourceTypes?`) + impl no repo real e no in-memory/fake de teste. Usar **só** em `incomeStatement` (D3). `balanceSheet` **não muda**.
3. **`AccountingReportService.incomeStatement`**: excluir `sourceType='closing'` da janela DRE. Atualizar o comentário stale de `balanceSheet` (D3). Regressão: ano sem encerramento inalterado.
4. **`ExerciseClosingService`** (`features/accounting/services/`): `closeExercise(scope, year)` compõe 1 `PostEntryInput` multi-leg (cada conta de resultado com saldo pré-encerramento zerada; líquido em `2.3.1`; `sourceType='closing'`, `sourceId=String(year)`, date=`${year}-12-31`, description), chama `postEntry`. Deriva saldos pré-encerramento de `groupByAccount(result accounts, exclui closing, janela anual [1Jan..31Dez])` — a janela anual (não all-history) é o que mantém o **2º encerramento** correto. Reabertura = estornar pela rota genérica `/reverse` (o `reverseEntry` é closing-aware: herda `sourceType='closing'` + renomeia o `sourceId` do estornado → libera a chave, D5). **Sem `reopenExercise`.**
5. **DTO** `CloseExerciseRequestDto` (`.strict()`, `unitId`+`year`), **Controller**, **Rota** 3-toques (`POST /closing/exercise`), **Factory** `getExerciseClosingService()`. Policy `canPost`. Reabertura reusa `POST /reverse` (nenhuma rota nova).
6. **`lib/sped.ts`**: `buildI350(dtRes)`, `buildI355({codCta,codCcus?,vlCents,indDc})`; `buildI200` deriva `IND_LCTO` (novo campo no input `EcdEntry`/`RegI200Input` = `sourceType`/flag). Assembler emite I350+I355 depois do diário (posição por manual — I350 nível 3 no bloco I, antes do I990). Testes unitários por builder.
7. **`SpedGenerationService`**: emitir I350 (`DT_RES=31/12`) + I355 (saldos pré-encerramento das contas de resultado, closing-excluded); marcar o encerramento no I200 (`IND_LCTO='E'`); J150 via DRE closing-aware; J100 reconcilia sozinho. Coverage-gate D5 já cobre `2.3.1`.
8. **Testes de domínio** (ADR §4, os 14) + **`docs:generate`** (rotas novas no openapi.json).
9. **Closeout**: `ACCOUNTING-MASTER-MAP.md` §5 (ECD ⏳→✅ merge #62; nó apuração novo); `learning-log`; memórias `accounting-*`.

## 2. Gates de envio (OPS-001) — preencher no handoff ao reviewer
1. **Objetivo:** ECD PVA-value-clean para exercício encerrado — J100 A=P com detalhe, I350/I355 presentes, regras de valor do bloco J satisfeitas.
2. **Grau de cada claim:** "A=P pós-encerramento", "I155(dez)=0", "DRE mostra operacional" — **verificado** por teste; "PVA aceita" — **residual humano** (PGE desktop).
3. **Caso adversarial tentado:** estorna encerramento → re-encerra (classe idempotência); dezembro HARD_CLOSED antes de encerrar; ano sem encerramento (regressão DRE); conta `2.3.1` sem mapeamento (coverage-gate).
4. **Checagem que teria falhado se errado:** teste bidirecional A=P; cross-path reversão→re-encerra→lançamento novo; I155×I250 (E2) com o encerramento presente; determinismo sha256.
5. **Risco principal remanescente:** (a) semântica divergente `incomeStatement.netResult`×`balanceSheet.netResultLine` pós-encerramento (documentada, correta); (b) fidelidade campo-a-campo I350/I355 vs PGE — só o PVA fecha.

## 3. Review independente (T12)
`luminaris-reviewer` em **worktree SEPARADO**, re-checando o commit do zero. Residual honesto: "PVA aceita" é sign-off humano (RFB desktop) — declarar, não bloquear merge.
