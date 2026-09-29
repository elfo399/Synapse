import { prisma } from "@/lib/db";

export async function maintenanceActive() {
  const lease = await prisma.maintenanceLease.findUnique({ where: { id: 1 } });
  return Boolean(lease && lease.expiresAt > new Date());
}

export async function acquireMaintenance(owner: string, durationMs = 10 * 60_000) {
  const now = new Date();
  const result = await prisma.maintenanceLease.updateMany({
    where: { id: 1, OR: [{ expiresAt: { lte: now } }, { owner }] },
    data: { owner, expiresAt: new Date(now.getTime() + durationMs) },
  });
  if (!result.count) throw new Error("Un'altra operazione di manutenzione è già in corso.");
}

export async function releaseMaintenance(owner: string) {
  await prisma.maintenanceLease.updateMany({ where: { id: 1, owner }, data: { owner: "", expiresAt: new Date() } });
}