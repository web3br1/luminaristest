-- CreateTable
CREATE TABLE "accounting_data_exchange_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "storageKey" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "committedRows" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT NOT NULL,
    "committedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "committedAt" DATETIME
);

-- CreateTable
CREATE TABLE "accounting_data_exchange_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "groupKey" TEXT,
    "rawJson" TEXT NOT NULL,
    "normalizedJson" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "field" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounting_data_exchange_rows_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "accounting_data_exchange_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "accounting_data_exchange_jobs_userId_unitId_createdAt_idx" ON "accounting_data_exchange_jobs"("userId", "unitId", "createdAt");

-- CreateIndex
CREATE INDEX "accounting_data_exchange_rows_userId_unitId_jobId_idx" ON "accounting_data_exchange_rows"("userId", "unitId", "jobId");

-- CreateIndex
CREATE INDEX "accounting_data_exchange_rows_userId_unitId_groupKey_idx" ON "accounting_data_exchange_rows"("userId", "unitId", "groupKey");
