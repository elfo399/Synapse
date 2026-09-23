ALTER TABLE "AiConversation" ADD COLUMN "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiConversation" ADD COLUMN "reasoningEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiMessage" ADD COLUMN "options" JSONB;

-- Existing explicit Web/combined conversations retain their earlier behavior.
UPDATE "AiConversation" SET "webSearchEnabled" = true WHERE "mode" IN ('WEB', 'COMBINED');
