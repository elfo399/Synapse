import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { idSchema } from "@/domain/validation";
import { HttpError, json, readJson, route } from "@/server/http";

const blockSchema = z.object({
  type: z.enum(["TEXT", "LINK", "IMAGE", "AUDIO", "FILE"]),
  text: z.string().max(100_000).optional(),
  url: z.string().url().max(2048).optional(),
  attachmentId: idSchema.optional(),
}).strict();

async function resource(userId: string, id: string) {
  const item = await prisma.item.findFirst({ where: { userId, id, type: "RESOURCE" }, select: { id: true } });
  if (!item) throw new HttpError(404, "Risorsa non trovata.");
  return item;
}

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  const id = idSchema.parse((await context.params).id);
  const input = blockSchema.parse(await readJson(request));
  await resource(user.id, id);
  if (input.attachmentId && !(await prisma.attachment.findFirst({ where: { id: input.attachmentId, userId: user.id, itemId: id }, select: { id: true } })))
    throw new HttpError(404, "Allegato non trovato.");
  const last = await prisma.resourceBlock.aggregate({ where: { userId: user.id, resourceId: id }, _max: { position: true } });
  const block = await prisma.resourceBlock.create({ data: { userId: user.id, resourceId: id, type: input.type, text: input.type === "TEXT" ? input.text ?? "" : null, url: input.type === "LINK" ? input.url : null, attachmentId: input.attachmentId, position: (last._max.position ?? -1) + 1 } });
  return json({ block }, 201);
});

export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  const resourceId = idSchema.parse((await context.params).id);
  const input = z.object({ blocks: z.array(z.object({ id: idSchema, position: z.number().int().min(0), text: z.string().max(100_000).nullable().optional(), url: z.string().url().max(2048).nullable().optional() })).min(1).max(500) }).strict().parse(await readJson(request));
  await resource(user.id, resourceId);
  const owned = await prisma.resourceBlock.count({ where: { userId: user.id, resourceId, id: { in: input.blocks.map((block) => block.id) } } });
  if (owned !== input.blocks.length) throw new HttpError(404, "Blocco non trovato.");
  await prisma.$transaction(input.blocks.map((block) => prisma.resourceBlock.update({ where: { id: block.id }, data: { position: block.position, ...(block.text !== undefined && { text: block.text }), ...(block.url !== undefined && { url: block.url }) } })));
  return json({ success: true });
});

export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  const resourceId = idSchema.parse((await context.params).id);
  const input = z.object({ id: idSchema }).strict().parse(await readJson(request));
  await resource(user.id, resourceId);
  const removed = await prisma.resourceBlock.deleteMany({ where: { id: input.id, userId: user.id, resourceId } });
  if (!removed.count) throw new HttpError(404, "Blocco non trovato.");
  return new Response(null, { status: 204 });
});
