-- INCR-3: Numeração Sequencial do Livro Diário
--
-- Strategy (ADR-INCR3 §Backfill):
--   Phase 1 — drop/create journal_entry_sequences (idempotent)
--   Phase 2 — rebuild journal_entries with fiscalYear/entryNumber computed inline
--              (eliminates separate ADD COLUMN + UPDATE phases; works on both
--               fresh DBs and DBs where a prior failed attempt partially applied)
--   Phase 3 — seed sequences from rebuilt data
--
-- SQLite does not support ALTER COLUMN, so full table rebuild is required.
-- NOT NULL + UNIQUE on the new table are the backfill invariant guards:
-- any NULL or duplicate causes the INSERT (Phase 2) to abort the migration.

-- ── Phase 1: sequences table ───────────────────────────────────────────────────
-- DROP IF EXISTS handles dev recovery (stale sequences from a failed run).
-- On a fresh DB this is a no-op. On prod this never runs (table won't exist).
DROP TABLE IF EXISTS "journal_entry_sequences";

CREATE TABLE "journal_entry_sequences" (
    "userId"     TEXT     NOT NULL,
    "unitId"     TEXT     NOT NULL,
    "fiscalYear" INTEGER  NOT NULL,
    "last"       INTEGER  NOT NULL DEFAULT 0,
    "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "unitId", "fiscalYear")
);

-- ── Phase 2: rebuild journal_entries ──────────────────────────────────────────
-- fiscalYear and entryNumber are computed inline in the SELECT:
--   fiscalYear  = UTC year of the posting date (dual-format, see below)
--   entryNumber = ROW_NUMBER() per (userId, unitId, fiscalYear)
--                 ordered by date, createdAt, id  (ADR Q6 / Emenda 5)
--
-- DUAL-FORMAT date handling (RISK-INCR3-MIGRATION-001): Prisma stores DateTime
-- on SQLite as INTEGER ms-epoch; SQL-seeded rows store TEXT. strftime() on a raw
-- integer interprets it as a Julian Day → out of range → NULL → the NOT NULL
-- guard aborts the migration (P3018). Each date expression therefore branches on
-- typeof("date"): INTEGER ms-epoch goes through datetime(ms/1000,'unixepoch');
-- everything else (TEXT ISO, REAL Julian Day) is what strftime already handles.
-- Integer *seconds*-epoch is not covered — no writer in this codebase produces it.
--
-- TZ SEMANTICS — UTC, deliberately: the app derives fiscalYear with
-- getUTCFullYear() on the date-only string (PostingService.fiscalYearFrom,
-- ADR-INCR3 Emenda 3 — America/Sao_Paulo was tried and reverted because it
-- disagreed with the period gate at the Jan-1 boundary). datetime(...,'unixepoch')
-- is UTC, so backfilled rows number exactly as the current app would number them.
--
-- Column order matches original DDL (20260623152052) + INCR-1 columns.
-- DROP IF EXISTS: a prior failed run leaves journal_entries_new behind (the
-- rename only happens on success), so the retry must clear it or die on
-- CREATE TABLE. The original journal_entries is intact in that scenario —
-- the failure point (INSERT) precedes its DROP.
DROP TABLE IF EXISTS "journal_entries_new";

CREATE TABLE "journal_entries_new" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "userId"       TEXT     NOT NULL,
    "unitId"       TEXT     NOT NULL,
    "date"         DATETIME NOT NULL,
    "description"  TEXT     NOT NULL,
    "status"       TEXT     NOT NULL DEFAULT 'Draft',
    "sourceType"   TEXT     NOT NULL DEFAULT 'manual',
    "sourceId"     TEXT,
    "reversedById" TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    "createdById"  TEXT,
    "postedById"   TEXT,
    "fiscalYear"   INTEGER  NOT NULL,
    "entryNumber"  INTEGER  NOT NULL,
    CONSTRAINT "journal_entries_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journal_entries_reversedById_fkey"
        FOREIGN KEY ("reversedById") REFERENCES "journal_entries_new" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "journal_entries_new"
    ("id", "userId", "unitId", "date", "description", "status", "sourceType", "sourceId",
     "reversedById", "createdAt", "updatedAt", "createdById", "postedById",
     "fiscalYear", "entryNumber")
SELECT
    "id", "userId", "unitId", "date", "description", "status", "sourceType", "sourceId",
    "reversedById", "createdAt", "updatedAt", "createdById", "postedById",
    CAST(strftime('%Y', CASE WHEN typeof("date") = 'integer'
                             THEN datetime("date" / 1000.0, 'unixepoch')
                             ELSE "date" END) AS INTEGER),
    ROW_NUMBER() OVER (
        PARTITION BY "userId", "unitId",
            CAST(strftime('%Y', CASE WHEN typeof("date") = 'integer'
                                     THEN datetime("date" / 1000.0, 'unixepoch')
                                     ELSE "date" END) AS INTEGER)
        -- ORDER BY normalizes "date" to epoch ms: raw comparison in a partition
        -- mixing INTEGER and TEXT rows would sort by storage class, not time.
        -- (createdAt tie-break stays raw; a mixed-format partition with two rows
        -- on the SAME date is out of scope for this backfill.)
        ORDER BY CASE WHEN typeof("date") = 'integer' THEN "date"
                      ELSE CAST(strftime('%s', "date") AS INTEGER) * 1000 END,
                 "createdAt", "id"
    )
FROM "journal_entries";

DROP TABLE "journal_entries";
ALTER TABLE "journal_entries_new" RENAME TO "journal_entries";

-- Recreate all indices — names must match Prisma conventions exactly
-- (carried over from 20260623152052 + new ones for INCR-3)
CREATE UNIQUE INDEX "journal_entries_reversedById_key"
    ON "journal_entries"("reversedById");

CREATE INDEX "journal_entries_userId_unitId_status_idx"
    ON "journal_entries"("userId", "unitId", "status");

CREATE UNIQUE INDEX "journal_entries_userId_unitId_sourceType_sourceId_key"
    ON "journal_entries"("userId", "unitId", "sourceType", "sourceId");

CREATE UNIQUE INDEX "journal_entries_userId_unitId_fiscalYear_entryNumber_key"
    ON "journal_entries"("userId", "unitId", "fiscalYear", "entryNumber");

CREATE INDEX "journal_entries_userId_unitId_fiscalYear_idx"
    ON "journal_entries"("userId", "unitId", "fiscalYear");

-- ── Phase 3: seed sequences — last = MAX(entryNumber) per partition ────────────
INSERT INTO "journal_entry_sequences" ("userId", "unitId", "fiscalYear", "last", "updatedAt")
SELECT "userId", "unitId", "fiscalYear", MAX("entryNumber"), datetime('now')
FROM "journal_entries"
GROUP BY "userId", "unitId", "fiscalYear";
