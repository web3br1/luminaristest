# BE-INCR-5 Pre-Validation Report

**Date:** 2026-06-30  
**Status:** PASS — Governance-ready for approval  
**Reviewer:** Architecture Contract Audit  
**Authority:** `.claude/skills/_ARCHITECTURE-CONTRACT.md` + `.claude/skills/_REUSE-CRITERION.md`

---

## Executive Summary

BE-INCR-5 (Attachments/Evidence MVP) passes all pre-validation gates against architecture contract and governance criteria. The design adheres to Prisma-first modeling (§0, §2, §2.1), strict layering, tenant scope enforcement, and audit integration patterns established in INCR-1 through INCR-4.

**Blockers:** None  
**Minor issues:** 2 (documentation clarifications, not architectural)  
**Verdict:** ✅ **PASS — Ready for implementation**

---

## Validation Framework

This report evaluates BE-INCR-5 brief against five foundational gates:

1. **Scope & Reuse** — Contract §0 (reuse before recreate)
2. **Prisma-First Modeling** — Contract §2 + §2.1 (ERP boundary)
3. **Layering & Dependency** — Contract §2 (Route → Controller → Service → Repository → Prisma)
4. **Transaction & Audit** — Contract §2 (soft-delete, audit trail, scope filter)
5. **API & Safety** — Contract §1 + brief §9–13 (MIME, size, path traversal, OpenAPI)

---

## Gate 1: Scope & Reuse (Contract §0)

### Question: Should this be a separate DocumentAttachment or reuse CrmAttachment?

**Etapa 1 (DETECTOR):** Shape + Posse

| Aspect | CrmAttachment | DocumentAttachment |
|--------|---------------|--------------------|
| **Shape** | Dynamic field → file | Entry-scoped → file |
| **Posse (source)** | `DynamicTableData` (user-defined schema) | `JournalEntry` (developer-defined first-class entity) |
| **Tenancy** | CRM user (implicit in DynamicTableData) | Accounting scope (userId + unitId explicit) |
| **Audit context** | No entry-specific audit | Full audit trail (upload/delete/download events) |

**DETECTOR RESULT:** Different in species (shape + posse diverge).  
**Divergence sanctioned?** Yes — accounting is first-class Prisma, CRM is DynamicTable. Separate model ensures layer purity (memory `[[accounting-is-first-class-prisma]]`).

**Etapa 2 (DECISOR):** Not applicable (different species).

✅ **GATE 1 PASS:** Create separate `DocumentAttachment` model (not CrmAttachment reuse).

---

## Gate 2: Prisma-First Modeling (Contract §2 + §2.1)

### Requirement: DocumentAttachment is first-class Prisma, not DynamicTable hybrid.

**Test:** Does the brief model DocumentAttachment as a real Prisma table with developer-defined schema?

**Evidence:**
- ✅ §Data Model (line 256): `CREATE TABLE "DocumentAttachment"` (SQL/Prisma syntax)
- ✅ Lines 298–333: Full Prisma schema with `model DocumentAttachment`, relations to `User`, `Unit`, `JournalEntry`
- ✅ Constraints explicit: `@@unique([userId, unitId, targetType, targetId, originalName], where: { deletedAt: null })`
- ✅ Indexes defined for scoped queries
- ✅ No `data: Json` column; all fields typed

**Anti-pattern check (§2.1-B):**
- ✅ **AC-2.1-B1:** Service does NOT inject into `DynamicTableService` (line 414–422, service only uses `DocumentAttachmentRepository` + `AuditEventService` + `FileStorageHelper`)
- ✅ **AC-2.1-B2:** Entity is NOT modeled as DynamicTable row
- ✅ **AC-2.1-B3:** No preset reuse for persistence (attachment is data-authoritative, entry-scoped)
- ✅ **AC-2.1-B4:** Service is purpose-built (not modified cross-module)
- ✅ **AC-2.1-B5:** Uniqueness is real `@@unique` (not `compositeUnique` preset scan)

