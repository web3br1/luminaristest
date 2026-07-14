-- CreateTable
CREATE TABLE "payables" (
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
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "payables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payables_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payable_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "paidByUserId" TEXT,
    "status" TEXT NOT NULL,
    "entryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payable_payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "payables_userId_unitId_status_idx" ON "payables"("userId", "unitId", "status");

-- CreateIndex
CREATE INDEX "payables_userId_unitId_dueDate_idx" ON "payables"("userId", "unitId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payables_userId_unitId_supplierName_documentNumber_key" ON "payables"("userId", "unitId", "supplierName", "documentNumber");

-- CreateIndex
CREATE INDEX "payable_payments_userId_unitId_payableId_idx" ON "payable_payments"("userId", "unitId", "payableId");
