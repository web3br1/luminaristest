# FE-INCR-6 Import/Export — Functional Validation Result (Bloco A/B/C/D/I)

## Context
- branch under test: `feat/accounting-fe-import-export`
- HEAD at validation start: `27b5576` (docs plan) — **merged `465f9a4`/#20 mid-run** (see Findings); final HEAD `e8483e3`
- FE under test: `c512c0f` (FE Import/Export tab, PR #21)
- date: 2026-07-01
- tester: Claude (agent-conducted, browser-driven via preview MCP) — human-eye sign-off still pending
- environment: **frontend production build** (`next build` + `next start`, :3000) per CLAUDE.md withAuth rule; backend `ts-node-dev` (:3001)
- unitId: `cmr258xgb0003ci84y6cxtjon` (unit "Matriz")
- test user: `admin@luminaris.test`
- fixtures: `docs/accounting/fixtures/incr6-validation/` (README maps each file to its roteiro case)
- scope: **Bloco A (happy path), Bloco B (idempotency), Bloco C (rejection)** only. Bloco D (period gate), F (chart create-or-skip), G (export), H (tenancy), I (reconciliation), J (money edges) **not yet run** — see Next Steps.

## Result
**PASS for Bloco A/B/C**, with one significant finding resolved mid-validation (see M1 below). No data-integrity regression survives on the branch as it now stands (post-merge).

## Checklist

| Bloco | Case | Status | Evidence |
|---|---|---|---|
| A1 | Plano de Contas CSV (2 new leaf accounts) | **PASS** | Preview VALIDATED 2/2 → commit COMMITTED, Gravadas 2; both `1.1.5`/`1.4.1` appear in Plano de Contas |
| A2 | Plano de Contas XLSX (parity) | **PASS** | Same flow via `.xlsx` (fresh codes `1.1.6`/`1.4.2` to avoid re-triggering the create-or-skip path) → VALIDATED 2/2 → COMMITTED; verified in Plano de Contas |
| A3 | Saldos Iniciais CSV (balanced) | **PASS** | VALIDATED 2/2 → COMMITTED; Balancete confirmed Banco +R$5.000,00, Receita credit +R$5.000,00, balanced (see Warning W1 on staleness) |
| A4 | Lançamentos CSV (2 `entryKey` groups) | **PASS** | VALIDATED 4/4 → COMMITTED 4/4; Balancete reflects both groups (Caixa +100, Despesas +50, Banco credit +50) |
| A5 | Lançamentos XLSX (parity) | **PASS** | Uploaded via same-origin fetch of `.xlsx` fixture; VALIDATED 2/2 |
| B1 | Saldos Iniciais — cross-job re-upload | **FAIL → then PASS after merge** | See Finding M1 below |
| B2 | Lançamentos — cross-job re-upload, no `externalReference` | **PASS** | Re-upload of identical `journal-entries.csv` as new job → COMMITTED, but Balancete **unchanged** (no doubling) |
| B3 | Lançamentos — cross-job re-upload, with `externalReference` | **PASS** | `JE-101`/`NF-00101` uploaded twice → Balancete unchanged after 2nd upload |
| B4 | Re-commit same job | not exercised this pass | — |
| B5 | Altered content (1 cent different) re-upload | **PASS** | New distinct entry posted (Banco +R$5.000,01) — proves dedup is content-hash-based, not positional/blind |
| C1 | Missing required header | **PASS** | `ImportHeaderError`: "Cabeçalho inválido: faltam colunas accountCode." — no preview possible |
| C2 | `ACCOUNT_NOT_FOUND` | **PASS** | "accountCode '9.9.9' não existe."; sibling row in same `entryKey` also INVALID (cascading); Confirmar disabled |
| C3 | `ACCOUNT_NOT_LEAF` | **PASS** | "accountCode '3' não aceita lançamentos." |
| C4 | `NOT_SINGLE_SIDED` | **PASS** | "Cada linha deve ter débito OU crédito." |
| C5 | `BAD_DEBIT` (comma) / `BAD_CREDIT` (negative) | **PASS** | Both rejected in the same file: "debitCents deve ser inteiro ≥ 0." / "creditCents deve ser inteiro ≥ 0." |
| C6 | `BAD_DATE` | **PASS** | "postingDate deve ser YYYY-MM-DD." |
| C7 | `FILE_UNBALANCED` (opening balances) | **PASS** | "Arquivo não fecha: débito 500000 ≠ crédito 499000." — tudo-ou-nada, nothing committable |
| C8 | `GROUP_TOO_FEW_LINES` | **PASS** | "Lançamento precisa de ao menos 2 partidas." |
| C9 | `GROUP_UNBALANCED` | **PASS** | "Lançamento não fecha: débito 10000 ≠ crédito 9000." |
| C10 | `PARENT_NOT_FOUND` (chart) | **PASS** | "parentCode '9.9' não existe." |
| C11 | Preview without confirming → no commit | **PASS** | 10 rejected uploads (C1–C10) run without ever clicking Confirmar; Balancete total unchanged (R$20.850,01) across the whole Bloco C run |

## Findings

### Majors (resolved during this validation pass)

**M1 — B1 (opening-balance cross-job re-upload) doubled the ledger entry; branch was missing the already-reviewed fix #20.**

Reproduced exactly as the plan predicted: re-uploading the identical `opening-balances.csv` as a new job doubled Banco from R$5.000,00 → R$10.000,00. Root cause confirmed via `git merge-base --is-ancestor 465f9a4 HEAD` → **NO**: the branch `feat/accounting-fe-import-export` was cut before PR #20 (`465f9a4`/`df8e144`, deterministic `sourceId = "di:"+sha256(fileHash|opening)`) merged to main. The FE branch still ran the pre-fix `sourceId = jobId` scheme for opening balances.

**Resolution:** merged `465f9a4` into the current branch (clean merge, no conflicts — `e8483e3`), restarted the backend, and re-verified:
- A 3rd upload of the same file (first one under the new post-merge scheme) posted as a new entry — expected, since it can't retroactively collide with the two legacy `sourceId=jobId` rows already in the dev DB (R$5k→10k→15k, permanent residue in this disposable DB, matching the documented "double-post only in disposable smoke DBs" precedent).
- A **4th** upload of the same file correctly deduped against the 3rd (post-fix) entry — Balancete stayed at R$15.000,00, confirming the fix closes the gap going forward.

**Action needed beyond this validation:** the merge commit `e8483e3` (`465f9a4` → `feat/accounting-fe-import-export`) exists locally on this branch only — it has not been pushed. Recommend this branch's PR includes #20, or that #20 lands on `main` before this FE branch merges, per the documented merge order `#20 → #21` in `accounting-incr6-data-exchange-plan.md`.

### Minors / Warnings

- **W1 — Balancete/ledger views do not auto-refetch after a same-session import commit.** After confirming A3, the Balancete tab (already mounted) kept showing pre-import figures until a full page reload. The backend data was correct throughout (verified via the commit response `committedRows` and a reload) — this is a **display staleness** issue, not a data bug, but it does mean a tester (or user) trusting the on-screen Balancete without navigating away/reloading could wrongly conclude an import silently failed. Worth a follow-up: invalidate/refetch the trial-balance query on import commit success.

## Update — git/db follow-up (same day, after domain-architect review)

Independent of this session, `main` picked up `465f9a4` (#20) as its own clean commit, the FE branch was synced from `main`, and `#21` merged cleanly (`21cee27`, confirmed on `origin/main`) — resolving the #20/#21 coupling without needing the local revert that had been planned. Separately, `dev.db` was reset (`prisma migrate reset --force`, explicit user consent per Prisma's own AI-agent safety gate) to clear the B1-repro contamination, and reseeded. **Found + fixed a real bug in the process:** `server/prisma/seed.ts` hardcoded a `datasources.db.url` override (`file:./dev.db`) that silently resolved to the empty decoy file instead of the real nested `prisma/prisma/dev.db` — removed the override so the schema's own `env("DATABASE_URL")` resolution applies (same mechanism the running app already uses correctly).

**Correction on domain model:** the chart of accounts is **not** a DynamicTable — it's the first-class Prisma `Account` model, seeded idempotently by `PostingService.ensureChartOfAccounts()` on the first `postEntry`/import-commit in scope. Only the accounting **unit** ("Matriz") is DynamicTable-backed (preset `units`, internalName `units`) and needed manual recreation after the reset — the chart re-appeared on its own at the first commit, exactly as designed.

**Setup for D/I:** recreated unit "Matriz" via the onboarding wizard (hit an unrelated pre-existing bug — see below — worked around by selecting the CRM template instead of the Salon template), seeded 2026 periods, opened June (OPEN) and hard-closed May (HARD_CLOSED), then posted one A3 (opening balances) + one A4 (journal entries) as the frozen baseline book.

**Out-of-scope bug found + flagged (not fixed, spawned as background task):** the onboarding wizard's "Advanced Beauty Salon ERP" (and any non-CRM) template installation throws `Configuração inválida: relação 'leads.accountId' aponta para presetKey inexistente 'crmAccounts'` — a Core table (`leads`, always installed) has a hard relation into the optional CRM module's `crmAccounts` table. Selecting the CRM template works around it (brings `crmAccounts` along). Unrelated to INCR-6; task_9c4d0b9f tracks it.

**Concurrent-actor note:** while working, discovered (via a modified doc + memory file) that another session ran its own independent API-level validation pass against the same shared `dev.db`, including its own reset — timestamps confirm their pass completed *before* this session's reset+rebuild, so no data was clobbered, but this is the same "two concurrent actors" pattern flagged in `accounting-incr6-data-exchange-plan.md` before. Recommend not running further resets against this dev.db without checking who else might be mid-pass.

## Bloco D — Gate de período (run against the rebuilt baseline, all via real UI clicks except D8)

| Case | Result | Evidence |
|---|---|---|
| D1 — commit to CLOSED period (2026-05) | **PASS** | Preview VALID (advisory only) → commit: job **FAILED**, per-row message "Período contábil 2026/05 não está aberto para lançamentos."; Balancete unchanged after |
| D2 — importer never auto-opens | **PASS** | After D1, Períodos tab shows 2026-05 still "Definitivo" |
| D3 — opening-balance closed-period failure surfaced | **PASS** | Same explicit message per-row, not silent; ledger unchanged |
| D4 — mixed open+closed groups in one file | **PASS** | Job **PARTIAL**, Gravadas: 2 (open group only); ledger delta matched exactly the open group's amounts (+R$30 Caixa/Receita), closed group's message visible |
| D5 — reversal requires open period | **PASS** | Reversal defaulting to today (2026-07, never opened) → blocked with the same period-gate message; soft-closed June also blocked it; reopening June (with justification) let the reversal succeed — proves the gate applies to the reversal's own posting date, not just original postings |
| D6 — open/close/reopen require justification, no silent sibling effects | **PASS** | Every transition this session (Jan, Mai, Jun ×2) required the justification dialog; no other period changed status as a side effect |
| D7 — audit trail for period transitions | **PASS** | Verified directly against `AuditEvent` (no UI/API surface exists for it — matches FE-INCR1's documented "audit trails in UI = out of scope"): every transition recorded `actorUserId`, `reason`, `fromStatus`/`toStatus`, hash-chained (`prevHash`/`hash`) |
| D8 — TOCTOU post × close race | **Declared, not clicked** | Per the plan's own honesty rule — a real concurrent-write race can't be constructed through a single browser session. Coverage exists at service/smoke level ([ACC-011], `authoritative-gate-inside-tx` memory), not re-verified here |

## Bloco I — Reconciliação (run against the frozen post-D book: Banco 4.950 / Caixa 30 / Receita -5.030 / Despesas 50, Total 5.280/5.280)

| Case | Result | Evidence |
|---|---|---|
| I1 — Σdébito = Σcrédito | **PASS** | Balancete Total R$5.280,00 = R$5.280,00 |
| I2 — export round-trip | **PASS** | `EXPORT_TRIAL_BALANCE` CSV downloaded via real API; every row's cents matched the on-screen Balancete exactly (e.g. Banco `500000,5000,495000`) |
| I3 — estorno neutralizes | **PASS** | Razão for Caixa: original posting (debit 10000, status "Reversed") + reversal posting (credit 10000) — net zero from that pair; original **not deleted**, status flipped ([ACC-018]) |
| I4 — no lost/duplicated postings | **PASS** | Razão for Banco: exactly 2 postings (the A3 saldo debit 500000, the A4 despesa credit 5000) — matches what was fed in, no phantom third row from the D4 closed-group attempt (which correctly never posted) |

## Final Decision

**PASS for Bloco A/B/C/D/I.** Both previously-identified stop-the-line blocks (D and I) are now green, run against a git-history-correct branch and a reconciliation-clean baseline. No new data-integrity bugs found; one already-known minor persists (reversal description shows raw entry id, not friendly number — same as FE-INCR1's m2).

Not yet run: **F** (chart of accounts create-or-skip on genuine re-import), **G** (export CSV/XLSX round-trip for BP/DRE/Razão — only Balancete was round-tripped here), **H** (cross-tenant `NotFoundError`), **J** (money edges: large values, zero/blank cents). None of these are stop-the-line per the reaffirmed sequence, but should be closed before calling #21 fully done. **→ Now closed: see "Bloco F/G/H/J — closeout pass (2026-07-02)" at the end of this doc.**
4. Re-run B1/B2 once more after #20 is confirmed on `main` as a final gate, per governance (independent reviewer already PASS'd #20 at 647/647 — this pass only needed to confirm the FE branch's runtime behavior, which it now does).

Bloco A (happy path) and the rest of Bloco B/C — chart of accounts creation, journal entries (both reference and reference-less), all 10 rejection codes, and the "preview never writes" invariant — all validated cleanly against the production frontend build.

---

# Bloco F/G/H/J — closeout pass (2026-07-02, post FIX-FE-INCR1-M1M2)

The four blocks left as **"Not yet run"** above depended on the M1 (DRE `reportStatus`) / M2
(date rendering) fixes, which are now in `main` (merge `e7b727d`, doc `bc1af0d`). This pass
closes them. It does **not** re-touch A/B/C/D/I.

## Environment
- **Isolated git worktree** off `origin/main` @ `bc1af0d` (branch `valid/fe-incr6-fghj`) — per
  `verify-write-context-before-writing`; node_modules shared read-only via junction, no shared
  working dir.
- **Isolated DB** `server/prisma/prisma/dev.fghj.db` (`migrate deploy` + seed; `migrate status`
  = up to date, no drift) — never the shared `dev.db` (`stay-on-sqlite-no-postgres` /
  dev.db-collision precedent).
- **Backend FRESH** — `npm run dev` (ts-node-dev) started clean from the worktree @ `bc1af0d`
  on `:3099`, health `{database:ok}` before any evidence (`stale-dev-server-serves-old-code`).
- **Surface:** real HTTP API under `/api/accounting/data-exchange/*` (+ `/post`, report,
  period endpoints) — the exact surface the FE Import/Export tab calls — driven with a
  self-minted admin JWT. Scope `unitId` is a plain string, so each block used a hermetic unit
  (`unit-fghj-F/G/H/J`); the chart of accounts self-seeds on first read per unit.
- tester: Claude (agent-conducted, API-layer + FE source verification). **Browser gap declared
  below**, consistent with the A/B/C and VALIDATION-STATUS passes.

## Result: PASS for F / G / H — PASS-with-known-caveat for J
34/34 API assertions behaved as specified once one wrong test-side assertion was corrected
(DRE expense **sign**, see G3 note). One money edge re-confirms the **already-tracked**
`ACC-INCR6-J-001` (Int32 money column ceiling) from the import surface — not a regression, not
a new bug, has a repo-level test. No data-integrity defect surfaced in any block.

### Bloco F — chart create-or-skip on a genuine mixed re-import
Distinct from C2 (identical re-upload): this import mixes brand-new codes with codes that
already exist (a canonical seed code **and** a code created by a prior import).

| Case | Result | Evidence |
|---|---|---|
| F0 — seed import (2 brand-new leaf accounts `1.5.1`,`1.5.2` under parent `1`) | **PASS** | preview `validRows=2` → commit `committedRows=2`, status `COMMITTED` |
| F1 — mixed re-import preview (`1.1.1` canonical-existing + `1.5.1` existing + `1.5.3` new) | **PASS** | `validRows=3`, `invalidRows=0` — existing accounts are **not** flagged at validation time (ACCOUNT_EXISTS is a commit-time decision) |
| F2 — commit: only the new account is created | **PASS** | `committedRows=1` (just `1.5.3`), status `COMMITTED` |
| F3 — the two existing rows are SKIPPED | **PASS** | `GET rows?status=SKIPPED` → 2 rows, both `errorCode=ACCOUNT_EXISTS` |
| F4 — zero duplication (DB-level) | **PASS** | `Account` rows for the unit: no duplicate `code`; `1.1.1` count = **1**; `1.5.1/1.5.2/1.5.3` all present exactly once |

### Bloco G — export round-trip BP/DRE/Razão (CSV **and** XLSX) + dates (M2) + DRE reportStatus (M1)
Real active ledger seeded via `/post`: revenue R$1.000,00 (`1.1.1`↔`3.1`, date `2026-06-15`),
expense R$300,00 (`4.1`↔`1.1.1`, date `2026-06-20`); `asOf=2026-06-30`. Artifacts downloaded
via `GET /jobs/:id/download` and parsed.

| Case | Result | Evidence |
|---|---|---|
| G1 — **Razão** CSV + XLSX: dates correct, **no −1 shift** (M2) | **PASS** | `date` column = `2026-06-15`, `2026-06-20` exactly in both formats; the two off-by-one dates (`…-14`/`…-19`) absent. (Razão is the only report whose export carries a date column.) |
| G2 — **BP** CSV + XLSX | **PASS** | `ASSETS,1.1.1,Banco,70000` and `NET_RESULT,,…,70000` in both formats |
| G3 — **DRE** CSV + XLSX | **PASS** | `GROSS_REVENUE,3.1,…,100000`; `EXPENSES,4.1,…,-30000`; `NET_RESULT,,…,70000` in both formats. **Note:** DRE amounts are **signed** — expenses are negative contributions (`100000 + (−30000) = 70000`); this is the report's designed shape (confirmed against `incomeStatement().expenses.accounts`), not a defect. An initial test assertion wrongly expected an unsigned `30000`; corrected. |
| G4 — **DRE reportStatus === OK** over a real active ledger + revenue (M1) | **PASS** | `GET /income-statement?asOf=2026-06-30` → `reportStatus:"OK"`, `netResult.amountCents:"70000"` — the M1 always-INVALID bug is gone against a real book |
| G5 — BP reportStatus === OK | **PASS** | `GET /balance-sheet` → `reportStatus:"OK"` |
| G6 — FE on-screen date render (dd/mm/aaaa, no shift) | **PASS (source-verified; browser gap)** | `features/accounting/lib/formatDate.ts` slices to date-only and parses as **local** midnight (`new Date(datePart+'T00:00:00')`, no `Z`) → dd/mm/aaaa with no UTC−3 shift; used by `LedgerPanel` (date column), and per the M2 commit also `BalanceSheetPanel`/`IncomeStatementPanel`/`JournalEntriesPanel`. Verified by source, not by a live click — see browser gap. |

### Bloco H — cross-tenant NotFoundError
An EXPORT job and an IMPORT job created under `(admin, unit-fghj-H-A)`; every job-scoped read
and the commit attempted from a foreign scope. Job scoping is `{ userId: ownerUserId, unitId }`.

| Case | Result | Evidence |
|---|---|---|
| H1–H4 — same user, **different unitId** | **PASS** | `getJob`, `rows`, `download`, `commit` → **404** each |
| H5–H8 — **different user**, same unitId | **PASS** | `getJob`, `rows`, `download`, `commit` → **404** each |
| H9 — no leakage in the 404 | **PASS** | 404 body = `{"code":"NOT_FOUND","message":"Job não encontrado."}` (58 bytes on download); no `storageKey`, no rows, no artifact bytes |
| H10 — control: owner reads own job | **PASS** | same job under its true scope → **200** (proves the 404s are scoping, not a blanket failure) |

### Bloco J — money edges (integer cents)
Money is integer cents; the validator's `parseCents` accepts a non-negative **safe** integer
(`Number.isSafeInteger`). Persisted columns `Posting.debitCents/creditCents` are Prisma `Int`
(signed 32-bit).

| Case | Result | Evidence |
|---|---|---|
| J1 — Int32-max value (`2147483647`) | **PASS** | journal preview VALID → commit `COMMITTED` → `EXPORT_TRIAL_BALANCE` `balanceCents = 2147483647` **exactly** (no float error, no NaN) |
| J2 — overflow `MAX+1` (`9007199254740992`) at validation | **PASS** | `validRows=0`, rows `INVALID` `BAD_DEBIT/BAD_CREDIT` — rejected cleanly at preview |
| J3 — zero on **both** sides | **PASS** | `INVALID` `NOT_SINGLE_SIDED` |
| J4 — zero on **one** side opposite a value | **PASS** | `validRows=2`, VALID (a 0 is legal opposite a non-zero leg) |
| J5 — blank/absent cents | **PASS** | `validRows=0`, `INVALID` `BAD_DEBIT` (empty fails `^\d+$`, no NaN) |
| J6 — opening-balances overflow parity | **PASS** | opening-balances `MAX+1` → `validRows=0`, `BAD_DEBIT` (same guard as journal) |
| J7 — near-`MAX_SAFE_INTEGER` (`9007199254740991`) commit | **PASS (confirms known `ACC-INCR6-J-001`)** | validator says **VALID** (it's a safe JS integer), but commit **FAILED**: both rows `POST_FAILED` with `"…does not fit in an INT column, try migrating 'debitCents' to BIGINT"`, job `FAILED`, **zero entries persisted**. The import path **contains** the raw Prisma error as a per-row `POST_FAILED` (not an opaque 500). No silent overflow/wraparound/partial post. |

## Findings

- **`ACC-INCR6-J-001` (Minor, already tracked — re-confirmed from the FE import surface).** The
  import validator's upper bound (`Number.isSafeInteger`, ~9.0e15) is wider than the storage
  column (`Int` = ±2,147,483,647 cents ≈ ±R$21,474,836.47). Values in the gap pass **preview
  as VALID** and are only rejected at **commit** (`POST_FAILED`/`FAILED`). This is the same
  ceiling proven at the repository layer by `PostingRepository.moneyOverflow.test.ts`
  (`ACC-INCR6-J-001` — a value one cent over Int32 is never caught as a `ValidationError`; the
  Int32-max value itself round-trips exactly; the on-the-fly `_sum` aggregate for
  Balancete/BP/DRE is **not** clipped). Import-path nuance vs. the raw `/post` probe: the
  importer's per-group `try/catch` turns the raw Prisma error into a contained `POST_FAILED`
  row + `FAILED` job, so the FE surfaces a per-row reason rather than a 500. **Not fixed here**
  — the real fix is a schema migration `Int → BigInt` on `debitCents/creditCents`
  (+ `deltaCents`) plus an import-validator upper-bound guard, which is a code decision outside
  this validation's scope. Practical exposure: a salon ERP posting leg > R$21.47M; loud and
  safe today, never silent corruption.
- **DRE sign convention (not a defect).** The DRE export/report returns expense amounts
  **signed negative** so `NET_RESULT = Σrevenue + Σ(signed expenses)`. Documented here only
  because a first-pass test assertion mistook the correct `-30000` for a bug.

## Browser gap (declared)
Consistent with the A/B/C pass and `FE-INCR6-VALIDATION-STATUS.md`: in this environment the
controllable browser reaches external sites but not `localhost`/private IPs, and the shared
`:3000`/backend are owned by other sessions. So F/G/H/J were validated at the **API layer**
(the identical HTTP surface the tab calls) plus **FE source verification** for the render-only
concern (G6 date formatting). The prod FE build itself compiles clean (`next build`, exit 0).
Not a code defect — a harness limitation. Residual for human sign-off: a live authenticated
click-through of the Import/Export tab (upload→preview→commit→export) and a visual read of the
dd/mm/aaaa dates on the Razão/BP/DRE screens.

## Gates (this pass, in the worktree)
- `cd server && npx tsc --noEmit` → **0**
- `cd my-app && npx tsc --noEmit` → **0**
- `cd server && npm test` → **655/655 pass, exit 0** (the `TECH-DEBT-TEST-001` prisma.ts
  post-teardown flake did not trigger this run; not touched either way)
- `cd my-app && npx next build` → **clean, exit 0**
- `npx prisma migrate status` → **up to date, no drift** (no new migration)
- `docs:generate` → **N/A** (no route/DTO touched; this pass is docs-only)

## Status update — Next Steps
**F / G / H / J are now CLOSED** (J closed with the known-caveat cross-reference to
`ACC-INCR6-J-001`). Combined across all passes: **A / B / C / D / F / G / H / I / J = PASS**
(J with the tracked Int32-ceiling caveat). Remaining before calling FE-INCR-6 fully done:
- Human sign-off with a live authenticated browser click-through (the declared browser gap).
- `ACC-INCR6-J-001` fix decision (schema `Int → BigInt` + validator upper-bound guard) — its
  own change, not this validation.
