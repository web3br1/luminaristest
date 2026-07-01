# BE-INCR-5 — Attachments/Evidence — Execution Brief

**Date:** 2026-06-30  
**Status:** DRAFT — awaiting approval  
**Scope:** Backend-first minimum for auditable documentary evidence on accounting entries  
**Next:** Code implementation after brief PASS

---

## Executive Summary

BE-INCR-5 introduces a first-class `DocumentAttachment` model to associate auditable evidence files with journal entries, without requiring OCR, complex approval workflows, or external storage integrations. The feature is backend-only at MVP, with isolated storage on disk and audit trail integration via `AuditEvent`.

**MVP gates:**
- Upload/download/delete (soft) of attachments on JournalEntry
- Metadata validation: MIME type, size, SHA256 checksum
- Tenant scope enforcement (`userId` + `unitId`)
- Audit trail for upload/download/delete actions
- OpenAPI documentation

---

## Design Decisions

### 1. Reuse CrmAttachment or Create Contábil Own FileObject?

**Decision:** Create a separate `DocumentAttachment` model.

**Rationale:**
- Accounting attachments are first-class Prisma entities (like `JournalEntry`, `Account`, `Posting`), not user-defined runtime schemas.
- `CrmAttachment` is scoped to CRM user-defined tables; accounting has strict tenancy rules (`userId` + `unitId` via `AccountingScope`).
- Audit trail integration differs: accounting events must include `unitId` and `scope` context; CRM attachments do not have this constraint.
- Future accounting-specific requirements (e.g., legal hold, immutability flags, retention policies) should not couple to CRM.
- Separate model ensures layer purity: `DocumentAttachment` belongs in `Accounting` domain, not `CRM`.

### 2. File Storage Strategy (MVP)

**Decision:** Disk-based storage with `storagePath` relative to application root.

**Details:**
- Directory: `storage/attachments/{userId}/{unitId}/{documentAttachmentId}/`
- Filename: original name is normalized (strip unsafe chars, max 255 bytes).
- No external cloud storage (S3, GCS, etc.) in MVP.
- File I/O via `fs` module with permission checks in middleware.
- Size limit: 50 MB per file (configurable via ENV).

**Rationale:**
- MVP scope prohibits cloud storage complexity.
- Local disk is sufficient for single-instance deployment.
- Audit trail and checksum provide integrity.
- Future migration to S3 can abstract via a storage layer (Strategy pattern).

### 3. Target Entities (This Increment)

**Allowed:**
- `JournalEntry` — main target.

**Future targets (INCR-6+):**
- `AccountingPeriod` (period-level evidence)
- `CloseTask` (closing procedure evidence)
- `Reconciliation` (reconciliation documentation)
- `SourceDocument` (e.g., purchase order, invoice scan)

**Rationale:**
- JournalEntry is the atomic accounting unit; evidence on it is the foundational use case.
- Other entities depend on period/reconciliation workflows that are not yet defined.

### 4. Attachment Mutability on Posted JournalEntry

**Decision:** Attachments are **separate entities**; posting a JournalEntry does NOT freeze attachment operations.

**Details:**
- Attaching to a **Posted** entry creates a new `DocumentAttachment` record without modifying the entry itself.
- Deleting an attachment (soft-delete) also does NOT modify the entry's `status` or `postedAt`.
- `DocumentAttachment.deletedAt` is the audit trail; the entry remains Posted.
- Audit event `attachment.deleted` logs who/when for compliance.

**Rationale:**
- Separates data mutability (entry posting) from evidence accumulation (attachments).
- Avoids re-opening a Posted entry; evidence can be added/removed post-fact.
- Audit trail compensates: who deleted what, when.

### 5. Download Audit Trail

**Decision:** `attachment.downloaded` event is **captured but marked DEFERRED**.

**Details:**
- Upload/delete generate `AuditEvent`.
- Download is logged if `AUDIT_DOWNLOAD_ATTACHMENTS=true` (feature flag, default false).
- Payload is identical to delete: `attachmentId`, `targetType`, `targetId`, `mimeType`, `sizeBytes`, `sha256`.
- Future: compliance rules may mandate download audit; infrastructure is ready.

**Rationale:**
- Download audit is O(n) I/O on busy systems; MVP defers the cost.
- Single-instance deployment makes download audit less critical.
- Flagged architecture allows opt-in without schema change.

