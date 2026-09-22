CREATE TYPE "TimeBlockCategory" AS ENUM ('WORK', 'STUDY', 'TRAINING', 'BREAK', 'PERSONAL', 'OTHER');
CREATE TYPE "TimeBlockStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

CREATE TABLE "TimeBlock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Rome',
  "category" "TimeBlockCategory" NOT NULL DEFAULT 'OTHER',
  "status" "TimeBlockStatus" NOT NULL DEFAULT 'PLANNED',
  "recurrence" JSONB,
  "exceptionDates" JSONB,
  "recurrenceParentId" VARCHAR(128),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlannerTemplate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "blocks" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlannerTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TimeSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "timeBlockId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimeSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlannerTemplate_userId_name_key" ON "PlannerTemplate"("userId", "name");
CREATE INDEX "TimeBlock_userId_startsAt_idx" ON "TimeBlock"("userId", "startsAt");
CREATE INDEX "TimeBlock_userId_endsAt_idx" ON "TimeBlock"("userId", "endsAt");
CREATE INDEX "TimeBlock_userId_itemId_idx" ON "TimeBlock"("userId", "itemId");
CREATE INDEX "TimeBlock_userId_recurrenceParentId_idx" ON "TimeBlock"("userId", "recurrenceParentId");
CREATE INDEX "PlannerTemplate_userId_updatedAt_idx" ON "PlannerTemplate"("userId", "updatedAt");
CREATE INDEX "TimeSession_userId_startedAt_idx" ON "TimeSession"("userId", "startedAt");
CREATE INDEX "TimeSession_timeBlockId_endedAt_idx" ON "TimeSession"("timeBlockId", "endedAt");
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlannerTemplate" ADD CONSTRAINT "PlannerTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeSession" ADD CONSTRAINT "TimeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeSession" ADD CONSTRAINT "TimeSession_timeBlockId_fkey" FOREIGN KEY ("timeBlockId") REFERENCES "TimeBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
