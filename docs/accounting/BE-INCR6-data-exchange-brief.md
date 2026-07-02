# BE/FE-INCR-6 — Accounting Data Exchange MVP — Execution Brief

**Status:** PLANNING (no code yet) · **Date:** 2026-07-01 · **Predecessor:** BE-INCR-5 (merged `a33e42b`, smoke-cleared)
**Authority:** `.claude/skills/_ARCHITECTURE-CONTRACT.md` (§0 reuse, §2 layers, §2.1 boundary), `.claude/skills/_REUSE-CRITERION.md`

---

## 1. Goal & locked scope

A **central de entrada/saída de dados contábeis** for CSV/XLSX, with staging → validation → preview → idempotent commit, plus report export. Not conciliação, not ECD/fiscal, not OCR/AI.

**In scope (locked with stakeholder):**

| Direction | Kinds |
|---|---|
| **Import** | Chart of Accounts · Opening Balances · Journal Entries |
| **Export** | Report data (Trial Balance, General Ledger, Balance Sheet, Income Statement) · Import-error reports · Blank templates |
| **Formats** | CSV **and** XLSX |
| **Frontend** | One minimal Import/Export tab (upload, pick kind, download template, preview, see errors, commit, download exports) |

**Locked decisions:**
- **Period-gate policy:** *require manual opening.* Rows landing in a CLOSED period are flagged `INVALID` at validation; the user opens the period via the existing periods screen and re-runs. The two-level posting gate stays the single authority — the importer never auto-opens a period.
- **Auditable evidence package (zip):** *deferred to its own increment* (needs `archiver` dep + package assembler). Not here.
- **Out:** OFX/CNAB/NF-e/NFS-e, inventory, payroll, customers/suppliers, OCR, AI classification, bank reconciliation, ECD/ECF, PDF, smart column mapping, auto period creation, auto account creation during posting.

---

## 2. STOP reflex (Contract §2.1) — where this lives

Binary answer: **first-class Prisma, service-layer only.** No DynamicTable.

- The importer **writes accounting invariants** (accounts, journal entries) → it must route through the canonical services (`PostingService.postEntry`, `PostingService.createAccount`), never a raw repository insert and never the DynamicTable engine.
- The new **staging tables** (`AccountingDataExchangeJob` / `Row`) are internal *system lifecycle* data (job status, per-row validation), not user-defined runtime schema → first-class Prisma models, not a DynamicTable preset.
- No Prisma service is injected into any plugin/RuleContext; the import orchestration is a plain accounting service composing existing accounting services. Contract §2.1 respected.

---

## 3. Reuse-vs-bespoke (evidence-based, Contract §0)

Every "reuse" below was confirmed by reading the file, not assumed.

| Need | Verdict | Evidence |
|---|---|---|
| Post a journal entry | **REUSE** `PostingService.postEntry` | idempotent (`@@unique(userId,unitId,sourceType,sourceId)`), period-gated (preflight + in-tx), balance-invariant, emits `entry.posted` audit in-tx — `PostingService.ts:*` |
| Create an account | **REUSE** `PostingService.createAccount(scope, {code,name,nature,acceptsEntries})` | `PostingService.ts:462`, `CreateAccountSchema` in `PostingDto.ts` |
| Report data source | **REUSE** `AccountingReportService` (trialBalance / accountLedger / balanceSheet / incomeStatement) | all read-only, money in integer cents, `AccountingReportService.ts` |
| XLSX read/write | **REUSE** `exceljs ^4.4.0` (already in `package.json`, currently unused in server) | no new dep |
| CSV read/write | **BESPOKE tiny** (no dep) | no papaparse/csv-parser installed; output is trivial join, input is a small quoted-field parser. `ponytail:` a dep only if RFC-4180 edge cases bite |
| Multipart upload + validation | **REUSE** `lib/uploadSecurity` | allowlist already has `text/csv`, `text/plain`, XLSX; XLSX magic-bytes = PK/ZIP enforced; CSV has no signature (parse-validated) — `uploadSecurity.ts:11-44` |
| Persist the uploaded source file (for re-validation/preview + audit) | **REUSE** `lib/attachmentStorage` (`saveFile`/`resolveReadPath`/`deleteFile`) | domain-agnostic disk store, path-traversal guarded — `attachmentStorage.ts` |
| Stream a download (export artifacts + error reports) | **REUSE** the `documentAttachmentController` pattern (`Content-Disposition` + `createReadStream`) | proven at `documentAttachmentController.ts:92-126` |
| Authorization | **REUSE** `IAccountingPolicy` (`canManage` for import/commit, `canRead` for export) | no new policy |
| Audit | **REUSE** `AuditService.append` (in-tx hash-chain) + extend `PAYLOAD_ALLOWLIST` | allowlist THROWS on unknown eventType — `auditCanonical.ts` |
| Staging job/row model | **BESPOKE new** (2 Prisma models) | no staging precedent exists in the codebase |

