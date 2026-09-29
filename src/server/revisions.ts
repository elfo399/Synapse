import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeIdentity } from "@/domain/normalization";
import { queueItemEmbedding } from "./ai-index";
import { HttpError } from "./errors";
import { syncWikiLinks } from "./wikilinks";

export type RevisionSnapshot = {
  title: string;
  content: string;
  type: string;
  status: string;
  inbox: boolean;
  url: string | null;
  dueAt: string | null;
  archivedAt: string | null;
  tags: string[];
  blocks: Array<{
    id: string;
    type: string;
    position: number;
    text: string | null;
    url: string | null;
    attachment: { id: string; originalName: string; mimeType: string; size: number } | null;
  }>;
};

async function snapshot(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  itemId: string,
): Promise<RevisionSnapshot> {
  const item = await tx.item.findFirst({
    where: { userId, id: itemId },
    include: {
      tags: { include: { tag: { select: { name: true } } } },
      resourceBlocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { attachment: { select: { id: true, originalName: true, mimeType: true, size: true } } },
      },
    },
  });
  if (!item) throw new HttpError(404, "Elemento non trovato.");
  return {
    title: item.title,
    content: item.content,
    type: item.type,
    status: item.status,
    inbox: item.inbox,
    url: item.url,
    dueAt: item.dueAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    tags: item.tags.map(({ tag }) => tag.name),
    blocks: item.resourceBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      position: block.position,
      text: block.text,
      url: block.url,
      attachment: block.attachment,
    })),
  };
}

export async function createItemRevision(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  itemId: string,
  options: { comment?: string | null; restoredFromRevisionId?: string | null } = {},
) {
  const next = await tx.itemRevision.aggregate({
    where: { userId, itemId },
    _max: { revisionNumber: true },
  });
  const data = await snapshot(tx, userId, itemId);
  const previous = await tx.itemRevision.findFirst({
    where: { userId, itemId }, orderBy: { revisionNumber: "desc" }, select: { snapshot: true },
  });
  if (previous && JSON.stringify(previous.snapshot) === JSON.stringify(data)) return null;
  return tx.itemRevision.create({
    data: {
      userId,
      itemId,
      revisionNumber: (next._max.revisionNumber ?? 0) + 1,
      snapshot: data as unknown as Prisma.InputJsonValue,
      comment: options.comment?.trim() || null,
      restoredFromRevisionId: options.restoredFromRevisionId ?? null,
    },
    select: { id: true, revisionNumber: true, createdAt: true },
  });
}

export async function ensureInitialRevision(userId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    await ensureInitialRevisionInTransaction(tx, userId, itemId);
  });
}

export async function ensureInitialRevisionInTransaction(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  itemId: string,
) {
  const exists = await tx.itemRevision.count({ where: { userId, itemId } });
  if (!exists) await createItemRevision(tx, userId, itemId, { comment: "Stato iniziale" });
}

export async function listItemRevisions(userId: string, itemId: string, page = 1, limit = 20) {
  await ensureInitialRevision(userId, itemId);
  const [revisions, total] = await prisma.$transaction([
    prisma.itemRevision.findMany({
      where: { userId, itemId },
      orderBy: { revisionNumber: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, revisionNumber: true, comment: true, restoredFromRevisionId: true, createdAt: true, snapshot: true },
    }),
    prisma.itemRevision.count({ where: { userId, itemId } }),
  ]);
  return {
    revisions: revisions.map((revision) => ({ ...revision, createdAt: revision.createdAt.toISOString(), snapshot: revision.snapshot as unknown as RevisionSnapshot })),
    total,
    page,
    pageSize: limit,
  };
}

export async function restoreItemRevision(userId: string, itemId: string, revisionId: string, version: number) {
  const { withUserTransaction } = await import("./transactions");
  return withUserTransaction(userId, async (tx) => {
    const [item, revision] = await Promise.all([
      tx.item.findFirst({ where: { userId, id: itemId, deletedAt: null } }),
      tx.itemRevision.findFirst({ where: { id: revisionId, userId, itemId } }),
    ]);
    if (!item || !revision) throw new HttpError(404, "Versione non trovata.");
    if (item.version !== version) throw new HttpError(409, "L’elemento è cambiato. Ricarica la pagina prima di ripristinare.");
    const data = revision.snapshot as unknown as RevisionSnapshot;
    await tx.item.update({
      where: { userId_id: { userId, id: itemId } },
      data: {
        title: data.title,
        titleNormalized: normalizeIdentity(data.title),
        content: data.content,
        type: data.type as never,
        status: data.status as never,
        inbox: data.inbox,
        url: data.url,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
        version: { increment: 1 },
      },
    });
    await tx.itemTag.deleteMany({ where: { userId, itemId } });
    for (const name of data.tags) {
      const normalizedName = name.trim().toLocaleLowerCase("it-IT");
      const tag = await tx.tag.upsert({ where: { userId_normalizedName: { userId, normalizedName } }, create: { userId, name, normalizedName }, update: {} });
      await tx.itemTag.create({ data: { userId, itemId, tagId: tag.id } });
    }
    if (item.type === "RESOURCE") {
      await tx.resourceBlock.deleteMany({ where: { userId, resourceId: itemId } });
      for (const block of data.blocks) {
        const attachmentId = block.attachment ? (await tx.attachment.findFirst({ where: { id: block.attachment.id, userId, itemId }, select: { id: true } }))?.id ?? null : null;
        await tx.resourceBlock.create({ data: { userId, resourceId: itemId, type: block.type as never, position: block.position, text: block.text, url: block.url, attachmentId } });
      }
    }
    await syncWikiLinks(tx, userId, itemId, data.content);
    await queueItemEmbedding(tx, userId, itemId, item.version + 1);
    await createItemRevision(tx, userId, itemId, { restoredFromRevisionId: revision.id, comment: `Ripristinata dalla versione ${revision.revisionNumber}` });
    return { revisionNumber: revision.revisionNumber };
  });
}
