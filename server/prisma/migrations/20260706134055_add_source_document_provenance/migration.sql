-- CreateTable
CREATE TABLE "source_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalRef" TEXT,
    "documentDate" DATETIME,
    "description" TEXT,
    "attachmentId" TEXT,
    "rawJson" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "journal_entry_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_entry_sources_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journal_entry_sources_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "source_documents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "source_documents_userId_unitId_sourceType_idx" ON "source_documents"("userId", "unitId", "sourceType");

-- CreateIndex
CREATE INDEX "source_documents_userId_unitId_externalRef_idx" ON "source_documents"("userId", "unitId", "externalRef");

-- CreateIndex
CREATE INDEX "source_documents_deletedAt_idx" ON "source_documents"("deletedAt");

-- CreateIndex
CREATE INDEX "journal_entry_sources_userId_unitId_sourceDocumentId_idx" ON "journal_entry_sources"("userId", "unitId", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "journal_entry_sources_userId_unitId_journalEntryId_idx" ON "journal_entry_sources"("userId", "unitId", "journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_sources_journalEntryId_sourceDocumentId_key" ON "journal_entry_sources"("journalEntryId", "sourceDocumentId");
