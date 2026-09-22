import { requireUser } from "@/lib/auth";
import { applyTemplate } from "@/server/planner";
import { json, readJson, route } from "@/server/http";

export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  return json({ blocks: await applyTemplate(user.id, (await params).id, await readJson(request)) }, 201);
});
