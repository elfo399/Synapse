import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { markStaleGenerationsInterrupted, runGenerationJob } from "../src/server/ai";
import { maintenanceActive } from "../src/server/maintenance";

const ownerId = `ai-worker-${process.pid}-${randomUUID().slice(0, 8)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let stopping = false;

async function acquireLease() {
  const now = new Date();
  const result = await prisma.aiGenerationLease.updateMany({
    where: { id: 1, OR: [{ expiresAt: { lte: now } }, { ownerId }] },
    data: { ownerId, expiresAt: new Date(now.getTime() + 45_000) },
  });
  return result.count === 1;
}

async function nextJob() {
  const job = await prisma.aiGeneration.findFirst({
    where: { state: "QUEUED", cancelRequestedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return job?.id;
}

async function loop() {
  await markStaleGenerationsInterrupted();
  let lastRecovery = Date.now();
  while (!stopping) {
    try {
      if (await maintenanceActive()) { await wait(1000); continue; }
      if (Date.now() - lastRecovery > 30_000) {
        await markStaleGenerationsInterrupted();
        lastRecovery = Date.now();
      }
      if (!(await acquireLease())) { await wait(900); continue; }
      const id = await nextJob();
      if (id) await runGenerationJob(id, ownerId);
      else await wait(700);
    } catch (error) {
      console.error("[synapse-ai-worker]", error instanceof Error ? error.message : error);
      await wait(1500);
    }
  }
}

void loop();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; });
