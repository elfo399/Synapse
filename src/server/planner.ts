import { type Prisma, TimeBlockStatus } from "@prisma/client";
import type { z } from "zod";
import type { PlannerData, TimeBlockCategory, TimeBlockSummary } from "@/domain/types";
import { plannerRangeSchema, timeBlockPatchSchema, timeBlockSchema } from "@/domain/validation";
import { z } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { HttpError } from "./errors";
import { withUserTransaction } from "./transactions";

type Recurrence = { frequency: "DAILY" | "WEEKLY"; weekdays?: number[]; until?: string | null };
const categories: TimeBlockCategory[] = ["WORK", "STUDY", "TRAINING", "BREAK", "PERSONAL", "OTHER"];
const itemSelect = { id: true, title: true, type: true, status: true, dueAt: true } as const;

function serialized(block: {
  id: string; title: string; description: string; startsAt: Date; endsAt: Date; timezone: string;
  category: TimeBlockCategory; status: TimeBlockStatus; itemId: string | null; recurrence: Prisma.JsonValue | null;
  item: { id: string; title: string; type: "NOTE" | "TASK" | "PROJECT" | "AREA" | "RESOURCE" | "BOOKMARK"; status: "ACTIVE" | "TODO" | "IN_PROGRESS" | "DONE" | "ON_HOLD" | "CANCELLED"; dueAt: Date | null } | null;
  sessions?: { startedAt: Date; endedAt: Date | null }[];
}): TimeBlockSummary {
  const actualMinutes = (block.sessions ?? []).reduce((total, session) => total + Math.max(0, Math.round(((session.endedAt ?? new Date()).getTime() - session.startedAt.getTime()) / 60_000)), 0);
  return { ...block, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString(),
    recurrence: block.recurrence as Recurrence | null,
    item: block.item ? { ...block.item, dueAt: block.item.dueAt?.toISOString() ?? null } : null,
    actualMinutes, conflict: false };
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
  const sourceStart = new Date(block.startsAt); const sourceEnd = new Date(block.endsAt);
  const duration = sourceEnd.getTime() - sourceStart.getTime(); const output: TimeBlockSummary[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const sourceTime = [sourceStart.getUTCHours(), sourceStart.getUTCMinutes(), sourceStart.getUTCSeconds()];
  for (let i = 0; i < 10 && cursor < to; i += 1) {
    cursor.setUTCHours(...sourceTime, 0);
    if (cursor >= sourceStart && recurrenceMatches(block, cursor) && cursor < to) output.push({ ...block, id: `${block.id}:${cursor.toISOString().slice(0, 10)}`, startsAt: cursor.toISOString(), endsAt: new Date(cursor.getTime() + duration).toISOString() });
    cursor.setUTCDate(cursor.getUTCDate() + 1); cursor.setUTCHours(0, 0, 0, 0);
  }
  return output;
}

function markConflicts(blocks: TimeBlockSummary[]): TimeBlockSummary[] {
  return blocks.map((block, index) => ({ ...block, conflict: blocks.some((other, otherIndex) => otherIndex !== index && new Date(block.startsAt) < new Date(other.endsAt) && new Date(block.endsAt) > new Date(other.startsAt)) }));
}

export async function getPlanner(userId: string, rawRange: unknown): Promise<PlannerData> {
  const range = plannerRangeSchema.parse(rawRange); const from = new Date(range.from); const to = new Date(range.to);
  const [stored, tasks, templates] = await prisma.$transaction([
    prisma.timeBlock.findMany({ where: { userId, startsAt: { lt: to }, OR: [{ endsAt: { gt: from } }, { recurrence: { not: Prisma.DbNull } }] }, orderBy: { startsAt: "asc" }, include: { item: { select: itemSelect }, sessions: { where: { startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] }, select: { startedAt: true, endedAt: true } } } }),
    prisma.item.findMany({ where: { userId, type: "TASK", archivedAt: null, status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }], take: 12, select: itemSelect }),
    prisma.plannerTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, name: true, blocks: true } }),
  ]);
  const blocks = markConflicts(stored.flatMap((block) => expandRecurring(serialized(block), from, to)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  const summary = Object.fromEntries(categories.map((category) => [category, { planned: 0, actual: 0 }])) as PlannerData["summary"];
  for (const block of blocks) { const value = summary[block.category]; value.planned += Math.round((new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60_000); value.actual += block.actualMinutes; }
  return { blocks, tasks: tasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() ?? null, content: "", inbox: false, url: null, completedAt: null, createdAt: "", updatedAt: "", archivedAt: null, version: 1, tags: [] })), templates, summary };
}

