-- CreateTable
CREATE TABLE "dimension_definitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "dimension_definitions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dimension_values" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "dimension_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "dimension_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dimension_values_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "dimension_values" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "posting_dimensions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "posting_dimensions_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "postings" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "posting_dimensions_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "dimension_values" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "dimension_definitions_userId_unitId_idx" ON "dimension_definitions"("userId", "unitId");

-- CreateIndex
CREATE INDEX "dimension_definitions_deletedAt_idx" ON "dimension_definitions"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "dimension_definitions_userId_unitId_code_key" ON "dimension_definitions"("userId", "unitId", "code");

-- CreateIndex
CREATE INDEX "dimension_values_userId_unitId_definitionId_idx" ON "dimension_values"("userId", "unitId", "definitionId");

-- CreateIndex
CREATE INDEX "dimension_values_parentId_idx" ON "dimension_values"("parentId");

-- CreateIndex
CREATE INDEX "dimension_values_deletedAt_idx" ON "dimension_values"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "dimension_values_userId_unitId_definitionId_code_key" ON "dimension_values"("userId", "unitId", "definitionId", "code");

-- CreateIndex
CREATE INDEX "posting_dimensions_userId_unitId_definitionId_valueId_idx" ON "posting_dimensions"("userId", "unitId", "definitionId", "valueId");

-- CreateIndex
CREATE INDEX "posting_dimensions_postingId_idx" ON "posting_dimensions"("postingId");

-- CreateIndex
CREATE UNIQUE INDEX "posting_dimensions_postingId_definitionId_key" ON "posting_dimensions"("postingId", "definitionId");
