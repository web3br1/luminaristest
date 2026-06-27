-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN "createdById" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN "postedById" TEXT;

-- AlterTable
ALTER TABLE "postings" ADD COLUMN "updatedAt" DATETIME;

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FUTURE',
    "openedAt" DATETIME,
    "openedById" TEXT,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "accounting_period_transitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounting_period_transitions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "accounting_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "accounting_periods_userId_unitId_status_idx" ON "accounting_periods"("userId", "unitId", "status");

-- CreateIndex
CREATE INDEX "accounting_periods_userId_unitId_year_idx" ON "accounting_periods"("userId", "unitId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_userId_unitId_year_month_key" ON "accounting_periods"("userId", "unitId", "year", "month");

-- CreateIndex
CREATE INDEX "accounting_period_transitions_userId_unitId_periodId_idx" ON "accounting_period_transitions"("userId", "unitId", "periodId");

-- CreateIndex
CREATE INDEX "accounting_period_transitions_actorUserId_occurredAt_idx" ON "accounting_period_transitions"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "accounts_deletedAt_idx" ON "accounts"("deletedAt");
