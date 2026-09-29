import "dotenv/config";
import { prisma } from "../src/lib/db";
import { maintenanceActive } from "../src/server/maintenance";
import { runTaskSchedules } from "../src/server/task-planning";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;
async function loop() {
  while (!stopping) {
    try { if (!await maintenanceActive()) await runTaskSchedules(); }
    catch (error) { console.error("[synapse-scheduler]", error instanceof Error ? error.message : error); }
    await wait(60_000);
  }
  await prisma.$disconnect();
}
void loop();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; });