### 6–8. Audit Events: Upload, Delete, Download

**Events Created:**

| Event | Captured | Payload |
|-------|----------|---------|
| `attachment.uploaded` | Always | `{attachmentId, targetType, targetId, mimeType, sizeBytes, sha256}` |
| `attachment.deleted` | Always | `{attachmentId, targetType, targetId, mimeType, sizeBytes, sha256, deletedById}` |
| `attachment.downloaded` | Conditional | Same as deleted (see §5) |

**Implementation:**
- Events are inserted within the same transaction as the database operation.
- Payload is allowlisted; no file path, request body, token, or raw content included.
- `deletedById` is the userId of the actor performing the delete.

### 9. PII & Payload Safety

**Constraints:**
- No full file path in audit payload (only `attachmentId`).
- No document filename in event payload (stored separately in `DocumentAttachment.originalName`).
- No document content or raw request body.
- Audit payload is read by tenants on their own scope; no cross-tenant leakage via API.

**Rationale:**
- Audit is compliance data; sensitive file content should not appear in logs.
- Filename is metadata; if a tenant wants to audit it, they query `DocumentAttachment.originalName` directly.

### 10. File Size Limit

**Decision:** 50 MB per file (configurable).

**Details:**
- Validated in controller before upload.
- `DocumentAttachment.sizeBytes` is checked against `MAX_ATTACHMENT_SIZE_BYTES` from `.env`.
- Returns `400 Bad Request` if exceeded.

**Rationale:**
- Prevents disk exhaustion attacks.
- Reasonable for accounting documents (PDFs, scans, CSVs).
- Can be tuned per deployment.

### 11. MIME Type Whitelist

**Decision:** Accept common document types; reject executables/scripts.

**Whitelist:**
```
application/pdf
application/vnd.openxmlformats-officedocument.wordprocessingml.document  (docx)
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet  (xlsx)
text/plain
text/csv
image/png
image/jpeg
```

**Rationale:**
- Covers 95% of accounting evidence use cases.
- Explicitly rejects `.exe`, `.sh`, `.bat`, etc.
- Client-side sends MIME; server validates + re-checks file magic bytes (if time permits, defer to INCR-6).

### 12. SHA256 Calculation & Persistence

**Implementation:**
- Calculated server-side during upload using Node.js `crypto.createHash('sha256')`.
- Read file once, stream to disk, compute hash in parallel.
- Hash stored in `DocumentAttachment.sha256` column (64-char hex string).
- Used for integrity checks; downloadable by tenant for offline verification.

**Rationale:**
- Proves file was not modified post-upload.
- Enables deduplication in future increments.
- No external service required.

### 13. Path Traversal Prevention

