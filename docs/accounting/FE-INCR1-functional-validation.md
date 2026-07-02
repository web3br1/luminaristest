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

---

## Update 2026-07-02 — M1/M2 remediados

- **Fix commit:** `3ae67c2` on `fix/accounting-dre-diagnostics-and-date-rendering` (FIX-FE-INCR1-M1M2, plan: `docs/accounting/FIX-FE-INCR1-M1M2-execution-brief.md`)
- **Environment:** isolated `git worktree` (`.claude/worktrees/fix-fe-incr1-m1m2`) — a concurrent session was found to have raced the shared working directory mid-task (checked out a different branch and committed under this session; recovered before any commit, see PR notes). Backend: `npm run dev` (ts-node-dev, same W1 caveat as the original run — compiled `start` still fails, unrelated to this fix). Frontend: `next build` + `next start` (production build, per CLAUDE.md withAuth rule), fresh `next build` after the M2 fix.
- **Database:** fresh worktree-local SQLite (`server/prisma/dev.worktree.db`), migrated clean (`prisma migrate status` → up to date, 0 drift) and seeded independently of the shared `dev.db` — avoids the dev.db collision documented for 2026-07-01.

### Re-run — sections H and I

Scenario: unit `verify-unit-1`, July/2026 period opened, one entry posted 2026-07-01 (Caixa D / Receita de Vendas C, R$300,00), via the live `POST /api/accounting/post` API against the real seeded chart of accounts (not a mock).

| # | Section | Status | Evidence |
|---|---------|--------|----------|
| H | Balance sheet, asOf, reportStatus=OK | **PASS** | Live `GET /balance-sheet?unitId=verify-unit-1&asOf=2026-07-01` → `reportStatus: "OK"`, `balanced: true`, `diagnostics.unmappedAccounts: []`, Ativo Caixa 30000 cents |
| I | Income statement, year_to_date, reportStatus=OK | **PASS** (was FAIL/M1) | Live `GET /income-statement?unitId=verify-unit-1&asOf=2026-07-01` → `reportStatus: "OK"` (previously `INVALID`), `diagnostics.unmappedAccounts: []`, `grossRevenue.totalCents: "30000"`, `netResult.amountCents: "30000"` |

