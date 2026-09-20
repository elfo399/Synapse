import { Prisma } from "@prisma/client";
import { z } from "../lib/validation";
import { prisma } from "@/lib/db";
import { ITEM_TYPES, RELATION_TYPES } from "@/domain/types";
import type { GraphData } from "@/domain/graph";
import { HttpError } from "./errors";

export const graphQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  tag: z.string().max(40).optional(),
  archive: z.enum(["active", "archived", "all"]).default("active"),
  parent: z.string().max(100).optional(),
  focus: z.string().max(100).optional(),
  depth: z.coerce.number().int().min(1).max(3).default(1),
  relation: z.enum(RELATION_TYPES).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1500).default(500),
});

export async function getGraph(
  userId: string,
  input: unknown,
): Promise<GraphData> {
  const query = graphQuerySchema.parse(input);
  if (
    query.focus &&
    !(await prisma.item.findFirst({
      where: { id: query.focus, userId },
      select: { id: true },
    }))
  ) {
    throw new HttpError(404, "Elemento non trovato.");
  }
  const filters: Prisma.ItemWhereInput[] = [];
  if (query.parent)
    filters.push({
      OR: [
        { id: query.parent },
        {
          outgoing: {
            some: { relationType: "PARENT", targetItemId: query.parent },
          },
        },
      ],
    });
  let traversalTruncated = false;
  if (query.focus) {
    // Breadth-first traversal follows both directions without duplicating backlink
    // edges. Bound intermediate work as well as the final browser response.
    const reached = new Set([query.focus]);
    let frontier = [query.focus];
    for (let level = 0; level < query.depth && frontier.length > 0; level++) {
      const links = await prisma.itemRelation.findMany({
        where: {
          userId,
          OR: [
            { sourceItemId: { in: frontier } },
            { targetItemId: { in: frontier } },
          ],
          ...(query.relation && { relationType: query.relation }),
        },
        select: { sourceItemId: true, targetItemId: true },
        orderBy: { id: "asc" },
        take: 5001,
      });
      if (links.length > 5000) traversalTruncated = true;
      const next = new Set<string>();
      for (const edge of links.slice(0, 5000)) {
        for (const id of [edge.sourceItemId, edge.targetItemId]) {
          if (reached.has(id)) continue;
          if (reached.size >= 5000) {
            traversalTruncated = true;
            break;
          }
          reached.add(id);
          next.add(id);
        }
      }
      frontier = [...next];
    }
    filters.push({ id: { in: [...reached] } });
  }
  const where: Prisma.ItemWhereInput = {
    userId,
    ...(query.type && { type: query.type }),
    ...(query.archive !== "all" && {
      archivedAt: query.archive === "archived" ? { not: null } : null,
    }),
    ...(query.tag && {
      tags: {
        some: {
          tag: {
            normalizedName: query.tag.normalize("NFKC").trim().toLowerCase(),
          },
        },
      },
    }),
    ...(query.q && { title: { contains: query.q, mode: "insensitive" } }),
    AND: filters,
  };
  const [items, total] = await prisma.$transaction(
    [
      prisma.item.findMany({
        where,
        select: {
          id: true,
          title: true,
          type: true,
          archivedAt: true,
          tags: { select: { tag: { select: { id: true, name: true } } } },
          _count: { select: { outgoing: true, incoming: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: query.limit,
      }),
      prisma.item.count({ where }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const ids = items.map((item) => item.id);
  const edges = await prisma.itemRelation.findMany({
    where: {
      userId,
      sourceItemId: { in: ids },
      targetItemId: { in: ids },
      ...(query.relation && { relationType: query.relation }),
    },
    select: {
      id: true,
      sourceItemId: true,
      targetItemId: true,
      relationType: true,
    },
    orderBy: { id: "asc" },
    take: 5001,
  });
  return {
    nodes: items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      archivedAt: item.archivedAt?.toISOString() ?? null,
      tags: item.tags.map((join) => join.tag),
      connections: item._count.incoming + item._count.outgoing,
    })),
    edges: edges
      .slice(0, 5000)
      .map((edge) => ({
        id: edge.id,
        source: edge.sourceItemId,
        target: edge.targetItemId,
        type: edge.relationType,
      })),
    total,
    limit: query.limit,
    truncated:
      traversalTruncated || total > items.length || edges.length > 5000,
  };
}
