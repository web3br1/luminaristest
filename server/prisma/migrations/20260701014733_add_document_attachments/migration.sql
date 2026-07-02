-- CreateTable
CREATE TABLE "document_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'JOURNAL_ENTRY',
    "targetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "deletedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "document_attachments_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "journal_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_journal_entry_sequences" (
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "unitId", "fiscalYear")
);
INSERT INTO "new_journal_entry_sequences" ("fiscalYear", "last", "unitId", "updatedAt", "userId") SELECT "fiscalYear", "last", "unitId", "updatedAt", "userId" FROM "journal_entry_sequences";
DROP TABLE "journal_entry_sequences";
ALTER TABLE "new_journal_entry_sequences" RENAME TO "journal_entry_sequences";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "document_attachments_userId_unitId_targetType_targetId_idx" ON "document_attachments"("userId", "unitId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "document_attachments_deletedAt_idx" ON "document_attachments"("deletedAt");
