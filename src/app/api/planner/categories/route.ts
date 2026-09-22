import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { categorySummary, createPlannerCategory, getPlannerCategories } from "@/server/planner-categories";
import { json, readJson, route } from "@/server/http";

export const GET = (request: Request) => route(async () => {
  const user = await requireUser(request);
  return json({ categories: (await getPlannerCategories(prisma, user.id)).map(categorySummary) });
});
export const POST = (request: Request) => route(async () => {
  const user = await requireUser(request);
  return json({ category: categorySummary(await createPlannerCategory(prisma, user.id, await readJson(request))) }, 201);
});