Regression coverage (unit level, `server/src/features/accounting/services/__tests__/AccountingReportService.bp-dre.test.ts`): T1 (asset+revenue → DRE OK) confirmed **red before the fix** (reverted the guard, T1 failed with `reportStatus: "INVALID"`) and **green after**; T2 (account unmapped in both BP and DRE → still INVALID, guard doesn't over-silence a genuine orphan); T3 (same mixed scenario → balanceSheet stays OK, BP guard untouched). Full suite: 655/655 (652 baseline + T1–T3).

### Spot-check — date rendering (M2)

The Chrome browser extension was unavailable for the entire session (`tabs_context_mcp` returned "not connected" on every retry), so the 4 screens could not be screenshotted directly. In its place: the real ISO date strings returned by the live API above (`entry.date: "2026-07-01T00:00:00.000Z"`, `fromDate: "2026-01-01"`, `toDate: "2026-07-01"`) were run through the actual shipped module (`my-app/features/accounting/lib/formatDate.ts`, imported via `tsx` from the production-built tree, system timezone confirmed `America/Sao_Paulo`):

- Old buggy `new Date(iso).toLocaleDateString('pt-BR')` on the same strings → `30/06/2026` and `31/12/2025 a 30/06/2026` (reproduces the exact FAIL symptom).
- New `formatDate` (local wrapper) on the same strings → `01/07/2026` and `01/01/2026 a 01/07/2026` (correct, numeric dd/mm/aaaa format preserved — the canonical `dashboard/shared` `formatDate(..., {dateOnly:true})` was evaluated for direct reuse but rejected: it renders long-form dates ("01 de jul. de 2026"), which would have silently changed the visual format across all 4 screens).

This confirms the fix at the exact code path the browser would execute, but is **not** a substitute for an actual rendered screenshot. **Caveat:** live-browser visual confirmation across the 4 screens (BalanceSheetPanel, IncomeStatementPanel, JournalEntriesPanel, LedgerPanel) is still pending — recommended before human sign-off, whenever the Chrome extension is available.

### Final Decision (update)
**PASS** — M1 and M2 both fixed and re-validated against a live seeded ledger (not mocks). Two caveats carried forward, both pre-existing from the original run: (1) human eye sign-off still pending (as before); (2) browser-rendered visual confirmation of the 4 date-bearing screens pending — this session verified the exact rendering code path and real data end-to-end, but could not capture a screenshot (Chrome extension unavailable).

---

## Update 2026-07-02 (post-merge) — full A–K re-run after PR #25 merge

- **Trigger:** Diretoria directive to re-run the full A–K functional checklist after FIX-FE-INCR1-M1M2 landed.
- **Code under test:** merged `main` — PR #25 merge commit `e7b727d` (feature `7c7ccf1`); validated from the `fix/accounting-dre-diagnostics-and-date-rendering` worktree, which is byte-identical to the merged feature tree.
- **Environment:** backend `npm run dev` (ts-node-dev; same W1 caveat as prior runs — compiled `start` still unrelated-broken), **freshly restarted** (see the stale-runtime note below); isolated `dev.worktree.db` (not the shared `dev.db`); frontend production build (`next build` + `next start`).
- **Fixture:** a `units` DynamicTable installed from preset + one unit row "Matriz" (`unitId = cmr3pxsbp0003ci1gva9xqa3q`); chart of accounts self-seeded on first read; a mixed asset+revenue ledger built through the real HTTP endpoints (so the M1 guard is genuinely exercised: a Caixa/Asset balance sits in the DRE-diagnostics input).

### A–K checklist (API / behaviour layer, via the real endpoints the UI calls)

| # | Section | Status | Evidence |
|---|---------|--------|----------|
| A | 7 tabs load without errors | **N/A (env)** | Not verifiable — the controllable Chrome could not reach the local dev server (see limitation below). |
| B | Create/open period (OPEN) | **PASS** | `POST /{unit}/periods/seed-year` → 12 periods; `POST /periods/{jul}/open` → `status: OPEN` |
| C | Post entry, entryNumber + fiscalYear | **PASS** | `POST /post` (Caixa D / Receita C, 2026-07-01) → `2026/0001`, `status: Posted`, stored `date: 2026-07-01T00:00:00.000Z` |
| D | Post to non-open period → error | **PASS** | `POST /post` dated 2026-08-15 → `HTTP 422 { code: ACCOUNTING_PERIOD_NOT_OPEN, "Período contábil 2026/08 não está aberto…" }` |
| E | Reverse entry | **PASS** | `POST /reverse` → `2026/0001` → `Reversed`, reversal `2026/0002` `Posted` |
| F | Ledger reflects movements | **PASS** | `GET /ledger` Caixa 1.1.3: +30000 / −30000 (reversal) / +50000 → closing 50000; all rows dated 2026-07-01 |
| G | Trial balance balanced | **PASS** | `GET /trial-balance` → `balanced: true`, débito = crédito = 110000 |
| H | Balance sheet, asOf, reportStatus=OK | **PASS** | `GET /balance-sheet?asOf=2026-07-01` → `reportStatus: OK`, `balanced: true`, `assets: 50000`, `unmappedAccounts: []` |
| **I** | Income statement, reportStatus=OK | **PASS** (was FAIL/M1) | `GET /income-statement?asOf=2026-07-01` → `reportStatus: OK`, `unmappedAccounts: []`, `grossRevenue: 50000`, `netResult: 50000` — the Caixa/Asset balance is NO LONGER flagged unmapped |
| J | Reports expose reportStatus/diagnostics/mappingVersion | **PASS** | Both reports carry `reportStatus`, the full `diagnostics` shape, and `mappingVersion: statement-mapping.v1` |
| K | UI loading/empty/error states | **N/A (env)** | Not verifiable — browser unreachable (see below). |

### ⚠️ Stale-runtime incident (near false-negative — recorded for honesty)
The **first** `GET /income-statement` call in this run returned the M1 bug symptom exactly — `reportStatus: INVALID`, Caixa (Asset, balance 50000) in `unmappedAccounts`. Investigation showed the on-disk fix was present and clean (`AccountingReportService.ts:264`, the DRE→BP guard; no dirty diff). The cause was a **stale long-running `ts-node-dev` process** that had respawned/crashed into a pre-fix transpile. Killing it and starting a **fresh** backend flipped the identical request to `reportStatus: OK, unmapped: 0`. The authoritative proof of M1 remains the unit tests (red-before/green-after) plus this fresh-backend re-run — never a dev server that has been running across edits. (Captured as a durable lesson.)

### Environment limitation — browser-visual items (A, K, and M2 pixel paint)
The controllable Chrome (claude-in-chrome) **could not reach the local dev servers**: it screenshots external sites fine (example.com), but navigations to `http://localhost:3000`, `http://127.0.0.1:3000`, and the LAN IP either render Chrome's error page or silently leave the tab on the previous page — i.e. the controllable browser is not co-located with / cannot route to this machine's dev server. Consequently **A** (visual tab render), **K** (UI loading/empty/error states), and a pixel-level confirmation that the M2 date fix paints `01/07/2026` in each of the 4 screens **could not be captured**. M2 remains verified only at the shipped-module + stored-data level (stored ISO `2026-07-01`; `my-app/features/accounting/lib/formatDate.ts` renders it `01/07/2026` under `America/Sao_Paulo`).

### Final Decision (post-merge A–K)
**PASS (data/behaviour) — with warnings.** Every API-observable A–K item passes on a freshly-restarted backend running the merged code, against a real mixed asset+revenue ledger; the item that was FAIL (**I / M1**) is now OK. **Outstanding (unchanged in kind from prior runs):** (1) human-eye sign-off; (2) live-browser visual confirmation of A, K, and the M2 date paint across the 4 screens — blocked here by the controllable Chrome being unable to reach localhost, not by any code defect. Recommend a browser pass from an environment whose Chrome can reach the local dev server (or a deployed instance) before final human sign-off.
