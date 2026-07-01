# ADR — BE-INCR-6B Import: idempotency, period policy & failure visibility

**Status:** Accepted · **Date:** 2026-07-01 · **Increment:** BE/FE-INCR-6B (Accounting Data Exchange — Import)
**Deciders:** Chief Accounting Architect (parecer) + implementer · **Supersedes:** the "held pending D1–D4" hold on `wip/be-incr6b-import`

This ADR ratifies the D1–D4 decisions the import was built on **and** decides the risk finding the reviewer surfaced (elevated to a blocker in the accounting chair). It is the artifact that honestly clears the deploy/merge gate — the brief (§11) documented the options; this ADR *decides* them.

---

## Context

The importer turns CSV/XLSX into ledger writes exclusively through `PostingService.postEntry` / `createAccount`. `postEntry` is idempotent on the DB `@@unique(userId, unitId, sourceType, sourceId)`. The commit path therefore lives or dies on the `sourceId` chosen per imported entry.

---

## Decisions

### D1 — Journal-entry idempotency key (RATIFIED + HARDENED)
- **Primary key:** the user-supplied `externalReference` (a stable business key).
- **BLOCKER FIX — no NULL sourceId.** When `externalReference` is blank, the entry MUST still get a **deterministic** `sourceId = "di:" + sha256(fileSha256 + "|" + entryKey)`. The previous `externalReference || undefined` produced a NULL `sourceId`, which never collides on the `@@unique` (SQLite treats NULL as distinct), so re-uploading the same file as a *new job* silently double-posted every reference-less entry. A file-content + entryKey hash makes re-import of identical bytes dedup correctly with **zero burden on the user**. Rejected alternative: making `externalReference` mandatory (worse UX; content-hash dedup is the correct reimport semantics).

### D2 — Opening balances shape (RATIFIED; sourceId amended 2026-07-01 — see Amendment)
One **balanced** JournalEntry per file (all-or-nothing), `sourceType = ACCOUNTING_OPENING_BALANCE_IMPORT`, `sourceId = "di:" + sha256(fileSha256 + "|opening")`. Whole-file `Σdebit == Σcredit` (exact integer) enforced at validation and re-enforced by `postEntry`. (Originally `sourceId = jobId`, which keyed on the per-upload jobId and double-posted on cross-job re-upload — same class of bug as D1; corrected in the Amendment.)

### D3 — XLSX ingest (RATIFIED)
First worksheet only; header row required; money in **integer cents** columns (no decimals/locale). CSV + XLSX both supported.

### D4 — Period policy (RATIFIED)
The importer **never auto-opens a period**. Rows whose `postingDate` falls in a non-OPEN period are rejected; the user opens the period via the periods screen and re-commits. The authoritative gate stays inside `postEntry`'s tx.

### D5 — Failure visibility & retryability (NEW — from the parecer)
- **Opening-balance failures must not be swallowed.** The bare `.catch(() => 0)` hid the most common failure (closed period). Every affected row now carries `errorCode='POST_FAILED'` + message; the rows stay `VALID` so a re-commit retries once the period is opened.
- **Partial success is a first-class state.** When some entry groups commit and others fail, the job status is **`PARTIAL`** (not `COMMITTED`). Only a fully `COMMITTED` job short-circuits `commit()`, so `PARTIAL`/`FAILED` jobs remain retryable. Retry is **safe** because of the deterministic `sourceId` (D1) — re-committing never double-posts an already-landed entry.

---

## Consequences

- Re-uploading an identical file (any kind) is idempotent end-to-end: chart = create-or-skip; opening = deterministic file-hash sourceId (amended — see Amendment); journal = `externalReference` or the deterministic file hash.
- The FE can render row-level `errorCode`/`errorMessage` and offer a retry on `PARTIAL`/`FAILED` jobs.
- `di:`-prefixed sourceIds appear on imported entries lacking an externalReference — a recognizable, stable provenance marker.
- No schema/migration change (status is a string column); `DataExchangeStatus` gains `PARTIAL`.

## Verification
`tsc` clean · **jest 646/646** (new test: deterministic sourceId + stable across re-imports) · reviewer re-check of the delta · functional smoke re-run incl. blank-`externalReference` re-import dedup at the real DB level.

## Not in this increment
`EXPORT_IMPORT_ERRORS` CSV (errors already served as JSON via `/jobs/{id}/rows?status=INVALID`), chart-of-accounts safe-field update (no `updateAccount` service yet), FE Import/Export tab.

## Amendment — 2026-07-01: opening-balance cross-job idempotency (residual)

**Found after merge** (domain re-review): D1's deterministic-sourceId fix was applied to `IMPORT_JOURNAL_ENTRIES` only. `IMPORT_OPENING_BALANCES` still keyed `sourceId = jobId`, and `jobId` is minted fresh per upload — so re-uploading the same opening-balance file as a **new job** never collided on the `@@unique` and **double-posted the opening balances** (the exact bug D1 fixed for journals). The original Consequences claim *"opening = same jobId sourceId … idempotent (any kind)"* was therefore false.

**Fix (branch `fix/incr6b-opening-balance-idempotency`, off main):** opening-balance `sourceId` is now `"di:" + sha256(fileSha256 + "|opening")`, mirroring `journalSourceId`. Identical bytes → identical `sourceId` → dedup at the DB `@@unique`. `commitOpeningBalances` now takes `fileSha` (from `job.sha256 ?? job.id`) instead of `jobId`. Regression test added: `derives a stable sourceId across re-imports of the same file (cross-job idempotency)`. `tsc` clean; independent reviewer re-check of the delta pending before merge.
