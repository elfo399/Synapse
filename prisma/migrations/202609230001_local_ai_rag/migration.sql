CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE "AiConversationMode" ADD VALUE IF NOT EXISTS 'WEB';
ALTER TYPE "AiConversationMode" ADD VALUE IF NOT EXISTS 'COMBINED';

CREATE TYPE "AiEmbeddingJobState" AS ENUM ('PENDING', 'PROCESSING', 'FAILED');

CREATE TABLE "ItemEmbeddingChunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemVersion" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemEmbeddingChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiEmbeddingJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemVersion" INTEGER NOT NULL,
    "state" "AiEmbeddingJobState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiEmbeddingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemEmbeddingChunk_userId_itemId_chunkIndex_key" ON "ItemEmbeddingChunk"("userId", "itemId", "chunkIndex");
CREATE INDEX "ItemEmbeddingChunk_userId_itemId_itemVersion_idx" ON "ItemEmbeddingChunk"("userId", "itemId", "itemVersion");
CREATE UNIQUE INDEX "AiEmbeddingJob_userId_itemId_key" ON "AiEmbeddingJob"("userId", "itemId");
CREATE INDEX "AiEmbeddingJob_state_updatedAt_idx" ON "AiEmbeddingJob"("state", "updatedAt");
CREATE INDEX "ItemEmbeddingChunk_embedding_idx" ON "ItemEmbeddingChunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "ItemEmbeddingChunk" ADD CONSTRAINT "ItemEmbeddingChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemEmbeddingChunk" ADD CONSTRAINT "ItemEmbeddingChunk_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEmbeddingJob" ADD CONSTRAINT "AiEmbeddingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEmbeddingJob" ADD CONSTRAINT "AiEmbeddingJob_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
