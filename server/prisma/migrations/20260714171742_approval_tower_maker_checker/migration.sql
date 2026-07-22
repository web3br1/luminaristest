-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_journal_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "reversedById" TEXT,
    "createdById" TEXT,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "postedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "fiscalYear" INTEGER,
    "entryNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "journal_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journal_entries_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "journal_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_journal_entries" ("createdAt", "createdById", "date", "description", "entryNumber", "fiscalYear", "id", "postedById", "reversedById", "sourceId", "sourceType", "status", "unitId", "updatedAt", "userId") SELECT "createdAt", "createdById", "date", "description", "entryNumber", "fiscalYear", "id", "postedById", "reversedById", "sourceId", "sourceType", "status", "unitId", "updatedAt", "userId" FROM "journal_entries";
DROP TABLE "journal_entries";
ALTER TABLE "new_journal_entries" RENAME TO "journal_entries";
CREATE UNIQUE INDEX "journal_entries_reversedById_key" ON "journal_entries"("reversedById");
CREATE INDEX "journal_entries_userId_unitId_status_idx" ON "journal_entries"("userId", "unitId", "status");
CREATE INDEX "journal_entries_userId_unitId_fiscalYear_idx" ON "journal_entries"("userId", "unitId", "fiscalYear");
CREATE UNIQUE INDEX "journal_entries_userId_unitId_sourceType_sourceId_key" ON "journal_entries"("userId", "unitId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "journal_entries_userId_unitId_fiscalYear_entryNumber_key" ON "journal_entries"("userId", "unitId", "fiscalYear", "entryNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
