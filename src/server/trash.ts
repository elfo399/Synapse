import { createHash } from "node:crypto";
import type { ItemType, Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { HttpError } from "./errors";
import {
  queueAttachmentDeletion,
  drainAttachmentDeletions,
} from "./attachments";
import { withUserTransaction } from "./transactions";

type TrashItem = {
  id: string;
  title: string;
  titleNormalized: string;
  type: ItemType;
  archivedAt: Date | null;
  deletedAt: Date | null;
  trashOperationId: string | null;
};

const trashItemSelect = {
  id: true,
  title: true,
  titleNormalized: true,
  type: true,
  archivedAt: true,
  deletedAt: true,
  trashOperationId: true,
} satisfies Prisma.ItemSelect;

function operationPlan(items: TrashItem[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        items.map((item) => [item.id, item.deletedAt?.toISOString()]).sort(),
      ),
    )
    .digest("hex");
}

function serializeItem(item: TrashItem) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}

export async function listTrash(
  userId: string,
  input: { q?: string; type?: ItemType } = {},
) {
  const matches = {
    deletedAt: { not: null },
    ...(input.type ? { type: input.type } : {}),
    ...(input.q
      ? { title: { contains: input.q, mode: "insensitive" as const } }
      : {}),
  };
  const operations = await prisma.trashOperation.findMany({
    where: { userId, items: { some: matches } },
    include: {
      items: { where: { deletedAt: { not: null } }, select: trashItemSelect },
    },
    orderBy: { deletedAt: "desc" },
  });
  return operations.map((operation) => ({
    id: operation.id,
    rootItemId: operation.rootItemId,
    includeContained: operation.includeContained,
    deletedAt: operation.deletedAt.toISOString(),
    items: operation.items.map(serializeItem),
  }));
}

async function ownedOperation(
  tx: Prisma.TransactionClient,
  userId: string,
  operationId: string,
) {
  const operation = await tx.trashOperation.findFirst({
    where: { userId, id: operationId },
    include: {
      items: { where: { deletedAt: { not: null } }, select: trashItemSelect },
    },
  });
  if (!operation || !operation.items.length)
    throw new HttpError(404, "Operazione nel Cestino non trovata.");
  return operation;
}

function rootOf(operation: Awaited<ReturnType<typeof ownedOperation>>) {
  return (
    operation.items.find((item) => item.id === operation.rootItemId) ??
    operation.items[0]
  );
}

async function ensureTitleConflictsFree(
  tx: Prisma.TransactionClient,
  userId: string,
  items: TrashItem[],
) {
  const active = await tx.item.findMany({
    where: {
      userId,
      deletedAt: null,
      titleNormalized: { in: items.map((item) => item.titleNormalized) },
    },
    select: { titleNormalized: true, title: true },
  });
  const conflicts = items.filter((item) =>
    active.some((row) => row.titleNormalized === item.titleNormalized),
  );
  if (conflicts.length)
    throw new HttpError(
      409,
      `Non puoi ripristinare: esiste gi? un elemento attivo con lo stesso titolo (${conflicts.map((item) => item.title).join(", ")}). Rinomina o sposta nel Cestino l?elemento in conflitto, poi riprova.`,
    );
}

export async function restoreTrashOperation(
  userId: string,
  operationId: string,
  itemId?: string,
) {
  return withUserTransaction(userId, async (tx) => {
    const operation = await ownedOperation(tx, userId, operationId);
    const items = itemId
      ? operation.items.filter((item) => item.id === itemId)
      : operation.items;
    if (!items.length)
      throw new HttpError(404, "Elemento nel Cestino non trovato.");
    await ensureTitleConflictsFree(tx, userId, items);
    const restored = await tx.item.updateMany({
      where: {
        userId,
        id: { in: items.map((item) => item.id) },
        deletedAt: { not: null },
        trashOperationId: operationId,
      },
      data: { deletedAt: null, trashOperationId: null },
    });
    if (restored.count !== items.length)
      throw new HttpError(
        409,
        "Il Cestino ? cambiato. Aggiorna la pagina e riprova.",
      );
    if (items.length === operation.items.length)
      await tx.trashOperation.delete({ where: { id: operationId } });
    return { restored: restored.count };
  });
}

