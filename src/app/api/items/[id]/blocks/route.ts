import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { idSchema } from "@/domain/validation";
import { HttpError, json, readJson, route } from "@/server/http";
import { withUserTransaction } from "@/server/transactions";
import { createItemRevision } from "@/server/revisions";

const blockSchema = z.object({ type: z.enum(["TEXT", "LINK", "IMAGE", "AUDIO", "FILE"]), text: z.string().max(100_000).optional(), url: z.string().url().max(2048).optional(), attachmentId: idSchema.optional() }).strict();
async function resource(userId: string, id: string, db: Prisma.TransactionClient | typeof prisma = prisma) { const item = await db.item.findFirst({ where: { userId, id, type: "RESOURCE", deletedAt: null }, select: { id: true } }); if (!item) throw new HttpError(404, "Risorsa non trovata."); return item; }
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request); const id = idSchema.parse((await context.params).id); const input = blockSchema.parse(await readJson(request));
  const block = await withUserTransaction(user.id, async (tx) => { await resource(user.id, id, tx); if (input.attachmentId && !(await tx.attachment.findFirst({ where: { id: input.attachmentId, userId: user.id, itemId: id }, select: { id: true } }))) throw new HttpError(404, "Allegato non trovato."); const last = await tx.resourceBlock.aggregate({ where: { userId: user.id, resourceId: id }, _max: { position: true } }); const created = await tx.resourceBlock.create({ data: { userId: user.id, resourceId: id, type: input.type, text: input.type === "TEXT" ? input.text ?? "" : null, url: input.type === "LINK" ? input.url : null, attachmentId: input.attachmentId, position: (last._max.position ?? -1) + 1 } }); await createItemRevision(tx, user.id, id); return created; });
  return json({ block }, 201);
});
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request); const resourceId = idSchema.parse((await context.params).id); const input = z.object({ blocks: z.array(z.object({ id: idSchema, position: z.number().int().min(0), text: z.string().max(100_000).nullable().optional(), url: z.string().url().max(2048).nullable().optional() })).min(1).max(500) }).strict().parse(await readJson(request));
  await withUserTransaction(user.id, async (tx) => { await resource(user.id, resourceId, tx); const current = await tx.resourceBlock.findMany({ where: { userId: user.id, resourceId, id: { in: input.blocks.map((block) => block.id) } }, select: { id: true, position: true, text: true, url: true } }); if (current.length !== input.blocks.length) throw new HttpError(404, "Blocco non trovato."); const changed = input.blocks.some((block) => { const old = current.find((entry) => entry.id === block.id)!; return old.position !== block.position || (block.text !== undefined && old.text !== block.text) || (block.url !== undefined && old.url !== block.url); }); if (!changed) return; await Promise.all(input.blocks.map((block) => tx.resourceBlock.update({ where: { id: block.id }, data: { position: block.position, ...(block.text !== undefined && { text: block.text }), ...(block.url !== undefined && { url: block.url }) } }))); await createItemRevision(tx, user.id, resourceId); });
  return json({ success: true });
});
export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request); const resourceId = idSchema.parse((await context.params).id); const input = z.object({ id: idSchema }).strict().parse(await readJson(request));
  await withUserTransaction(user.id, async (tx) => { await resource(user.id, resourceId, tx); const removed = await tx.resourceBlock.deleteMany({ where: { id: input.id, userId: user.id, resourceId } }); if (!removed.count) throw new HttpError(404, "Blocco non trovato."); await createItemRevision(tx, user.id, resourceId); });
  return new Response(null, { status: 204 });
});
