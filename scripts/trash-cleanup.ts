import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getTrashPurgePreview, purgeTrashOperation } from "../src/server/trash";
import { maintenanceActive } from "../src/server/maintenance";

export async function cleanExpiredTrash() {
  if (await maintenanceActive()) return 0;
  const locked = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(82944122) AS locked`;
  if (!locked[0]?.locked) return 0;
  try {
    const operations = await prisma.trashOperation.findMany({ where: { purgeAfter: { lte: new Date() } }, select: { id: true, userId: true, deletedAt: true, purgeAfter: true }, take: 100, orderBy: { purgeAfter: "asc" } });
    let deleted = 0;
    for (const operation of operations) {
      const setting = await prisma.userSettings.upsert({ where: { userId: operation.userId }, create: { userId: operation.userId }, update: {}, select: { trashRetentionDays: true } });
      const expiresAt = operation.purgeAfter ?? new Date(operation.deletedAt.getTime() + setting.trashRetentionDays * 86_400_000);
      if (expiresAt.getTime() > Date.now()) continue;
      try { const preview = await getTrashPurgePreview(operation.userId, operation.id); await purgeTrashOperation(operation.userId, operation.id, true, preview.planId); deleted++; }
      catch (error) { console.error("Trash cleanup deferred", { operationId: operation.id, error: error instanceof Error ? error.message : error }); }
    }
    return deleted;
  } finally { await prisma.$queryRaw`SELECT pg_advisory_unlock(82944122)`; }
}
async function main() { const watch = process.argv.includes("--watch"); do { const count = await cleanExpiredTrash(); console.info(`Trash cleanup complete: ${count} operation(s) purged.`); if (!watch) break; await new Promise((resolve) => setTimeout(resolve, 86_400_000)); } while (true); }
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { if (!process.argv.includes("--watch")) void prisma.$disconnect(); });