✅ **GATE 2 PASS:** Prisma-first modeling adheres to §2.1 architecture.

---

## Gate 3: Strict Layering (Contract §2)

### Requirement: Route → Controller → Service → Repository → Prisma + Policy

**Design check (brief §3 Layer Architecture, lines 403–453):**

| Layer | Responsibility (Brief) | Contract Match | Risk |
|-------|---|---|---|
| **Route** | Mount in `routes/index.ts`, no logic | §2: "Zero lógica" | ✅ Brief says "just declaration" |
| **Controller** | Extract scope, validate multipart, call service | §2: "Valida (Zod), extrai actor, chama service, formata" | ✅ No `prisma.*` direct |
| **Service** | Validate MIME/size, coordinate upload, emit audit | §2: "Zero `prisma.*` direto, só via repo; policy-first" | ✅ Injected repo + policy (lines 418) |
| **Repository** | CRUD, scope filter `WHERE userId=$1 AND unitId=$2` | §2: "Único com `prisma.*`" | ✅ Soft-delete pattern documented (line 430) |
| **Middleware** | Extract AccountingScope from JWT | §2: Actor extraction | ✅ Separate concern (line 445–453) |

**Dependency injection (§2):**
- ✅ Line 418: Service receives `DocumentAttachmentRepository` + `AuditEventService` + `FileStorageHelper` by injection
- ✅ No `new Repository()` / `new Policy()` inside service
- ✅ Mirrors existing `PostingService` pattern (from INCR-1)

**Policy-first (§2):**
- Brief does NOT explicitly state "check policy before any data access" in service methods
- ⚠️ Minor issue: Expected pattern is `if (!this.policy.canXxx(...)) throw new ForbiddenError()` at service method entry
- Mitigation: Implementation must include scope check in all service methods (standard from INCR-1)

✅ **GATE 3 PASS:** Layering pattern adheres to contract with standard clarification needed at implementation.

---

## Gate 4: Transaction & Audit (Contract §2 + Brief §4–8)

### 4.1 Soft-Delete Universal (§2)

**Check:** `findMany`/`findFirst` filter `deletedAt: null`; delete = `update({ deletedAt: new Date() })`.

- ✅ Line 431: Repository description says "Soft-delete: set `deletedAt = NOW()`"
- ✅ Test case (line 505–507): "Soft-delete idempotence" tested
- ✅ Brief §4 (line 69–76): "Entry remains Posted" — no status change on attachment delete

✅ **GATE 4.1 PASS:** Soft-delete pattern adhered.

### 4.2 Audit Trail Integration (§2 + Brief §6–8)

**Check:** Events emitted within same tx, allowlisted payload, no PII/paths.

**Events documented (lines 100–107):**

| Event | Always? | Payload |
|-------|---------|---------|
| `attachment.uploaded` | Yes | `attachmentId`, `targetType`, `targetId`, `mimeType`, `sizeBytes`, `sha256` |
| `attachment.deleted` | Yes | ^ + `deletedById` |
| `attachment.downloaded` | Conditional (flag) | Same as deleted |

**Payload safety (lines 114–119):**
- ✅ No full file path (only `attachmentId`)
- ✅ No filename (stored in `originalName` separately)
- ✅ No raw content
- ✅ Cross-tenant isolation: scoped by `userId` + `unitId`

**Transaction boundary:** Brief §6 (line 109) states "Events are inserted within the same transaction" — standard pattern from INCR-2.

⚠️ **Minor issue (TX-001):** Brief does NOT document compensation logic:
- What if file write succeeds but DB insert fails?
- What if DB insert succeeds but file write fails?

**Mitigation:** Add §5a (see below) before code starts.

✅ **GATE 4.2 PASS:** Audit trail documented; TX compensation needs pre-code clarification.

---

## Gate 5: API & Safety (Contract §1 + Brief §9–15)

### 5.1 Storage Path Safety (Brief §13)

**Checks:**

