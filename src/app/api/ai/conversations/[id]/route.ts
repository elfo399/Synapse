import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { deleteConversation, getConversation, renameConversation } from "@/server/ai";
import { json, readJson, route } from "@/server/http";

type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => route(async () => json({ conversation: await getConversation((await requireUser(request)).id, (await context.params).id) }));
export const PATCH = (request: Request, context: Context) => route(async () => { const input = z.object({ title: z.string().trim().min(1).max(160) }).strict().parse(await readJson(request)); await renameConversation((await requireUser(request)).id, (await context.params).id, input.title); return json({ ok: true }); });
export const DELETE = (request: Request, context: Context) => route(async () => { await readJson(request); await deleteConversation((await requireUser(request)).id, (await context.params).id); return new Response(null, { status: 204 }); });
