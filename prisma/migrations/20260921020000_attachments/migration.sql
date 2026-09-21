CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "originalName" VARCHAR(200) NOT NULL,
  "storageKey" VARCHAR(64) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" > 0),
  "sha256" VARCHAR(64) NOT NULL,
  "duration" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Attachment_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_userId_itemId_createdAt_idx" ON "Attachment"("userId", "itemId", "createdAt");
CREATE TABLE "AttachmentDeletion" (
  "storageKey" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttachmentDeletion_pkey" PRIMARY KEY ("storageKey")
);