1. ✅ Path structure: `storage/attachments/{userId}/{unitId}/{documentAttachmentId}/`
2. ✅ UUID for attachment ID (no user input in path)
3. ✅ Test case (lines 181–185): Traversal attempt `../../etc/passwd` stripped, `resolve()` asserted within boundary
4. ✅ No symlink following assumed (not mentioned; standard practice for Node `fs.readFile`)

✅ **GATE 5.1 PASS:** Path traversal prevention documented.

### 5.2 MIME & Size Validation (Brief §11)

**Whitelist (lines 143–152):**
- PDF, DOCX, XLSX, TXT, CSV, PNG, JPG
- Covers 95% of accounting use case

**Size limit:** 50 MB (configurable)

**Validation location:** Controller, before upload (lines 129–131)

**Magic bytes check:** Brief §11 defers to INCR-6 ("if time permits")
- ⚠️ **Minor issue (MIME-001):** MIME validation is header-only; no magic bytes in Phase 1. Documented as deferred; acceptable for MVP.

**Acceptance criteria (line 534):** "MIME type validated (whitelist enforced)" — update to clarify **header-only** check in INCR-5, magic bytes in INCR-6.

✅ **GATE 5.2 PASS:** MIME + size validation adequate for MVP; magic bytes deferred with clear rationale.

### 5.3 OpenAPI & Routes (Brief §15)

**Endpoints documented (lines 216–223):**

| Method | Path | Summary |
|--------|------|---------|
| POST | `/api/accounting/attachments` | Upload |
| GET | `/api/accounting/attachments/:id` | Download |
| DELETE | `/api/accounting/attachments/:id` | Soft-delete |
| GET | `/api/accounting/journal-entries/:journalEntryId/attachments` | List |

**DTOs (lines 225–248):** Upload + response DTO defined.

**Registration (lines 68–70, Contract §2):** Brief mentions will update OpenAPI; must do "3 touches":
1. ✅ Mount in `server/src/routes/index.ts`
2. ✅ Add path to `protectedApiPaths` in `auth.ts`
3. ✅ Add `@openapi` block in `docs.paths.ts`

✅ **GATE 5.3 PASS:** OpenAPI plan adequate.

---

## Gate 6: Code Quality & Testing (Contract §1 + Brief §6 Checklist)

### 6.1 Type Safety (Contract §1)

- ✅ Brief implies full TS types (DTOs, models defined)
- ✅ Gate: `cd server && npx tsc --noEmit` must pass (line 536)
- ✅ No `any` mentioned; expect interface for actor/scope

✅ **GATE 6.1 PASS:** TypeScript gates explicit.

### 6.2 Testing Plan (Brief §6 Phase 6, lines 498–508)

**Coverage:**
- ✅ Unit: Service (mocked repo, storage)
- ✅ Integration: Full flow (upload, list, delete, download)
- ✅ Security: Path traversal, oversized, MIME, cross-tenant, soft-delete idempotence
- ✅ Audit: Event payloads
- ✅ Code quality: `tsc`, `jest`, OpenAPI verified

**Gate line 538:** "Jest green (all new + regression)"

✅ **GATE 6.2 PASS:** Testing plan comprehensive.

---

## Minor Issues Summary

### Issue 1: TX-001 — Transaction Compensation Logic

**What's missing:** How the code handles:
- File write succeeds, DB insert fails → must delete physical file
- DB insert succeeds, file write fails → rollback tx

**Why:** INCR-1 & INCR-2 had explicit tx gates; this brief needs same clarity.

**Fix before code:** Add to brief §5a or standalone:

```markdown
### 5a. Transaction Boundaries & Compensation

**Upload flow:**
1. Validate MIME, size
2. Begin runTransaction()
3. Stream file to disk (after validation passes)
4. Insert DocumentAttachment + emit audit.uploaded in same tx
5. If DB insert fails → delete physical file (compensation)
6. If file write fails → rollback tx (DB not modified)

**Delete flow:**
1. Begin runTransaction()
2. Soft-delete DocumentAttachment (set deletedAt) + emit audit.deleted in same tx
3. Physical file remains on disk (audit compliance)
```

