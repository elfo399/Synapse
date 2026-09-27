ALTER TYPE "AiMessageState" ADD VALUE IF NOT EXISTS 'GENERATING';

CREATE TYPE "AiGenerationState" AS ENUM ('QUEUED', 'PLANNING', 'GENERATING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'CANCELED');

CREATE TABLE "AiGeneration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userMessageId" TEXT NOT NULL,
  "assistantMessageId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "options" JSONB NOT NULL,
  "state" "AiGenerationState" NOT NULL DEFAULT 'QUEUED',
  "phase" VARCHAR(40) NOT NULL DEFAULT 'PREPARING',
  "content" TEXT NOT NULL DEFAULT '',
  "sources" JSONB,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "cancelRequestedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiGeneration_userMessageId_key" ON "AiGeneration"("userMessageId");
CREATE UNIQUE INDEX "AiGeneration_assistantMessageId_key" ON "AiGeneration"("assistantMessageId");
CREATE UNIQUE INDEX "AiGeneration_userId_idempotencyKey_key" ON "AiGeneration"("userId", "idempotencyKey");
CREATE INDEX "AiGeneration_state_createdAt_idx" ON "AiGeneration"("state", "createdAt");
CREATE INDEX "AiGeneration_conversationId_state_idx" ON "AiGeneration"("conversationId", "state");
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiGenerationLease" (
  "id" INTEGER NOT NULL,
  "ownerId" VARCHAR(128) NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiGenerationLease_pkey" PRIMARY KEY ("id")
);
INSERT INTO "AiGenerationLease" ("id", "ownerId", "expiresAt", "updatedAt") VALUES (1, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);