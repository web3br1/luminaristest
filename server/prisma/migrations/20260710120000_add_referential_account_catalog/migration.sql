-- CreateTable
CREATE TABLE "referential_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layoutVersion" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isAnalytic" BOOLEAN NOT NULL,
    "parentCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "referential_accounts_layoutVersion_isAnalytic_idx" ON "referential_accounts"("layoutVersion", "isAnalytic");

-- CreateIndex
CREATE UNIQUE INDEX "referential_accounts_layoutVersion_code_key" ON "referential_accounts"("layoutVersion", "code");
