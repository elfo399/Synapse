import { requireUser } from "@/lib/auth";
import { saveTemplate } from "@/server/planner";
import { json, readJson, route } from "@/server/http";
export const POST = (request: Request) => route(async () => json({ template: await saveTemplate((await requireUser(request)).id, await readJson(request)) }, 201));
