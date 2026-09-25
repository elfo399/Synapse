-- A note is now a resource. The update keeps every Item primary key and all
-- dependent rows intact; foreign keys preserve relations, planner links, blocks,
-- attachments and embeddings. Converted items are re-indexed asynchronously.
WITH converted AS (
  UPDATE "Item"
  SET "type" = 'RESOURCE'
  WHERE "type" = 'NOTE'
  RETURNING "userId", "id", "version"
)
INSERT INTO "AiEmbeddingJob" ("id", "userId", "itemId", "itemVersion", "state", "attempts", "createdAt", "updatedAt")
SELECT concat('note-to-resource-', "id"), "userId", "id", "version", 'PENDING', 0, now(), now()
FROM converted
ON CONFLICT ("userId", "itemId") DO UPDATE
SET "itemVersion" = EXCLUDED."itemVersion", "state" = 'PENDING', "attempts" = 0, "lastError" = NULL, "updatedAt" = now();

ALTER TABLE "Item" ALTER COLUMN "type" DROP DEFAULT;
CREATE TYPE "ItemType_new" AS ENUM ('TASK', 'PROJECT', 'AREA', 'RESOURCE', 'BOOKMARK');
ALTER TABLE "Item" ALTER COLUMN "type" TYPE "ItemType_new" USING ("type"::text::"ItemType_new");
DROP TYPE "ItemType";
ALTER TYPE "ItemType_new" RENAME TO "ItemType";
ALTER TABLE "Item" ALTER COLUMN "type" SET DEFAULT 'RESOURCE';
