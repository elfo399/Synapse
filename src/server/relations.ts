import type { Prisma } from "@prisma/client";
import type { RelationType } from "../domain/types";
import { prisma } from "../lib/db";
import { HttpError } from "./errors";
import { relationInclude, serializeRelation } from "./serialization";
import { withUserTransaction } from "./transactions";

export async function validateParent(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceItemId: string,
  targetItemId: string,
): Promise<void> {
  if (sourceItemId === targetItemId)
    throw new HttpError(400, "Un elemento non può contenere se stesso.");
  const target = await tx.item.findFirst({
    where: { userId, id: targetItemId },
    select: { type: true },
  });
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
): Promise<void> {
  const unique = [...new Set(parentIds)];
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
      create: { userId, sourceItemId, targetItemId, relationType: "PARENT" },
      update: {},
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
        where: { userId, id: { in: [input.sourceItemId, input.targetItemId] } },
      })) !== 2
    )
      throw new HttpError(404, "L’elemento collegato non esiste.");
    if (input.relationType === "PARENT")
      await validateParent(tx, userId, input.sourceItemId, input.targetItemId);
    const relation = await tx.itemRelation.upsert({
      where: {
        userId_sourceItemId_targetItemId_relationType: { userId, ...input },
      },
      create: { userId, ...input },
      update: { manual: true },
      include: relationInclude,
    });
    return serializeRelation(relation);
  });
}

export async function deleteRelation(
  userId: string,
  id: string,
): Promise<void> {
  await withUserTransaction(userId, async (tx) => {
    const relation = await tx.itemRelation.findFirst({ where: { userId, id } });
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
      ...(itemId
        ? { OR: [{ sourceItemId: itemId }, { targetItemId: itemId }] }
        : {}),
    },
    include: relationInclude,
    take: 1000,
  });
  return relations.map(serializeRelation);
}
