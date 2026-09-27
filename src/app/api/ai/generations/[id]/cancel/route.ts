import { requireUser } from "@/lib/auth";
import { requestGenerationCancel } from "@/server/ai";
import { json, route } from "@/server/http";
type Context = { params: Promise<{ id: string }> };
export const POST = (request: Request, context: Context) => route(async () => {
  await requestGenerationCancel((await requireUser(request)).id, (await context.params).id);
  return json({ ok: true });
});