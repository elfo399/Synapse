-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('NOTE', 'TASK', 'PROJECT', 'AREA', 'RESOURCE', 'BOOKMARK');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'TODO', 'IN_PROGRESS', 'DONE', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('RELATED', 'PARENT', 'REFERENCES');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ItemType" NOT NULL DEFAULT 'NOTE',
    "title" VARCHAR(200) NOT NULL,
    "titleNormalized" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "inbox" BOOLEAN NOT NULL DEFAULT true,
    "url" VARCHAR(2048),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') ||
      setweight(to_tsvector('simple'::regconfig, coalesce("content", '')), 'B')
    ) STORED,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "normalizedName" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTag" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("itemId","tagId")
);

-- CreateTable
CREATE TABLE "ItemRelation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "targetItemId" TEXT NOT NULL,
    "relationType" "RelationType" NOT NULL DEFAULT 'RELATED',
    "manual" BOOLEAN NOT NULL DEFAULT true,
    "wikilink" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiReference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "titleNormalized" VARCHAR(200) NOT NULL,

    CONSTRAINT "WikiReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE INDEX "Item_userId_archivedAt_updatedAt_idx" ON "Item"("userId", "archivedAt", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Item_userId_type_archivedAt_status_idx" ON "Item"("userId", "type", "archivedAt", "status");

-- CreateIndex
CREATE INDEX "Item_userId_inbox_archivedAt_idx" ON "Item"("userId", "inbox", "archivedAt");

-- CreateIndex
CREATE INDEX "Item_userId_dueAt_idx" ON "Item"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Item_userId_id_key" ON "Item"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Item_userId_titleNormalized_key" ON "Item"("userId", "titleNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_id_key" ON "Tag"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_normalizedName_key" ON "Tag"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "ItemTag_userId_tagId_idx" ON "ItemTag"("userId", "tagId");

-- CreateIndex
CREATE INDEX "ItemRelation_userId_sourceItemId_idx" ON "ItemRelation"("userId", "sourceItemId");

-- CreateIndex
CREATE INDEX "ItemRelation_userId_targetItemId_idx" ON "ItemRelation"("userId", "targetItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemRelation_userId_sourceItemId_targetItemId_relationType_key" ON "ItemRelation"("userId", "sourceItemId", "targetItemId", "relationType");

-- CreateIndex
CREATE INDEX "WikiReference_userId_titleNormalized_idx" ON "WikiReference"("userId", "titleNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "WikiReference_sourceItemId_titleNormalized_key" ON "WikiReference"("sourceItemId", "titleNormalized");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_userId_tagId_fkey" FOREIGN KEY ("userId", "tagId") REFERENCES "Tag"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_userId_sourceItemId_fkey" FOREIGN KEY ("userId", "sourceItemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_userId_targetItemId_fkey" FOREIGN KEY ("userId", "targetItemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiReference" ADD CONSTRAINT "WikiReference_userId_sourceItemId_fkey" FOREIGN KEY ("userId", "sourceItemId") REFERENCES "Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Item_searchVector_idx" ON "Item" USING GIN ("searchVector");
CREATE INDEX "Tag_search_idx" ON "Tag" USING GIN (to_tsvector('simple'::regconfig, "name"));
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_no_self_link" CHECK ("sourceItemId" <> "targetItemId");
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_has_provenance" CHECK ("manual" OR "wikilink");
ALTER TABLE "ItemRelation" ADD CONSTRAINT "ItemRelation_wikilink_references" CHECK (NOT "wikilink" OR "relationType" = 'REFERENCES');
ALTER TABLE "Item" ADD CONSTRAINT "Item_nonempty_title" CHECK (length(trim("title")) > 0);
ALTER TABLE "Item" ADD CONSTRAINT "Item_positive_version" CHECK ("version" > 0);
