import type { Prisma } from "@prisma/client";
import { extractWikiLinks, renameWikiLinks } from "../domain/wikilinks";

export async function syncWikiLinks(tx: Prisma.TransactionClient, userId: string, sourceItemId: string, content: string): Promise<void> {
  const links = extractWikiLinks(content);
  await tx.wikiReference.deleteMany({ where: { userId, sourceItemId } });
  if (links.length) await tx.wikiReference.createMany({ data: links.map((link) => ({ userId, sourceItemId, title: link.title, titleNormalized: link.normalized })) });
  const targets = links.length ? await tx.item.findMany({ where: { userId, titleNormalized: { in: links.map((link) => link.normalized) }, id: { not: sourceItemId } }, select: { id: true } }) : [];
  const targetIds = targets.map((target) => target.id);
  // Removing prose links must never erase separately-created manual relationships.
  await tx.itemRelation.deleteMany({ where: { userId, sourceItemId, relationType: "REFERENCES", wikilink: true, manual: false, targetItemId: { notIn: targetIds } } });
  await tx.itemRelation.updateMany({ where: { userId, sourceItemId, relationType: "REFERENCES", wikilink: true, manual: true, targetItemId: { notIn: targetIds } }, data: { wikilink: false } });
  for (const targetItemId of targetIds) {
    await tx.itemRelation.upsert({
      where: { userId_sourceItemId_targetItemId_relationType: { userId, sourceItemId, targetItemId, relationType: "REFERENCES" } },
      create: { userId, sourceItemId, targetItemId, relationType: "REFERENCES", manual: false, wikilink: true },
      update: { wikilink: true },
    });
  }
}

export async function resolveNewTitle(tx: Prisma.TransactionClient, userId: string, targetItemId: string, normalized: string): Promise<void> {
  const waiting = await tx.wikiReference.findMany({ where: { userId, titleNormalized: normalized, sourceItemId: { not: targetItemId } }, select: { sourceItemId: true } });
  for (const { sourceItemId } of waiting) {
    await tx.itemRelation.upsert({
      where: { userId_sourceItemId_targetItemId_relationType: { userId, sourceItemId, targetItemId, relationType: "REFERENCES" } },
      create: { userId, sourceItemId, targetItemId, relationType: "REFERENCES", manual: false, wikilink: true },
      update: { wikilink: true },
    });
  }
}

export async function propagateTitleRename(tx: Prisma.TransactionClient, userId: string, oldNormalized: string, newTitle: string): Promise<void> {
  const references = await tx.wikiReference.findMany({ where: { userId, titleNormalized: oldNormalized }, include: { source: { select: { id: true, content: true } } } });
  for (const { source } of references) {
    const content = renameWikiLinks(source.content, oldNormalized, newTitle);
    await tx.item.update({ where: { userId_id: { userId, id: source.id } }, data: { content, version: { increment: 1 } } });
    await syncWikiLinks(tx, userId, source.id, content);
  }
}
