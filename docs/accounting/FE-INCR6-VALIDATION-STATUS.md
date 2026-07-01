# FE-INCR-6 Import/Export Functional Validation — Status

**Date:** 2026-07-01
**Branch:** `main` (post-merge) — `#20` (`465f9a4`) then `#21` (`21cee27`) landed in that order.
**Run scope:** full case matrix (Export / Chart / Opening / Journal / Errors) re-run on a **clean reset DB** via the real HTTP API (the exact surface the FE tab calls), plus FE prod-build boot + source verification.
**Status:** **PASS** — 21/21 backend cases; both stop-the-line cases (O2, J4) confirmed at API **and** DB level. 1 Minor (cosmetic badge).

---

## What landed first (the precondition the plan required)

`#20 → #21`, in order, both CLEAN with all CI green:

- **#20** squash-merged → `465f9a4` (deterministic `sourceId` for opening-balance import — the residual fix).
- **#21** merge-commit → `21cee27` (FE Import/Export tab). GitHub blocked the merge until the branch was updated onto post-#20 `main`, so #20 is provably in `main` history before #21 — closing the "B1 reopens" risk from the prior pass.

## DB baseline

The prior pass left `dev.db` contaminated (7 import-origin entries + manual/reversal). Reset to a clean seed before this run: **`prisma migrate reset` → migrate deploy → seed** (runtime DB `server/prisma/prisma/dev.db`; the 0-byte `server/prisma/dev.db` is the decoy). Contaminated copy preserved at `server/prisma/prisma/dev.db.contaminated-bak-20260701`. Clean baseline confirmed: 1 user, 0 accounts, 0 periods, **0 journal_entries, 0 import-origin**.

## Result matrix (backend, via real API on clean DB)

Each run used a **hermetic `unitId`** (scope is a plain string) so idempotency hashes never collide across runs; deltas measured via `entries.total`.

| Case | Assertion | Result |
|---|---|---|
| E1 Balancete CSV/XLSX | export 201 + artifact streams (bytes>0) | PASS |
| E1 guards | BP w/o `asOf` → 400; Razão w/o `accountCode` → 400 | PASS |
| E2 templates (3 kinds) | 201 + header-only file with exact import columns | PASS |
| C1 chart valid | 2 VALID → commit → +2 accounts | PASS |
| C2 chart re-upload | every row SKIPPED (`ACCOUNT_EXISTS`), 0 dup accounts | PASS |
| C3 bad `nature` | row INVALID, excluded from commit (valid=0) | PASS |
| O1 opening balanced | 2 VALID → commit → **+1** balanced entry | PASS |
| **O2 cross-job re-upload** ★ | same bytes, new job → commit → **entryDelta = 0** | **PASS** |
| O3 unbalanced | all INVALID (`FILE_UNBALANCED`), commit disabled | PASS |
| O4 closed period | commit → job **FAILED**, 0 committed (not silently COMMITTED) | PASS |
| J1 two groups | VALID → commit → **+2** entries | PASS |
| J2 partial file | good group posts (+1), bad group INVALID; committedRows=2, invalidRows=2 | PASS (see Minor) |
| J3 re-commit | re-commit same job → **entryDelta = 0** (idempotent) | PASS |
| **J4 reference-less re-upload** ★ | blank `externalReference`, same bytes new job → **entryDelta = 0** | **PASS** |
| X1 bad MIME (.png) | 415 (“envie CSV ou XLSX”) | PASS |
| X2 oversized (~12 MB) | 413 | PASS |
| X3 commit bad job id | 404, no false COMMITTED | PASS |

★ = stop-the-line (data-integrity). Both no-double-post cases pass. **DB-level confirmation:** content-dup scan grouped by `(unitId, sourceType, date)` finds **no unit with more entries than distinct sourceIds** — the exact cross-job doubling signature is absent.

## The one Minor — J2 top-line badge

Roteiro J2 expects the job to render **PARTIAL** when some rows are dropped. The implementation yields **COMMITTED**: `status = failedCount===0 ? 'COMMITTED' : committed>0 ? 'PARTIAL' : 'FAILED'`, and `failedCount` counts only rows that were **VALID but failed at commit-time**. J2's bad group is rejected at *validation* (INVALID, never enters `validRows`), so the valid subset commits cleanly → `failedCount=0` → COMMITTED. PARTIAL is reserved for post-validation commit failures (which are retryable) — an internally-consistent, deliberately-documented tri-state.

