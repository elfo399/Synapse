-- Completes retention for installations where TrashOperation was created after
-- the original retention migration. All clauses are idempotent for upgrades.
ALTER TABLE "TrashOperation" ADD COLUMN IF NOT EXISTS "purgeAfter" TIMESTAMP(3);
UPDATE "TrashOperation"
SET "purgeAfter" = GREATEST("deletedAt" + INTERVAL '30 days', CURRENT_TIMESTAMP + INTERVAL '7 days')
WHERE "purgeAfter" IS NULL;
CREATE INDEX IF NOT EXISTS "TrashOperation_purgeAfter_idx" ON "TrashOperation"("purgeAfter") WHERE "purgeAfter" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "TrashOperation_userId_purgeAfter_idx" ON "TrashOperation"("userId", "purgeAfter");