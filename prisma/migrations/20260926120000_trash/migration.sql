ALTER TABLE "Item" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "trashOperationId" TEXT;

CREATE TABLE "TrashOperation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rootItemId" TEXT NOT NULL,
  "includeContained" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrashOperation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TrashOperation" ADD CONSTRAINT "TrashOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_trashOperationId_fkey" FOREIGN KEY ("trashOperationId") REFERENCES "TrashOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Item_userId_deletedAt_updatedAt_idx" ON "Item"("userId", "deletedAt", "updatedAt" DESC);
CREATE INDEX "Item_userId_trashOperationId_idx" ON "Item"("userId", "trashOperationId");
CREATE INDEX "TrashOperation_userId_deletedAt_idx" ON "TrashOperation"("userId", "deletedAt" DESC);
CREATE INDEX "TrashOperation_userId_rootItemId_idx" ON "TrashOperation"("userId", "rootItemId");

-- Trashed records retain their original title; only active records must be unique.
DROP INDEX "Item_userId_titleNormalized_key";
CREATE UNIQUE INDEX "Item_userId_titleNormalized_active_key" ON "Item"("userId", "titleNormalized") WHERE "deletedAt" IS NULL;
