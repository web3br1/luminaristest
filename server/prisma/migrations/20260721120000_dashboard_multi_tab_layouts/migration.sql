-- Multi-tab dashboards (fork feature/back-end): DashboardLayout goes 1-per-user -> N-per-user.
-- userId loses UNIQUE, gains index; new columns `name` (tab label) and `isActive`.
-- Backfill: each existing single layout becomes the user's active tab named 'Dashboard'.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DashboardLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "layoutData" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DashboardLayout" ("createdAt", "id", "layoutData", "updatedAt", "userId", "name", "isActive")
SELECT "createdAt", "id", "layoutData", "updatedAt", "userId", 'Dashboard', 1 FROM "DashboardLayout";
DROP TABLE "DashboardLayout";
ALTER TABLE "new_DashboardLayout" RENAME TO "DashboardLayout";
CREATE INDEX "DashboardLayout_userId_idx" ON "DashboardLayout"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
