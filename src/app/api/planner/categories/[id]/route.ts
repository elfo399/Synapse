import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { categorySummary, deletePlannerCategory, updatePlannerCategory } from "@/server/planner-categories";
import { assertMutationOrigin, json, readJson, route } from "@/server/http";

export const PATCH = (request: Request, { params }: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  return json({ category: categorySummary(await updatePlannerCategory(prisma, user.id, (await params).id, await readJson(request))) });
});
export const DELETE = (request: Request, { params }: { params: Promise<{ id: string }> }) => route(async () => {
  const user = await requireUser(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("application/json")) await deletePlannerCategory(prisma, user.id, (await params).id, await readJson(request));
  else { assertMutationOrigin(request, ""); await deletePlannerCategory(prisma, user.id, (await params).id, {}); }
  return new Response(null, { status: 204 });
});
