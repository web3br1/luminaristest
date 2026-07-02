-- CreateTable
CREATE TABLE "customer_package_balances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "customer_package_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "package_balance_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "deltaCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "package_balance_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "customer_package_balances_userId_unitId_idx" ON "customer_package_balances"("userId", "unitId");

-- CreateIndex
CREATE INDEX "customer_package_balances_deletedAt_idx" ON "customer_package_balances"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_package_balances_userId_unitId_customerId_packageId_key" ON "customer_package_balances"("userId", "unitId", "customerId", "packageId");

-- CreateIndex
CREATE INDEX "package_balance_movements_userId_unitId_customerId_packageId_idx" ON "package_balance_movements"("userId", "unitId", "customerId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "package_balance_movements_userId_unitId_saleId_kind_key" ON "package_balance_movements"("userId", "unitId", "saleId", "kind");

