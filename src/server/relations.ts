import type { Prisma } from "@prisma/client";
import type { RelationType } from "../domain/types";
import { prisma } from "../lib/db";
import { HttpError } from "./errors";
import { relationInclude, serializeRelation } from "./serialization";
import { withUserTransaction } from "./transactions";

const allowedParents: Record<string, string[]> = {
  AREA: [],
  PROJECT: ["AREA"],
  RESOURCE: ["PROJECT", "AREA", "RESOURCE"],
  TASK: ["PROJECT", "AREA"],
  BOOKMARK: ["PROJECT", "AREA", "RESOURCE"],
};

export async function validateParent(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceItemId: string,
  targetItemId: string,
): Promise<void> {
  const source = await tx.item.findFirst({
    where: { userId, id: sourceItemId, deletedAt: null },
    select: { type: true },
  });
  if (!source)
    throw new HttpError(404, "L’elemento da organizzare non esiste.");
  if (sourceItemId === targetItemId)
    throw new HttpError(400, "Un elemento non può contenere se stesso.");
  const target = await tx.item.findFirst({
    where: { userId, id: targetItemId, deletedAt: null },
    select: { type: true },
  });
  if (target && !allowedParents[source.type].includes(target.type))
    throw new HttpError(
      400,
      source.type === "AREA"
        ? "Un’area è un contenitore principale e non può essere inserita in un altro elemento."
        : "Questo elemento non può essere organizzato in quel contenitore.",
    );
  if (!target) throw new HttpError(404, "L’elemento collegato non esiste.");
  if (!["PROJECT", "AREA", "RESOURCE"].includes(target.type))
    throw new HttpError(
      400,
      "Il contenitore deve essere un progetto, un’area o una risorsa.",
    );
  const cycle = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT "targetItemId" AS id FROM "ItemRelation" WHERE "userId"=${userId} AND "sourceItemId"=${targetItemId} AND "relationType"='PARENT'
      UNION
      SELECT r."targetItemId" FROM "ItemRelation" r JOIN ancestors a ON r."sourceItemId"=a.id WHERE r."userId"=${userId} AND r."relationType"='PARENT'
    ) SELECT id FROM ancestors WHERE id=${sourceItemId} LIMIT 1`;
  if (cycle.length)
    throw new HttpError(
      400,
      "Questo contenitore creerebbe una gerarchia circolare.",
    );
}

export async function setParents(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceItemId: string,
  parentIds: string[],
  primaryParentId?: string | null,
): Promise<void> {
  const unique = [...new Set(parentIds)];
  if (primaryParentId && !unique.includes(primaryParentId))
    throw new HttpError(
      400,
      "Il contenitore principale deve essere tra i contenitori selezionati.",
    );
  for (const targetItemId of unique)
    await validateParent(tx, userId, sourceItemId, targetItemId);
  await tx.itemRelation.deleteMany({
    where: {
      userId,
      sourceItemId,
      relationType: "PARENT",
      targetItemId: { notIn: unique },
    },
  });
  await tx.itemRelation.updateMany({
    where: { userId, sourceItemId, relationType: "PARENT" },
    data: { isPrimary: false },
  });
  for (const targetItemId of unique)
    await tx.itemRelation.upsert({
      where: {
        userId_sourceItemId_targetItemId_relationType: {
          userId,
          sourceItemId,
          targetItemId,
          relationType: "PARENT",
        },
      },
      create: {
        userId,
        sourceItemId,
        targetItemId,
        relationType: "PARENT",
        isPrimary: false,
      },
      update: { isPrimary: false },
    });
  const primary = primaryParentId ?? unique[0];
  if (primary)
    await tx.itemRelation.update({
      where: {
        userId_sourceItemId_targetItemId_relationType: {
          userId,
          sourceItemId,
          targetItemId: primary,
          relationType: "PARENT",
        },
      },
      data: { isPrimary: true },
    });
}

export async function createRelation(
  userId: string,
  input: {
    sourceItemId: string;
    targetItemId: string;
    relationType: RelationType;
  },
) {
  if (input.sourceItemId === input.targetItemId)
    throw new HttpError(400, "Un elemento non può collegarsi a se stesso.");
  return withUserTransaction(userId, async (tx) => {
    if (
      (await tx.item.count({
        where: {
          userId,
          deletedAt: null,
          id: { in: [input.sourceItemId, input.targetItemId] },
        },
      })) !== 2
    )
      throw new HttpError(404, "L’elemento collegato non esiste.");
    if (input.relationType === "PARENT")
      await validateParent(tx, userId, input.sourceItemId, input.targetItemId);
    const hasPrimary =
      input.relationType === "PARENT" &&
      (await tx.itemRelation.count({
        where: {
          userId,
          sourceItemId: input.sourceItemId,
          relationType: "PARENT",
          isPrimary: true,
        },
      }));
    const relation = await tx.itemRelation.upsert({
      where: {
        userId_sourceItemId_targetItemId_relationType: { userId, ...input },
      },
      create: {
        userId,
        ...input,
        isPrimary: input.relationType === "PARENT" && !hasPrimary,
      },
      update: { manual: true },
      include: relationInclude,
    });
    return serializeRelation(relation);
  });
}

export async function setPrimaryParent(userId: string, id: string) {
  return withUserTransaction(userId, async (tx) => {
    const relation = await tx.itemRelation.findFirst({
      where: {
        userId,
        id,
        source: { deletedAt: null },
        target: { deletedAt: null },
      },
    });
    if (!relation || relation.relationType !== "PARENT")
      throw new HttpError(404, "Contenitore non trovato.");
    await tx.itemRelation.updateMany({
      where: {
        userId,
        sourceItemId: relation.sourceItemId,
        relationType: "PARENT",
      },
      data: { isPrimary: false },
    });
    const updated = await tx.itemRelation.update({
      where: { id: relation.id },
      data: { isPrimary: true },
      include: relationInclude,
    });
    return serializeRelation(updated);
  });
}

export async function deleteRelation(
  userId: string,
  id: string,
): Promise<void> {
  await withUserTransaction(userId, async (tx) => {
    const relation = await tx.itemRelation.findFirst({
      where: {
        userId,
        id,
        source: { deletedAt: null },
        target: { deletedAt: null },
      },
    });
    if (!relation) throw new HttpError(404, "Relazione non trovata.");
    if (relation.wikilink && !relation.manual)
      throw new HttpError(
        409,
        "Rimuovi il collegamento interno dal contenuto per eliminare questo riferimento.",
      );
    if (relation.wikilink)
      await tx.itemRelation.update({ where: { id }, data: { manual: false } });
    else await tx.itemRelation.delete({ where: { id } });
  });
}

export async function listRelations(userId: string, itemId?: string) {
  const relations = await prisma.itemRelation.findMany({
    where: {
      userId,
      source: { deletedAt: null },
      target: { deletedAt: null },
      ...(itemId
        ? { OR: [{ sourceItemId: itemId }, { targetItemId: itemId }] }
        : {}),
    },
    include: relationInclude,
    take: 1000,
  });
  return relations.map(serializeRelation);
}
