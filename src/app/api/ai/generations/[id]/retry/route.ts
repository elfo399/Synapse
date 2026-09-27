import { requireUser } from "@/lib/auth";
import { retryGeneration } from "@/server/ai";
import { json, route } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export const POST = (request: Request, context: Context) => route(async () =>
  json({ generation: await retryGeneration((await requireUser(request)).id, (await context.params).id) }),
);