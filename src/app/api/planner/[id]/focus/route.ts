import { requireUser } from "@/lib/auth";
import { startFocus, stopFocus } from "@/server/planner";
import { json, readJson, route } from "@/server/http";
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => route(async () => { const body = await readJson(request) as { action?: string }; const user = await requireUser(request); const id = (await params).id; if (body.action === "stop" || body.action === "complete") { await stopFocus(user.id, id, body.action === "complete"); return json({ ok: true }); } return json({ session: await startFocus(user.id, id) }); });
