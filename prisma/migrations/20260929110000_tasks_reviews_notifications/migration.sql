-- Task hierarchy, dependencies, recurrence definitions, weekly reviews and
-- durable in-app reminders. Existing items remain untouched and nullable.
CREATE TYPE "NotificationKind" AS ENUM ('REMINDER', 'WEEKLY_REVIEW', 'FOCUS_LONG_RUNNING');

ALTER TABLE "Item" ADD COLUMN "taskParentId" TEXT;
ALTER TABLE "Item" ADD COLUMN "recurrenceId" TEXT;

CREATE TABLE "TaskDependency" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "blockerTaskId" TEXT NOT NULL,
  "blockedTaskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskRecurrence" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "templateTaskId" TEXT NOT NULL,
  "rule" JSONB NOT NULL,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Rome',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reminder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT,
  "kind" "NotificationKind" NOT NULL DEFAULT 'REMINDER',
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserSettings" ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Rome';
ALTER TABLE "UserSettings" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "browserNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "defaultReminderTime" VARCHAR(5) NOT NULL DEFAULT '09:00';
ALTER TABLE "UserSettings" ADD COLUMN "weeklyReviewDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "UserSettings" ADD COLUMN "weeklyReviewTime" VARCHAR(5) NOT NULL DEFAULT '09:00';
ALTER TABLE "UserSettings" ADD COLUMN "quietHoursStart" VARCHAR(5);
ALTER TABLE "UserSettings" ADD COLUMN "quietHoursEnd" VARCHAR(5);

CREATE UNIQUE INDEX "TaskDependency_userId_blockerTaskId_blockedTaskId_key" ON "TaskDependency"("userId", "blockerTaskId", "blockedTaskId");
CREATE INDEX "TaskDependency_userId_blockedTaskId_idx" ON "TaskDependency"("userId", "blockedTaskId");
CREATE UNIQUE INDEX "TaskRecurrence_templateTaskId_key" ON "TaskRecurrence"("templateTaskId");
CREATE INDEX "TaskRecurrence_userId_active_nextOccurrenceAt_idx" ON "TaskRecurrence"("userId", "active", "nextOccurrenceAt");
CREATE UNIQUE INDEX "WeeklyReview_userId_weekStart_key" ON "WeeklyReview"("userId", "weekStart");
CREATE INDEX "WeeklyReview_userId_completedAt_idx" ON "WeeklyReview"("userId", "completedAt");
CREATE INDEX "Reminder_userId_sentAt_scheduledAt_idx" ON "Reminder"("userId", "sentAt", "scheduledAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt" DESC);
CREATE INDEX "Item_userId_taskParentId_idx" ON "Item"("userId", "taskParentId");
CREATE INDEX "Item_userId_recurrenceId_idx" ON "Item"("userId", "recurrenceId");

ALTER TABLE "Item" ADD CONSTRAINT "Item_taskParentId_fkey" FOREIGN KEY ("taskParentId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockerTaskId_fkey" FOREIGN KEY ("blockerTaskId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedTaskId_fkey" FOREIGN KEY ("blockedTaskId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_templateTaskId_fkey" FOREIGN KEY ("templateTaskId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
