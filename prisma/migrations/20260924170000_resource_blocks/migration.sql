CREATE TYPE "ResourceBlockType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'FILE', 'LINK');

CREATE TABLE "ResourceBlock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "type" "ResourceBlockType" NOT NULL,
  "position" INTEGER NOT NULL,
  "text" TEXT,
  "url" VARCHAR(2048),
  "attachmentId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResourceBlock_userId_resourceId_position_idx" ON "ResourceBlock"("userId", "resourceId", "position");
CREATE INDEX "ResourceBlock_attachmentId_idx" ON "ResourceBlock"("attachmentId");
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_userId_resourceId_fkey" FOREIGN KEY ("userId", "resourceId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceBlock" ADD CONSTRAINT "ResourceBlock_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing resource text and files are retained in ordered blocks. Legacy NOTE
-- and BOOKMARK rows remain valid during the compatibility release.
INSERT INTO "ResourceBlock" ("id", "userId", "resourceId", "type", "position", "text", "createdAt", "updatedAt")
SELECT 'legacy-text-' || "id", "userId", "id", 'TEXT', 0, "content", "createdAt", "updatedAt"
FROM "Item" WHERE "type" = 'RESOURCE' AND length(trim("content")) > 0;

INSERT INTO "ResourceBlock" ("id", "userId", "resourceId", "type", "position", "text", "createdAt", "updatedAt")
SELECT 'migrated-note-' || "id", "userId", "id", 'TEXT', 0, "content", "createdAt", "updatedAt"
FROM "Item" WHERE "type" = 'NOTE';

INSERT INTO "ResourceBlock" ("id", "userId", "resourceId", "type", "position", "url", "createdAt", "updatedAt")
SELECT 'migrated-link-' || "id", "userId", "id", 'LINK', 0, "url", "createdAt", "updatedAt"
FROM "Item" WHERE "type" = 'BOOKMARK' AND "url" IS NOT NULL;

INSERT INTO "ResourceBlock" ("id", "userId", "resourceId", "type", "position", "attachmentId", "createdAt", "updatedAt")
SELECT 'legacy-file-' || a."id", a."userId", a."itemId",
  CASE WHEN a."mimeType" LIKE 'image/%' THEN 'IMAGE'::"ResourceBlockType" WHEN a."mimeType" LIKE 'audio/%' THEN 'AUDIO'::"ResourceBlockType" ELSE 'FILE'::"ResourceBlockType" END,
  1000 + row_number() OVER (PARTITION BY a."itemId" ORDER BY a."createdAt")::int,
  a."id", a."createdAt", a."createdAt"
FROM "Attachment" a JOIN "Item" i ON i."id" = a."itemId" AND i."userId" = a."userId" WHERE i."type" IN ('RESOURCE', 'NOTE', 'BOOKMARK');

UPDATE "Item" SET "type" = 'RESOURCE' WHERE "type" IN ('NOTE', 'BOOKMARK');
