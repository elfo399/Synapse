import { prisma } from "@/lib/db";
import { HttpError } from "./errors";

const allowed = new Set([7, 14, 30, 60, 90]);
export async function getUserSettings(userId: string) {
  return prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {}, select: { trashRetentionDays: true } });
}
export async function updateTrashRetention(userId: string, days: number) {
  if (!allowed.has(days)) throw new HttpError(400, "Scegli un periodo di conservazione valido.");
  return prisma.$transaction(async (tx) => {
    const settings = await tx.userSettings.upsert({ where: { userId }, create: { userId, trashRetentionDays: days }, update: { trashRetentionDays: days }, select: { trashRetentionDays: true } });
    const operations = await tx.trashOperation.findMany({ where: { userId, items: { some: { deletedAt: { not: null } } } }, select: { id: true, deletedAt: true } });
    await Promise.all(operations.map((operation) => tx.trashOperation.update({ where: { id: operation.id }, data: { purgeAfter: new Date(operation.deletedAt.getTime() + days * 86_400_000) } })));
    return settings;
  });
}
export async function expiredTrashCount(userId: string, days: number) {
  return prisma.trashOperation.count({ where: { userId, deletedAt: { lte: new Date(Date.now() - days * 86_400_000) }, items: { some: { deletedAt: { not: null } } } } });
}
