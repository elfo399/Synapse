-- Additive hierarchy migration. Existing PARENT links are retained; the oldest
-- one (then its stable id) becomes the navigational parent for each child.
ALTER TABLE "ItemRelation" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "userId", "sourceItemId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS position
  FROM "ItemRelation"
  WHERE "relationType" = 'PARENT'
)
UPDATE "ItemRelation" relation
SET "isPrimary" = true
FROM ranked
WHERE relation.id = ranked.id AND ranked.position = 1;

-- A partial index permits RELATED/REFERENCES links freely and enforces one
-- primary PARENT without removing secondary contexts.
CREATE UNIQUE INDEX "ItemRelation_one_primary_parent_per_source"
  ON "ItemRelation" ("userId", "sourceItemId")
  WHERE "relationType" = 'PARENT' AND "isPrimary" = true;

CREATE INDEX "ItemRelation_userId_sourceItemId_primary_idx"
  ON "ItemRelation" ("userId", "sourceItemId", "isPrimary")
  WHERE "relationType" = 'PARENT';
