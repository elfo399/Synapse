import { requireUser } from "@/lib/auth";
import { getGeneration } from "@/server/ai";
import { json, route } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, context: Context) => route(async () =>
  json({ generation: await getGeneration((await requireUser(request)).id, (await context.params).id) }),
);