export async function getTrashPurgePreview(
  userId: string,
  operationId: string,
) {
  return withUserTransaction(userId, async (tx) => {
    const operation = await ownedOperation(tx, userId, operationId);
    const ids = operation.items.map((item) => item.id);
    const [attachments, relations, plannerBlocks] = await Promise.all([
      tx.attachment.count({ where: { userId, itemId: { in: ids } } }),
      tx.itemRelation.count({
        where: {
          userId,
          OR: [{ sourceItemId: { in: ids } }, { targetItemId: { in: ids } }],
        },
      }),
      tx.timeBlock.count({ where: { userId, itemId: { in: ids } } }),
    ]);
    const counts: Partial<Record<ItemType, number>> = {};
    for (const item of operation.items)
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    return {
      planId: operationPlan(operation.items),
      operationId,
      root: serializeItem(rootOf(operation)),
      items: operation.items.map(serializeItem),
      counts,
      attachments,
      relations,
      plannerBlocks,
    };
  });
}

export async function purgeTrashOperation(
  userId: string,
  operationId: string,
  confirmed: boolean,
  planId: string,
) {
  await withUserTransaction(userId, async (tx) => {
    const operation = await ownedOperation(tx, userId, operationId);
    if (confirmed !== true)
      throw new HttpError(400, "Conferma l'eliminazione definitiva.");
    if (operationPlan(operation.items) !== planId)
      throw new HttpError(
        409,
        "Il Cestino ? cambiato. Controlla di nuovo l?anteprima.",
      );
    const ids = operation.items.map((item) => item.id);
    for (const id of ids) await queueAttachmentDeletion(tx, userId, id);
    const deleted = await tx.item.deleteMany({
      where: {
        userId,
        id: { in: ids },
        deletedAt: { not: null },
        trashOperationId: operationId,
      },
    });
    if (deleted.count !== ids.length)
      throw new HttpError(
        409,
        "Il Cestino ? cambiato. Controlla di nuovo l?anteprima.",
      );
    await tx.trashOperation.deleteMany({ where: { userId, id: operationId } });
  });
  await drainAttachmentDeletions();
}

export async function getEmptyTrashPreview(userId: string) {
  const operations = await prisma.trashOperation.findMany({
    where: { userId },
    include: {
      items: { where: { deletedAt: { not: null } }, select: trashItemSelect },
    },
  });
  const items = operations.flatMap((operation) => operation.items);
  const attachments = await prisma.attachment.count({
    where: { userId, itemId: { in: items.map((item) => item.id) } },
  });
  return {
    operations: operations.length,
    items: items.length,
    attachments,
    planId: operationPlan(items),
  };
}

export async function emptyTrash(
  userId: string,
  confirmed: boolean,
  planId: string,
) {
  if (confirmed !== true)
    throw new HttpError(400, "Conferma lo svuotamento del Cestino.");
  await withUserTransaction(userId, async (tx) => {
    const operations = await tx.trashOperation.findMany({
      where: { userId },
      include: {
        items: { where: { deletedAt: { not: null } }, select: trashItemSelect },
      },
    });
    const items = operations.flatMap((operation) => operation.items);
    if (operationPlan(items) !== planId)
      throw new HttpError(
        409,
        "Il Cestino ? cambiato. Aggiorna l?anteprima e riprova.",
      );
    for (const item of items)
      await queueAttachmentDeletion(tx, userId, item.id);
    await tx.item.deleteMany({ where: { userId, deletedAt: { not: null } } });
    await tx.trashOperation.deleteMany({ where: { userId } });
  });
  await drainAttachmentDeletions();
}