async function ownedItem(tx: Prisma.TransactionClient, userId: string, itemId?: string | null) {
  if (!itemId) return;
  if (!(await tx.item.findFirst({ where: { userId, id: itemId }, select: { id: true } }))) throw new HttpError(404, "L’elemento collegato non esiste.");
}

export async function createTimeBlock(userId: string, raw: unknown) {
  const input = timeBlockSchema.parse(raw);
  return withUserTransaction(userId, async (tx) => { await ownedItem(tx, userId, input.itemId); const block = await tx.timeBlock.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), recurrence: input.recurrence ?? undefined, itemId: input.itemId ?? null }, include: { item: { select: itemSelect }, sessions: true } }); return serialized(block); });
}

export async function updateTimeBlock(userId: string, id: string, raw: unknown) {
  const input = timeBlockPatchSchema.parse(raw);
  return withUserTransaction(userId, async (tx) => {
    const previous = await tx.timeBlock.findFirst({ where: { userId, id } }); if (!previous) throw new HttpError(404, "Blocco non trovato.");
    const startsAt = input.startsAt ? new Date(input.startsAt) : previous.startsAt; const endsAt = input.endsAt ? new Date(input.endsAt) : previous.endsAt;
    if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 86_400_000) throw new HttpError(400, "Controlla l’orario del blocco.");
    await ownedItem(tx, userId, input.itemId);
    const block = await tx.timeBlock.update({ where: { id }, data: { ...input, startsAt, endsAt, recurrence: input.recurrence === undefined ? undefined : input.recurrence, itemId: input.itemId === undefined ? undefined : input.itemId }, include: { item: { select: itemSelect }, sessions: true } }); return serialized(block);
  });
}

export async function deleteTimeBlock(userId: string, id: string) { const result = await prisma.timeBlock.deleteMany({ where: { userId, id } }); if (!result.count) throw new HttpError(404, "Blocco non trovato."); }
export async function startFocus(userId: string, id: string) { return withUserTransaction(userId, async (tx) => { const block = await tx.timeBlock.findFirst({ where: { userId, id } }); if (!block) throw new HttpError(404, "Blocco non trovato."); await tx.timeSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: new Date() } }); const session = await tx.timeSession.create({ data: { userId, timeBlockId: id, startedAt: new Date() } }); await tx.timeBlock.update({ where: { id }, data: { status: "IN_PROGRESS" } }); return { id: session.id, startedAt: session.startedAt.toISOString() }; }); }
export async function stopFocus(userId: string, id: string, complete = false) { return withUserTransaction(userId, async (tx) => { const session = await tx.timeSession.findFirst({ where: { userId, timeBlockId: id, endedAt: null }, orderBy: { startedAt: "desc" } }); if (session) await tx.timeSession.update({ where: { id: session.id }, data: { endedAt: new Date() } }); await tx.timeBlock.updateMany({ where: { userId, id }, data: { status: complete ? "COMPLETED" : "PLANNED" } }); }); }
export async function saveTemplate(userId: string, raw: unknown) { const input = z.object({ name: z.string().trim().min(1).max(100), blocks: z.array(timeBlockSchema).min(1).max(30) }).strict().parse(raw); return prisma.plannerTemplate.upsert({ where: { userId_name: { userId, name: input.name } }, create: { userId, name: input.name, blocks: input.blocks }, update: { blocks: input.blocks }, select: { id: true, name: true, blocks: true } }); }
