import "dotenv/config";
import { prisma } from "../src/lib/db";
import { acquireMaintenance, releaseMaintenance } from "../src/server/maintenance";

async function main() {
  const [action, owner, minutes = "120"] = process.argv.slice(2);
  if (!owner || !["acquire", "release", "wait"].includes(action)) {
    throw new Error("Usage: maintenance-lease.ts acquire|release|wait OWNER [minutes]");
  }
  if (action === "acquire") {
    const duration = Number(minutes);
    if (!Number.isFinite(duration) || duration < 1 || duration > 720)
      throw new Error("The maintenance lease duration must be between 1 and 720 minutes.");
    await acquireMaintenance(owner, duration * 60_000);
    console.info(`Maintenance lease acquired by ${owner}.`);
  } else if (action === "release") {
    await releaseMaintenance(owner);
    console.info(`Maintenance lease released by ${owner}.`);
  } else {
    const deadline = Date.now() + 120_000;
    while (true) {
      const active = await prisma.aiGeneration.count({
        where: { state: { in: ["PLANNING", "GENERATING"] } },
      });
      if (!active) break;
      if (Date.now() >= deadline)
        throw new Error("An AI generation is still active; maintenance was not started.");
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    console.info("No active AI generation remains.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
