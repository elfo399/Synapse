ALTER TABLE "Item" ADD COLUMN "itemKey" VARCHAR(32);

CREATE TABLE "UserSettings" (
  "userId" TEXT NOT NULL,
  "trashRetentionDays" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserItemCounter" (
  "userId" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserItemCounter_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserItemCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ItemRevision" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "comment" VARCHAR(500),
  "restoredFromRevisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ItemRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemRevision_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FocusState" (
  "userId" TEXT NOT NULL,
  "timeBlockId" TEXT NOT NULL,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "FocusState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FocusState_timeBlockId_fkey" FOREIGN KEY ("timeBlockId") REFERENCES "TimeBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

WITH ranked AS (
  SELECT "id", "userId", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id")::int AS n
  FROM "Item"
)
UPDATE "Item" item SET "itemKey" = 'SYN-' || ranked.n FROM ranked WHERE item."id" = ranked."id";

INSERT INTO "UserItemCounter" ("userId", "nextNumber")
SELECT "userId", COALESCE(MAX((substring("itemKey" from 5))::int), 0) + 1 FROM "Item" GROUP BY "userId"
ON CONFLICT ("userId") DO UPDATE SET "nextNumber" = EXCLUDED."nextNumber";

INSERT INTO "UserSettings" ("userId") SELECT "id" FROM "User" ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "Item" ADD CONSTRAINT "Item_userId_itemKey_key" UNIQUE ("userId", "itemKey");
CREATE UNIQUE INDEX "ItemRevision_itemId_revisionNumber_key" ON "ItemRevision"("itemId", "revisionNumber");
CREATE INDEX "ItemRevision_userId_itemId_createdAt_idx" ON "ItemRevision"("userId", "itemId", "createdAt" DESC);
CREATE INDEX "FocusState_timeBlockId_idx" ON "FocusState"("timeBlockId");
