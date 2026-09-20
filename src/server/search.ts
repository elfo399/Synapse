import { Prisma } from "@prisma/client";
import { z } from "../lib/validation";
import { prisma } from "@/lib/db";
import { ITEM_TYPES } from "@/domain/types";

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  type: z.enum(ITEM_TYPES).optional(),
  tag: z.string().max(40).optional(),
  archive: z.enum(["active", "archived", "all"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function searchItems(userId: string, input: unknown) {
  const query = searchQuerySchema.parse(input);
  if (!query.q) return { items: [], total: 0, page: query.page, pageSize: query.limit };
  // Parameters are bound by Prisma; no user text is interpolated into SQL syntax.
  const term = /^[\p{L}\p{N}_]+$/u.test(query.q)
    ? Prisma.sql`to_tsquery('simple', ${query.q + ":*"})`
    : Prisma.sql`websearch_to_tsquery('simple', ${query.q})`;
  const filters = [Prisma.sql`i."userId" = ${userId}`];
  if (query.type) filters.push(Prisma.sql`i.type::text = ${query.type}`);
  if (query.archive === "active") filters.push(Prisma.sql`i."archivedAt" IS NULL`);
  if (query.archive === "archived") filters.push(Prisma.sql`i."archivedAt" IS NOT NULL`);
  if (query.tag) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "ItemTag" it JOIN "Tag" t ON t.id = it."tagId" WHERE it."itemId" = i.id AND it."userId" = ${userId} AND t."normalizedName" = ${query.tag.normalize("NFKC").trim().toLowerCase()})`);
  const matches = Prisma.sql`(i."searchVector" @@ ${term} OR EXISTS (SELECT 1 FROM "ItemTag" it JOIN "Tag" t ON t.id = it."tagId" WHERE it."itemId" = i.id AND it."userId" = ${userId} AND to_tsvector('simple', t."name") @@ ${term}))`;
  const where = Prisma.sql`${Prisma.join(filters, " AND ")} AND ${matches}`;
  const [hits, count] = await prisma.$transaction([
    prisma.$queryRaw<{ id: string; snippet: string }[]>(Prisma.sql`
      SELECT i.id, ts_headline('simple', left(i.content, 100000), ${term}, 'StartSel=,StopSel=,MaxWords=35,MinWords=12,MaxFragments=1') AS snippet
      FROM "Item" i WHERE ${where}
      ORDER BY (CASE WHEN i."titleNormalized" = ${query.q.normalize("NFKC").toLowerCase()} THEN 10 ELSE 0 END + ts_rank_cd(i."searchVector", ${term})) DESC, i."updatedAt" DESC, i.id
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
    prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "Item" i WHERE ${where}`),
  ], { isolationLevel: "RepeatableRead" });
  const items = await prisma.item.findMany({ where: { userId, id: { in: hits.map(hit => hit.id) } }, include: { tags: { include: { tag: true } } } });
  const byId = new Map(items.map(item => [item.id, item]));
  return {
    items: hits.flatMap(hit => {
      const item = byId.get(hit.id);
      if (!item) return [];
      return [{ id: item.id, title: item.title, type: item.type, status: item.status, inbox: item.inbox, content: hit.snippet, snippet: hit.snippet,
        url: item.url, dueAt: item.dueAt?.toISOString() ?? null, completedAt: item.completedAt?.toISOString() ?? null, archivedAt: item.archivedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), version: item.version,
        tags: item.tags.map(join => ({ id: join.tag.id, name: join.tag.name })),
      }];
    }),
    total: Number(count[0]?.total ?? 0), page: query.page, pageSize: query.limit,
  };
}