**Implementation:**
- `originalName` is stripped of `..`, `/`, `\`.
- Storage path is **always** `storage/attachments/{userId}/{unitId}/{documentAttachmentId}/original_name.ext`.
- No user input in path calculation; `documentAttachmentId` is UUID.
- File I/O operations use `path.resolve()` and assert the resolved path is within `storage/attachments/`.

**Test Case:**
```
POST /attachments with name="../../etc/passwd"
→ Stored as: storage/attachments/{userId}/{unitId}/{uuid}/etcpasswd
→ Assert resolve is within storage/attachments/*
```

**Rationale:**
- Whitelist-based: only expect known structure.
- No symlink following; no relative traversal.

### 14. Tenant Scope: userId + unitId

**Implementation:**
- `DocumentAttachment` table has `userId` and `unitId` columns.
- Every query includes filter `WHERE userId = $1 AND unitId = $2`.
- Repository methods receive `scope: AccountingScope` (extracted from JWT or context).
- Controller injects scope; business logic never trusts client-provided scope.

**Middleware:**
```typescript
// attachments.middleware.ts
export const validateAttachmentScope = async (req, res, next) => {
  const scope = extractAccountingScopeFromAuth(req);
  if (!scope) return res.status(401).json({error: "Invalid scope"});
  req.accountingScope = scope;
  next();
};
```

**Rationale:**
- Prevents cross-tenant attachment leakage.
- Mirrors `Posting`, `JournalEntry` scope enforcement.

### 15. OpenAPI Contract

**Endpoints:**

| Method | Path | Summary |
|--------|------|---------|
| `POST` | `/api/accounting/attachments` | Upload attachment to JournalEntry |
| `GET` | `/api/accounting/attachments/:id` | Download attachment by ID |
| `DELETE` | `/api/accounting/attachments/:id` | Soft-delete attachment |
| `GET` | `/api/accounting/journal-entries/:journalEntryId/attachments` | List attachments for entry |

**DTO:**

```typescript
// DocumentAttachmentUploadDto
{
  targetId: string;  // journalEntryId
  targetType: "JOURNAL_ENTRY";  // literal
  file: File;
}

// DocumentAttachmentDto (response)
{
  id: string;
  targetId: string;
  targetType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedById: string;
  createdAt: datetime;
  deletedAt: datetime | null;
}
```

**Rationale:**
- Minimal, aligned with existing Accounting API patterns.
- File upload uses `multipart/form-data` standard.

---

## Data Model

### Table: `DocumentAttachment`

```sql
CREATE TABLE "DocumentAttachment" (
  id                TEXT PRIMARY KEY DEFAULT (uuid_v7()),
  userId            TEXT NOT NULL,
  unitId            TEXT NOT NULL,
  targetType        TEXT NOT NULL DEFAULT 'JOURNAL_ENTRY',  -- enum-like
  targetId          TEXT NOT NULL,  -- journalEntryId
  originalName      TEXT NOT NULL,
  mimeType          TEXT NOT NULL,
  sizeBytes         INTEGER NOT NULL,
  sha256            TEXT NOT NULL,  -- 64-char hex
  storagePath       TEXT NOT NULL,  -- relative to app root
  status            TEXT NOT NULL DEFAULT 'ACTIVE',  -- for future: SCANNING, QUARANTINED
  uploadedById      TEXT NOT NULL,
  deletedById       TEXT,  -- if deleted
  createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deletedAt         DATETIME,  -- soft-delete
  
  -- Constraints
  CONSTRAINT fk_document_attachment_user FOREIGN KEY (userId) REFERENCES User(id),
  CONSTRAINT fk_document_attachment_unit FOREIGN KEY (unitId) REFERENCES Unit(id),
  CONSTRAINT fk_document_attachment_uploader FOREIGN KEY (uploadedById) REFERENCES User(id),
  CONSTRAINT fk_document_attachment_deleter FOREIGN KEY (deletedById) REFERENCES User(id),
  
  -- Tenant scope + type uniqueness (no duplicate names per entry)
  UNIQUE (userId, unitId, targetType, targetId, originalName, deletedAt IS NULL),
  
  -- Indexes for fast queries
  INDEX idx_document_attachment_scope (userId, unitId),
  INDEX idx_document_attachment_target (targetType, targetId),
  INDEX idx_document_attachment_user (userId),
  INDEX idx_document_attachment_sha256 (sha256),
  INDEX idx_document_attachment_created_at (createdAt DESC)
);
```

### Relationship: `JournalEntry` → `DocumentAttachment` (1:N)

```prisma
model JournalEntry {
  // ... existing fields
  attachments DocumentAttachment[] @relation("JournalEntryAttachments")
}

model DocumentAttachment {
  id            String   @id @default(cuid2())
  userId        String
  unitId        String
  targetType    String   @default("JOURNAL_ENTRY")
  targetId      String   // journalEntryId
  originalName  String
  mimeType      String
  sizeBytes     Int
  sha256        String
  storagePath   String
  status        String   @default("ACTIVE")
  uploadedById  String
  deletedById   String?
  createdAt     DateTime @default(now())
  deletedAt     DateTime?

  // Relations
  user          User     @relation("DocumentAttachmentUser", fields: [userId], references: [id])
  unit          Unit     @relation("DocumentAttachmentUnit", fields: [unitId], references: [id])
  uploader      User     @relation("DocumentAttachmentUploader", fields: [uploadedById], references: [id])
  deleter       User?    @relation("DocumentAttachmentDeleter", fields: [deletedById], references: [id])
  journalEntry  JournalEntry @relation("JournalEntryAttachments", fields: [targetId], references: [id])

  @@unique([userId, unitId, targetType, targetId, originalName], where: { deletedAt: null })
  @@index([userId, unitId])
  @@index([targetType, targetId])
  @@index([sha256])
}
```

**Note:** Prisma `@@unique` with `where` clause enforces uniqueness only on active (non-deleted) records.

---

## Audit Event Integration

### AuditEvent Payloads

**Event: `attachment.uploaded`**
```json
{
  "event": "attachment.uploaded",
  "scope": {
    "userId": "user_123",
    "unitId": "unit_456"
  },
  "payload": {
    "attachmentId": "uuid_789",
    "targetType": "JOURNAL_ENTRY",
    "targetId": "entry_001",
    "mimeType": "application/pdf",
    "sizeBytes": 123456,
    "sha256": "abcd1234..."
  }
}
```

**Event: `attachment.deleted`**
```json
{
  "event": "attachment.deleted",
  "scope": {
    "userId": "user_123",
    "unitId": "unit_456"
  },
  "payload": {
    "attachmentId": "uuid_789",
    "targetType": "JOURNAL_ENTRY",
    "targetId": "entry_001",
    "mimeType": "application/pdf",
    "sizeBytes": 123456,
    "sha256": "abcd1234...",
    "deletedById": "user_999"
  }
}
```

**Event: `attachment.downloaded` (conditional, feature-flagged)**
```json
{
  "event": "attachment.downloaded",
  "scope": {
    "userId": "user_123",
    "unitId": "unit_456"
  },
  "payload": {
    "attachmentId": "uuid_789",
    "targetType": "JOURNAL_ENTRY",
    "targetId": "entry_001",
    "mimeType": "application/pdf",
    "sizeBytes": 123456,
    "sha256": "abcd1234..."
  }
}
```

---

## Layer Architecture

### Service: `DocumentAttachmentService`

**Location:** `server/src/accounting/services/DocumentAttachmentService.ts`

**Responsibility:**
- Validate MIME type, size.
- Coordinate upload: hash file, persist to disk, insert DB record.
- Coordinate delete: soft-delete DB record, emit audit event.
- List/read operations with scope filtering.

**Dependencies:**
- `DocumentAttachmentRepository` (injected)
- `AuditEventService` (injected)
- `FileStorageHelper` (injected)

**No dependencies:**
- Do NOT inject `DynamicTableService`, `JournalEntryService`, or other business logic.
- Foreign key verification is the repository's job (fail at DB constraint level).

### Repository: `DocumentAttachmentRepository`

**Location:** `server/src/accounting/repositories/DocumentAttachmentRepository.ts`

**Responsibility:**
- CRUD on `DocumentAttachment` table.
- Enforce scope filter on all queries: `WHERE userId = $1 AND unitId = $2`.
- Soft-delete: set `deletedAt = NOW()`.
- Foreign key validation via Prisma constraints.

### Controller: `DocumentAttachmentController`

**Location:** `server/src/accounting/controllers/DocumentAttachmentController.ts`

**Responsibility:**
- Extract `AccountingScope` from JWT.
- Validate multipart upload form.
- Call service.
- Return DTO + appropriate HTTP status.
- Inject `DocumentAttachmentService`.

### Middleware: `attachmentScopeMiddleware.ts`

**Location:** `server/src/accounting/middleware/attachmentScopeMiddleware.ts`

**Responsibility:**
- Verify JWT is present and valid.
- Extract `AccountingScope` (userId + unitId).
- Attach to `req.accountingScope`.
- Reject invalid/missing scope with 401.

---

## Implementation Checklist

### Phase 1: Schema & Infrastructure

- [ ] Create migration: add `DocumentAttachment` table.
- [ ] Update Prisma schema with `DocumentAttachment` model and relation.
- [ ] Create `storage/attachments/` directory (gitignore it).
- [ ] Create `FileStorageHelper` utility (normalize name, safe path resolve, stream write).

### Phase 2: Service & Repository

- [ ] Create `DocumentAttachmentRepository` with scope filtering.
- [ ] Create `DocumentAttachmentService`:
  - [ ] `uploadAttachment()` — validate, hash, persist, insert.
  - [ ] `deleteAttachment()` — soft-delete, audit.
  - [ ] `getAttachment()` — read + scope check.
  - [ ] `listByJournalEntry()` — list all for entry.
  - [ ] `downloadAttachment()` — stream file from disk, optional audit.

### Phase 3: Controller & Routes

- [ ] Create `DocumentAttachmentController`.
- [ ] Create `DocumentAttachmentRouter` and wire to `app`.
- [ ] Wire middleware for scope extraction.
- [ ] POST `/api/accounting/attachments` (upload).
- [ ] GET `/api/accounting/attachments/:id` (download).
- [ ] DELETE `/api/accounting/attachments/:id` (soft-delete).
- [ ] GET `/api/accounting/journal-entries/:journalEntryId/attachments` (list).

### Phase 4: Audit Integration

- [ ] Add `attachment.uploaded`, `attachment.deleted`, `attachment.downloaded` to `AuditEventType` enum.
- [ ] Call `AuditEventService.log()` in service methods.
- [ ] Test payload structure and scope inclusion.

### Phase 5: OpenAPI & Documentation

- [ ] Document DTO schemas in controller.
- [ ] Run `npm run docs:generate` to update `public/openapi.json`.
- [ ] Verify Swagger renders correctly.

### Phase 6: Testing

- [ ] Unit tests: `DocumentAttachmentService` (mocked repo, storage).
- [ ] Integration tests: full flow (upload, list, delete, download).
- [ ] Security tests:
  - [ ] Path traversal attempts.
  - [ ] Oversized file rejection.
  - [ ] MIME type validation.
  - [ ] Cross-tenant scope isolation.
  - [ ] Soft-delete idempotence.
- [ ] Audit trail tests: events emitted with correct payloads.

### Phase 7: Code Quality Gates

- [ ] `cd server && npx tsc --noEmit` ✅ (no errors)
- [ ] `cd my-app && npx tsc --noEmit` ✅ (if frontend schema changed, it didn't)
- [ ] Jest test suite passes: 100% of new tests + regression.
- [ ] OpenAPI matches implementation.
- [ ] Code review: layer purity, scope isolation, no CrmAttachment coupling.

---

## Acceptance Criteria (Gate)

**Do not merge without:**

1. ✅ Upload creates metadata + file persisted to disk.
2. ✅ SHA256 calculated and stored in `DocumentAttachment.sha256`.
3. ✅ List by JournalEntry respects `userId` + `unitId` scope.
4. ✅ Download respects permission (scope check).
5. ✅ Delete is soft-delete; `deletedAt` is set, file remains on disk.
6. ✅ Posted JournalEntry is not modified when attachment is added/removed.
7. ✅ `attachment.uploaded` audit event emitted with allowed payload.
8. ✅ `attachment.deleted` audit event emitted with allowed payload.
9. ✅ `attachment.downloaded` audit event deferred (flagged, not yet emitted).
10. ✅ Path traversal tested and prevented.
11. ✅ MIME type validated (whitelist enforced).
12. ✅ File size validated (50 MB default, configurable).
13. ✅ `cd server && npx tsc --noEmit` clean.
14. ✅ `cd my-app && npx tsc --noEmit` clean (if schema changed).
15. ✅ Jest green (all new + regression).
16. ✅ OpenAPI updated and verified.
17. ✅ Independent reviewer PASS on all governance gates (G0–G9).
18. ✅ PR opened to main (no direct commits).

---

## Out of Scope (Future Increments)

- OCR / AI document reading.
- Digital signatures / certificates.
- External cloud storage (S3, GCS, etc.).
- Mandatory attachments by rule.
- Attachment approval workflow.
- Document retention policies.
- ECD/ECF export with attachment metadata.
- Reconciliation attachments (future).
- Download audit by default (feature-flagged, deferred).

---

## Timeline Estimate

**DRAFT – for planning only**

| Phase | Estimate | Notes |
|-------|----------|-------|
| Schema & infra | 2h | Prisma, migration, file helper |
| Service & repo | 3h | Business logic, repo methods |
| Controller & routes | 2h | HTTP layer, middleware |
| Audit integration | 1h | Event emission |
| OpenAPI & docs | 1h | Swagger generation |
| Testing | 4h | Unit, integration, security |
| Code review & iteration | 2h | Fixes, edge cases |
| **Total** | **~15h** | Single engineer, includes review cycles |

---

## Approvals & Sign-Off

**Brief Status:** DRAFT (awaiting tech lead/governance approval)

**Approved by:** [to be filled]  
**Date:** [to be filled]

**Blockers:** None identified. Ready for code phase upon approval.

---

## References

- Architecture Contract: `.claude/skills/_ARCHITECTURE-CONTRACT.md`
- Reuse Criterion: `.claude/skills/_REUSE-CRITERION.md`
- Accounting Scope (tenancy): `docs/accounting/INCR-1-periods.md`
- Audit Trail (INCR-2): `docs/accounting/INCR-2-audit.md`
- Past increments: `docs/accounting/*.md`
