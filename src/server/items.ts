import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { ItemDetail } from "../domain/types";
import { normalizeIdentity, normalizeTag } from "../domain/normalization";
import {
  defaultStatus,
  itemPatchSchema,
  itemQuerySchema,
  itemSchema,
  statusAllowed,
} from "../domain/validation";
import { prisma } from "../lib/db";
import { HttpError } from "./errors";
import {
  itemInclude,
  relationInclude,
  serializeItem,
  serializeRelation,
} from "./serialization";
import { setParents } from "./relations";
import { withUserTransaction } from "./transactions";
import {
  propagateTitleRename,
  resolveNewTitle,
  syncWikiLinks,
} from "./wikilinks";
import {
  queueAttachmentDeletion,
  drainAttachmentDeletions,
} from "./attachments";
import { queueItemEmbedding } from "./ai-index";

async function setTags(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
  names: string[],
): Promise<void> {
  await tx.itemTag.deleteMany({ where: { userId, itemId } });
  for (const name of new Set(names.map(normalizeTag))) {
    const tag = await tx.tag.upsert({
      where: { userId_normalizedName: { userId, normalizedName: name } },
      create: { userId, name, normalizedName: name },
      update: {},
    });
    await tx.itemTag.create({ data: { userId, itemId, tagId: tag.id } });
  }
}

export async function getItem(
  userId: string,
  id: string,
  db: Prisma.TransactionClient = prisma,
): Promise<ItemDetail> {
  const item = await db.item.findFirst({
    where: { userId, id },
    include: {
      ...itemInclude,
      outgoing: { include: relationInclude, orderBy: { createdAt: "desc" } },
      incoming: { include: relationInclude, orderBy: { createdAt: "desc" } },
      wikiReferences: true,
    },
  });
  if (!item) throw new HttpError(404, "Elemento non trovato.");
  const existingTitles = await db.item.findMany({
    where: {
      userId,
      titleNormalized: {
        in: item.wikiReferences.map((link) => link.titleNormalized),
      },
    },
    select: { titleNormalized: true },
  });
  const existing = new Set(
    existingTitles.map((target) => target.titleNormalized),
  );
  return {
    ...serializeItem(item),
    outgoing: item.outgoing.map(serializeRelation),
    incoming: item.incoming.map(serializeRelation),
    unresolvedWikilinks: item.wikiReferences
      .filter((link) => !existing.has(link.titleNormalized))
      .map((link) => link.title),
  };
}

