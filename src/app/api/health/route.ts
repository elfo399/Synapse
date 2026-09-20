import { prisma } from "@/lib/db";
import { json } from "@/server/http";
export async function GET() {
  try { await prisma.$queryRaw`SELECT 1`; return json({ status: "ok" }); }
  catch { console.error("Health check: database unavailable"); return json({ status: "unavailable" }, 503); }
}
