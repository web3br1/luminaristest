# FE-INCR-6 Import/Export — Functional Validation Plan

**Purpose:** the gate that a production build does NOT cover — actually clicking upload → preview → commit → export in a running app. FE-INCR-1 shipped 2 Majors (DRE-always-INVALID, date off-by-one) precisely through the "build-clean but never clicked" hole. This tab renders preview/commit/**PARTIAL** states that only surface on interaction.

**Run AFTER `#20 → #21` are merged** (the opening-balance case below requires the #20 fix present). **Pass criterion:** every target case behaves as stated; any deviation is a Major and blocks calling INCR-6 done.

## Setup
1. Backend up (`server`), frontend up (`my-app`, **production build** per CLAUDE.md, not `next dev`), logged in, a unit selected.
2. One **OPEN** period for the posting dates used below (open it in the Períodos tab first — the importer never auto-opens).

## Target cases

### Export (read-only — lowest risk, do first)
- **E1** Balancete / Razão / BP / DRE, each in **CSV and XLSX** → file downloads, opens, headers + rows match the on-screen report. BP/DRE require a date; Razão requires an account code — the button must block without them.
- **E2** Template download for each import kind (CSV + XLSX) → header-only file with the exact import columns.

### Import — Chart of Accounts
- **C1** Valid chart CSV → preview all VALID → **Confirmar** → new accounts appear in Plano de Contas.
- **C2** Re-upload the **same** file → every row **SKIPPED** (`ACCOUNT_EXISTS`); no duplicate accounts, no error.
- **C3** One row with a bad `nature` → that row **INVALID** with a readable message; commit count excludes it.

### Import — Opening Balances  ← the residual's home; test hardest
- **O1** Balanced opening CSV into the OPEN period → VALID → **Confirmar** → one balanced JournalEntry appears (Lançamentos/Balancete reflect it).
- **O2 — CROSS-JOB RE-UPLOAD (explicit residual case):** upload the **same** opening-balance file **again as a new job** → **Confirmar** → **NO second entry is created** (Balancete unchanged; still exactly one opening entry). This is the exact failure mode the `sourceId=jobId` residual caused — it MUST NOT double-post with #20 present.
- **O3** Unbalanced file (Σdébito ≠ Σcrédito) → all rows **INVALID** (`FILE_UNBALANCED`); commit disabled.
- **O4** File whose `postingDate` is in a **CLOSED** period → commit surfaces the closed-period failure per row (`POST_FAILED` + message), status not silently COMMITTED (D5 visibility).

### Import — Journal Entries
- **J1** Two balanced entries (grouped by `entryKey`) → VALID → **Confirmar** → both posted.
- **J2 — PARTIAL:** a file where one group is unbalanced and another is fine → the fine group commits, the bad group shows `INVALID`/error → **job status renders `PARTIAL`**, commit count = the good rows.
- **J3 — Retry:** re-commit the **J2 PARTIAL** job after fixing nothing → good rows are not re-posted (idempotent), bad rows still fail; then with a corrected file the remaining rows land — no double-post of the already-committed group.
- **J4 — Reference-less re-upload:** entries with **blank `externalReference`**, upload + commit, then re-upload the same file as a new job → **NO doubling** (deterministic `di:` sourceId).

### Errors / edges
- **X1** Upload a `.txt`/`.png` → **415** message ("envie CSV ou XLSX").
- **X2** Oversized file → **413** message.
- **X3** Network/500 during commit → error banner, job state not left falsely COMMITTED.

## Reporting
Record PASS/FAIL per case with a screenshot or the observed Balancete delta. O2 and J4 (cross-job no-double-post) are the load-bearing cases — if either doubles, stop and treat as a data-integrity regression. File any Major like FE-INCR-1's validation status doc.
