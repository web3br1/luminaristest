# FE-INCR-1 Functional Validation Result

## Context
- main hash at validation: `a50ff6d` (post BE-INCR-6A EXPORT merge)
- FE under test: `f809bad` (FE-INCR-1, PR #13) — accounting 7-tab UI
- date: 2026-07-01
- tester: Claude (agent-conducted checklist) — human-eye sign-off still pending
- environment: **frontend production build** (`next build` + `next start`, :3000) per CLAUDE.md withAuth rule; backend `ts-node-dev` (:3001) — see Warning W1
- unitId: `cmr258xgb0003ci84y6cxtjon` (unit "Matriz", provisioned for validation)
- test user: `admin@luminaris.test`

## Result
**FAIL** — 1 Major functional bug (DRE always INVALID) + 1 Major UX bug (systemic date off-by-one). Core double-entry engine, periods, posting, reversal, ledger, trial balance, and balance sheet all behave correctly. Fixes are small and localized.

## Checklist

| # | Section | Status | Evidence |
|---|---------|--------|----------|
| A | 7 tabs load without errors | **PASS** | Title "Luminaris - Contabilidade"; tabs Balancete/Períodos/Lançamentos/Razão/Plano de Contas/BP/DRE all render; no console errors; unit selector shows "Matriz" |
| B | Create/open accounting period (OPEN) | **PASS** | "Semear 2026" seeded 12 FUTURE periods; opening July → status "Aberto" with soft/hard-close actions |
| C | Post entry, entryNumber + fiscalYear visible | **PASS** | Entry posted; Lançamentos shows **Nº 2026/0001** (fiscalYear 2026 + seq 0001), status "Postado" |
| D | Posting to non-open period → ACCOUNTING_PERIOD_NOT_OPEN | **PASS** | Entry dated 2026-08 (FUTURE) → `422 { code: ACCOUNTING_PERIOD_NOT_OPEN, message: "Período contábil 2026/08 não está aberto para lançamentos." }`; entry not created |
| E | Reverse entry with reversalPostingDate | **PASS** | Estornar on 2026/0001 → original → "Estornado", reversal 2026/0002 created (Postado) with opposite legs |
| F | Ledger reflects movements | **PASS** | Razão for 1.1.3 Caixa: +100 (venda), −100 (estorno), running balance 100 → 0, Saldo final R$0,00 |
| G | Trial balance balanced (Σdébito = Σcrédito) | **PASS** | Balancete Total R$ débito = R$ crédito, Saldo R$0,00; "Balanceado" badge |
| H | Balance sheet, asOf, reportStatus=OK | **PASS** | BP as_of: `reportStatus OK`, "Balanceado", ATIVO Caixa R$300, computed "Resultado do Exercício" R$300 line with date range |
| I | Income statement, year_to_date, reportStatus=OK | **FAIL (Major M1)** | DRE renders year_to_date + correct figures (RECEITA BRUTA R$300, Resultado R$300) but **reportStatus = INVALID** — see M1 |
| J | Reports include reportStatus, diagnostics, mappingVersion | **PASS** | Both reports expose reportStatus badge, diagnostics (unmapped list rendered), mappingVersion in payload |
| K | UI handles loading/empty/error states | **PASS** | Empty states ("Nenhum lançamento…", "Selecione a data… Gerar BP"), error banner on failed post, balanced/unbalanced badges all observed |

## Findings

### Blockers
None.

### Majors

**M1 — DRE reports `reportStatus: INVALID` for any normal ledger (backend).**
The income statement flags every balance-sheet account (Asset/Liability/Equity) that has a non-zero balance as an "unmapped account with balance", forcing `reportStatus = INVALID`. Observed: a single revenue posting (Caixa D / Receita C) makes the DRE flag **"1.1.3 — Caixa (R$300,00)"** as unmapped → INVALID. Because every revenue posting debits a cash/receivable account, the DRE is INVALID in essentially all real use.

- **Figures are correct** — RECEITA BRUTA R$300, Resultado R$300. Only the self-assessment (`reportStatus`) and the `unmappedAccounts` diagnostic are wrong.
- **Root cause** (`server/src/features/accounting/services/AccountingReportService.ts:261`): `buildDiagnostics` has a BP-only reciprocal guard —
  ```ts
  if (statement === 'BP' && findMappingRule(row.nature, row.code, 'DRE')) continue;
  ```
  `incomeStatement` (line 489) passes **all** account balances (`getAccountBalances` returns every account, line 473) to `buildDiagnostics(dreRows, 'DRE', …)`, but there is **no symmetric guard** to skip Asset/Liability/Equity accounts that legitimately belong to the BP.
- **One-line fix** (add after line 261):
  ```ts
  if (statement === 'DRE' && findMappingRule(row.nature, row.code, 'BP')) continue;
  ```
- **Why tests are green (632/632):** coverage gap — every `incomeStatement` test in `AccountingReportService.bp-dre.test.ts` feeds only Revenue/Expense accounts; none includes an asset balance alongside revenue (the normal case). Fix must add a regression test: asset + revenue → `reportStatus OK`, `unmappedAccounts` empty.

**M2 — Systemic date display off-by-one (frontend, timezone).**
Every displayed date is shifted one day earlier. Entry dated 2026-07-**01** displays **30/06/2026**; BP asOf set 31/07 displays 30/07; DRE range displays "31/12/2025 a 30/07/2026" (backend fromDate is 2026-01-01). Confirmed display-only: the July-1 entry posted successfully while **only July was OPEN** (June is FUTURE) — backend stored the correct date; the frontend renders the stored UTC-midnight ISO in local time (UTC-3). In an accounting module, misread dates erode trust and risk wrong-period reasoning. Fix: format dates as date-only (parse/format in UTC or slice the ISO `YYYY-MM-DD`) in the accounting components.

### Minors

- **m1** — Post-error modal shows generic "Erro ao postar o lançamento. Tente novamente." instead of the backend's specific localized reason (the `ACCOUNTING_PERIOD_NOT_OPEN` message is available in the 422 body). "Tente novamente" is actively misleading — retrying won't help. Surface `error.code`/`message`.
- **m2** — Reversal entry description shows the raw internal id ("Estorno de cmr25dihg0014ci2kej4aq3a8") instead of the friendly entry number ("Estorno de 2026/0001").
- **m3** — `GET /api/auth/me → 404` polled repeatedly on the accounting page. Auth works (token cookie), but the endpoint doesn't exist → console/network noise.

### Warnings (environment, not FE-INCR-1 scope)

- **W1** — Backend `npm run start` (compiled `node dist/server.js`) fails: `Cannot find module '@/controllers/authUtilityController'`. The compiled output keeps `@/` path aliases and there is no `tsc-alias` rewrite step; only `ts-node-dev -r tsconfig-paths/register` (the `dev` script) resolves them. Real deploy-config gap for any future non-dev backend run. Validation used the `dev` backend (same API surface); the withAuth prod-build requirement targets the frontend, which **was** the production build.
- **W2** — `GET /api/health` returns 404 (route not found); older status docs claim `health: ok`. Cosmetic/stale.

## Final Decision
**FAIL** — do not close FE-INCR-1 as validated until M1 and M2 are fixed and re-validated.

Recommended next actions (in order):
1. **M1** — apply the one-line DRE diagnostics guard + regression test (asset+revenue → OK). Backend, ~15 min.
2. **M2** — date-only formatting in accounting components + a small check. Frontend.
3. Re-run this checklist (sections H/I especially) after fixes; independent reviewer per governance.
4. m1–m3 and W1 are non-blocking; W1 should be addressed before any real backend deploy.

Everything else — the double-entry core, period state machine + posting gate, sequential numbering, reversal, ledger, trial balance, and balance sheet — validated cleanly against the production frontend build.