**Net:** the only genuinely new code is the two staging models, the CSV/XLSX (de)serializers, the per-kind validators, and the commit orchestrator. Everything with a financial or security invariant is reused.

---

## 4. Data model (staging — bespoke, first-class Prisma)

Two new models. Tenancy = plain scoped strings (`userId`/`unitId`), matching `AuditEvent`/`JournalEntry` — **no User relations** (zero blast radius on `User`). Money inside `normalizedJson` = **integer cents as string** (project convention).

```prisma
model AccountingDataExchangeJob {
  id            String   @id @default(cuid())
  userId        String
  unitId        String
  direction     String   // IMPORT | EXPORT
  kind          String   // see kind enum below
  status        String   // UPLOADED | VALIDATED | COMMITTING | COMMITTED | FAILED | EXPORTED
  originalName  String?
  mimeType      String?
  sizeBytes     Int?
  sha256        String?  // of the uploaded/generated artifact
  storageKey    String?  // reused attachmentStorage key (source file or export artifact)
  totalRows     Int      @default(0)
  validRows     Int      @default(0)
  invalidRows   Int      @default(0)
  committedRows Int      @default(0)
  requestedById String                       // actor (plain string)
  committedById String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  committedAt   DateTime?
  rows          AccountingDataExchangeRow[]
  @@index([userId, unitId, createdAt])
  @@map("accounting_data_exchange_jobs")
}

model AccountingDataExchangeRow {
  id             String   @id @default(cuid())
  userId         String
  unitId         String
  jobId          String
  rowNumber      Int
  groupKey       String?  // entryKey for multi-line journal entries
  rawJson        String   // original parsed cells
  normalizedJson String?  // canonicalized (cents as string), null if unparseable
  status         String   // VALID | INVALID | COMMITTED | SKIPPED
  errorCode      String?
  errorMessage   String?
  field          String?
  targetType     String?  // ACCOUNT | JOURNAL_ENTRY
  targetId       String?  // set after commit (plain string, not FK)
  createdAt      DateTime @default(now())
  job            AccountingDataExchangeJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@index([userId, unitId, jobId])
  @@index([userId, unitId, groupKey])
  @@map("accounting_data_exchange_rows")
}
```

**Kind enum (string, validated in DTO):**
`IMPORT_CHART_OF_ACCOUNTS` · `IMPORT_OPENING_BALANCES` · `IMPORT_JOURNAL_ENTRIES` · `EXPORT_TRIAL_BALANCE` · `EXPORT_GENERAL_LEDGER` · `EXPORT_BALANCE_SHEET` · `EXPORT_INCOME_STATEMENT` · `EXPORT_IMPORT_ERRORS` · `EXPORT_TEMPLATE`

---

## 5. Flow — two-phase, per-entry atomic, idempotent

```
upload (multipart) ──▶ parse + per-row validate ──▶ persist Job + Rows (VALID/INVALID)
                                                          │
                                        preview: GET job / GET rows
                                                          │
                        POST commit ──▶ for each VALID row/group:
                                          createAccount()  |  postEntry()   (each atomic, idempotent)
                                          mark row COMMITTED/SKIPPED, record targetId
                                        ──▶ Job COMMITTED (partial success allowed)
```

