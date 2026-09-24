-- The first compatibility migration may already have converted legacy notes
-- before this release adds attachment blocks. Add only files that are not
-- represented yet, so both fresh and upgraded installations stay idempotent.
INSERT INTO "ResourceBlock" ("id", "userId", "resourceId", "type", "position", "attachmentId", "createdAt", "updatedAt")
SELECT 'legacy-file-' || a."id", a."userId", a."itemId",
  CASE WHEN a."mimeType" LIKE 'image/%' THEN 'IMAGE'::"ResourceBlockType" WHEN a."mimeType" LIKE 'audio/%' THEN 'AUDIO'::"ResourceBlockType" ELSE 'FILE'::"ResourceBlockType" END,
  COALESCE((SELECT MAX(b."position") FROM "ResourceBlock" b WHERE b."userId" = a."userId" AND b."resourceId" = a."itemId"), -1)
    + row_number() OVER (PARTITION BY a."itemId" ORDER BY a."createdAt")::int,
  a."id", a."createdAt", a."createdAt"
FROM "Attachment" a
JOIN "Item" i ON i."id" = a."itemId" AND i."userId" = a."userId"
WHERE i."type" = 'RESOURCE'
  AND NOT EXISTS (SELECT 1 FROM "ResourceBlock" b WHERE b."attachmentId" = a."id");
