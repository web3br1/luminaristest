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

Not yet run: **F** (chart of accounts create-or-skip on genuine re-import), **G** (export CSV/XLSX round-trip for BP/DRE/Razão — only Balancete was round-tripped here), **H** (cross-tenant `NotFoundError`), **J** (money edges: large values, zero/blank cents). None of these are stop-the-line per the reaffirmed sequence, but should be closed before calling #21 fully done.
4. Re-run B1/B2 once more after #20 is confirmed on `main` as a final gate, per governance (independent reviewer already PASS'd #20 at 647/647 — this pass only needed to confirm the FE branch's runtime behavior, which it now does).

Bloco A (happy path) and the rest of Bloco B/C — chart of accounts creation, journal entries (both reference and reference-less), all 10 rejection codes, and the "preview never writes" invariant — all validated cleanly against the production frontend build.
