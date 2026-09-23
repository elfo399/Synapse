import { z } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { deleteConversation, getConversation, renameConversation, updateConversationPreferences } from "@/server/ai";
import { json, readJson, route } from "@/server/http";

type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => route(async () => json({ conversation: await getConversation((await requireUser(request)).id, (await context.params).id) }));
export const PATCH = (request: Request, context: Context) => route(async () => { const input = z.object({ title: z.string().trim().min(1).max(160).optional(), webSearch: z.boolean().optional(), reasoning: z.boolean().optional() }).strict().refine((value) => value.title !== undefined || (value.webSearch !== undefined && value.reasoning !== undefined), "Indica una modifica valida.").parse(await readJson(request)); const user = await requireUser(request); const id = (await context.params).id; if (input.title !== undefined) await renameConversation(user.id, id, input.title); if (input.webSearch !== undefined && input.reasoning !== undefined) await updateConversationPreferences(user.id, id, { webSearch: input.webSearch, reasoning: input.reasoning }); return json({ ok: true }); });
export const DELETE = (request: Request, context: Context) => route(async () => { await readJson(request); await deleteConversation((await requireUser(request)).id, (await context.params).id); return new Response(null, { status: 204 }); });
