-- INCR-COUNTERPARTY / ADR-INCR-COUNTERPARTY (F-CP1 → A1) — Counterparty first-class + FK.
-- Additive: CREATE TABLE counterparties, ADD COLUMN counterpartyId (nullable) on payables/receivables
-- (SQLite rebuilds the tables to attach the FK; rows preserved via INSERT…SELECT), then an idempotent,
-- scope-deduped backfill. counterpartyId stays NULLABLE this increment (SEC-A1-5: the NOT NULL hardening
-- is a 2nd migration that first asserts zero in-scope NULLs).

-- CreateTable
CREATE TABLE "counterparties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ref" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "counterparties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables (SQLite ADD FK column ⇒ table rebuild; existing rows copied, counterpartyId defaults NULL)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_payables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierRef" TEXT,
    "documentNumber" TEXT,
    "description" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "payables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payables_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payables_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_payables" ("amountCents", "cancelReason", "cancelledById", "createdAt", "createdById", "deletedAt", "description", "documentNumber", "dueDate", "expenseAccountId", "id", "issueDate", "status", "supplierName", "supplierRef", "unitId", "updatedAt", "userId") SELECT "amountCents", "cancelReason", "cancelledById", "createdAt", "createdById", "deletedAt", "description", "documentNumber", "dueDate", "expenseAccountId", "id", "issueDate", "status", "supplierName", "supplierRef", "unitId", "updatedAt", "userId" FROM "payables";
DROP TABLE "payables";
ALTER TABLE "new_payables" RENAME TO "payables";
CREATE INDEX "payables_userId_unitId_status_idx" ON "payables"("userId", "unitId", "status");
CREATE INDEX "payables_userId_unitId_dueDate_idx" ON "payables"("userId", "unitId", "dueDate");
CREATE UNIQUE INDEX "payables_userId_unitId_supplierName_documentNumber_key" ON "payables"("userId", "unitId", "supplierName", "documentNumber");
CREATE TABLE "new_receivables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerRef" TEXT,
    "documentNumber" TEXT,
    "description" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "revenueAccountId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "receivables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "receivables_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivables_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_receivables" ("amountCents", "cancelReason", "cancelledById", "createdAt", "createdById", "customerName", "customerRef", "deletedAt", "description", "documentNumber", "dueDate", "id", "issueDate", "revenueAccountId", "status", "unitId", "updatedAt", "userId") SELECT "amountCents", "cancelReason", "cancelledById", "createdAt", "createdById", "customerName", "customerRef", "deletedAt", "description", "documentNumber", "dueDate", "id", "issueDate", "revenueAccountId", "status", "unitId", "updatedAt", "userId" FROM "receivables";
DROP TABLE "receivables";
ALTER TABLE "new_receivables" RENAME TO "receivables";
CREATE INDEX "receivables_userId_unitId_status_idx" ON "receivables"("userId", "unitId", "status");
CREATE INDEX "receivables_userId_unitId_dueDate_idx" ON "receivables"("userId", "unitId", "dueDate");
CREATE UNIQUE INDEX "receivables_userId_unitId_customerName_documentNumber_key" ON "receivables"("userId", "unitId", "customerName", "documentNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "counterparties_userId_unitId_type_idx" ON "counterparties"("userId", "unitId", "type");

-- CreateIndex
CREATE INDEX "counterparties_deletedAt_idx" ON "counterparties"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_userId_unitId_type_name_key" ON "counterparties"("userId", "unitId", "type", "name");

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Backfill (INCR-COUNTERPARTY / A1). RUNS AFTER the counterparties unique index above so
-- INSERT OR IGNORE can dedupe on it. Guarantees:
--   • SEC-A1-2  dedupe by SCOPE — one Counterparty per DISTINCT (userId, unitId, name) per type; two
--               tenants named "ACME" NEVER collapse (GROUP BY carries userId+unitId).
--   • SEC-A1-3  zero cross-scope — the linking UPDATE correlates on userId AND unitId AND name, so a
--               row can only ever point at a Counterparty of its OWN scope.
--   • idempotent — INSERT OR IGNORE on the unique key + "WHERE counterpartyId IS NULL" make a 2nd run a
--               no-op (never P2002).
-- Timestamps are INTEGER ms-epoch to match how Prisma persists/reads DateTime on SQLite (memória
-- sintetico-nao-cobre-formato-de-dado-real — a TEXT CURRENT_TIMESTAMP would read back dual-format).
-- Includes cancelled/soft-deleted subledger rows: rename-on-delete only mangles documentNumber, so
-- supplierName/customerName stay intact and aging history keeps a scope-correct counterparty.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- SUPPLIERS from payables
INSERT OR IGNORE INTO "counterparties" ("id", "userId", "unitId", "type", "name", "ref", "createdById", "createdAt", "updatedAt", "deletedAt")
SELECT
    'cp_' || lower(hex(randomblob(12))),
    "userId",
    "unitId",
    'SUPPLIER',
    "supplierName",
    NULL,
    NULL,
    (CAST(strftime('%s','now') AS INTEGER) * 1000),
    (CAST(strftime('%s','now') AS INTEGER) * 1000),
    NULL
FROM "payables"
GROUP BY "userId", "unitId", "supplierName";

UPDATE "payables"
SET "counterpartyId" = (
    SELECT "c"."id" FROM "counterparties" "c"
    WHERE "c"."userId" = "payables"."userId"
      AND "c"."unitId" = "payables"."unitId"
      AND "c"."type" = 'SUPPLIER'
      AND "c"."name" = "payables"."supplierName"
)
WHERE "counterpartyId" IS NULL;

-- CUSTOMERS from receivables
INSERT OR IGNORE INTO "counterparties" ("id", "userId", "unitId", "type", "name", "ref", "createdById", "createdAt", "updatedAt", "deletedAt")
SELECT
    'cp_' || lower(hex(randomblob(12))),
    "userId",
    "unitId",
    'CUSTOMER',
    "customerName",
    NULL,
    NULL,
    (CAST(strftime('%s','now') AS INTEGER) * 1000),
    (CAST(strftime('%s','now') AS INTEGER) * 1000),
    NULL
FROM "receivables"
GROUP BY "userId", "unitId", "customerName";

UPDATE "receivables"
SET "counterpartyId" = (
    SELECT "c"."id" FROM "counterparties" "c"
    WHERE "c"."userId" = "receivables"."userId"
      AND "c"."unitId" = "receivables"."unitId"
      AND "c"."type" = 'CUSTOMER'
      AND "c"."name" = "receivables"."customerName"
)
WHERE "counterpartyId" IS NULL;
