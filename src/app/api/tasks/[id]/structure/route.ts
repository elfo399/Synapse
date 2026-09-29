import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { json, readJson, route } from "@/server/http";
import { addTaskDependency, setTaskParent, setTaskRecurrence, taskStructure } from "@/server/task-planning";
import { createItem } from "@/server/items";

export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request); return json(await taskStructure(user.id, idSchema.parse((await context.params).id)));
});
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request); const id = idSchema.parse((await context.params).id);
  const input = z.object({ parentId: idSchema.nullable() }).strict().parse(await readJson(request));
  await setTaskParent(user.id, id, input.parentId); return json(await taskStructure(user.id, id));
});
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request); const id = idSchema.parse((await context.params).id);
  const input = z.discriminatedUnion("action", [z.object({ action: z.literal("dependency"), blockerTaskId: idSchema }).strict(), z.object({ action: z.literal("createSubtask"), title: z.string().trim().min(1).max(200), dueAt: z.string().datetime().nullable().optional() }).strict(), z.object({ action: z.literal("recurrence"), rule: z.object({ frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]), interval: z.number().int().min(1).max(365).optional() }).strict(), timezone: z.string().min(1).max(64), startsAt: z.string().datetime(), endsAt: z.string().datetime().nullable().optional(), active: z.boolean().optional() }).strict()]).parse(await readJson(request));
  if (input.action === "dependency") await addTaskDependency(user.id, input.blockerTaskId, id);
  else if (input.action === "createSubtask") { const created = await createItem(user.id, { title: input.title, content: "", type: "TASK", status: "TODO", inbox: false, tags: [], parentIds: [], dueAt: input.dueAt ?? null, url: null }); await setTaskParent(user.id, created.id, id); }
  else await setTaskRecurrence(user.id, id, input);
  return json(await taskStructure(user.id, id));
});
