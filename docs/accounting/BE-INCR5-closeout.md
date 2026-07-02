# BE-INCR-5 — Closeout

**Increment:** BE-INCR-5 — Accounting Document Attachments / Evidence (documentary evidence on journal entries)
**Status:** ✅ MERGED — technically closed
**Closeout date:** 2026-07-01

---

## Merge facts

| Item | Value |
|---|---|
| PR | [#15](https://github.com/web3br1/luminaristest/pull/15) — *feat(accounting): BE-INCR-5 — Attachments/Evidence* |
| PR state | **MERGED** (2026-07-01T02:14:39Z) |
| Base ← Head | `main` ← `feat/accounting-attachments-evidence` |
| Merge commit | `a33e42b` |
| Local `main` == `origin/main` | `a33e42b` (in sync) |

### Feature commits included in the merge
| Commit | Phase |
|---|---|
| `e040878` | brief patch — TX-001 + MIME-001 + pre-validation |
| `c8b26af` | reuse reconciliation — storage lib + magic bytes |
| `eb2de02` | Phase 1 — DocumentAttachment schema + migration (`20260701014733_add_document_attachments`) |
| `35a3db2` | Phases 2–5 — service / repo / controller / routes / OpenAPI |
| `06ac782` | Phase 6 — attachment service + upload-security tests |

---

## Quality gates (verified)

| Gate | Result |
|---|---|
| Independent reviewer (separate worktree, re-checked from scratch) | **PASS** on G0–G9 |
| `tsc --noEmit` (server) | clean |
| Jest | **623 / 623** (52 suites) |
| OpenAPI (`npm run docs:generate`) | valid; 4 attachment endpoints + `DocumentAttachment` schema present; regenerated artifact == committed |
| `prisma migrate status` | 15 migrations, no drift, no pending — "Database schema is up to date!" |

---

## Notes for the record

- **Stray migration removed.** An empty `20260701014746_add_document_attachments/` (from a later `prisma migrate dev --create-only`) was found **untracked and unapplied**, showing as pending in `migrate status`. It never entered PR #15. Deleted; `main` carries only the correct `...014733` migration.
- **Governance warning (ordering).** The merge of PR #15 landed *before* the independent reviewer re-run finished. This deviates from the intended order (independent PASS → merge). Mitigation: an independent reviewer — separate from the implementing sequence, per governance rule `reviewer-independence-separate-agent` — subsequently returned a clean PASS on the merged code (its own tsc / jest 623-623 / OpenAPI / migrate + full G0–G9), with no defects. The merge is validated retroactively; nothing to revert.

---

## Deploy gate — SMOKE-MIGRATION-GATE-BE-INCR5 — ✅ PASS (2026-07-01)

**Executed and passed.** A populated-DB upgrade smoke test was run against a scratch SQLite DB, exercising the real services (not mocks).

**Method:** built a **pre-INCR5** DB by deploying the 14 migrations *before* `...014733` (the INCR5 migration held out), seeded it via real code paths — a `User`, an "old" `Posted` `JournalEntry`, a `journal_entry_sequences` row (`last=1`, the table the migration rebuilds), and one `entry.posted` audit event — then applied the INCR5 migration over that populated DB (`prisma migrate deploy`) and exercised upload → list → download → soft-delete through `DocumentAttachmentService`, with `AUDIT_DOWNLOAD_ATTACHMENTS=true`.

| # | Check | Result |
|---|---|---|
| 1 | SQLite populated pre-BE-INCR5 | ✅ seed: user + entry + sequence + audit (chain ok, 1 event) |
| 2 | Migrations up to `a33e42b` apply, no drift | ✅ `migrate deploy` ok; `migrate status` → "up to date" |
| 3 | `DocumentAttachment` table exists | ✅ `document_attachments` present |
| 4 | Old `JournalEntry` still readable | ✅ pre-INCR5 entry read post-migration |
| 4b | `journal_entry_sequences` data preserved (RedefineTable) | ✅ `last=1` intact after rebuild |
| 5 | Upload works | ✅ sha256 + size match |
| 6 | List by JournalEntry works | ✅ returns the row |
| 7 | Download works | ✅ on-disk file, sha256 matches |
| 8 | Soft-delete works | ✅ leaves list, `deletedAt` set, binary retained |
| 8b | Cross-target upload rejected | ✅ `NotFoundError` on foreign entry |
| 9 | `attachment.uploaded` audited | ✅ |
| 10 | `attachment.deleted` audited | ✅ |
| 11 | `attachment.downloaded` audited (in final scope) | ✅ (flag on) |
| 12 | `verifyAuditChain` ok | ✅ chain valid, 4 events (seed + 3 ops) |
| 13 | server `tsc --noEmit` | ✅ clean |
| 14 | `my-app` `tsc --noEmit` | ✅ clean |
| 15 | Jest | ✅ 623 / 623 (52 suites) |

The incidental `journal_entry_sequences` rebuild (strips a stray `DEFAULT CURRENT_TIMESTAMP` on `updatedAt` — pre-existing drift between hand-authored `20260627150000` and Prisma `@updatedAt`) was confirmed **data-safe on real data**: the seeded `last=1` survived the `INSERT..SELECT` intact (check #4b).

**Deploy status:** migration gate cleared. BE-INCR-5 is smoke-validated for deploy.

---

## Related

- Brief: `docs/accounting/BE-INCR5-attachments-evidence-brief.md`
- Pre-validation: `docs/accounting/BE-INCR5-VALIDATION-STATUS.md`
- Memory: `accounting-incr5-attachments`
