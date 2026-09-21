import type { Prisma } from "@prisma/client";
import type { ItemRelation, ItemSummary } from "../domain/types";

export const itemInclude = {
  tags: { include: { tag: true } },
  attachments: { orderBy: { createdAt: "asc" } },
  _count: { select: { outgoing: true, incoming: true } },
} satisfies Prisma.ItemInclude;
export const relationInclude = {
  source: {
    select: {
      id: true,
      title: true,
      type: true,
      archivedAt: true,
      status: true,
      dueAt: true,
    },
  },
  target: {
    select: {
      id: true,
      title: true,
      type: true,
      archivedAt: true,
      status: true,
      dueAt: true,
    },
  },
} satisfies Prisma.ItemRelationInclude;

type StoredItem = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;
type StoredRelation = Prisma.ItemRelationGetPayload<{
  include: typeof relationInclude;
}>;

export function serializeItem(item: StoredItem): ItemSummary {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    status: item.status,
    inbox: item.inbox,
    url: item.url,
    dueAt: item.dueAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    archivedAt: item.archivedAt?.toISOString() ?? null,
    version: item.version,
    tags: item.tags.map(({ tag }) => ({ id: tag.id, name: tag.name })),
    _count: item._count,
    attachments: item.attachments.map((file) => ({
      id: file.id,
      itemId: file.itemId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      duration: file.duration,
      createdAt: file.createdAt.toISOString(),
    })),
  };
}

export function serializeRelation(relation: StoredRelation): ItemRelation {
  return {
    id: relation.id,
    sourceItemId: relation.sourceItemId,
    targetItemId: relation.targetItemId,
    relationType: relation.relationType,
    manual: relation.manual,
    wikilink: relation.wikilink,
    source: {
      ...relation.source,
      archivedAt: relation.source.archivedAt?.toISOString() ?? null,
      dueAt: relation.source.dueAt?.toISOString() ?? null,
    },
    target: {
      ...relation.target,
      archivedAt: relation.target.archivedAt?.toISOString() ?? null,
      dueAt: relation.target.dueAt?.toISOString() ?? null,
    },
  };
}
