import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "./errors";
import { withUserTransaction } from "./transactions";
import { allocateItemKey } from "./items";

const task = (userId: string, id: string, db: Prisma.TransactionClient) =>
  db.item.findFirst({ where: { id, userId, type: "TASK", deletedAt: null }, select: { id: true, title: true, content: true, status: true, inbox: true, dueAt: true, archivedAt: true, taskParentId: true, tags: { select: { tagId: true } } } });

export async function setTaskParent(userId: string, taskId: string, parentId: string | null) {
  return withUserTransaction(userId, async (tx) => {
    const current = await task(userId, taskId, tx);
    if (!current) throw new HttpError(404, "Attività non trovata.");
    if (!parentId) return tx.item.update({ where: { id: taskId }, data: { taskParentId: null } });
    if (parentId === taskId) throw new HttpError(400, "Un'attività non può essere una sottoattività di se stessa.");
    let cursor = await task(userId, parentId, tx);
    if (!cursor) throw new HttpError(404, "Attività principale non trovata.");
    const seen = new Set<string>();
    while (cursor) {
      if (cursor.id === taskId || seen.has(cursor.id)) throw new HttpError(409, "Questa scelta creerebbe una gerarchia circolare.");
      seen.add(cursor.id);
      cursor = cursor.taskParentId ? await task(userId, cursor.taskParentId, tx) : null;
    }
    return tx.item.update({ where: { id: taskId }, data: { taskParentId: parentId } });
  });
}

export async function addTaskDependency(userId: string, blockerTaskId: string, blockedTaskId: string) {
  return withUserTransaction(userId, async (tx) => {
    if (blockerTaskId === blockedTaskId) throw new HttpError(400, "Un'attività non può bloccare se stessa.");
    if (!(await task(userId, blockerTaskId, tx)) || !(await task(userId, blockedTaskId, tx))) throw new HttpError(404, "Attività non trovata.");
    const visited = new Set<string>(); const queue = [blockedTaskId];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === blockerTaskId) throw new HttpError(409, "Questa dipendenza creerebbe un ciclo.");
      if (visited.has(current)) continue; visited.add(current);
      const next = await tx.taskDependency.findMany({ where: { userId, blockerTaskId: current }, select: { blockedTaskId: true } });
      queue.push(...next.map((entry) => entry.blockedTaskId));
    }
    return tx.taskDependency.upsert({ where: { userId_blockerTaskId_blockedTaskId: { userId, blockerTaskId, blockedTaskId } }, create: { userId, blockerTaskId, blockedTaskId }, update: {} });
  });
}

export async function taskStructure(userId: string, taskId: string) {
  const current = await prisma.item.findFirst({ where: { id: taskId, userId, type: "TASK", deletedAt: null }, select: { id: true } });
  if (!current) throw new HttpError(404, "Attività non trovata.");
  const [subtasks, blocking, blockedBy, recurrence] = await Promise.all([
    prisma.item.findMany({ where: { userId, taskParentId: taskId, deletedAt: null }, select: { id: true, itemKey: true, title: true, status: true, dueAt: true }, orderBy: [{ dueAt: "asc" }, { title: "asc" }] }),
    prisma.taskDependency.findMany({ where: { userId, blockerTaskId: taskId }, include: { blocked: { select: { id: true, itemKey: true, title: true, status: true } } } }),
    prisma.taskDependency.findMany({ where: { userId, blockedTaskId: taskId }, include: { blocker: { select: { id: true, itemKey: true, title: true, status: true } } } }),
    prisma.taskRecurrence.findFirst({ where: { userId, templateTaskId: taskId } }),
  ]);
  return { subtasks, completedSubtasks: subtasks.filter((entry) => entry.status === "DONE").length, blocking: blocking.map((entry) => ({ id: entry.id, task: entry.blocked })), blockedBy: blockedBy.map((entry) => ({ id: entry.id, task: entry.blocker })), recurrence };
}

export async function setTaskRecurrence(userId: string, taskId: string, input: { rule: Prisma.InputJsonValue; timezone: string; startsAt: string; endsAt?: string | null; active?: boolean }) {
  return withUserTransaction(userId, async (tx) => {
    const current = await task(userId, taskId, tx); if (!current) throw new HttpError(404, "Attività non trovata.");
    const startsAt = new Date(input.startsAt); if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, "Data di inizio non valida.");
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    return tx.taskRecurrence.upsert({ where: { templateTaskId: taskId }, create: { userId, templateTaskId: taskId, rule: input.rule, timezone: input.timezone, startsAt, endsAt, nextOccurrenceAt: startsAt, active: input.active ?? true }, update: { rule: input.rule, timezone: input.timezone, startsAt, endsAt, active: input.active ?? true } });
  });
}

type Rule = { frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; interval?: number };
function nextDate(date: Date, rule: Rule) {
  const next = new Date(date); const interval = Math.max(1, Math.min(365, rule.interval ?? 1));
  if (rule.frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7 * interval);
  else if (rule.frequency === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + interval);
  else if (rule.frequency === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + interval);
  else next.setUTCDate(next.getUTCDate() + interval);
  return next;
}

export async function runTaskSchedules(now = new Date()) {
  const lease = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(82944124) AS locked`;
  if (!lease[0]?.locked) return { reminders: 0, occurrences: 0 };
  try {
    const [reminders, recurrences] = await Promise.all([
      prisma.reminder.findMany({ where: { sentAt: null, OR: [{ scheduledAt: { lte: now } }, { snoozedUntil: { lte: now } }] }, take: 100, orderBy: { scheduledAt: "asc" } }),
      prisma.taskRecurrence.findMany({ where: { active: true, nextOccurrenceAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, take: 50, orderBy: { nextOccurrenceAt: "asc" }, include: { templateTask: { include: { tags: true } } } }),
    ]);
    for (const reminder of reminders) await prisma.$transaction(async (tx) => { const fresh = await tx.reminder.findFirst({ where: { id: reminder.id, sentAt: null } }); if (!fresh) return; await tx.notification.create({ data: { userId: fresh.userId, itemId: fresh.itemId, kind: "REMINDER", title: fresh.title, body: "Promemoria Synapse" } }); await tx.reminder.update({ where: { id: fresh.id }, data: { sentAt: now, snoozedUntil: null } }); });
    for (const recurrence of recurrences) await prisma.$transaction(async (tx) => { const current = await tx.taskRecurrence.findFirst({ where: { id: recurrence.id, active: true, nextOccurrenceAt: { lte: now } }, include: { templateTask: { include: { tags: true } } } }); if (!current) return; const dueAt = current.nextOccurrenceAt; const exists = await tx.item.findFirst({ where: { userId: current.userId, recurrenceId: current.id, dueAt }, select: { id: true } }); if (!exists) { const copy = await tx.item.create({ data: { userId: current.userId, itemKey: await allocateItemKey(tx, current.userId), type: "TASK", title: current.templateTask.title, titleNormalized: current.templateTask.titleNormalized, content: current.templateTask.content, status: "TODO", inbox: current.templateTask.inbox, dueAt, recurrenceId: current.id } }); if (current.templateTask.tags.length) await tx.itemTag.createMany({ data: current.templateTask.tags.map(({ tagId }) => ({ userId: current.userId, itemId: copy.id, tagId })) }); } await tx.taskRecurrence.update({ where: { id: current.id }, data: { nextOccurrenceAt: nextDate(current.nextOccurrenceAt, current.rule as Rule) } }); });
    return { reminders: reminders.length, occurrences: recurrences.length };
  } finally { await prisma.$queryRaw`SELECT pg_advisory_unlock(82944124)`; }
}
