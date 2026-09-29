import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { idSchema } from "@/domain/validation";
import { json, readJson, route } from "@/server/http";

export const POST = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const input = z.object({ ids: z.array(idSchema).min(1).max(100), action: z.enum(["complete", "reopen", "archive"]) }).strict().parse(await readJson(request));
  const data = input.action === "complete" ? { status: "DONE" as const, completedAt: new Date() } : input.action === "reopen" ? { status: "TODO" as const, completedAt: null } : { archivedAt: new Date() };
  const result = await prisma.item.updateMany({ where: { id: { in: input.ids }, userId: user.id, type: "TASK", deletedAt: null }, data });
  return json({ updated: result.count });
});
