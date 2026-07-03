-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "statementRef" TEXT,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "openingBalanceCents" INTEGER,
    "closingBalanceCents" INTEGER,
    "sha256" TEXT NOT NULL,
    "attachmentId" TEXT,
    "importedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "bank_statements_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "externalRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "rawJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bank_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "bank_statements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "matchedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unmatchedAt" DATETIME,
    "unmatchedById" TEXT,
    CONSTRAINT "reconciliation_matches_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "bank_statement_lines" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reconciliation_matches_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "postings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bank_statements_userId_unitId_glAccountId_idx" ON "bank_statements"("userId", "unitId", "glAccountId");

-- CreateIndex
CREATE INDEX "bank_statements_deletedAt_idx" ON "bank_statements"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statements_userId_unitId_sha256_key" ON "bank_statements"("userId", "unitId", "sha256");

-- CreateIndex
CREATE INDEX "bank_statement_lines_userId_unitId_statementId_status_idx" ON "bank_statement_lines"("userId", "unitId", "statementId", "status");

-- CreateIndex
CREATE INDEX "bank_statement_lines_userId_unitId_date_idx" ON "bank_statement_lines"("userId", "unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_statementId_lineNumber_key" ON "bank_statement_lines"("statementId", "lineNumber");

-- CreateIndex
CREATE INDEX "reconciliation_matches_userId_unitId_postingId_idx" ON "reconciliation_matches"("userId", "unitId", "postingId");

-- CreateIndex
CREATE INDEX "reconciliation_matches_userId_unitId_statementLineId_idx" ON "reconciliation_matches"("userId", "unitId", "statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_matches_statementLineId_postingId_key" ON "reconciliation_matches"("statementLineId", "postingId");
