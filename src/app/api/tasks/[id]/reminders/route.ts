import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { idSchema } from "@/domain/validation";
import { HttpError } from "@/server/errors";
import { json, readJson, route } from "@/server/http";

async function taskId(userId: string, rawId: string) {
  const id = idSchema.parse(rawId);
  const item = await prisma.item.findFirst({ where: { id, userId, type: "TASK", deletedAt: null }, select: { id: true, title: true } });
  if (!item) throw new HttpError(404, "Attività non trovata.");
  return item;
}

export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  const task = await taskId(user.id, (await context.params).id);
  const reminders = await prisma.reminder.findMany({ where: { userId: user.id, itemId: task.id, sentAt: null }, select: { id: true, title: true, scheduledAt: true }, orderBy: { scheduledAt: "asc" } });
  return json({ reminders: reminders.map((reminder) => ({ ...reminder, scheduledAt: reminder.scheduledAt.toISOString() })) });
});

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  const task = await taskId(user.id, (await context.params).id);
  const input = z.object({ scheduledAt: z.string().datetime({ offset: true }) }).strict().parse(await readJson(request));
  const scheduledAt = new Date(input.scheduledAt);
  if (scheduledAt.getTime() <= Date.now()) throw new HttpError(400, "Scegli un orario futuro per il promemoria.");
  const reminder = await prisma.reminder.create({ data: { userId: user.id, itemId: task.id, title: task.title, scheduledAt }, select: { id: true, title: true, scheduledAt: true } });
  return json({ reminder: { ...reminder, scheduledAt: reminder.scheduledAt.toISOString() } }, 201);
});
