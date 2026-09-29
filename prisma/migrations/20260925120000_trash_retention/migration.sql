-- On a fresh database TrashOperation is introduced by a later migration.
-- Existing installations which already have it retain their configured dates.
DO $$
BEGIN
  IF to_regclass('public."TrashOperation"') IS NOT NULL THEN
    ALTER TABLE "TrashOperation" ADD COLUMN IF NOT EXISTS "purgeAfter" TIMESTAMP(3);
    UPDATE "TrashOperation"
    SET "purgeAfter" = GREATEST("deletedAt" + INTERVAL '30 days', CURRENT_TIMESTAMP + INTERVAL '7 days')
    WHERE "purgeAfter" IS NULL;
    CREATE INDEX IF NOT EXISTS "TrashOperation_userId_purgeAfter_idx" ON "TrashOperation"("userId", "purgeAfter");
  END IF;
END $$;