- **Validation is advisory at upload; the commit is authoritative** — `postEntry` re-checks the period gate *inside its own tx*. A period closing between preview and commit is caught (row fails, reported), never bypassed.
- **Per-entry atomicity**, not all-or-nothing: each `postEntry`/`createAccount` commits independently; the job reports row-level outcome. Matches idempotent retry.
- **Idempotency:** re-committing the same job skips rows already `COMMITTED`; re-uploading a corrected file relies on `sourceId` at the posting layer (§6 decision).

---

## 6. Import kinds — rules & the corrections evidence forced

### 6.1 Chart of Accounts (`IMPORT_CHART_OF_ACCOUNTS`)
File columns: `code,name,nature,acceptsEntries,parentCode`.
- **`parentCode` is a validation-only column, NOT stored.** The `Account` model has no `parentId`/`parentCode` — hierarchy is implicit in the `code` string ("1.1.2" ⊃ "1.1"). Parent existence is validated by checking the parent code exists among *existing accounts ∪ rows in the same file*. (Confirmed: `schema.prisma` `model Account` has no self-relation; matches the deliberate flat-code-hierarchy design.)
- **Create** new accounts via `createAccount`. **Update** existing (by `@@unique(userId,unitId,code)`) only for **safe fields** (`name`). 
- **Guards (reject as INVALID):** changing `nature` on an account that has postings (would corrupt BP/DRE mapping); flipping `acceptsEntries` true→false on an account with postings; any code not present that a later row references as parent; duplicate `code` within the file. **No delete via import** — ever.

### 6.2 Opening Balances (`IMPORT_OPENING_BALANCES`)
File columns: `accountCode,postingDate,description,debitCents,creditCents`.
- The **whole file must balance** (Σdebit === Σcredit, exact integer). Committed as **one balanced `JournalEntry`** via `postEntry`, `sourceType='ACCOUNTING_OPENING_BALANCE_IMPORT'`, `sourceId=<jobId>` (idempotent per job).
- `postingDate` must fall in an **OPEN** period (locked policy) and each `accountCode` must be a leaf (`acceptsEntries=true`) — both already enforced by `postEntry`.

### 6.3 Journal Entries (`IMPORT_JOURNAL_ENTRIES`)
File columns: `entryKey,documentDate,postingDate,description,accountCode,debitCents,creditCents,lineDescription,externalReference`.
- Rows grouped by `entryKey` → one `postEntry` per group (min 2 legs, balanced per group).
- `sourceType='IMPORT_JOURNAL_ENTRIES'`. **Idempotency key = `externalReference`** (a stable business key the user controls) → re-importing the same file does not double-post. If `externalReference` is blank, the row commits without a dedup guard (documented). *(Open decision D1 — see §11.)*

**Money is always integer cents in the file** (columns are `*Cents`) — sidesteps decimal/locale/float ambiguity. No decimal parsing.

---

## 7. Export kinds

Each export builds an in-memory artifact (CSV or XLSX via exceljs), persists it via `attachmentStorage` under a Job row, and streams it back with `Content-Disposition` (reused pattern).

- **Reports** (`EXPORT_TRIAL_BALANCE`, `EXPORT_GENERAL_LEDGER`, `EXPORT_BALANCE_SHEET`, `EXPORT_INCOME_STATEMENT`): call the matching `AccountingReportService` method, serialize its DTO to rows. Filters (`asOf`, `accountCode`, `unitId`) passed through.
- **Templates** (`EXPORT_TEMPLATE`, param = import kind): a header-only CSV/XLSX matching each import layout above. Static, no data.
- **Import errors** (`EXPORT_IMPORT_ERRORS`, param = jobId): the `INVALID` rows of a job with `rowNumber, field, errorCode, errorMessage` — lets the user fix the spreadsheet offline.

---

## 8. HTTP surface (3-touch route each)