**Not a data-integrity issue and not a silent drop.** `ImportExportPanel.tsx` always renders, next to the badge: `Válidas`, **`Inválidas: {invalidRows}` in red**, `Gravadas`, and a table listing every INVALID row with its error message (`previewRows = invalidRows.length>0 ? invalidRows : rows`). So on J2 the user sees a green COMMITTED badge **but also** "Inválidas: 2" and the two failing rows with `GROUP_UNBALANCED`. Severity: **Minor (cosmetic)** — recommend the badge go amber when `invalidRows>0` even if COMMITTED, so the top-line signal matches the partial reality.

**Domain-architect reinforcement (confirmed against `PostingService.postEntry`, no code change made):** the period gate is authoritative *inside the tx*, per row/group (`assertPeriodOpenTx(tx, ...)` inside `postEntry`'s own `runTransaction` — there is no single batch-level tx). That's the correct, safe design — but it means a period closing **mid-import** produces a genuinely partial result at the `committed`-row layer (some groups POSTED before the close, later groups correctly FAILED), which is a *different* source of partial-ness than J2's validation-time INVALID rows. Today `failedCount` only tracks commit-time failures, so this scenario **would** actually surface as `PARTIAL` (not `COMMITTED`) — unlike J2. That's good; it means the badge is already accurate for the case that matters more (mid-batch period race). The amber-on-`invalidRows>0` recommendation above stands as the fix for the J2-shaped case (validation-time rejection), now with the added rationale that a batch can be "not fully clean" for two structurally different reasons — the badge should read amber for either.

## Frontend

- Prod build (`next build`) compiles clean; prod server (`next start`) boots and serves the login page live (verified on an isolated port).
- `ImportExportPanel.tsx` is **byte-identical** to `c512c0f` (#21) — the exact code the prior pass click-validated live (Bloco A/B/C, 23 cases PASS). Render logic verified by source: upload→preview→commit flow, commit gating (`validRows>0 && status!=='COMMITTED'` → O3/C3 disable the button), 415/413 messages, and the counts+error-table that resolve the J2 concern above.
- A fresh **authenticated** browser drive on the isolated port was blocked by an environmental CORS mismatch (backend allowlist = `http://localhost:3000`; the shared backend + :3000 are owned by another session and can't be restarted/taken here). Not a code defect. Coverage for the authenticated path comes from: the exhaustive API run (same HTTP surface), the source-verified render logic, and the prior pass's live click-through on identical bytes.

## Pre-deploy trip-wire (fold into SMOKE-MIGRATION-GATE-BE-INCR6)

Query against the runtime DB (`server/prisma/prisma/dev.db`). After this validation the DB is **no longer zero** (it holds this run's test entries across hermetic units); reset before real data. "Zero today ≠ zero forever." A cross-job double-post would appear as two entries with the same accounts/amounts/date under **different** `sourceId`s within one unit — the grouped content-dup scan is the trip-wire; post-#20 it cannot recur (identical bytes → identical deterministic `sourceId` → blocked by `@@unique`). Remediate any real duplicate by **estorno ([ACC-018]), never delete.**

## Not re-run this pass (unchanged from prior order)

Bloco D (period-closed via UI — covered here at API level by O4), F, G, H (tenancy), I (reconciliation — needs a clean DB again), J (money edges). See `FE-INCR6-functional-validation.md` → Final Decision.

---

## Update (same day, separate session) — Bloco D + I run via real UI clicks

**Note on concurrency:** this update was written by a different session than the one above, working against the same shared `dev.db`. Timestamps confirm the API-level pass above completed and its reset predates this session's own reset+rebuild — no clobbering occurred, but this is the second time in one day two sessions have touched this file/DB concurrently. Flag for the team: coordinate before running `prisma migrate reset` against shared dev infra.

Bloco D (period gate, 8 cases) and Bloco I (reconciliation, 4 cases) — both previously the two remaining stop-the-line blocks — are now **PASS**, run live via browser clicks against a freshly rebuilt unit + periods + one-shot A3/A4 baseline (frozen before I, per the plan's own "don't recontaminate the baseline" rule).

| Bloco | Result |
|---|---|
| D — period gate (D1–D7 clicked, D8 declared per honesty rule) | 7/7 clicked PASS + 1 declared |
| I — reconciliation (against the frozen post-D book) | 4/4 PASS |

Full case-by-case detail (including the git/db follow-up, the seed.ts bug found+fixed, and an unrelated onboarding-preset bug found+flagged) in `FE-INCR6-functional-validation.md`.

**Combined status across both sessions' passes: A/B/C/D/I all PASS. Remaining: F, G (full 4-report round-trip, only Balancete done here), H, J.**
