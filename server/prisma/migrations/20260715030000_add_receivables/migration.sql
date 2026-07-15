-- CreateTable
CREATE TABLE "receivables" (
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
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "receivables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "receivables_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "receivable_receipts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "receivedByUserId" TEXT,
    "status" TEXT NOT NULL,
    "entryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "receivable_receipts_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "receivables_userId_unitId_status_idx" ON "receivables"("userId", "unitId", "status");

-- CreateIndex
CREATE INDEX "receivables_userId_unitId_dueDate_idx" ON "receivables"("userId", "unitId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_userId_unitId_customerName_documentNumber_key" ON "receivables"("userId", "unitId", "customerName", "documentNumber");

-- CreateIndex
CREATE INDEX "receivable_receipts_userId_unitId_receivableId_idx" ON "receivable_receipts"("userId", "unitId", "receivableId");

