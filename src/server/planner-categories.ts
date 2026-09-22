import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_PLANNER_CATEGORIES } from "@/domain/planner-categories";
import type { PlannerCategorySummary } from "@/domain/types";
import { plannerCategoryPatchSchema, plannerCategorySchema } from "@/domain/validation";
import { HttpError } from "./errors";

type Client = Prisma.TransactionClient | PrismaClient;

export function categorySummary(category: {
  id: string; name: string; color: string; icon: string | null; sortOrder: number; archivedAt: Date | null;
}): PlannerCategorySummary {
  return { ...category, color: category.color.toUpperCase(), archivedAt: category.archivedAt?.toISOString() ?? null };
}

export async function ensurePlannerCategories(client: Client, userId: string) {
  if (await client.plannerCategory.count({ where: { userId } })) return;
  await Promise.all(DEFAULT_PLANNER_CATEGORIES.map((category) => client.plannerCategory.upsert({
    where: { userId_name: { userId, name: category.name } },
    create: { userId, name: category.name, color: category.color, icon: category.icon, sortOrder: category.sortOrder },
    update: {},
  })));
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("it-IT");
}

async function assertDistinctName(client: Client, userId: string, name: string, exceptId?: string) {
  const existing = await client.plannerCategory.findMany({ where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
  if (existing.some((category) => normalizedName(category.name) === normalizedName(name))) {
    throw new HttpError(409, "Hai già una categoria con questo nome.");
  }
}

export async function getPlannerCategories(client: Client, userId: string) {
  await ensurePlannerCategories(client, userId);
  return client.plannerCategory.findMany({ where: { userId }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
}

export async function ownedPlannerCategory(client: Client, userId: string, id: string, allowArchived = false) {
  const category = await client.plannerCategory.findFirst({ where: { id, userId }, select: { id: true, name: true, color: true, icon: true, sortOrder: true, archivedAt: true } });
  if (!category || (!allowArchived && category.archivedAt)) throw new HttpError(404, "La categoria selezionata non è disponibile.");
  return category;
}

export async function createPlannerCategory(client: Client, userId: string, raw: unknown) {
  const input = plannerCategorySchema.parse(raw);
  await ensurePlannerCategories(client, userId);
  await assertDistinctName(client, userId, input.name);
  const last = await client.plannerCategory.aggregate({ where: { userId }, _max: { sortOrder: true } });
  return client.plannerCategory.create({ data: { userId, name: input.name, color: input.color.toUpperCase(), icon: input.icon ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function updatePlannerCategory(client: Client, userId: string, id: string, raw: unknown) {
  const input = plannerCategoryPatchSchema.parse(raw);
  await ownedPlannerCategory(client, userId, id, true);
  if (input.name) await assertDistinctName(client, userId, input.name, id);
  const updated = await client.plannerCategory.update({ where: { id }, data: {
    name: input.name,
    color: input.color?.toUpperCase(),
    icon: input.icon,
    sortOrder: input.sortOrder,
    archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
  } });
  if (input.sortOrder !== undefined) {
    const ordered = await client.plannerCategory.findMany({ where: { userId }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
    const withoutCurrent = ordered.filter((category) => category.id !== id);
    withoutCurrent.splice(Math.min(input.sortOrder, withoutCurrent.length), 0, { id });
    await Promise.all(withoutCurrent.map((category, sortOrder) => client.plannerCategory.update({ where: { id: category.id }, data: { sortOrder } })));
  }
  return updated;
}

export async function deletePlannerCategory(client: Client, userId: string, id: string, raw: unknown) {
  const payload = (raw && typeof raw === "object" ? raw : {}) as { reassignToId?: unknown };
  const reassignToId = typeof payload.reassignToId === "string" ? payload.reassignToId : undefined;
  const category = await ownedPlannerCategory(client, userId, id, true);
  const references = await client.timeBlock.count({ where: { userId, categoryId: id } });
  if (references && !reassignToId) throw new HttpError(409, "Questa categoria contiene blocchi. Scegli prima una categoria in cui spostarli oppure archiviala.");
  if (reassignToId) {
    if (reassignToId === id) throw new HttpError(400, "Scegli una categoria diversa.");
    const replacement = await ownedPlannerCategory(client, userId, reassignToId);
    await client.timeBlock.updateMany({ where: { userId, categoryId: id }, data: { categoryId: replacement.id } });
  }
  await client.plannerCategory.delete({ where: { id: category.id } });
}
