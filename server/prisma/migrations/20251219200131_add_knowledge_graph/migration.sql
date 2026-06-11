-- CreateTable
CREATE TABLE "knowledge_graphs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "knowledge_graphs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_graphs_userId_key" ON "knowledge_graphs"("userId");

-- CreateIndex
CREATE INDEX "knowledge_graphs_userId_idx" ON "knowledge_graphs"("userId");
