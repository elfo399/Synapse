import { requireUser } from "@/lib/auth";
import { getPlanner, createTimeBlock } from "@/server/planner";
import { json, readJson, route } from "@/server/http";
export const GET = (request: Request) => route(async () => { const user = await requireUser(request); const url = new URL(request.url); return json(await getPlanner(user.id, { from: url.searchParams.get("from"), to: url.searchParams.get("to") })); });
export const POST = (request: Request) => route(async () => json({ block: await createTimeBlock((await requireUser(request)).id, await readJson(request)) }, 201));
