CREATE TABLE "PlannerCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "color" VARCHAR(7) NOT NULL,
  "icon" VARCHAR(40),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlannerCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TimeBlock" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "TimeBlock" ADD COLUMN "categoryColor" VARCHAR(7);

INSERT INTO "PlannerCategory" ("id", "userId", "name", "color", "icon", "sortOrder", "updatedAt")
SELECT
  'pc_' || md5(u."id" || defaults.legacy), u."id", defaults.name, defaults.color, defaults.icon, defaults."sortOrder", CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (VALUES
  ('WORK', 'Lavoro', '#8FA9FF', 'briefcase', 0),
  ('STUDY', 'Studio', '#B59BE8', 'book-open', 1),
  ('TRAINING', 'Allenamento', '#8DCAA5', 'dumbbell', 2),
  ('BREAK', 'Pausa', '#D8BA78', 'coffee', 3),
  ('PERSONAL', 'Personale', '#E09AB9', 'heart', 4),
  ('OTHER', 'Altro', '#9DA5B2', 'circle', 5)
) AS defaults(legacy, name, color, icon, "sortOrder");

UPDATE "TimeBlock" AS block
SET "categoryId" = category."id", "categoryColor" = category."color"
FROM "PlannerCategory" AS category
WHERE category."userId" = block."userId"
  AND category."name" = CASE block."category"::text
    WHEN 'WORK' THEN 'Lavoro' WHEN 'STUDY' THEN 'Studio' WHEN 'TRAINING' THEN 'Allenamento'
    WHEN 'BREAK' THEN 'Pausa' WHEN 'PERSONAL' THEN 'Personale' ELSE 'Altro' END;

ALTER TABLE "TimeBlock" ALTER COLUMN "categoryId" SET NOT NULL;
CREATE UNIQUE INDEX "PlannerCategory_userId_name_key" ON "PlannerCategory"("userId", "name");
CREATE INDEX "PlannerCategory_userId_archivedAt_sortOrder_idx" ON "PlannerCategory"("userId", "archivedAt", "sortOrder");
CREATE INDEX "TimeBlock_userId_categoryId_idx" ON "TimeBlock"("userId", "categoryId");
ALTER TABLE "PlannerCategory" ADD CONSTRAINT "PlannerCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PlannerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
