-- CreateTable
CREATE TABLE "access_roles" (
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
    CONSTRAINT "access_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "access_role_permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "access_role_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "access_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "access_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "access_roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "access_roles_userId_unitId_idx" ON "access_roles"("userId", "unitId");

-- CreateIndex
CREATE INDEX "access_roles_deletedAt_idx" ON "access_roles"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "access_roles_userId_unitId_code_key" ON "access_roles"("userId", "unitId", "code");

-- CreateIndex
CREATE INDEX "access_role_permissions_roleId_idx" ON "access_role_permissions"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "access_role_permissions_roleId_permissionKey_key" ON "access_role_permissions"("roleId", "permissionKey");

-- CreateIndex
CREATE INDEX "access_role_assignments_userId_unitId_subjectUserId_idx" ON "access_role_assignments"("userId", "unitId", "subjectUserId");

-- CreateIndex
CREATE INDEX "access_role_assignments_roleId_idx" ON "access_role_assignments"("roleId");

-- CreateIndex
CREATE INDEX "access_role_assignments_deletedAt_idx" ON "access_role_assignments"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "access_role_assignments_userId_unitId_subjectUserId_roleId_key" ON "access_role_assignments"("userId", "unitId", "subjectUserId", "roleId");
