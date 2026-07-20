-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "description" TEXT,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "totalValueCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "inventory_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "valueCentsDelta" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
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
    "expenseAccountId" TEXT,
    "inventoryProductRef" TEXT,
    "inventoryQty" INTEGER,
    "counterpartyId" TEXT,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "payables_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payables_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payables_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_payables" ("amountCents", "cancelReason", "cancelledById", "counterpartyId", "createdAt", "createdById", "deletedAt", "description", "documentNumber", "dueDate", "expenseAccountId", "id", "issueDate", "status", "supplierName", "supplierRef", "unitId", "updatedAt", "userId") SELECT "amountCents", "cancelReason", "cancelledById", "counterpartyId", "createdAt", "createdById", "deletedAt", "description", "documentNumber", "dueDate", "expenseAccountId", "id", "issueDate", "status", "supplierName", "supplierRef", "unitId", "updatedAt", "userId" FROM "payables";
DROP TABLE "payables";
ALTER TABLE "new_payables" RENAME TO "payables";
CREATE INDEX "payables_userId_unitId_status_idx" ON "payables"("userId", "unitId", "status");
CREATE INDEX "payables_userId_unitId_dueDate_idx" ON "payables"("userId", "unitId", "dueDate");
CREATE UNIQUE INDEX "payables_userId_unitId_supplierName_documentNumber_key" ON "payables"("userId", "unitId", "supplierName", "documentNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "inventory_items_userId_unitId_status_idx" ON "inventory_items"("userId", "unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_userId_unitId_productRef_key" ON "inventory_items"("userId", "unitId", "productRef");

-- CreateIndex
CREATE INDEX "stock_movements_inventoryItemId_occurredAt_idx" ON "stock_movements"("inventoryItemId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_inventoryItemId_kind_sourceType_sourceId_key" ON "stock_movements"("inventoryItemId", "kind", "sourceType", "sourceId");
