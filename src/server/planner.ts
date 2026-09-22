import { ItemStatus, ItemType, Prisma, TimeBlockStatus } from "@prisma/client";
import { defaultPlannerCategory } from "@/domain/planner-categories";
import type { PlannerData, TimeBlockSummary } from "@/domain/types";
import { plannerRangeSchema, timeBlockPatchSchema, timeBlockSchema } from "@/domain/validation";
import { z } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { zonedDateTimeToUtc } from "@/features/planner/time-layout";
import { HttpError } from "./errors";
import { categorySummary, ensurePlannerCategories, getPlannerCategories, ownedPlannerCategory } from "./planner-categories";
import { withUserTransaction } from "./transactions";

type Recurrence = { frequency: "DAILY" | "WEEKLY"; weekdays?: number[]; until?: string | null };
const itemSelect = { id: true, title: true, type: true, status: true, dueAt: true } as const;
const categorySelect = { id: true, name: true, color: true, icon: true, sortOrder: true, archivedAt: true } as const;
function timeParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  return { hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0), minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0) };
}

function serialized(block: {
  id: string; title: string; description: string; startsAt: Date; endsAt: Date; timezone: string;
  categoryId: string; categoryColor: string | null; plannerCategory: { id: string; name: string; color: string; icon: string | null; sortOrder: number; archivedAt: Date | null };
  status: TimeBlockStatus; itemId: string | null; recurrence: Prisma.JsonValue | null;
  item: { id: string; title: string; type: ItemType; status: ItemStatus; dueAt: Date | null } | null;
  sessions?: { startedAt: Date; endedAt: Date | null }[];
}): TimeBlockSummary {
  const actualMinutes = (block.sessions ?? []).reduce((total, session) => total + Math.max(0, Math.round(((session.endedAt ?? new Date()).getTime() - session.startedAt.getTime()) / 60_000)), 0);
  return { id: block.id, title: block.title, description: block.description, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString(), timezone: block.timezone, categoryId: block.categoryId, categoryColor: block.categoryColor, category: categorySummary(block.plannerCategory), status: block.status, itemId: block.itemId, recurrence: block.recurrence as Recurrence | null, item: block.item ? { ...block.item, dueAt: block.item.dueAt?.toISOString() ?? null } : null, actualMinutes, conflict: false };
}

function recurrenceMatches(block: TimeBlockSummary, occurrence: Date): boolean {
  const rule = block.recurrence;
  if (!rule) return false;
  if (rule.until && occurrence.getTime() > new Date(rule.until).getTime()) return false;
  if (rule.frequency === "DAILY") return true;
  return (rule.weekdays?.length ? rule.weekdays : [new Date(block.startsAt).getUTCDay()]).includes(occurrence.getUTCDay());
}

function expandRecurring(block: TimeBlockSummary, from: Date, to: Date): TimeBlockSummary[] {
  if (!block.recurrence) return block.startsAt < to.toISOString() && block.endsAt > from.toISOString() ? [block] : [];
  const sourceStart = new Date(block.startsAt); const sourceEnd = new Date(block.endsAt); const duration = sourceEnd.getTime() - sourceStart.getTime(); const output: TimeBlockSummary[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); const sourceTime: [number, number, number] = [sourceStart.getUTCHours(), sourceStart.getUTCMinutes(), sourceStart.getUTCSeconds()];
  for (let i = 0; i < 10 && cursor < to; i += 1) { cursor.setUTCHours(...sourceTime, 0); if (cursor >= sourceStart && recurrenceMatches(block, cursor) && cursor < to) output.push({ ...block, id: `${block.id}:${cursor.toISOString().slice(0, 10)}`, startsAt: cursor.toISOString(), endsAt: new Date(cursor.getTime() + duration).toISOString() }); cursor.setUTCDate(cursor.getUTCDate() + 1); cursor.setUTCHours(0, 0, 0, 0); }
  return output;
}
function markConflicts(blocks: TimeBlockSummary[]): TimeBlockSummary[] { return blocks.map((block, index) => ({ ...block, conflict: blocks.some((other, otherIndex) => otherIndex !== index && new Date(block.startsAt) < new Date(other.endsAt) && new Date(block.endsAt) > new Date(other.startsAt)) })); }

