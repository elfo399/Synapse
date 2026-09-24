-- Persist the project currently discussed in each AI conversation.
ALTER TABLE "AiConversation" ADD COLUMN "activeProjectId" TEXT;
CREATE INDEX "AiConversation_userId_activeProjectId_idx" ON "AiConversation"("userId", "activeProjectId");