-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "widgetInstanceId" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatInstance" ("createdAt", "id", "title", "updatedAt", "userId", "widgetInstanceId") SELECT "createdAt", "id", "title", "updatedAt", "userId", "widgetInstanceId" FROM "ChatInstance";
DROP TABLE "ChatInstance";
ALTER TABLE "new_ChatInstance" RENAME TO "ChatInstance";
CREATE INDEX "ChatInstance_userId_idx" ON "ChatInstance"("userId");
CREATE INDEX "ChatInstance_type_idx" ON "ChatInstance"("type");
CREATE UNIQUE INDEX "ChatInstance_userId_widgetInstanceId_key" ON "ChatInstance"("userId", "widgetInstanceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
