import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { idSchema } from "@/domain/validation";
import { json, readJson, route } from "@/server/http";
import { prisma } from "@/lib/db";
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => { const user = await requireUser(request); const id = idSchema.parse((await context.params).id); const input = z.object({ read: z.boolean() }).strict().parse(await readJson(request)); const notification = await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: input.read ? new Date() : null } }); if (!notification.count) return new Response(null, { status: 404 }); return json({ success: true }); });
export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => route(async () => { const user = await requireUser(request); const id = idSchema.parse((await context.params).id); await prisma.notification.deleteMany({ where: { id, userId: user.id } }); return new Response(null, { status: 204 }); });
