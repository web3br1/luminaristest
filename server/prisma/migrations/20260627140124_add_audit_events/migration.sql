-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeUserId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "eventType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "hashVersion" INTEGER NOT NULL DEFAULT 1,
    "canonicalVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "audit_chain_heads" (
    "scopeUserId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "nextSeq" BIGINT NOT NULL,
    "headHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("scopeUserId", "unitId")
);

-- CreateIndex
CREATE INDEX "audit_events_scopeUserId_unitId_createdAt_idx" ON "audit_events"("scopeUserId", "unitId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_scopeUserId_unitId_targetType_targetId_idx" ON "audit_events"("scopeUserId", "unitId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_createdAt_idx" ON "audit_events"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_eventType_createdAt_idx" ON "audit_events"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_scopeUserId_unitId_seq_key" ON "audit_events"("scopeUserId", "unitId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_scopeUserId_unitId_hash_key" ON "audit_events"("scopeUserId", "unitId", "hash");