export async function listItems(
  userId: string,
  input: z.input<typeof itemQuerySchema>,
) {
  const query = itemQuerySchema.parse(input);
  const where: Prisma.ItemWhereInput = {
    userId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.inbox ? { inbox: query.inbox === "true" } : {}),
    ...(query.archive === "active"
      ? { archivedAt: null }
      : query.archive === "archived"
        ? { archivedAt: { not: null } }
        : {}),
    ...(query.tag
      ? {
          tags: {
            some: {
              tag: {
                OR: [
                  { id: query.tag },
                  { normalizedName: normalizeTag(query.tag) },
                ],
              },
            },
          },
        }
      : {}),
    ...(query.parent
      ? {
          outgoing: {
            some: { targetItemId: query.parent, relationType: "PARENT" },
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { content: { contains: query.q, mode: "insensitive" } },
            {
              tags: {
                some: {
                  tag: { normalizedName: { contains: normalizeTag(query.q) } },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      include: itemInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.item.count({ where }),
  ]);
  return {
    items: items.map(serializeItem),
    total,
    page: query.page,
    pageSize: query.limit,
  };
}

export async function createItem(
  userId: string,
  rawInput: unknown,
): Promise<ItemDetail> {
  return withUserTransaction(userId, (tx) =>
    createItemInTransaction(tx, userId, rawInput),
  );
}

export async function createItemInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  rawInput: unknown,
): Promise<ItemDetail> {
  const input = itemSchema.parse(rawInput);
  const status = input.status ?? defaultStatus(input.type);
  if (!statusAllowed(input.type, status))
    throw new HttpError(
      400,
      "Scegli uno stato adatto a questo tipo di elemento.",
    );
  if (input.type === "BOOKMARK" && !input.url)
    throw new HttpError(400, "I preferiti richiedono un URL.");
  const item = await tx.item.create({
    data: {
      userId,
      title: input.title,
      titleNormalized: normalizeIdentity(input.title),
      content: input.content,
      type: input.type,
      status,
      inbox: input.inbox,
      url: input.url,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      completedAt: status === "DONE" ? new Date() : null,
      archivedAt: input.archived ? new Date() : null,
    },
  });
  await setTags(tx, userId, item.id, input.tags);
  await setParents(tx, userId, item.id, input.parentIds, input.primaryParentId);
  await syncWikiLinks(tx, userId, item.id, input.content);
  await resolveNewTitle(tx, userId, item.id, item.titleNormalized);
  await queueItemEmbedding(tx, userId, item.id, item.version);
  return getItem(userId, item.id, tx);
}

export async function updateItem(
  userId: string,
  id: string,
  rawInput: unknown,
): Promise<ItemDetail> {
  const input = itemPatchSchema.parse(rawInput);
  return withUserTransaction(userId, async (tx) => {
    const previous = await tx.item.findFirst({ where: { userId, id } });
    if (!previous) throw new HttpError(404, "Elemento non trovato.");
    if (input.version !== undefined && input.version !== previous.version)
      throw new HttpError(
        409,
        "Questo elemento è stato modificato in un’altra scheda. Ricaricalo prima di salvare.",
      );
    const type = input.type ?? previous.type;
    const status =
      input.status ??
      (type !== previous.type ? defaultStatus(type) : previous.status);
    if (!statusAllowed(type, status))
      throw new HttpError(
        400,
        "Scegli uno stato adatto a questo tipo di elemento.",
      );
    const url = input.url !== undefined ? input.url : previous.url;
    if (type === "BOOKMARK" && !url)
      throw new HttpError(400, "I preferiti richiedono un URL.");
    if (
      !["PROJECT", "AREA", "RESOURCE"].includes(type) &&
      type !== previous.type &&
      (await tx.itemRelation.count({
        where: { userId, targetItemId: id, relationType: "PARENT" },
      }))
    ) {
      throw new HttpError(
        409,
        "Sposta gli elementi contenuti prima di cambiare il tipo.",
      );
    }
    const title = input.title ?? previous.title;
    const normalized = normalizeIdentity(title);
    const updated = await tx.item.update({
      where: { userId_id: { userId, id } },
      data: {
        title,
        titleNormalized: normalized,
        content: input.content,
        type,
        status,
        inbox: input.inbox,
        url,
        dueAt:
          input.dueAt !== undefined
            ? input.dueAt
              ? new Date(input.dueAt)
              : null
            : undefined,
        completedAt:
          status === "DONE" ? (previous.completedAt ?? new Date()) : null,
        archivedAt:
          input.archived === undefined
            ? undefined
            : input.archived
              ? (previous.archivedAt ?? new Date())
              : null,
        version: { increment: 1 },
      },
    });
    if (input.tags !== undefined) await setTags(tx, userId, id, input.tags);
    if (input.parentIds !== undefined)
      await setParents(tx, userId, id, input.parentIds, input.primaryParentId);
    else if (input.primaryParentId !== undefined) {
      const parents = await tx.itemRelation.findMany({
        where: { userId, sourceItemId: id, relationType: "PARENT" },
        select: { targetItemId: true },
      });
      await setParents(
        tx,
        userId,
        id,
        parents.map((parent) => parent.targetItemId),
        input.primaryParentId,
      );
    }
    await syncWikiLinks(tx, userId, id, input.content ?? previous.content);
    if (title !== previous.title)
      await propagateTitleRename(tx, userId, previous.titleNormalized, title);
    await resolveNewTitle(tx, userId, id, normalized);
    await queueItemEmbedding(tx, userId, id, updated.version);
    return getItem(userId, id, tx);
  });
}

export async function deleteItem(
  userId: string,
  id: string,
  confirmTitle: string,
): Promise<void> {
  await withUserTransaction(userId, async (tx) => {
    const item = await tx.item.findFirst({
      where: { userId, id },
      select: { title: true },
    });
    if (!item) throw new HttpError(404, "Elemento non trovato.");
    if (confirmTitle !== item.title)
      throw new HttpError(
        400,
        "Digita il titolo esatto dell’elemento per eliminarlo definitivamente.",
      );
    await queueAttachmentDeletion(tx, userId, id);
    await tx.item.delete({ where: { userId_id: { userId, id } } });
  });
  await drainAttachmentDeletions();
}
