# BE-INCR-6B — Import — Closeout

**Increment:** BE/FE-INCR-6B — Accounting Data Exchange, **IMPORT** half (CSV/XLSX → chart of accounts / opening balances / journal entries)
**Status:** ✅ Verified — ready to merge (reviewer PASS + functional smoke PASS)
**Date:** 2026-07-01 · **Predecessor:** BE-INCR-6A EXPORT (merged main `a50ff6d`, PR #18)

---

## Scope delivered

The import half of the Data Exchange central. Upload → per-row validate → preview → **commit through the canonical accounting services** (`PostingService.postEntry` / `createAccount`), never a raw ledger write.

| Import kind | Behaviour |
|---|---|
| `IMPORT_CHART_OF_ACCOUNTS` | Create-or-**skip** (existing code → SKIPPED; never update/delete via import). Parent validated by code-prefix (Account has no stored parentCode). |
| `IMPORT_OPENING_BALANCES` | One **balanced** JournalEntry per file (all-or-nothing), `sourceType=ACCOUNTING_OPENING_BALANCE_IMPORT`, `sourceId=jobId`. |
| `IMPORT_JOURNAL_ENTRIES` | One `postEntry` per `entryKey` group, per-entry atomic, partial success. `sourceType=IMPORT_JOURNAL_ENTRIES`, **`sourceId=externalReference`** (D1). |

Endpoints: `POST /api/accounting/data-exchange/imports` (multipart), `GET …/jobs/{jobId}/rows` (preview + error report as JSON), `POST …/jobs/{jobId}/commit`.

## Architecture

First-class Prisma, service-layer only. Two-phase: upload stages a `VALIDATED` job + rows (validation is **advisory**); commit is **authoritative** — `postEntry` re-checks the period gate + balance inside its own tx, so a period closing between preview and commit cannot be bypassed. Staging repo touches only the two `accounting_data_exchange_*` tables (added in 6A). No new migration in 6B.

## Reuse (no new dependency)

`exceljs` (XLSX), `lib/spreadsheet` (CSV, from 6A), `lib/uploadSecurity` (multipart + magic-bytes, CSV/XLSX allowlist), `lib/attachmentStorage` (source-file staging + TX-001 compensation), `PostingService` (writes), `AuditService` (in-tx hash-chain).

## Verification

**Independent reviewer** (separate worktree, re-checked the import diff from scratch): **PASS — ready to merge.** Own gates: `tsc` clean, **jest 645/645 (56 suites)**, `docs:generate` valid with **no drift** (3 import endpoints in the committed artifact), `migrate status` clean (no new migration). All contract checks pass (§2.1 boundary, in-tx period gate, per-entry atomicity, D1 idempotency, chart create-or-skip, validators, TX-001, audit allowlist + PII-safe, tenancy).

**Functional smoke (real DB, real `PostingService`) — PASS**, all 10 checks:
`uploadAndValidate` → `commit` of a journal-entries CSV produced **1 `Posted` JournalEntry with 2 postings**, `sourceId=externalReference` (D1 confirmed at the DB level), `data_exchange.import_committed` audited, `verifyAuditChain` valid (4 events: period.opened + entry.posted + import_uploaded + import_committed), and a **re-commit did not double-post** (idempotent).

## Gates

`tsc --noEmit` clean · **jest 645/645** · `docs:generate` valid (86 paths / 106 ops) · 3-touch route · OpenAPI artifact regenerated (fixed a stale committed artifact — `openapi-wiring-static-artifact`).

## Known limitations (non-blocking — reviewer-noted, for the FE / follow-up)

1. **Journal entry without `externalReference` has no dedup guard** — sanctioned D1 decision (brief §6.3/§11). Blank ref → `postEntry` runs without `sourceId`; a crash between the entry commit and the row-status update could double-post only on a re-commit of a FAILED job.
2. **Partial-failure is not retryable** — if ≥1 group commits, the job → `COMMITTED` and re-commit short-circuits, leaving failed groups stuck in `VALID`. No double-post; the failed rows carry `POST_FAILED` + message for the FE to surface.
3. **Orphan staging job on upload-tx failure** — `createJob` runs before the staging tx; a tx failure leaves a `VALIDATED` job with no rows and a null storageKey (the source file is TX-001-compensated). Harmless — no ledger impact.

## Deferred (declared, not wired)

- `EXPORT_IMPORT_ERRORS` (CSV/XLSX error report) — the invalid rows are already served as JSON by `GET …/jobs/{jobId}/rows?status=INVALID`; a formatted download is a small follow-up.
- Chart-of-accounts **safe-field update** of existing accounts (import is create-or-skip; there is no `updateAccount` service yet).
- FE minimal Import/Export tab (the increment's frontend phase).

## Related
6A export closeout: `docs/accounting/BE-INCR6A-*` · brief: `docs/accounting/BE-INCR6-data-exchange-brief.md` · memory: `accounting-incr6-data-exchange-plan`.
