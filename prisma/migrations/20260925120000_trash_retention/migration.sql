ALTER TABLE "TrashOperation" ADD COLUMN "purgeAfter" TIMESTAMP(3);
UPDATE "TrashOperation"
SET "purgeAfter" = GREATEST("deletedAt" + INTERVAL '30 days', CURRENT_TIMESTAMP + INTERVAL '7 days')
WHERE "purgeAfter" IS NULL;
CREATE INDEX "TrashOperation_userId_purgeAfter_idx" ON "TrashOperation"("userId", "purgeAfter");
