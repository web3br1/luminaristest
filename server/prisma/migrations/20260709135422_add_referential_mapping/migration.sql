-- CreateTable
CREATE TABLE "referential_mappings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "referentialCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mappingVersion" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "referential_mappings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "referential_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "referential_mappings_userId_unitId_mappingVersion_idx" ON "referential_mappings"("userId", "unitId", "mappingVersion");

-- CreateIndex
CREATE UNIQUE INDEX "referential_mappings_userId_unitId_accountId_mappingVersion_key" ON "referential_mappings"("userId", "unitId", "accountId", "mappingVersion");