```
POST   /api/accounting/data-exchange/imports            (multipart: kind, file) → Job (VALIDATED)
GET    /api/accounting/data-exchange/jobs/:jobId        → Job summary
GET    /api/accounting/data-exchange/jobs/:jobId/rows   → paginated rows (preview/errors)
POST   /api/accounting/data-exchange/jobs/:jobId/commit → commits VALID rows → Job (COMMITTED)
POST   /api/accounting/data-exchange/exports            (kind, format, filters) → Job (EXPORTED)
GET    /api/accounting/data-exchange/templates/:kind    → stream template artifact
GET    /api/accounting/data-exchange/jobs/:jobId/download → stream artifact (export/errors)
```
`/api/accounting` is already inside `protectedApiPaths` (prefix match) — Touch 2 covered. Touch 1 = mount, Touch 3 = `docs.paths.ts`.

---

## 9. Audit events (extend `PAYLOAD_ALLOWLIST` — it throws on unknown)

`data_exchange.import_uploaded` · `data_exchange.import_committed` · `data_exchange.import_failed` · `data_exchange.export_generated` · `data_exchange.artifact_downloaded` (flag-gated like `attachment.downloaded`).
Each posted entry still emits its own `entry.posted` via `postEntry`. PII-safe payload: `{jobId, kind, direction, sha256, totalRows, validRows, invalidRows}` — never file content or account balances.

---

## 10. Execution phases (sequencing: export-first = lower risk before the sensitive writes)

| Phase | Deliverable | Risk |
|---|---|---|
| **1** | Prisma: 2 staging models + migration | low |
| **2** | `lib/spreadsheet` — CSV + XLSX read/write helpers (bespoke thin over exceljs) + a self-check | low |
| **3** | **Export** service + controller + routes + streaming (reports → CSV/XLSX, templates) | low (read-only) |
| **4** | Import **validation** service (upload → stage → per-kind validators → VALID/INVALID rows) | medium |
| **5** | Import **commit** service (VALID rows → `createAccount`/`postEntry`, idempotent, audit, row outcomes) | **high** (writes) |
| **6** | Audit allowlist + factory wiring + OpenAPI (`docs.paths.ts` + `components`) | low |
| **7** | Tests (validators, commit idempotency, period-gate reject, chart guards, export serialization) | — |
| **8 (FE)** | Minimal Import/Export tab (upload, kind picker, template download, preview, errors, commit, export download) | medium |
| **Gates** | `tsc` (server+my-app) · jest green · `docs:generate` · independent reviewer · **SMOKE-MIGRATION-GATE-BE-INCR6** | — |

---

## 11. Open decisions (need sign-off before Phase 5)

- **D1 — Journal-entry idempotency key.** Recommend `externalReference` as `sourceId` (stable business key); blank ⇒ no dedup guard. Alternative: `<jobId>:<entryKey>` (but re-upload of a corrected file re-posts). 
- **D2 — Opening balances = single balanced entry per file.** Recommend yes (one `JournalEntry`, many legs, dated at the file's `postingDate`).
- **D3 — XLSX ingest = first worksheet only.** Recommend yes; header row required; cents columns (no decimals).
- **D4 — Limits.** Max upload size (reuse 50 MB attachment limit?) + max rows per import (e.g. 5 000) to bound in-memory parse. Recommend a row cap with a clear error.

## 12. Risks

- **R1 (data safety):** chart update touching `nature`/`acceptsEntries` on posted accounts → guarded (§6.1). 
- **R2 (memory):** exceljs loads the whole workbook; enforce the D4 caps.
- **R3 (encoding):** Excel often writes CSV as Latin-1/UTF-8-BOM; the CSV reader must strip BOM and default to UTF-8 (the `config/env` BOM handling is a precedent).
- **R4 (preview/commit skew):** period closes between preview and commit → caught by `postEntry`'s in-tx gate; row reported, never bypassed.
- **R5 (new dep creep):** keep CSV bespoke and defer `archiver` (zip) to the evidence-package increment. `ponytail:` reach for a CSV lib only if RFC-4180 quoting bites.

---

## 13. Related
Predecessor: [BE-INCR5-closeout.md](./BE-INCR5-closeout.md). Reuse anchors: `PostingService`, `AccountingReportService`, `lib/attachmentStorage`, `lib/uploadSecurity`, `AuditService`. Memory: `accounting-is-first-class-prisma`, `authoritative-gate-inside-tx`, `openapi-wiring-static-artifact`.
