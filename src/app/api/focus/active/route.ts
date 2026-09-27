import { requireUser } from "@/lib/auth";
import { getActiveFocus, pauseFocus, resumeFocus, stopFocus } from "@/server/planner";
import { json, readJson, route } from "@/server/http";

export const GET = (request: Request) => route(async () => json({ focus: await getActiveFocus((await requireUser(request)).id) }));
export const POST = (request: Request) => route(async () => {
  const user = await requireUser(request);
  const body = await readJson(request) as { action?: "pause" | "resume" | "stop" | "complete" };
  if (body.action === "pause") return json({ focus: await pauseFocus(user.id) });
  if (body.action === "resume") return json({ focus: await resumeFocus(user.id) });
  if (body.action === "stop" || body.action === "complete") { await stopFocus(user.id, undefined, body.action === "complete"); return json({ focus: null }); }
  return json({ focus: await getActiveFocus(user.id) });
});
