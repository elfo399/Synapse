import { createHash } from "node:crypto";
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
      resourceBlocks: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { attachment: true },
      },
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
    resourceBlocks: item.resourceBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      position: block.position,
      text: block.text,
      url: block.url,
      attachment: block.attachment
        ? {
            id: block.attachment.id,
            itemId: block.attachment.itemId,
            originalName: block.attachment.originalName,
            mimeType: block.attachment.mimeType,
            size: block.attachment.size,
            duration: block.attachment.duration,
            createdAt: block.attachment.createdAt.toISOString(),
          }
        : null,
    })),
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

export type DeletionPreview = {
  planId: string;
  root: { id: string; title: string; type: string };
  includeContained: boolean;
  delete: { id: string; title: string; type: string; archived: boolean }[];
  retained: { id: string; title: string; type: string; reason: string }[];
  counts: Record<string, number>;
  archived: number;
  attachments: number;
  relations: number;
  plannerBlocks: number;
};

async function deletionPreviewInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  rootId: string,
  includeContained: boolean,
): Promise<DeletionPreview> {
  const [root, items, parents] = await Promise.all([
    tx.item.findFirst({ where: { userId, id: rootId }, select: { id: true, title: true, type: true, version: true, archivedAt: true } }),
    tx.item.findMany({ where: { userId }, select: { id: true, title: true, type: true, version: true, archivedAt: true } }),
    tx.itemRelation.findMany({ where: { userId, relationType: "PARENT" }, select: { id: true, sourceItemId: true, targetItemId: true } }),
  ]);
  if (!root) throw new HttpError(404, "Elemento non trovato.");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, string[]>();
  const itemParents = new Map<string, string[]>();
  for (const relation of parents) {
    children.set(relation.targetItemId, [...(children.get(relation.targetItemId) ?? []), relation.sourceItemId]);
    itemParents.set(relation.sourceItemId, [...(itemParents.get(relation.sourceItemId) ?? []), relation.targetItemId]);
  }
  const reachable = new Set<string>([rootId]);
  if (includeContained) {
    const pending = [rootId];
    while (pending.length) {
      for (const childId of children.get(pending.pop()!) ?? []) if (!reachable.has(childId)) {
        reachable.add(childId); pending.push(childId);
      }
    }
  } else for (const childId of children.get(rootId) ?? []) reachable.add(childId);
  const deleting = new Set<string>([rootId]);
  if (includeContained) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of reachable) if (!deleting.has(id) && (itemParents.get(id) ?? []).every((parentId) => deleting.has(parentId))) {
        deleting.add(id); changed = true;
      }
    }
  }
  const deletedItems = [...deleting].map((id) => itemById.get(id)!).filter(Boolean);
  const retained = [...reachable]
    .filter((id) => !deleting.has(id))
    .map((id) => {
      const item = itemById.get(id)!;
      const keptParents = (itemParents.get(id) ?? []).filter((parentId) => !deleting.has(parentId)).map((parentId) => itemById.get(parentId)?.title).filter(Boolean);
      return { id, title: item.title, type: item.type, reason: includeContained ? `Conservato: appartiene anche a ${keptParents.join(", ") || "un altro contenitore"}.` : "Conservato: l'eliminazione del contenitore non elimina il contenuto." };
    });
  const deleteIds = deletedItems.map((item) => item.id);
  const [attachments, timeBlocks, relationCount] = await Promise.all([
    tx.attachment.count({ where: { userId, itemId: { in: deleteIds } } }),
    tx.timeBlock.count({ where: { userId, itemId: { in: deleteIds } } }),
    tx.itemRelation.count({ where: { userId, OR: [{ sourceItemId: { in: deleteIds } }, { targetItemId: { in: deleteIds } }] } }),
  ]);
  const counts: Record<string, number> = {};
  for (const item of deletedItems) counts[item.type] = (counts[item.type] ?? 0) + 1;
  const fingerprint = JSON.stringify({ rootId, includeContained, deleted: deletedItems.map((item) => [item.id, item.version]).sort(), retained: retained.map((item) => item.id).sort(), parents: parents.filter((relation) => reachable.has(relation.sourceItemId) || relation.targetItemId === rootId).map((relation) => [relation.id, relation.sourceItemId, relation.targetItemId]).sort() });
  return { planId: createHash("sha256").update(fingerprint).digest("hex"), root: { id: root.id, title: root.title, type: root.type }, includeContained, delete: deletedItems.map((item) => ({ id: item.id, title: item.title, type: item.type, archived: Boolean(item.archivedAt) })), retained, counts, archived: deletedItems.filter((item) => item.archivedAt).length, attachments, relations: relationCount, plannerBlocks: timeBlocks };
}

export async function getDeletionPreview(userId: string, id: string, includeContained = false) {
  return withUserTransaction(userId, (tx) => deletionPreviewInTransaction(tx, userId, id, includeContained));
}

export async function deleteItem(
  userId: string,
  id: string,
  confirmTitle: string,
  options: { includeContained?: boolean; planId?: string } = {},
): Promise<void> {
  await withUserTransaction(userId, async (tx) => {
    const item = await tx.item.findFirst({
      where: { userId, id },
      select: { title: true, type: true },
    });
    if (!item) throw new HttpError(404, "Elemento non trovato.");
    if (confirmTitle !== item.title)
      throw new HttpError(
        400,
        "Digita il titolo esatto dell’elemento per eliminarlo definitivamente.",
      );
    const advanced = item.type === "AREA" || item.type === "PROJECT";
    const preview = advanced
      ? await deletionPreviewInTransaction(tx, userId, id, Boolean(options.includeContained))
      : null;
    if (options.planId && preview && options.planId !== preview.planId)
      throw new HttpError(409, "Il piano di eliminazione non è più aggiornato. Controlla di nuovo gli elementi coinvolti.");
    if (options.includeContained && advanced && !options.planId)
      throw new HttpError(400, "Apri prima l'anteprima di eliminazione aggiornata.");
    const ids = preview ? preview.delete.map((entry) => entry.id) : [id];
    for (const itemId of ids) await queueAttachmentDeletion(tx, userId, itemId);
    await tx.aiConversation.updateMany({ where: { userId, activeProjectId: { in: ids } }, data: { activeProjectId: null } });
    await tx.item.deleteMany({ where: { userId, id: { in: ids } } });
    const keptChildren = await tx.itemRelation.findMany({ where: { userId, relationType: "PARENT", sourceItemId: { notIn: ids } }, select: { id: true, sourceItemId: true, isPrimary: true } });
    const primaryByChild = new Map<string, boolean>();
    for (const relation of keptChildren) primaryByChild.set(relation.sourceItemId, (primaryByChild.get(relation.sourceItemId) ?? false) || relation.isPrimary);
    for (const relation of keptChildren) if (!primaryByChild.get(relation.sourceItemId)) { await tx.itemRelation.update({ where: { id: relation.id }, data: { isPrimary: true } }); primaryByChild.set(relation.sourceItemId, true); }
  });
  await drainAttachmentDeletions();
}