export async function getPlanner(userId: string, rawRange: unknown): Promise<PlannerData> {
  const range = plannerRangeSchema.parse(rawRange); const from = new Date(range.from); const to = new Date(range.to);
  await ensurePlannerCategories(prisma, userId);
  const [stored, tasks, templates, categories] = await prisma.$transaction([
    prisma.timeBlock.findMany({ where: { userId, OR: [{ startsAt: { lt: to }, endsAt: { gt: from } }, { recurrence: { not: Prisma.DbNull } }] }, orderBy: { startsAt: "asc" }, include: { plannerCategory: { select: categorySelect }, item: { select: itemSelect }, sessions: { where: { startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] }, select: { startedAt: true, endedAt: true } } } }),
    prisma.item.findMany({ where: { userId, type: "TASK", archivedAt: null, status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }], take: 12, select: itemSelect }),
    prisma.plannerTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, name: true, blocks: true } }),
    prisma.plannerCategory.findMany({ where: { userId }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: categorySelect }),
  ]);
  const blocks = markConflicts(stored.flatMap((block) => expandRecurring(serialized(block), from, to)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  const summary = categories.map((category) => ({ category: categorySummary(category), planned: 0, actual: 0 })); const values = new Map(summary.map((value) => [value.category.id, value]));
  for (const block of blocks) { const value = values.get(block.categoryId); if (value) { value.planned += Math.round((new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60_000); value.actual += block.actualMinutes; } }
  return { blocks, tasks: tasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null, content: "", inbox: false, url: null, completedAt: null, createdAt: "", updatedAt: "", archivedAt: null, version: 1, tags: [] })), templates, categories: categories.map(categorySummary), summary };
}
async function ownedItem(tx: Prisma.TransactionClient, userId: string, itemId?: string | null) { if (!itemId) return; if (!(await tx.item.findFirst({ where: { userId, id: itemId }, select: { id: true } }))) throw new HttpError(404, "L’elemento collegato non esiste."); }

export async function createTimeBlock(userId: string, raw: unknown) {
  const input = timeBlockSchema.parse(raw);
  return withUserTransaction(userId, async (tx) => { await ensurePlannerCategories(tx, userId); await ownedItem(tx, userId, input.itemId); const category = await ownedPlannerCategory(tx, userId, input.categoryId); const block = await tx.timeBlock.create({ data: { userId, title: input.title, description: input.description, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), timezone: input.timezone, category: "OTHER", categoryId: category.id, categoryColor: category.color, status: input.status, recurrence: input.recurrence ?? Prisma.JsonNull, itemId: input.itemId ?? null }, include: { plannerCategory: { select: categorySelect }, item: { select: itemSelect }, sessions: { select: { startedAt: true, endedAt: true } } } }); return serialized(block); });
}
export async function updateTimeBlock(userId: string, id: string, raw: unknown) {
  const input = timeBlockPatchSchema.parse(raw);
  return withUserTransaction(userId, async (tx) => { const previous = await tx.timeBlock.findFirst({ where: { userId, id } }); if (!previous) throw new HttpError(404, "Blocco non trovato."); const startsAt = input.startsAt ? new Date(input.startsAt) : previous.startsAt; const endsAt = input.endsAt ? new Date(input.endsAt) : previous.endsAt; if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 86_400_000) throw new HttpError(400, "Controlla l’orario del blocco."); await ownedItem(tx, userId, input.itemId); const category = input.categoryId ? await ownedPlannerCategory(tx, userId, input.categoryId) : null; const recurrence = input.recurrence === undefined ? undefined : input.recurrence ?? Prisma.JsonNull; const block = await tx.timeBlock.update({ where: { id }, data: { title: input.title, description: input.description, startsAt, endsAt, timezone: input.timezone, categoryId: category?.id, categoryColor: category?.color, status: input.status, recurrence, itemId: input.itemId }, include: { plannerCategory: { select: categorySelect }, item: { select: itemSelect }, sessions: { select: { startedAt: true, endedAt: true } } } }); return serialized(block); });
}

const storedTemplateBlockSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(20_000).optional(), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().max(64).optional(), categoryId: z.string().min(1).max(128).optional(), category: z.string().optional(), itemId: z.string().min(1).max(128).nullable().optional() }).strict();
export async function applyTemplate(userId: string, id: string, raw: unknown) {
  const input = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().parse(raw);
  return withUserTransaction(userId, async (tx) => { await ensurePlannerCategories(tx, userId); const template = await tx.plannerTemplate.findFirst({ where: { userId, id }, select: { blocks: true } }); if (!template) throw new HttpError(404, "Template non trovato."); const rows = z.array(storedTemplateBlockSchema).min(1).max(30).parse(template.blocks); const categories = await getPlannerCategories(tx, userId); const created = []; for (const row of rows) { const originalStart = new Date(row.startsAt); const originalEnd = new Date(row.endsAt); const duration = originalEnd.getTime() - originalStart.getTime(); if (duration <= 0 || duration > 86_400_000) continue; const category = row.categoryId ? await ownedPlannerCategory(tx, userId, row.categoryId) : categories.find((value) => value.name === defaultPlannerCategory(row.category ?? "OTHER").name); if (!category) throw new HttpError(400, "Il template contiene una categoria non disponibile."); await ownedItem(tx, userId, row.itemId); const timezone = row.timezone ?? "Europe/Rome"; const time = timeParts(originalStart, timezone); const startsAt = zonedDateTimeToUtc(input.date, time.hour, time.minute); const block = await tx.timeBlock.create({ data: { userId, title: row.title, description: row.description ?? "", startsAt, endsAt: new Date(startsAt.getTime() + duration), timezone, category: "OTHER", categoryId: category.id, categoryColor: category.color, itemId: row.itemId ?? null }, include: { plannerCategory: { select: categorySelect }, item: { select: itemSelect }, sessions: true } }); created.push(serialized(block)); } return created; });
}
export async function deleteTimeBlock(userId: string, id: string) { const result = await prisma.timeBlock.deleteMany({ where: { userId, id } }); if (!result.count) throw new HttpError(404, "Blocco non trovato."); }
export async function startFocus(userId: string, id: string) { return withUserTransaction(userId, async (tx) => { const block = await tx.timeBlock.findFirst({ where: { userId, id } }); if (!block) throw new HttpError(404, "Blocco non trovato."); await tx.timeSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: new Date() } }); const session = await tx.timeSession.create({ data: { userId, timeBlockId: id, startedAt: new Date() } }); await tx.timeBlock.update({ where: { id }, data: { status: "IN_PROGRESS" } }); return { id: session.id, startedAt: session.startedAt.toISOString() }; }); }
export async function stopFocus(userId: string, id: string, complete = false) { return withUserTransaction(userId, async (tx) => { const session = await tx.timeSession.findFirst({ where: { userId, timeBlockId: id, endedAt: null }, orderBy: { startedAt: "desc" } }); if (session) await tx.timeSession.update({ where: { id: session.id }, data: { endedAt: new Date() } }); await tx.timeBlock.updateMany({ where: { userId, id }, data: { status: complete ? "COMPLETED" : "PLANNED" } }); }); }
export async function saveTemplate(userId: string, raw: unknown) { const input = z.object({ name: z.string().trim().min(1).max(100), blocks: z.array(timeBlockSchema).min(1).max(30) }).strict().parse(raw); return withUserTransaction(userId, async (tx) => { await ensurePlannerCategories(tx, userId); for (const block of input.blocks) await ownedPlannerCategory(tx, userId, block.categoryId); const blocks = JSON.parse(JSON.stringify(input.blocks)) as Prisma.InputJsonValue; return tx.plannerTemplate.upsert({ where: { userId_name: { userId, name: input.name } }, create: { userId, name: input.name, blocks }, update: { blocks }, select: { id: true, name: true, blocks: true } }); }); }