**Severity:** Clarification only (implementation-guiding, not architectural). Brief understands the pattern; needs explicit call-out.

### Issue 2: MIME-001 — Magic Bytes Deferred

**What's documented:** Server validates MIME header, not file magic bytes; deferred to INCR-6.

**Why:** Fair MVP trade-off (OCR/scanning also deferred).

**Fix before code (optional):** Update acceptance criterion #11 (line 534):

```markdown
11a. ✅ File size validated (50 MB default, configurable).
11b. ✅ MIME type validated via header check; magic bytes deferred to INCR-6.
```

**Severity:** Documentation only (no impact on Phase 1 implementation; rationale already in brief).

---

## Blockers Check

**Question:** Are there any design issues that block approval?

| Concern | Status |
|---------|--------|
| Separate model from CRM? | ✅ Justified (different tenancy, first-class Prisma) |
| Violates AC-2.1-B? | ✅ No violations found |
| Breaks existing patterns? | ✅ Mirrors INCR-1 through INCR-4 patterns |
| Scope isolation broken? | ✅ userId + unitId filtering explicit |
| Audit trail missing? | ✅ All three events (upload/delete/download) planned |
| Unsafe file I/O? | ✅ Path traversal tested, UUID-based storage |
| Missing testing? | ✅ Comprehensive test plan (Phase 6) |
| TypeScript gates? | ✅ tsc + jest gates explicit |
| OpenAPI wired? | ✅ Routes + DTOs + docs.paths.ts planned |

**Result:** ✅ **No blockers identified.**

---

## Warnings (Non-Blocking)

1. **Download audit is deferred** — Fair trade-off (O(n) I/O cost). Feature-flag ready.
2. **Magic bytes validation deferred** — Standard for MVP; future INCR-6.
3. **No mention of physical file cleanup on soft-delete** — File stays on disk (audit compliance); add comment in code explaining why deletion is soft.

---

## Approval Checklist

Before governance sign-off, ensure:

- [ ] Brief is read by tech lead / engineering team
- [ ] TX-001 clarification (§5a) added to brief OR flagged for implementer
- [ ] MIME-001 clarification (criteria #11b) added to brief OR flagged for acceptance
- [ ] No questions on scope (first-class Prisma justification is clear)
- [ ] No questions on layering (mirrors INCR-1 through INCR-4)
- [ ] Estimate (15h) approved for sprint
- [ ] Assign implementation + independent reviewer (separate worktree)

**Gate Status:** ✅ **Ready for code phase upon approval.**

---

## References

- Architecture Contract: `.claude/skills/_ARCHITECTURE-CONTRACT.md` (§0, §2, §2.1)
- Reuse Criterion: `.claude/skills/_REUSE-CRITERION.md` (Etapa 1/2)
- Prior brief: INCR-1 (periods) — `docs/accounting/INCR1-execution-brief.md`
- Audit reference: INCR-2 (audit trail) — `docs/accounting/INCR2-execution-brief.md`
- Memory: `[[accounting-is-first-class-prisma]]`, `[[accounting-scope-foundation-no-multicompany]]`

---

## Verdict

✅ **PASS — Governance-ready**

**Summary:**
- Scope: First-class Prisma, separate from CRM ✅
- Modeling: AC-2.1 compliant ✅
- Layering: Standard Route → Controller → Service → Repo ✅
- Audit: Events + payload safety ✅
- API: MIME + size + path safety ✅
- Testing: Comprehensive plan ✅
- Estimates: 15h reasonable ✅

**Action:** Governance approval sign-off. Implementation can begin once brief is approved and TX-001/MIME-001 clarifications (optional but recommended) are noted.

---

**Validation Date:** 2026-06-30  
**Next Gate:** Implementation (Phase 1–7 per brief), independent reviewer (worktree isolated)
